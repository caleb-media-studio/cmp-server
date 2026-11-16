import test from "node:test";
import assert from "node:assert/strict";
import { createCMPServer } from "../dist/server.js";
import { Client,StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

test("official MCP v2 client can list and retrieve CMP repository context",async()=>{
  const token="test-token-for-development-with-32-chars";
  const app=createCMPServer({token,dbFile:":memory:"});
  const addr=await app.listen(),base="http://127.0.0.1:"+addr.port;
  const client=new Client({name:"cmp-conformance-test",version:"0.1.0"});
  const transport=new StreamableHTTPClientTransport(new URL(base+"/mcp"),{
    requestInit:{headers:{authorization:"Bearer "+token}}
  });
  try{
    const created=await fetch(base+"/v1/repos",{
      method:"POST",
      headers:{authorization:"Bearer "+token,"content-type":"application/json"},
      body:JSON.stringify({id:"sample"})
    });
    assert.equal(created.status,201);
    await client.connect(transport);
    const {tools}=await client.listTools();
    assert.deepEqual(tools.map(x=>x.name),["code_mode"]);
    const result=await client.callTool({name:"code_mode",arguments:{code:"return await cmp.context.list({});"}});
    assert.ok(JSON.stringify(result).includes("sample"));
    const records=await client.callTool({name:"code_mode",arguments:{code:"const r = await cmp.context.snapshot({repo:\"sample\"}); return r;"}});
    assert.ok(JSON.stringify(records).includes("records"));
  }finally{await client.close().catch(()=>{});await app.close();}
});
