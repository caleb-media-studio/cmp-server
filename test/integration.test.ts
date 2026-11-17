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

test("Authenticated .cmp transport exposes manifest, refs, snapshot and CAS writes, not Git",async()=>{
 const t=await setup();
 try{
  assert.equal((await t.call("/local/transport_core.cmp","GET",undefined,false)).status,401);
  const created=await t.call("/v1/repos","POST",{id:"transport_core"});
  assert.equal(created.status,201);
  const manifest=await t.call("/local/transport_core.cmp");
  assert.equal(manifest.status,200);
  assert.equal(manifest.body.protocol,"cmp");
  assert.equal(manifest.body.transportVersion,1);
  assert.equal(manifest.body.repository,"local/transport_core");
  assert.equal(manifest.body.head,created.body.head);
  assert.equal(manifest.body.links.snapshot,"/local/transport_core.cmp?view=snapshot&ref=main");
  assert.equal((await t.call("/local/transport_core.cmp?view=refs")).body.branches.main,created.body.head);
  const result=await t.call("/local/transport_core.cmp","POST",{
   branch:"main",expectedHead:created.body.head,authorId:"cli",message:"Document",
   changes:[{op:"put",record:record("test","Context from .cmp")}]});
  assert.equal(result.status,201);
  const snapshot=await t.call("/local/transport_core.cmp?view=snapshot&ref=main");
  assert.equal(snapshot.body.records[0].content,"Context from .cmp");
  assert.equal(snapshot.body.head,result.body.id);
  assert.equal((await t.call("/local/transport_core.cmp","POST",{
   branch:"main",expectedHead:created.body.head,authorId:"cli",message:"stale",changes:[]
  })).status,409);
  assert.equal((await t.call("/local/transport_core.cmp?view=invalid")).status,400);
  assert.equal((await t.call("/local/missing_repo.cmp")).status,404);
  assert.equal((await t.call("/other/transport_core.cmp")).status,404);
 }finally{await t.app.close();rmSync(t.dir,{recursive:true,force:true});}
});

test("Core exposes local/name while preserving legacy flat SQLite keys across restart",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"cmp-core-namespace-sqlite-"));
 const db=join(dir,"legacy.sqlite");
 const seeded=new Store(db);
 const preexisting=seeded.create("legacy_repo");
 const original=preexisting.head();
 seeded.close();
 let app=createCMPServer({token,dbFile:db});
 try{
  let addr=await app.listen();
  let base="http://127.0.0.1:"+addr.port;
  const call=async(path,method="GET",body)=>{
   const resp=await fetch(base+path,{method,headers,
    body:body===undefined?undefined:JSON.stringify(body)});
   return {status:resp.status,body:await resp.json()};
  };
  const cap=await call("/v1/capabilities");
  assert.equal(cap.body.repositoryIdentifier,"owner/name");
  assert.equal(cap.body.repositoryNamespace,"local");
  assert.equal(cap.body.legacyFlatAliases,true);
  assert.deepEqual((await call("/v1/repos")).body.repositories,["local/legacy_repo"]);
  const legacy=await call("/v1/repos/legacy_repo");
  const canonical=await call("/v1/repos/local%2Flegacy_repo");
  assert.equal(legacy.status,200);
  assert.equal(legacy.body.id,"local/legacy_repo");
  assert.equal(canonical.body.head,original);
  assert.equal(canonical.body.id,legacy.body.id);
  assert.equal((await call("/v1/repos/local%2Flegacy_repo/head")).body.head,original);
  const created=await call("/v1/repos","POST",{id:"local/fresh_repo"});
  assert.equal(created.status,201);
  assert.equal(created.body.id,"local/fresh_repo");
  const snapshot=await call("/v1/repos/local%2Ffresh_repo/records");
  assert.deepEqual(snapshot.body.records,[]);
  const rpc=await call("/v1/rpc","POST",{method:"context.list",params:{}});
  assert.deepEqual(rpc.body.result.repositories.slice().sort(),["local/legacy_repo","local/fresh_repo"].sort());
  const rpcHead=await call("/v1/rpc","POST",{method:"context.head",
   params:{repo:"local/legacy_repo",branch:"main"}});
  assert.equal(rpcHead.body.result.head,original);
  assert.equal((await call("/local/legacy_repo.cmp")).body.repository,"local/legacy_repo");
  assert.equal((await call("/local/fresh_repo.cmp?view=snapshot&ref=main")).body.repository,"local/fresh_repo");
  const branch=await call("/v1/repos/local%2Ffresh_repo/branches","POST",{name:"feature"});
  assert.equal(branch.status,201);
  const changed=await call("/v1/repos/local%2Ffresh_repo/commits","POST",{
   branch:"feature",expectedHead:branch.body.head,authorId:"cli",message:"feature fact",
   changes:[{op:"put",record:record("feature_record","Stored via canonical REST")}]});
  assert.equal(changed.status,201);
  assert.equal((await call("/v1/repos/local%2Ffresh_repo/commits","POST",{
   branch:"feature",expectedHead:branch.body.head,authorId:"cli",message:"stale",changes:[]
  })).status,409);
  const diff=await call("/v1/repos/local%2Ffresh_repo/diff?from=main&to=feature");
  assert.equal(diff.body.changes.length,1);
  assert.equal((await call("/v1/repos/local%2Ffresh_repo/records?ref=feature")).body.records[0].id,"feature_record");
  assert.equal((await call("/v1/repos/local%2Ffresh_repo/events")).status,200);
  await app.close();
  // Close and reopen the same on-disk SQLite, never changing legacy keys.
  const check=new Store(db);
  assert.deepEqual(check.list().sort(),["legacy_repo","fresh_repo"].sort());
  check.close();
  app=createCMPServer({token,dbFile:db});
  addr=await app.listen();base="http://127.0.0.1:"+addr.port;
  assert.deepEqual((await call("/v1/repos")).body.repositories.slice().sort(),
   ["local/legacy_repo","local/fresh_repo"].sort());
  assert.equal((await call("/v1/repos/local%2Flegacy_repo/head")).body.head,original);
  assert.equal((await call("/v1/repos/local%2Ffresh_repo/records?ref=feature")).body.records[0].id,"feature_record");
 }finally{await app.close().catch(()=>{});rmSync(dir,{recursive:true,force:true});}
});

