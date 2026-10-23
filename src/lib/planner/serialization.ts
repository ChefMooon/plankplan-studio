/** Deterministic compact JSON for portable project documents. */
export const MAX_PROJECT_BYTES = 1_000_000;
export const MAX_IMPORT_BYTES = 2_000_000;

export function serializeCanonical(value: unknown): string {
  const visit=(current:unknown,path:string):string=>{
    if(current===null||typeof current==='string'||typeof current==='boolean')return JSON.stringify(current);
    if(typeof current==='number'){if(!Number.isFinite(current))throw new Error(`Non-finite number at ${path}`);return JSON.stringify(current);}
    if(Array.isArray(current)){const parts:string[]=[];for(let i=0;i<current.length;i++){if(!(i in current))throw new Error(`Sparse array at ${path}[${i}]`);parts.push(visit(current[i],`${path}[${i}]`));}return `[${parts.join(',')}]`;}
    if(current&&typeof current==='object'){
      const record=current as Record<string,unknown>;
      const keys=Object.keys(record).sort((a,b)=>a<b?-1:a>b?1:0);
      return `{${keys.map(key=>{if(record[key]===undefined)throw new Error(`Undefined value at ${path}.${key}`);return `${JSON.stringify(key)}:${visit(record[key],`${path}.${key}`)}`;}).join(',')}}`;
    }
    throw new Error(`Value is not JSON serializable at ${path}`);
  };
  return visit(value,'$');
}

export function utf8ByteLength(value: string): number { return new TextEncoder().encode(value).byteLength; }
export function serializeProjectDocument(value: unknown): string {
  const json = serializeCanonical(value);
  const bytes = utf8ByteLength(json);
  if (bytes > MAX_PROJECT_BYTES) throw new Error(`Project document exceeds ${MAX_PROJECT_BYTES} UTF-8 bytes`);
  return json;
}
export function readBoundedProjectInput(json: string): unknown {
  if (utf8ByteLength(json) > MAX_IMPORT_BYTES) throw new Error(`Import exceeds ${MAX_IMPORT_BYTES} UTF-8 bytes`);
  return JSON.parse(json) as unknown;
}
