import test from "node:test";
import assert from "node:assert/strict";
import {Client,StreamableHTTPClientTransport} from "@modelcontextprotocol/client";
import {createCMPServer} from "../dist/server.js";

const token="core-edition-test-token-is-long-enough";
const headers={authorization:"Bearer "+token,"content-type":"application/json"};
const fact={id:"decision-1",kind:"decision",content:"# Decision\nCMP Core owns versioned facts.",
 sourceRefs:["test:evidence"],status:"approved",authorId:"tester",updatedAt:"2026-11-16T00:00:00Z"};

test("Core runtime exposes repository capabilities, not Cloud-only services",async()=>{
 const app=createCMPServer({token});
 const addr=await app.listen();
 if(!addr||typeof addr==="string")throw Error("No local TCP listener");
 const origin="http://127.0.0.1:"+addr.port;
 const request=async(path:string,method="GET",body?:unknown)=>{
  const res=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:res.status,body:await res.json() as Record<string,any>};
 };
 try{
  const cap=await request("/v1/capabilities");
  assert.equal(cap.status,200);
  assert.equal(cap.body.implementation,"cmp-core");
  for(const name of ["websocket","agentCoordination","sessionArchive","connect"])
   assert.equal(cap.body.capabilities[name],false,name);
  const discovered=await request("/.well-known/context-management");
  assert.equal(discovered.body.transport,"http");
  assert.ok(discovered.body.capabilities.every((c:string)=>c.startsWith("context.")));
  assert.equal((await request("/v1/ws-ticket","POST",{})).status,404);
  assert.equal((await request("/v1/git/providers")).status,404);
  for(const method of ["agent.join","coordination.message","session.open","session.append","sources.list"]){
   assert.equal((await request("/v1/rpc","POST",{method,params:{}})).status,404,method);
  }
  const created=await request("/v1/repos","POST",{id:"core-test"});
  assert.equal(created.status,201);
  const head=created.body.head;
  const committed=await request("/v1/repos/core-test/commits","POST",{
   branch:"main",expectedHead:head,authorId:"tester",message:"First core fact",
   changes:[{op:"put",record:fact}]
  });
  assert.equal(committed.status,201);
  assert.equal((await request("/v1/repos/core-test/records")).body.records[0].id,"decision-1");
  assert.equal((await request("/v1/repos/core-test/records?ref="+head)).body.records.length,0);
  assert.equal((await request("/v1/repos/core-test/commits","POST",{
   branch:"main",expectedHead:head,authorId:"tester",message:"Stale",changes:[]
  })).status,409);
  const client=new Client({name:"cmp-core-boundary-test",version:"0.1.0"});
  try {
   await client.connect(new StreamableHTTPClientTransport(new URL(origin+"/mcp"),{
    requestInit:{headers:{authorization:"Bearer "+token}}
   }));
   const tools=await client.listTools();
   assert.deepEqual(tools.tools.map(t=>t.name),["code_mode"]);
   const reply=await client.callTool({name:"code_mode",arguments:{code:"return code_mode.docs();"}});
   const body=JSON.stringify(reply);
   assert.ok(body.includes("context.list"));
   assert.ok(!body.includes("agent.join"));
   assert.ok(!body.includes("session.open"));
   const hidden=await client.callTool({name:"code_mode",arguments:{
    code:"return await cmp.agent.join({});"
   }});
   assert.equal(hidden.isError,true);
  }finally{await client.close().catch(()=>{});}
 }finally{await app.close();}
});
