import http,{type IncomingMessage,type ServerResponse} from "node:http";
import {timingSafeEqual} from "node:crypto";
import {Store} from "./storage.js";
import {ConflictError,type Repository,type CommitInput} from "./repository.js";
import {createCoreMCPBridge,CORE_CONTEXT_METHODS} from "./mcp.js";

type Values=Record<string,unknown>;
export type CoreOptions={token?:string;dbFile?:string;host?:string;port?:number;allowedOrigins?:string[]};

function respond(res:ServerResponse,status:number,body:unknown){
 res.writeHead(status,{"content-type":"application/json","cache-control":"no-store",
  "x-content-type-options":"nosniff"});
 res.end(JSON.stringify(body));
}
function equal(a:unknown,b:unknown){
 if(typeof a!=="string"||typeof b!=="string")return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
async function readBody(req:IncomingMessage):Promise<Values>{
 const chunks:Buffer[]=[];let size=0;
 for await(const part of req){
  const chunk=Buffer.isBuffer(part)?part:Buffer.from(part as string);
  size+=chunk.length;
  if(size>1048576)throw Object.assign(Error("Request too large"),{status:413});
  chunks.push(chunk);
 }
 const body=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}") as unknown;
 if(!body||typeof body!=="object"||Array.isArray(body))
  throw Object.assign(Error("Expected JSON object"),{status:400});
 return body as Values;
}
function rejectMethod(method:string):never{
 throw Object.assign(Error("Unsupported CMP Core method: "+method),{status:404});
}

/**
 * Pre-publication extraction candidate: repository-only CMP runtime.
 * Cloud-only WSS, Connect, agent coordination, and session archives are absent.
 * Still development/loopback only; do not mistake for a production security review.
 */
