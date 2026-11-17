/**
 * Core's only external owner is local. Authorization remains independent of
 * namespace identity. Existing SQLite keys remain the original flat name.
 */
const NAME=/^[a-z0-9][a-z0-9_-]{1,63}$/;
const canonical=(name:string)=>"local/"+name;
const invalid=():never=>{throw Object.assign(new Error("Invalid CMP Core repository ID; expected local/name"),{status:400});};

export function corePublicId(name:string):string {
 if(!NAME.test(name))return invalid();
 return canonical(name);
}
export function coreStorageId(external:unknown,allowLegacy=true):string {
 if(typeof external!=="string")return invalid();
 const value=external;
 if(value.startsWith("local/")){
  const name=value.slice("local/".length);
  if(!NAME.test(name))return invalid();
  return name;
 }
 if(allowLegacy&&NAME.test(value))return value; // Deprecated flat alias.
 return invalid();
}

/** Decode the raw one-segment REST repository parameter exactly once. */
export function coreRestStorageId(raw:string):string {
 if(!raw||raw.includes("/")||/%(?![a-fA-F0-9]{2})/.test(raw)
   ||/%(?:25|2e|5c|00)/i.test(raw))return invalid();
 let decoded:string;
 try{decoded=decodeURIComponent(raw);}catch{return invalid();}
 if(decoded.includes("%"))return invalid(); // No double encoding or ambiguous aliases.
 return coreStorageId(decoded,true);
}

/** The .cmp transport identity is the same canonical public name as REST. */
export function coreCmpStorageId(rawName:string):string{
 if(!NAME.test(rawName))return invalid();
 return rawName;
}
