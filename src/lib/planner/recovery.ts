import { exportProject, importProject, type Project } from './model';
import { projectRepository } from './repository.indexeddb';

export const LEGACY_PROJECTS_KEY = 'plankplan-studio.projects.v1';
export type MigrationStatus = { state: 'complete'|'needs-recovery'|'empty'; sourceHash?: string; projectIds: string[]; recoveryIds: string[] };
const MIGRATION_LEASE_MS = 120_000;
const migrationOwner = () => crypto.randomUUID();
async function digest(bytes: Uint8Array): Promise<string> { const exact=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer; const hash=await crypto.subtle.digest('SHA-256',exact);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function preserve(raw: string, kind: 'legacy-library'|'legacy-project'|'import'|'unsupported-document', sourceProjectId?: string): Promise<string> {
  const bytes=new TextEncoder().encode(raw);const sourceHash=await digest(bytes);const recoveryId=`${kind}:${sourceHash}`;await projectRepository.putRecovery({recoveryId,namespaceId:'local',sourceKind:kind,sourceHash,sourceBytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),sourceProjectId,status:'available',observedAt:new Date().toISOString()});return recoveryId;
}
/** Capture the old whole-library value before attempting conversion; exact legacy bytes remain available for export. */
export async function migrateLegacyProjects(storage: Storage = localStorage): Promise<MigrationStatus> {
  const raw=storage.getItem(LEGACY_PROJECTS_KEY);if(raw===null)return{state:'empty',projectIds:[],recoveryIds:[]};
  const recoveryIds:string[]=[];
  try {
    const hash=await digest(new TextEncoder().encode(raw));
    const ownerKey=`migration:${hash}`;
    const owner=migrationOwner();
    const acquired=await acquireMigrationAttempt(ownerKey,owner,hash);
    if(!acquired.acquired){
      if(acquired.complete)return{state:'complete',sourceHash:hash,projectIds:acquired.projectIds??[],recoveryIds:acquired.recoveryIds??[]};
      const id=await preserve(raw,'legacy-library');
      return{state:'needs-recovery',sourceHash:hash,projectIds:[],recoveryIds:[id]};
    }
    // Hash-keyed completed markers make repeated startup safe; a leased attempt
    // keeps concurrent tabs from independently converting the same source.
    const previous=await readMigrationMarker(ownerKey);if(previous?.complete)return{state:'complete',sourceHash:hash,projectIds:previous.projectIds,recoveryIds:previous.recoveryIds};
    let library:unknown;try{library=JSON.parse(raw);}catch{const id=await preserve(raw,'legacy-library');await finishMigrationAttempt(ownerKey,owner,{complete:false,sourceHash:hash,projectIds:[],recoveryIds:[id]});return{state:'needs-recovery',sourceHash:hash,projectIds:[],recoveryIds:[id]};}
    if(!Array.isArray(library)){const id=await preserve(raw,'legacy-library');await finishMigrationAttempt(ownerKey,owner,{complete:false,sourceHash:hash,projectIds:[],recoveryIds:[id]});return{state:'needs-recovery',sourceHash:hash,projectIds:[],recoveryIds:[id]};}
    const valid:Project[]=[];const seen=new Set<string>();
    for(const candidate of library){try{const p=importProject(JSON.stringify(candidate));if(seen.has(p.id)){const id=await preserve(JSON.stringify(candidate),'legacy-project',p.id);recoveryIds.push(id);continue;}seen.add(p.id);valid.push(p);}catch{const id=await preserve(JSON.stringify(candidate),'legacy-project');recoveryIds.push(id);}}
    const whole=await preserve(raw,'legacy-library');recoveryIds.unshift(whole);
    const projectIds:string[]=[];
    for(const p of valid){const existing=await projectRepository.get({namespaceId:'local',projectId:p.id});if(existing.ok){projectIds.push(p.id);continue;}const result=await projectRepository.create('local',p);if(result.ok){const reopened=await projectRepository.get({namespaceId:'local',projectId:p.id});if(reopened.ok&&exportProject(reopened.value)===exportProject(result.value))projectIds.push(p.id);else{const id=await preserve(JSON.stringify(p),'legacy-project',p.id);recoveryIds.push(id);}}else{const id=await preserve(JSON.stringify(p),'legacy-project',p.id);recoveryIds.push(id);}}
    // Re-read the source immediately before committing completion. IDB and
    // localStorage cannot share an atomic transaction, so this detects writes
    // already observed here but cannot fence a legacy tab that writes later.
    const latest=storage.getItem(LEGACY_PROJECTS_KEY);
    if(latest!==raw){if(latest!==null){const id=await preserve(latest,'legacy-library');recoveryIds.push(id);}await finishMigrationAttempt(ownerKey,owner,{complete:false,sourceHash:hash,projectIds,recoveryIds});return{state:'needs-recovery',sourceHash:hash,projectIds,recoveryIds};}
    const committed=await finishMigrationAttempt(ownerKey,owner,{complete:true,sourceHash:hash,projectIds,recoveryIds});
    if(!committed){const current=storage.getItem(LEGACY_PROJECTS_KEY);if(current!==null&&current!==raw)recoveryIds.push(await preserve(current,'legacy-library'));return{state:'needs-recovery',sourceHash:hash,projectIds,recoveryIds};}
    await projectRepository.archiveRecovery(whole);
    return{state:recoveryIds.length>1?'needs-recovery':'complete',sourceHash:hash,projectIds,recoveryIds};
  }catch{const id=await preserve(raw,'legacy-library');return{state:'needs-recovery',projectIds:[],recoveryIds:[id]};}
}
type MigrationMarker={complete:boolean;sourceHash:string;projectIds:string[];recoveryIds:string[]};
type MigrationLease={owner:string;expiresAt:number;attempts:number;lastAttemptAt:string;sourceHash?:string;lastOutcome?:string;projectIds?:string[];recoveryIds?:string[]};
async function acquireMigrationAttempt(key:string,owner:string,sourceHash:string):Promise<{acquired:boolean;complete?:boolean;projectIds?:string[];recoveryIds?:string[]}>{
  const db=await indexedDb();const tx=db.transaction('meta','readwrite');const store=tx.objectStore('meta');const markerRecord=await request(store.get(key));const marker=markerRecord?.value as MigrationMarker|undefined;
  if(marker?.complete){await txDone(tx);return{acquired:false,complete:true,projectIds:marker.projectIds,recoveryIds:marker.recoveryIds};}
  const leaseRecord=await request(store.get(`${key}:attempt`));const lease=leaseRecord?.value as MigrationLease|undefined;const now=Date.now();
  if(lease&&lease.expiresAt>now){await txDone(tx);return{acquired:false};}
  store.put({key:`${key}:attempt`,value:{owner,expiresAt:now+MIGRATION_LEASE_MS,attempts:(lease?.attempts??0)+1,lastAttemptAt:new Date(now).toISOString(),sourceHash} satisfies MigrationLease & {sourceHash:string}});
  await txDone(tx);return{acquired:true};
}
async function readMigrationMarker(key:string):Promise<{complete:boolean;projectIds:string[];recoveryIds:string[]}|undefined>{try{const db=await indexedDb();const tx=db.transaction('meta','readonly');const result=await request(tx.objectStore('meta').get(key));return result?.value;}catch{return undefined;}}
async function finishMigrationAttempt(key:string,owner:string,value:MigrationMarker):Promise<boolean>{
  const db=await indexedDb();const tx=db.transaction('meta','readwrite');const store=tx.objectStore('meta');const record=await request(store.get(`${key}:attempt`));const lease=record?.value as MigrationLease|undefined;
  if(!lease||lease.owner!==owner||lease.expiresAt<=Date.now()){tx.abort();try{await txDone(tx);}catch{/* Expected abort after lease ownership changed. */}return false;}
  if(value.complete)store.put({key,value});
  store.put({key:`${key}:attempt`,value:{...lease,expiresAt:0,lastAttemptAt:new Date().toISOString(),lastOutcome:value.complete?'complete':'needs-recovery',projectIds:value.projectIds,recoveryIds:value.recoveryIds}});
  await txDone(tx);return true;
}
async function indexedDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('plankplan-studio.local',1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('projects')){const store=db.createObjectStore('projects',{keyPath:['namespaceId','projectId']});store.createIndex('by-namespace-updated',['namespaceId','updatedAt']);}if(!db.objectStoreNames.contains('recovery'))db.createObjectStore('recovery',{keyPath:'recoveryId'});if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function request<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function txDone(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Transaction aborted'));});}
let watcherInstalled=false;
export function watchLegacyPayloadChanges(onChange:(status:MigrationStatus)=>void):()=>void {
  if(watcherInstalled)return()=>undefined;watcherInstalled=true;
  let last=localStorage.getItem(LEGACY_PROJECTS_KEY);let active=true;
  const inspect=()=>{if(!active)return;const raw=localStorage.getItem(LEGACY_PROJECTS_KEY);if(raw!==last){last=raw;void migrateLegacyProjects().then(onChange);}};
  const onStorage=(event:StorageEvent)=>{if(event.key===LEGACY_PROJECTS_KEY)inspect();};
  window.addEventListener('storage',onStorage);window.addEventListener('focus',inspect);const timer=window.setInterval(inspect,60_000);
  return()=>{active=false;watcherInstalled=false;window.removeEventListener('storage',onStorage);window.removeEventListener('focus',inspect);window.clearInterval(timer);};
}
export async function exportRecovery(recoveryId:string):Promise<Blob|undefined>{return projectRepository.exportRecovery(recoveryId);}
