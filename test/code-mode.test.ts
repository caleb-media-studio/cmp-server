import test from "node:test";
import assert from "node:assert/strict";
import {runCodeMode,permittedMethods} from "../dist/code-mode.js";

const dispatch=(method,params)=>({method,params,repositories:["core-only"]});

test("Code Mode lists and executes only repository methods",async()=>{
 const result=await runCodeMode(
  'const d=code_mode.docs();const r=await cmp.context.list({});return {docs:d,result:r};',dispatch);
 assert.ok(result.docs.methods.includes("context.list"));
 assert.equal(result.result.repositories[0],"core-only");
 assert.ok(result.docs.methods.every(m=>m.startsWith("context.")));
 const docs=await runCodeMode('return code_mode.search("archive");',dispatch);
 assert.deepEqual(docs,[]);
 assert.ok(permittedMethods(true).includes("context.commit"));
});

test("Cloud-only method families are forbidden even with writes enabled",async()=>{
 const requests=["cmp.agent.join({})","cmp.coordination.message({})",
  "cmp.session.open({})","cmp.sources.list({})"];
 for(const method of requests){
  await assert.rejects(runCodeMode('return await '+method+';',dispatch,
   {writesEnabled:true}),/Code Mode:/);
 }
});

test("Code Mode denies arbitrary code, prototype access and forbidden writes",async()=>{
 const payloads=["return process.exit(0);","return fetch('https://example.org');",
  "import fs from 'node:fs';return fs;","while(true){}",
  "const o={__proto__:{admin:true}};return o;",
  "return await cmp.context.commit({branch:'main'});"];
 for(const program of payloads)
  await assert.rejects(runCodeMode(program,dispatch),/Code Mode:/);
 const allowed=await runCodeMode(
  'return await cmp.context.commit({repo:"demo",branch:"main"});',dispatch,
  {writesEnabled:true});
 assert.equal(allowed.method,"context.commit");
});