export function createCMPServer({
 token,dbFile=":memory:",host="127.0.0.1",port=0,allowedOrigins=["http://localhost:3000"]
}:CoreOptions={}){
 if(process.env.CMP_ENV!=="development")throw Error("CMP Core is not production-ready");
 if(typeof token!=="string"||token.length<32)throw Error("CMP_DEV_TOKEN must have at least 32 characters");
 if(!["127.0.0.1","localhost","::1"].includes(host))
  throw Error("Development CMP Core binds only to loopback");
 const store=new Store(dbFile),origins=new Set(allowedOrigins);
 const requireRepo=(id:string):Repository=>{
  const repo=/^[a-z0-9][a-z0-9_-]{1,63}$/.test(id)?store.get(id):undefined;
  if(!repo)throw Object.assign(Error("Repository not found"),{status:404});
  return repo;
 };
 const mutate=<T>(id:string,action:(r:Repository)=>T,name:string):T=>{
  requireRepo(id);
  return store.mutate(id,action,name).result;
 };
 const methods:Record<string,(p:Values)=>unknown>={
  "context.list":()=>({repositories:store.list()}),
  "context.head":p=>({head:requireRepo(String(p.repo)).head(String(p.branch||"main"))}),
  "context.snapshot":p=>({records:[...requireRepo(String(p.repo)).snapshot(String(p.ref||"main")).values()]}),
  "context.branches":p=>({branches:Object.fromEntries(requireRepo(String(p.repo)).branches)}),
  "context.branch":p=>mutate(String(p.repo),r=>({head:r.branch(String(p.name),String(p.from||"main"))}),"branch.created"),
  "context.commit":p=>mutate(String(p.repo),r=>r.commit(p as unknown as CommitInput),"commit.created"),
  "context.merge":p=>mutate(String(p.repo),r=>r.merge(String(p.source),String(p.target),String(p.authorId)),"merge.created")
 };
 const execute=(method:string,params:Values)=>methods[method]?methods[method](params):rejectMethod(method);
 const mcp=createCoreMCPBridge(execute);
 const server=http.createServer(async(req,res)=>{
  try {
   if(req.headers.origin&&!origins.has(req.headers.origin))
    return respond(res,403,{error:"Forbidden Origin"});
   const url=new URL(req.url||"/","http://localhost"),path=url.pathname;
   if(req.method==="GET"&&path==="/healthz")
    return respond(res,200,{status:"ok",edition:"cmp-core",environment:"development"});
   if(req.method==="GET"&&path==="/.well-known/context-management")
    return respond(res,200,{protocol:"cmp",version:1,transport:"http",
     endpoint:"/v1/rpc",mcp:"/mcp",capabilities:[...CORE_CONTEXT_METHODS],
     status:"development-only"});
   if(!req.headers.authorization?.startsWith("Bearer ")||
    !equal(req.headers.authorization.slice(7),token))
    return respond(res,401,{error:"Unauthorized"});
   if(path==="/mcp")return await mcp.handle(req,res);
   if(req.method==="POST"&&path==="/v1/rpc"){
    const request=await readBody(req),p=request.params;
    return respond(res,200,{result:execute(String(request.method||""),
     p&&typeof p==="object"&&!Array.isArray(p)?p as Values:{})});
   }
   if(req.method==="GET"&&path==="/v1/capabilities")
    return respond(res,200,{protocolVersion:1,implementation:"cmp-core",
     repositoryIdentifier:"local-repo",
     authentication:{type:"local-development-bearer",required:true,
      scopedAgentTokens:false,serviceAccountExchange:false},
     capabilities:{createRepository:true,listRepositories:true,getHead:true,getSnapshot:true,
      createBranch:true,commit:true,compareAndSwap:true,deleteRecord:true,merge:true,diff:true,
      websocket:false,agentCoordination:false,sessionArchive:false,connect:false},
     limits:{maxChangesPerCommit:500,maxRecordContentLength:100000,maxBranchNameLength:120}});
   if(req.method==="GET"&&path==="/v1/repos")
    return respond(res,200,{repositories:store.list()});
   if(req.method==="POST"&&path==="/v1/repos"){
    const input=await readBody(req),id=String(input.id||"");
    if(!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(id))
     throw Object.assign(Error("Invalid repository ID"),{status:400});
    const repo=store.create(id);
    return respond(res,201,{id,head:repo.head()});
   }
   const match=path.match(/^\/v1\/repos\/([a-z0-9_-]+)(?:\/(.*))?$/);
   if(match){
    const id=match[1]!,part=match[2]||"",repo=requireRepo(id),q=url.searchParams;
    if(req.method==="GET"&&part==="")
     return respond(res,200,{id,head:repo.head(),branches:Object.fromEntries(repo.branches)});
    if(req.method==="GET"&&part==="records")
     return respond(res,200,{records:[...repo.snapshot(q.get("ref")||"main").values()]});
    if(req.method==="GET"&&part==="branches")
     return respond(res,200,{branches:Object.fromEntries(repo.branches)});
    if(req.method==="GET"&&part==="head")
     return respond(res,200,{head:repo.head(q.get("branch")||"main")});
    if(req.method==="GET"&&part==="diff"){
     const from=q.get("from")||"main",to=q.get("to")||"main";
     const before=repo.snapshot(from),after=repo.snapshot(to),changes=[];
     for(const key of [...new Set([...before.keys(),...after.keys()])].sort()){
      const old=before.get(key),current=after.get(key);
      if(JSON.stringify(old)===JSON.stringify(current))continue;
      if(current)changes.push({op:"put",record:current});
      else changes.push({op:"delete",id:key});
     }
     return respond(res,200,{from,to,changes});
    }
    if(req.method==="GET"&&part==="events")
     return respond(res,200,{events:store.eventsAfter(id,q.get("cursor")||"0")});
    if(req.method==="POST"&&part==="branches"){
     const p=await readBody(req);
     return respond(res,201,mutate(id,r=>({head:r.branch(String(p.name),String(p.from||"main"))}),"branch.created"));
    }
    if(req.method==="POST"&&part==="commits"){
     const p=await readBody(req);
     return respond(res,201,mutate(id,r=>r.commit(p as unknown as CommitInput),"commit.created"));
    }
    if(req.method==="POST"&&part==="merge"){
     const p=await readBody(req);
     return respond(res,200,mutate(id,r=>r.merge(String(p.source),String(p.target),String(p.authorId)),"merge.created"));
    }
   }
   return respond(res,404,{error:"Not found"});
  }catch(error){
   const status=error instanceof ConflictError?409:
    (error as {status?:number}).status||400;
   respond(res,status,{error:error instanceof Error?error.message:String(error),
    records:error instanceof ConflictError?error.records:undefined});
  }
 });
 return {store,server,listen:()=>new Promise<ReturnType<typeof server.address>>((done,fail)=>{
   server.listen(port,host,()=>done(server.address())).once("error",fail);
  }),close:async()=>{
   await new Promise<void>((done,fail)=>server.close(err=>err?fail(err):done()));
   await mcp.close();store.close();
  }};
}
