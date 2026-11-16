import type {IncomingMessage,ServerResponse} from "node:http";
import {McpServer,createMcpHandler} from "@modelcontextprotocol/server";
import {toNodeHandler,localhostHostValidation,localhostOriginValidation} from "@modelcontextprotocol/node";
import * as z from "zod/v4";
import {runCodeMode,permittedMethods} from "./code-mode.js";

type Values=Record<string,unknown>;
export const CORE_CONTEXT_METHODS=[
 "context.list","context.head","context.snapshot","context.branches",
 "context.branch","context.commit","context.merge"
] as const;

/** Strictly repository-only MCP adapter. Never binds agent sessions or Cloud credentials. */
export function createCoreMCPBridge(execute:(method:string,params:Values)=>unknown){
 const allowed=new Set<string>(CORE_CONTEXT_METHODS);
 const handler=createMcpHandler(()=>{
  const server=new McpServer({name:"cmp-core",version:"0.1.0"},{capabilities:{tools:{}}});
  server.registerTool("code_mode",{
   description:"Restricted CMP Core context operations: code_mode.docs(), explain(), search(), cmp.context.*.",
   inputSchema:z.object({code:z.string().min(1).max(16384)})
  },async({code}:{code:string})=>{
   try{
    const writable=process.env.CMP_CODE_MODE_WRITES_ENABLED==="true";
    const enabled=permittedMethods(writable).filter(method=>allowed.has(method));
    const result=await runCodeMode(code,(method,params)=>{
     if(!allowed.has(method))throw Error("CMP Core does not support this method");
     return execute(method,params);
    },{writesEnabled:writable,allowedMethods:enabled});
    return {content:[{type:"text" as const,text:JSON.stringify({result})}]};
   }catch(error){
    return {isError:true,content:[{type:"text" as const,
     text:error instanceof Error?error.message:String(error)}]};
   }
  });
  return server;
 },{responseMode:"json"});
 const node=toNodeHandler(handler);
 const checkHost=localhostHostValidation(),checkOrigin=localhostOriginValidation();
 return {
  handle(req:IncomingMessage,res:ServerResponse){
   if(!checkHost(req,res)||!checkOrigin(req,res))return;
   return node(req,res);
  },
  close:()=>handler.close()
 };
}
