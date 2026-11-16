import test from "node:test";
import assert from "node:assert/strict";
import {createCMPServer} from "../dist/server.js";
import {Store} from "../dist/storage.js";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const token="core-integration-development-long-token-1234";
const headers={authorization:"Bearer "+token,"content-type":"application/json"};
const record=(id,content)=>({id,content,kind:"fact",status:"approved",
 sourceRefs:["manual:evidence"],authorId:"tester",updatedAt:"2026-11-16T16:00:00Z"});
async function setup(){
 const dir=mkdtempSync(join(tmpdir(),"cmp-core-integration-"));
 const db=join(dir,"cmp.sqlite");
 const app=createCMPServer({token,dbFile:db});
 const addr=await app.listen(),base="http://127.0.0.1:"+addr.port;
 const call=async(path,method="GET",body,auth=true)=>{
  const r=await fetch(base+path,{method,headers:auth?headers:{},
   body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
 };
 return {app,call,db,dir};
}
test("Core rejects unauthenticated reads and Cloud-only operations",async()=>{
 const t=await setup();
 try{
  assert.equal((await t.call("/v1/repos","GET",undefined,false)).status,401);
  for(const path of ["/v1/ws-ticket","/v1/git/providers"])
   assert.equal((await t.call(path)).status,404);
  for(const method of ["agent.join","coordination.propose","session.open"]){
   assert.equal((await t.call("/v1/rpc","POST",{method,params:{}})).status,404);
  }
 }finally{await t.app.close();rmSync(t.dir,{recursive:true,force:true});}
});
test("Records, branch merge, stale rejection, diff and historical state persist",async()=>{
 const t=await setup();
 try{
  const created=await t.call("/v1/repos","POST",{id:"repo_core"});
  assert.equal(created.status,201);
  const root=created.body.head;
  const first=await t.call("/v1/repos/repo_core/commits","POST",{
   branch:"main",expectedHead:root,authorId:"tester",message:"Initial",
   changes:[{op:"put",record:record("a","Original")}]});
  assert.equal(first.status,201);
  assert.equal((await t.call("/v1/repos/repo_core/commits","POST",{
   branch:"main",expectedHead:root,authorId:"tester",message:"stale",changes:[]
  })).status,409);
  const branch=await t.call("/v1/repos/repo_core/branches","POST",{name:"feature"});
  assert.equal(branch.status,201);
  const feature=await t.call("/v1/repos/repo_core/commits","POST",{
   branch:"feature",expectedHead:branch.body.head,authorId:"tester",
   message:"Feature",changes:[{op:"put",record:record("b","Added")}]});
  assert.equal(feature.status,201);
  const merged=await t.call("/v1/repos/repo_core/merge","POST",{
   source:"feature",target:"main",authorId:"tester"});
  assert.equal(merged.status,200);
  assert.equal((await t.call("/v1/repos/repo_core/records")).body.records.length,2);
  assert.equal((await t.call("/v1/repos/repo_core/records?ref="+root)).body.records.length,0);
  const diff=await t.call("/v1/repos/repo_core/diff?from="+root+"&to=main");
  assert.equal(diff.status,200);
  assert.equal(diff.body.changes.length,2);
  assert.ok((await t.call("/v1/repos/repo_core/events")).body.events.length>=3);
 }finally{await t.app.close();}
 const stored=new Store(t.db);
 try{
  assert.equal(stored.get("repo_core").snapshot().size,2);
 }finally{stored.close();rmSync(t.dir,{recursive:true,force:true});}
});
