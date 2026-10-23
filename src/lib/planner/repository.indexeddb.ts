import { normalizeProjectDocument, type Project } from './model';
import type { ConcurrencyToken, DeleteResult, ListResult, NamespaceId, ProjectKey, ProjectRepository, ProjectSummary, ReadResult, WriteResult } from './repository';

type StoredProject = { namespaceId: NamespaceId; projectId: string; generation: number; schemaVersion: number; name: string; updatedAt: string; document: Project };
type RecoveryRecord = { recoveryId: string; namespaceId: NamespaceId; sourceKind: 'legacy-library'|'legacy-project'|'import'|'unsupported-document'; sourceHash?: string; sourceBytes: ArrayBuffer; sourceProjectId?: string; status: 'available'|'repair-candidate'|'recovered'; observedAt: string };
const DB_NAME = 'plankplan-studio.local';
const DB_VERSION = 1;
function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) { const store = db.createObjectStore('projects', { keyPath: ['namespaceId', 'projectId'] }); store.createIndex('by-namespace-updated', ['namespaceId', 'updatedAt']); }
      if (!db.objectStoreNames.contains('recovery')) db.createObjectStore('recovery', { keyPath: 'recoveryId' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another tab'));
  });
}
const keyRange = (namespaceId: NamespaceId) => IDBKeyRange.bound([namespaceId, ''], [namespaceId, '\uffff']);
const errorKind = (error: unknown): 'quota'|'storage-failure' => error instanceof DOMException && error.name === 'QuotaExceededError' ? 'quota' : 'storage-failure';
const subscribers = new Map<NamespaceId, Set<(changed: ProjectKey[]) => void>>();
function broadcast(keys: ProjectKey[]) { for (const key of keys) subscribers.get(key.namespaceId)?.forEach(fn => fn(keys)); }
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${DB_NAME}.changes`) : undefined;
channel?.addEventListener('message', e => { if (Array.isArray(e.data)) broadcast(e.data as ProjectKey[]); });
// Do not reload a writer's own in-memory document; BroadcastChannel delivers to other tabs.
function notify(keys: ProjectKey[]) { channel?.postMessage(keys); }
function req<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}); }
function txDone(tx: IDBTransaction): Promise<void> { return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Transaction aborted'));tx.onerror=()=>reject(tx.error??new Error('Transaction failed'));}); }

export class IndexedDbProjectRepository implements ProjectRepository {
  async list(namespaceId: NamespaceId): Promise<ListResult> {
    try { const db=await openDb(); const tx=db.transaction(['projects','recovery'],'readonly'); const rows=await req(tx.objectStore('projects').getAll(keyRange(namespaceId))) as StoredProject[]; const records=await req(tx.objectStore('recovery').getAll()) as RecoveryRecord[]; await txDone(tx); const summaries:ProjectSummary[]=rows.map(r=>({id:r.projectId,name:r.name,updatedAt:r.updatedAt,localGeneration:r.generation,schemaVersion:r.schemaVersion,issueCount:0})); const issues=records.filter(r=>r.namespaceId===namespaceId&&r.status!=='recovered').map(r=>({recoveryId:r.recoveryId,code:'recovery-available',path:r.sourceProjectId??'legacy-library',severity:'warning' as const,sourceProjectId:r.sourceProjectId})); return {ok:true,summaries,issues}; } catch { return {ok:false,kind:'storage-failure',issues:[]}; }
  }
  async get(key: ProjectKey): Promise<ReadResult<Project>> {
    try {const db=await openDb();const tx=db.transaction('projects','readonly');const r=await req(tx.objectStore('projects').get([key.namespaceId,key.projectId])) as StoredProject|undefined;await txDone(tx);if(!r)return{ok:false,kind:'not-found'};try{return{ok:true,value:normalizeProjectDocument(r.document),token:{localGeneration:r.generation}};}catch(error){return{ok:false,kind:'validation',issue:{code:'invalid-document',path:String(error),severity:'error'}};}}catch{return{ok:false,kind:'storage-failure'};}
  }
  async create(namespaceId: NamespaceId, document: Project): Promise<WriteResult> {
    if(document.schemaVersion>2)return{ok:false,kind:'unsupported-version',issue:{code:'unsupported-version',path:'$.schemaVersion',severity:'error'}};
    let clean:Project;try{clean=normalizeProjectDocument(document);}catch(error){return{ok:false,kind:'validation',issue:{code:'invalid-document',path:String(error),severity:'error'}};}
    try {const db=await openDb();const tx=db.transaction('projects','readwrite');const store=tx.objectStore('projects');const idbKey=[namespaceId,clean.id];const existing=await req(store.get(idbKey));if(existing)return{ok:false,kind:'conflict'};store.add({namespaceId,projectId:clean.id,generation:1,schemaVersion:clean.schemaVersion,name:clean.name,updatedAt:clean.updatedAt,document:clean} satisfies StoredProject);await txDone(tx);notify([{namespaceId,projectId:clean.id}]);return{ok:true,value:clean,token:{localGeneration:1}};}catch(error){return{ok:false,kind:errorKind(error),issue:{code:'create-failed',path:'$',severity:'error'}};}
  }
  async save(key: ProjectKey, document: Project, expected: ConcurrencyToken): Promise<WriteResult> {
    if(document.id!==key.projectId)return{ok:false,kind:'validation',issue:{code:'identity-mismatch',path:'$.id',severity:'error'}};
    if(document.schemaVersion>2)return{ok:false,kind:'unsupported-version',issue:{code:'unsupported-version',path:'$.schemaVersion',severity:'error'}};
    let clean:Project;try{clean=normalizeProjectDocument(document);}catch(error){return{ok:false,kind:'validation',issue:{code:'invalid-document',path:String(error),severity:'error'}};}
    try {const db=await openDb();const tx=db.transaction('projects','readwrite');const store=tx.objectStore('projects');const idbKey=[key.namespaceId,key.projectId];const old=await req(store.get(idbKey)) as StoredProject|undefined;if(!old)return{ok:false,kind:'not-found'};if(old.schemaVersion>2)return{ok:false,kind:'unsupported-version',issue:{code:'unsupported-version',path:'$.schemaVersion',severity:'error'}};if(old.generation!==expected.localGeneration)return{ok:false,kind:'conflict'};const generation=old.generation+1;store.put({namespaceId:key.namespaceId,projectId:key.projectId,generation,schemaVersion:clean.schemaVersion,name:clean.name,updatedAt:clean.updatedAt,document:clean} satisfies StoredProject);await txDone(tx);notify([key]);return{ok:true,value:clean,token:{localGeneration:generation}};}catch(error){return{ok:false,kind:errorKind(error),issue:{code:'save-failed',path:'$',severity:'error'}};}
  }
  async delete(key: ProjectKey, expected: ConcurrencyToken): Promise<DeleteResult> {
    try {const db=await openDb();const tx=db.transaction('projects','readwrite');const store=tx.objectStore('projects');const idbKey=[key.namespaceId,key.projectId];const old=await req(store.get(idbKey)) as StoredProject|undefined;if(!old)return{ok:false,kind:'not-found'};if(old.generation!==expected.localGeneration)return{ok:false,kind:'conflict'};store.delete(idbKey);await txDone(tx);notify([key]);return{ok:true};}catch{return{ok:false,kind:'storage-failure'};}
  }
  subscribe(namespaceId: NamespaceId, listener: (changed: ProjectKey[]) => void): () => void {let set=subscribers.get(namespaceId);if(!set){set=new Set();subscribers.set(namespaceId,set);}set.add(listener);return()=>{set?.delete(listener);if(!set?.size)subscribers.delete(namespaceId);};}
  async putRecovery(record: RecoveryRecord): Promise<void> {const db=await openDb();const tx=db.transaction('recovery','readwrite');tx.objectStore('recovery').put(record);await txDone(tx);}
  async getRecovery(recoveryId:string):Promise<RecoveryRecord|undefined>{const db=await openDb();const tx=db.transaction('recovery','readonly');const record=await req(tx.objectStore('recovery').get(recoveryId)) as RecoveryRecord|undefined;await txDone(tx);return record;}
  async exportRecovery(recoveryId:string):Promise<Blob|undefined>{const record=await this.getRecovery(recoveryId);return record?new Blob([record.sourceBytes],{type:'application/octet-stream'}):undefined;}
}
export const projectRepository = new IndexedDbProjectRepository();
