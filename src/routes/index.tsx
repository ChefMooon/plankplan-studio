/* TanStack file routes export a Route object alongside their page component. */
/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { createProject, importProjectAsNew } from '@/lib/planner/storage';
import { copyProjectDocument, type Project } from '@/lib/planner/model';
import { projectRepository } from '@/lib/planner/repository.indexeddb';
import type { RecoveryIssue } from '@/lib/planner/repository';
import { LEGACY_PROJECTS_KEY, migrateLegacyProjects, watchLegacyPayloadChanges } from '@/lib/planner/recovery';
import { ProjectCard } from '@/components/project-card';
import { ThemeToggle } from '@/components/theme-toggle';

export const Route = createFileRoute('/')({ component: Home });
function Home() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState('Loading projects…');
  const [recoveryIssues,setRecoveryIssues]=useState<RecoveryIssue[]>([]);
  const reloadSequence=useRef(0);
  const reload = async () => { const sequence=++reloadSequence.current;let migratedState='empty'; if(window.localStorage.getItem(LEGACY_PROJECTS_KEY)!==null)migratedState=(await migrateLegacyProjects()).state; const listed = await projectRepository.list('local'); if(sequence!==reloadSequence.current)return;if (!listed.ok) { setStatus('Project storage is unavailable. Retry to load your projects.'); return; } setRecoveryIssues(listed.issues); const loaded = await Promise.all(listed.summaries.map(async summary => { const result = await projectRepository.get({ namespaceId:'local', projectId:summary.id }); return result.ok ? result.value : undefined; })); if(sequence!==reloadSequence.current)return;setProjects(loaded.filter((p):p is Project => !!p)); setStatus(migratedState === 'needs-recovery' || listed.issues.length ? 'Some older project data needs recovery. Valid projects remain available.' : ''); };
  const exportRecoveryCopy=async(recoveryId:string)=>{const blob=await projectRepository.exportRecovery(recoveryId);if(!blob){setStatus('Recovery data could not be read.');return;}const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`plankplan-recovery-${recoveryId.replace(/[^a-z0-9-]/gi,'-')}.bin`;anchor.click();URL.revokeObjectURL(url);};
  useEffect(() => { const scheduleReload=()=>{ queueMicrotask(()=>{ if(pathname==='/')void reload(); }); }; scheduleReload(); const unsubscribe=projectRepository.subscribe('local', scheduleReload); const stopWatching=watchLegacyPayloadChanges(result=>{if(result.state==='needs-recovery')setStatus('Legacy project data changed. Recovery copies were preserved for review.');scheduleReload();}); return () => {unsubscribe();stopWatching();}; }, [pathname]);
  const create = async (name = 'Untitled project') => { const p = createProject(name); const result = await projectRepository.create('local',p); if (!result.ok) { setStatus('Project could not be saved. Retry after checking local storage.'); return p; } ++reloadSequence.current;setProjects(current => [result.value,...current]); return result.value; };
  const restore = async (file?: File) => { if (!file) return; try { const imported = importProjectAsNew(await file.text(), projects); const result=await projectRepository.create('local',imported); if(!result.ok)throw new Error('Save failed');++reloadSequence.current;setProjects(current=>[result.value,...current]); setStatus('Project imported as a new copy.'); } catch { setStatus('This project file could not be imported. The saved projects were not changed.'); } };
  const startProject = () => { void create().then(p => navigate({ to: '/projects/$projectId/cutlist', params: { projectId: p.id } })); };
  const preview = () => { void navigate({ to: '/design-preview' }); };
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><img src="/plankplan-studio-stock-mix-v02.svg"/><span>PlankPlan <b>Studio</b></span></div><div className="topbar-tools"><span className="local-badge">Saved on this device</span><ThemeToggle /></div></header>
    <section className="hero"><p className="eyebrow">YOUR WORKSHOP, PLANNED</p><h1>Make every board count.</h1><p>Plan precise cuts, compare stock costs, and take a clear list to the shop.</p><div className="entry-actions"><button className="primary" onClick={startProject}>＋ Start a cutlist project</button><button className="secondary" onClick={preview}>▦ Open workspace preview <small>No project saved</small></button></div><div className="availability"><span><i className="dot live"/>Cutlist <b>Manual planning</b></span><span><i className="dot live"/>Design <b>Available in projects</b></span></div></section>
    <section className="project-section"><div className="section-heading"><div><p className="eyebrow">LOCAL PROJECTS</p><h2>Pick up where you left off</h2></div><label className="secondary import-button">Import project<input type="file" accept="application/json,.json" onChange={e => { void restore(e.target.files?.[0]); e.currentTarget.value = ''; }}/></label></div>
      {status && <p role="status">{status} <button type="button" onClick={() => void reload()}>Retry</button></p>}{recoveryIssues.map(issue=><article className="recovery-card" key={issue.recoveryId}><strong>Recovery copy available</strong><p>{issue.sourceProjectId ? `Project ${issue.sourceProjectId}` : 'Legacy project data'} · {issue.code}</p><button type="button" onClick={()=>void exportRecoveryCopy(issue.recoveryId)}>Export original bytes</button></article>)}{projects.length ? <div className="project-grid">{projects.map(p => <ProjectCard key={p.id} project={p} onDuplicate={() => { const copy=copyProjectDocument(p); void projectRepository.create('local',copy).then(r=>{if(r.ok){++reloadSequence.current;setProjects(current=>[r.value,...current]);}else setStatus('Could not duplicate project.');}); }} onDelete={() => { if (confirm(`Delete ${p.name}?`)) void projectRepository.get({namespaceId:'local',projectId:p.id}).then(r=>r.ok?projectRepository.delete({namespaceId:'local',projectId:p.id},r.token):{ok:false}).then(r=>{if(r.ok){++reloadSequence.current;setProjects(current=>current.filter(x=>x.id!==p.id));}else setStatus('Project changed elsewhere and was not deleted. Reload and retry.');}); }}/>)}</div> : !status.includes('unavailable') && <div className="empty-state"><div className="empty-mark">⌂</div><h3>Your next shop project starts here</h3><p>Create a cutlist project to organize parts, materials, and stock.</p><button className="primary" onClick={startProject}>Start your first project</button></div>}
    </section>
  </main>;
}