test("Core rejects forged or malformed names before repository lookup",async()=>{
 const t=await setup();
 try {
  const created=await t.call("/v1/repos","POST",{id:"local/valid_repo"});
  assert.equal(created.status,201);
  for(const id of ["other/valid_repo","local/a","local/project/name",
   "local/..","local/%2Ffoo","local/valid.repo","LOCAL/valid_repo","local/valid%252Frepo"]){
    const r=await t.call("/v1/repos","POST",{id});
    assert.equal(r.status,400,id);
  }
  for(const segment of ["other%2Fvalid_repo","local%252Fvalid_repo",
    "local%2Fvalid_repo%2Fchild","local%2F..","local%2F%2E%2E",
    "local%2fvalid_repo%25","local%2Fvalid%ZZ","local%5Cvalid_repo"]){
    const r=await t.call("/v1/repos/"+segment+"/head");
    assert.equal(r.status,400,segment);
  }
  assert.equal((await t.call("/v1/repos/local/valid_repo/head")).status,400);
  assert.equal((await t.call("/v1/repos/local%2Fmissing_repo/head")).status,404);
  assert.equal((await t.call("/v1/repos/valid_repo/head","GET",undefined,false)).status,401);
  assert.equal((await t.call("/v1/rpc","POST",{
   method:"context.head",params:{repo:"other/valid_repo",branch:"main"}
  })).status,400);
  assert.equal((await t.call("/other/valid_repo.cmp")).status,404);
 }finally{await t.app.close();rmSync(t.dir,{recursive:true,force:true});}
});

test("Core refuses raw percent-encoded traversal before URL normalization",async()=>{
 const t=await setup();
 try{
  const port=t.app.server.address().port;
  const {request}=await import("node:http");
  const raw=(path)=>new Promise((resolve,reject)=>{
   const req=request({host:"127.0.0.1",port,path,method:"GET",headers},
    res=>{res.resume();res.on("end",()=>resolve(res.statusCode));});
   req.on("error",reject);req.end();
  });
  for(const path of [
   "/v1/repos/local%2Ftarget/../head",
   "/v1/repos/local%2Ftarget/%2e%2e/head",
   "/v1/repos/local%252Ftarget/head",
   "/v1/repos/local%2Ftarget%2F..%2Fsecret/head",
   "/v1/repos/local%2Ftarget%ZZ/head",
   "/v1/repos/local%5Ctarget/head",
   "/v1/repos/local/target/head",
  ])assert.equal(await raw(path),400,path);
 }finally{await t.app.close();rmSync(t.dir,{recursive:true,force:true});}
});
