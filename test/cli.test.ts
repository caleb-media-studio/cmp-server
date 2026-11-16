import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initConfig, validateEnvironment } from "../dist/cli.js";

test("server CLI refuses production, short secrets and non-loopback addresses",()=>{
  assert.ok(validateEnvironment({CMP_ENV:"production",CMP_DEV_TOKEN:"a".repeat(64),CMP_HOST:"0.0.0.0"}).length>=2);
  assert.deepEqual(validateEnvironment({CMP_ENV:"development",CMP_DEV_TOKEN:"a".repeat(64),CMP_HOST:"127.0.0.1",CMP_PORT:"8787"}),[]);
});
test("server CLI init creates an owner-only env file without overwriting",()=>{
  const dir=mkdtempSync(join(tmpdir(),"cmp-cli-"));
  const file=join(dir,".env");
  try {
    initConfig(file);
    const content=readFileSync(file,"utf8");
    assert.match(content,/CMP_ENV=development/);
    assert.match(content,/CMP_DEV_TOKEN=[a-f0-9]{64}/);
    assert.equal(statSync(file).mode & 0o777,0o600);
    assert.throws(()=>initConfig(file),/already exists/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
