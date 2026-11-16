import ts from "typescript";

/**
 * CMP Code Mode is a deliberately limited TypeScript *syntax interpreter*.
 * No compiled JavaScript is ever evaluated. Only JSON literals, read-only
 * result references, and exact CMP method calls may execute.
 */
type Values = Record<string,unknown>;
export type CodeModeCallable=(method:string,params:Values)=>Promise<unknown>|unknown;

const descriptions:Record<string,string>={
 "context.list":"List available versioned context repositories.",
 "context.head":"Read branch head for a repository.",
 "context.snapshot":"Retrieve versioned context records.",
 "context.branches":"Read repository branch pointers.",
 "context.branch":"Create a context branch.",
 "context.commit":"Commit knowledge records with compare-and-swap protection.",
 "context.merge":"Merge two context branches."
};
const readonlySet=new Set([
 "context.list","context.head","context.snapshot","context.branches"
]);
const forbiddenProperties=new Set(["__proto__","prototype","constructor"]);
const fail=(reason:string):never=>{throw Object.assign(new Error("Code Mode: "+reason),{status:400});};
function access(node:ts.Node):string[]{
 if(ts.isIdentifier(node))return [node.text];
 if(ts.isPropertyAccessExpression(node)&&!forbiddenProperties.has(node.name.text))
   return [...access(node.expression),node.name.text];
 return fail("Only direct CMP method names are supported");
}
export function permittedMethods(writesEnabled:boolean):string[]{
 return Object.keys(descriptions).filter(method=>writesEnabled||readonlySet.has(method));
}
export async function runCodeMode(program:string,call:CodeModeCallable,{
 writesEnabled=false,maxCalls=16,allowedMethods
}: {writesEnabled?:boolean;maxCalls?:number;allowedMethods?:readonly string[]}={}):Promise<unknown>{
 if(typeof program!=="string"||program.length>16384)fail("Program exceeds 16KB limit");
 const file=ts.createSourceFile("cmp-code-mode.ts",program,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
 if((file as ts.SourceFile & {parseDiagnostics:readonly ts.Diagnostic[]}).parseDiagnostics.length)fail("Invalid TypeScript syntax");
 if(file.statements.length>32)fail("Program has too many statements");
 const allowed=new Set(allowedMethods||permittedMethods(writesEnabled));
 const visible=()=>permittedMethods(writesEnabled).filter(method=>allowed.has(method));
 const bindings=new Map<string,unknown>();
 let remaining=maxCalls;
 const seen=new Set<string>();
 async function value(node:ts.Expression,depth=0):Promise<unknown>{
  if(depth>12)fail("Expression depth exceeded");
  if(ts.isAwaitExpression(node)||ts.isParenthesizedExpression(node))return value(node.expression,depth+1);
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return node.text;
  if(ts.isNumericLiteral(node)){
   const num=Number(node.text);if(!Number.isFinite(num))fail("Invalid number");return num;
  }
  if(ts.isPrefixUnaryExpression(node)&&node.operator===ts.SyntaxKind.MinusToken
    &&ts.isNumericLiteral(node.operand))return -Number(node.operand.text);
  if(node.kind===ts.SyntaxKind.TrueKeyword)return true;
  if(node.kind===ts.SyntaxKind.FalseKeyword)return false;
  if(node.kind===ts.SyntaxKind.NullKeyword)return null;
  if(ts.isIdentifier(node)){
   if(!bindings.has(node.text))fail("Unknown variable "+node.text);
   return bindings.get(node.text);
  }
  if(ts.isArrayLiteralExpression(node)){
   if(node.elements.length>100)fail("Array size exceeded");
   const elements=[];
   for(const item of node.elements){
    if(ts.isSpreadElement(item))fail("Spread expressions are forbidden");
    elements.push(await value(item,depth+1));
   }
   return elements;
  }
  if(ts.isObjectLiteralExpression(node)){
   if(node.properties.length>100)fail("Object size exceeded");
   const out:Values=Object.create(null) as Values;
   for(const item of node.properties){
    if(!ts.isPropertyAssignment(item))return fail("Only object properties are allowed");
    const name=ts.isIdentifier(item.name)||ts.isStringLiteral(item.name)?item.name.text:null;
    if(!name||forbiddenProperties.has(name))return fail("Computed or unsafe property names are forbidden");
    out[name]=await value(item.initializer,depth+1);
   }
   return out;
  }
  if(ts.isPropertyAccessExpression(node)){
   const parts=access(node);
   if(parts.length>6||!bindings.has(parts[0]!))fail("Unbound property access");
   let current=bindings.get(parts[0]!);
   for(const part of parts.slice(1)){
    if(forbiddenProperties.has(part)||!current||typeof current!=="object"
     ||!Object.prototype.hasOwnProperty.call(current,part))fail("Unsafe result property");
    current=(current as Values)[part];
   }
   return current;
  }
  if(ts.isCallExpression(node)){
   const parts=access(node.expression),name=parts.join(".");
   const args:unknown[]=[];
   for(const argument of node.arguments)args.push(await value(argument,depth+1));
   if(parts[0]==="code_mode"){
    if(name==="code_mode.docs"&&args.length===0)
     return {methods:visible(),guide:"Use await cmp.context.list({}); return result; Only literal data and authorized CMP calls are accepted."};
    if(name==="code_mode.explain"&&args.length===1&&typeof args[0]==="string")
     return allowed.has(args[0])?{method:args[0],description:descriptions[args[0]]}:{error:"Not authorized or unknown method"};
    if(name==="code_mode.search"&&args.length===1&&typeof args[0]==="string")
     return visible().filter(method=>
       (method+" "+descriptions[method]).toLowerCase().includes((args[0] as string).toLowerCase())).map(method=>({method,description:descriptions[method]}));
    fail("Unknown local Code Mode documentation method");
   }
   if(parts[0]!=="cmp")fail("Only cmp.* and code_mode.* calls are permitted");
   const method=parts.slice(1).join(".");
   if(!allowed.has(method))fail("CMP method is unknown or not allowed: "+method);
   if(args.length!==1||!args[0]||Array.isArray(args[0])||typeof args[0]!=="object")
    fail("CMP method requires one JSON object argument");
   if(--remaining<0)fail("Too many CMP method calls");
   return call(method,args[0] as Values);
  }
  return fail("Unsupported expression: "+ts.SyntaxKind[node.kind]);
 }
 let last:unknown=null;
 for(const statement of file.statements){
  if(ts.isVariableStatement(statement)){
   if(!(statement.declarationList.flags&ts.NodeFlags.Const))fail("Only const declarations are supported");
   for(const declaration of statement.declarationList.declarations){
    if(!ts.isIdentifier(declaration.name)||!declaration.initializer)return fail("Destructuring and undefined declarations are forbidden");
    if(seen.has(declaration.name.text))fail("Variable already defined");
    seen.add(declaration.name.text);
    last=await value(declaration.initializer);
    bindings.set(declaration.name.text,last);
   }
  }else if(ts.isExpressionStatement(statement))last=await value(statement.expression);
  else if(ts.isReturnStatement(statement))return statement.expression?value(statement.expression):null;
  else return fail("Unsupported statement: "+ts.SyntaxKind[statement.kind]);
 }
 return last;
}
