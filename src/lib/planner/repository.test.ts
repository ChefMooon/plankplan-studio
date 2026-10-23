import { describe, expect, it } from 'vitest';
import { createProject } from './storage';
import { projectRepository } from './repository.indexeddb';

describe('per-project IndexedDB repository', () => {
  it('creates and reopens a v2 project with a generation token', async () => {
    const project = createProject('Repository test');
    const created = await projectRepository.create('local', project);
    expect(created).toMatchObject({ ok: true, token: { localGeneration: 1 } });
    expect(await projectRepository.list('local')).toMatchObject({ ok: true });
    if (!created.ok) return;
    const opened = await projectRepository.get({ namespaceId: 'local', projectId: project.id });
    expect(opened).toMatchObject({ ok: true, token: { localGeneration: 1 }, value: { name: 'Repository test', schemaVersion: 2 } });
  });

  it('rejects a stale generation without replacing a project', async () => {
    const project = createProject('Generation test');
    const created = await projectRepository.create('local', project);
    if (!created.ok) throw new Error('create failed');
    const first = await projectRepository.save({ namespaceId: 'local', projectId: project.id }, { ...project, name: 'First save' }, created.token);
    expect(first.ok).toBe(true);
    const stale = await projectRepository.save({ namespaceId: 'local', projectId: project.id }, { ...project, name: 'Stale save' }, created.token);
    expect(stale).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await projectRepository.delete({ namespaceId: 'local', projectId: project.id }, created.token)).toMatchObject({ok:false,kind:'conflict'});
    expect(await projectRepository.get({namespaceId:'local',projectId:project.id})).toMatchObject({ok:true,value:{name:'First save'},token:{localGeneration:2}});
  });

  it('keeps commits to different project identities independent', async () => {
    const first=createProject('Independent one'), second=createProject('Independent two');
    const a=await projectRepository.create('local',first), b=await projectRepository.create('local',second);
    if(!a.ok||!b.ok)throw new Error('create failed');
    const saved=await projectRepository.save({namespaceId:'local',projectId:first.id},{...first,name:'Changed one'},a.token);
    expect(saved.ok).toBe(true);
    expect(await projectRepository.get({namespaceId:'local',projectId:second.id})).toMatchObject({ok:true,value:{name:'Independent two'},token:{localGeneration:1}});
  });

  it('reports unavailable storage instead of returning an empty library', async () => {
    const original=globalThis.indexedDB;
    Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:undefined});
    try { expect(await projectRepository.list('local')).toEqual({ok:false,kind:'storage-failure',issues:[]}); }
    finally { Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:original}); }
  });
});
