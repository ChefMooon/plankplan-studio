import { describe, expect, it } from 'vitest';
import { createProject } from './storage';
import { migrateLegacyProjects, LEGACY_PROJECTS_KEY } from './recovery';
import { projectRepository } from './repository.indexeddb';

describe('recoverable legacy cutover',()=>{
  it('retains exact whole-library bytes and resumes idempotently without overwriting projects',async()=>{
    const project=createProject('Legacy fixture');
    const raw=`  ${JSON.stringify([project])} \n`;
    localStorage.setItem(LEGACY_PROJECTS_KEY,raw);
    const first=await migrateLegacyProjects(localStorage);
    expect(first.projectIds).toContain(project.id);
    const recoveryId=first.recoveryIds[0];
    const bytes=await projectRepository.exportRecovery(recoveryId);
    expect(await bytes?.text()).toBe(raw);
    const current=await projectRepository.get({namespaceId:'local',projectId:project.id});
    expect(current).toMatchObject({ok:true,token:{localGeneration:1},value:{name:'Legacy fixture'}});
    const repeated=await migrateLegacyProjects(localStorage);
    expect(repeated.projectIds).toEqual(first.projectIds);
    expect((await projectRepository.get({namespaceId:'local',projectId:project.id})).ok).toBe(true);
  });

  it('preserves malformed and duplicate records as independent recovery candidates',async()=>{
    const valid=createProject('Duplicate candidate');
    const raw=JSON.stringify([valid,valid,{schemaVersion:2,broken:true}]);
    localStorage.setItem(LEGACY_PROJECTS_KEY,raw);
    const result=await migrateLegacyProjects(localStorage);
    expect(result.state).toBe('needs-recovery');
    expect(result.recoveryIds.length).toBeGreaterThanOrEqual(3);
    expect(await projectRepository.exportRecovery(result.recoveryIds[0]).then(blob=>blob?.text())).toBe(raw);
    expect(await projectRepository.get({namespaceId:'local',projectId:valid.id})).toMatchObject({ok:true,value:{name:'Duplicate candidate'}});
  });

  it('serializes concurrent attempts for one source hash without duplicate generations',async()=>{
    const project=createProject('Concurrent migration');const raw=JSON.stringify([project]);localStorage.setItem(LEGACY_PROJECTS_KEY,raw);
    const results=await Promise.all([migrateLegacyProjects(localStorage),migrateLegacyProjects(localStorage)]);
    expect(results.every(result=>result.sourceHash)).toBe(true);
    const opened=await projectRepository.get({namespaceId:'local',projectId:project.id});
    expect(opened).toMatchObject({ok:true,token:{localGeneration:1},value:{name:'Concurrent migration'}});
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('plankplan-studio.local',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const tx=db.transaction('meta','readonly');const key=`migration:${results[0].sourceHash}:attempt`;
    const attempt=await new Promise<unknown>((resolve,reject)=>{const request=tx.objectStore('meta').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    expect(attempt).toMatchObject({value:{attempts:1,lastOutcome:'complete',projectIds:[project.id]}});
  });

  it('retains changed source bytes and migrates the new hash on retry',async()=>{
    const original=createProject('Original legacy');const changed=createProject('Changed legacy');
    const originalRaw=JSON.stringify([original]);const changedRaw=JSON.stringify([changed]);let reads=0;
    const changingStorage={getItem:()=>++reads===1?originalRaw:changedRaw} as unknown as Storage;
    const first=await migrateLegacyProjects(changingStorage);
    expect(first.state).toBe('needs-recovery');
    expect(await projectRepository.get({namespaceId:'local',projectId:original.id})).toMatchObject({ok:true,value:{name:'Original legacy'}});
    expect(await projectRepository.exportRecovery(first.recoveryIds.at(-1)!).then(blob=>blob?.text())).toBe(changedRaw);
    const stableStorage={getItem:()=>changedRaw} as unknown as Storage;
    const second=await migrateLegacyProjects(stableStorage);
    expect(second.state).toBe('complete');
    expect(second.sourceHash).not.toBe(first.sourceHash);
    expect(await projectRepository.get({namespaceId:'local',projectId:changed.id})).toMatchObject({ok:true,value:{name:'Changed legacy'}});
    expect(await projectRepository.get({namespaceId:'local',projectId:original.id})).toMatchObject({ok:true,value:{name:'Original legacy'}});
  });
});
