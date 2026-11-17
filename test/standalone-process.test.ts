import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {mkdtempSync,rmSync} from "node:fs";
import {randomBytes} from "node:crypto";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {setTimeout as sleep} from "node:timers/promises";

test("fresh compiled Core process serves HTTP repository API and survives restart",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"cmp-core-process-")),db=join(dir,"db.sqlite");
 const token=randomBytes(32).toString("hex");
 const port=await new Promise((ok,bad)=>{
  const socket=createServer();socket.once("error",bad);
  socket.listen(0,"127.0.0.1",()=>{
   const address=socket.address();
   if(!address||typeof address==="string")return bad(Error("No TCP port"));
   socket.close(()=>ok(address.port));
  });
 });
 const base="http://127.0.0.1:"+port;
 const env={...process.env,CMP_ENV:"development",CMP_DEV_TOKEN:token,
  CMP_HOST:"127.0.0.1",CMP_PORT:String(port),CMP_DB_FILE:db};
 const headers={authorization:"Bearer "+token,"content-type":"application/json"};
 let processRef;
 async function start(){
  processRef=spawn(process.execPath,[resolve("dist/cli.js"),"serve"],{
   cwd:process.cwd(),env,stdio:["ignore","pipe","pipe"]});
  let ready=false;
  for(let i=0;i<60;i++){
   if(processRef.exitCode!==null)throw Error("Server process exited unexpectedly");
   try{if((await fetch(base+"/healthz")).ok){ready=true;break;}}catch{}
   await sleep(100);
  }
  assert.equal(ready,true,"Core server did not become healthy");
 }
 async function stop(){
  if(!processRef||processRef.exitCode!==null)return;
  const child=processRef;
  child.kill("SIGTERM");
  await Promise.race([new Promise(ok=>child.once("exit",ok)),sleep(2500)]);
  if(child.exitCode===null)child.kill("SIGKILL");
 }
 async function call(path,method="GET",body){
  const response=await fetch(base+path,{
   headers,method,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 }
 try{
  await start();
  const cap=await call("/v1/capabilities");
  assert.equal(cap.body.capabilities.websocket,false);
  assert.equal(cap.body.capabilities.sessionArchive,false);
  const created=await call("/v1/repos","POST",{id:"process_repo"});
  assert.equal(created.status,201);
  await stop();
  await start();
  const repos=await call("/v1/repos");
  assert.deepEqual(repos.body.repositories,["local/process_repo"]);
  assert.equal((await call("/v1/repos/local%2Fprocess_repo/head")).status,200);
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
