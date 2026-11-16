#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { createCMPServer } from "./server.js";


const commands = ["init", "doctor", "serve", "help"] as const;
type Command = typeof commands[number];
const usage = `CMP Server · Context Management Protocol (development reference)

Usage:
  cmp-server init       Create a local .env with a random development token
  cmp-server doctor     Validate local configuration, no network calls
  cmp-server serve      Run the repository-only Core HTTP + MCP API
  cmp-server help       Show this command reference

The reference server is DEVELOPMENT ONLY. Never bind a public interface.
`;
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): string[] {
  const issues:string[]=[];
  if(env.CMP_ENV!=="development")issues.push("CMP_ENV must be development (production is intentionally blocked)");
  if(!env.CMP_DEV_TOKEN || env.CMP_DEV_TOKEN.length<32)issues.push("CMP_DEV_TOKEN needs at least 32 characters");
  if(env.CMP_HOST && !["localhost","127.0.0.1","::1"].includes(env.CMP_HOST))issues.push("CMP_HOST must be loopback");
  const port=Number(env.CMP_PORT||8787);
  if(!Number.isInteger(port)||port<1||port>65535)issues.push("CMP_PORT must be a valid TCP port");
  return issues;
}
export function initConfig(target = ".env"): void {
  if(existsSync(target))throw new Error(target+" already exists; refusing to overwrite");
  const lines=[
    "# Development-only CMP Server. Never deploy or expose this token.",
    "CMP_ENV=development",
    "CMP_DEV_TOKEN="+randomBytes(32).toString("hex"),
    "CMP_HOST=127.0.0.1",
    "CMP_PORT=8787",
    "CMP_DB_FILE=./data/cmp.sqlite",
    "CMP_ALLOWED_ORIGINS=http://localhost:3000",
    ""
  ].join("\n");
  writeFileSync(target,lines,{flag:"wx",mode:0o600});
  chmodSync(target,0o600);
}
async function main(): Promise<void> {
  const command=(process.argv[2]||"help") as Command;
  if(!commands.includes(command)){console.error("Unknown command: "+command+"\n"+usage);process.exitCode=2;return;}
  if(command==="help"){console.log(usage);return;}
  if(command==="init"){initConfig();console.log("Created .env with a random development token (permissions: 0600)");return;}
  const issues=validateEnvironment();
  if(issues.length){for(const issue of issues)console.error("FAIL "+issue);process.exitCode=1;return;}
  if(command==="doctor"){
    console.log("PASS local configuration");
    console.log("Development-only Core mode is enabled. No Cloud identity or agent services are bundled.");
    return;
  }
  const app=createCMPServer({
    token:process.env.CMP_DEV_TOKEN,
    dbFile:process.env.CMP_DB_FILE||"./data/cmp.sqlite",
    host:process.env.CMP_HOST||"127.0.0.1",
    port:Number(process.env.CMP_PORT||8787),
    allowedOrigins:(process.env.CMP_ALLOWED_ORIGINS||"http://localhost:3000").split(",")
  });
  const address=await app.listen();
  console.log("CMP local reference server listening at",address);
  const stop=async()=>{await app.close();process.exit(0);};
  process.once("SIGTERM",()=>{void stop();});
  process.once("SIGINT",()=>{void stop();});
}
if(process.argv[1] && import.meta.url===new URL("file://"+process.argv[1]).href){
  main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
}
