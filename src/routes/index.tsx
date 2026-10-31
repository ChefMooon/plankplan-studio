/* TanStack file routes export a Route object alongside their page component. */
/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ArrowSquareOut, Info, Plus, UploadSimple, X } from '@phosphor-icons/react';
import { Popover } from 'radix-ui';
import { createProject, importProjectAsNew } from '@/lib/planner/storage';
import { copyProjectDocument, type Project } from '@/lib/planner/model';
import type { ConcurrencyToken } from '@/lib/planner/repository';
import { projectRepository } from '@/lib/planner/repository.indexeddb';
import type { RecoveryIssue } from '@/lib/planner/repository';
import { LEGACY_PROJECTS_KEY, migrateLegacyProjects, watchLegacyPayloadChanges } from '@/lib/planner/recovery';
import { ProjectCard } from '@/components/project-card';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { HomeTableIllustration } from '@/components/HomeTableIllustration';
import { ProjectInfoDialog, type ProjectInfoDraft } from '@/components/ProjectInfoDialog';

export const Route = createFileRoute('/')({ component: Home });
function Home() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState('Loading projects…');
  const [recoveryIssues,setRecoveryIssues]=useState<RecoveryIssue[]>([]);
  const [pendingDeletionId, setPendingDeletionId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [infoProjectId, setInfoProjectId] = useState<string | null>(null);
  const [infoDraft, setInfoDraft] = useState<ProjectInfoDraft>({ name: '', notes: '', unitSystem: 'imperial', previewView: 'auto' });
  const [infoError, setInfoError] = useState('');
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoSnapshot, setInfoSnapshot] = useState<{ project: Project; token: ConcurrencyToken } | null>(null);
  const infoTrigger = useRef<HTMLElement | null>(null);
  const deletionTrigger = useRef<HTMLElement | null>(null);
  const deletingRef = useRef(false);
  const reloadSequence=useRef(0);
  const importInput = useRef<HTMLInputElement>(null);
  const hasRecovery = recoveryIssues.length > 0;
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryFeedback, setRecoveryFeedback] = useState('');
  const reload = async () => { const sequence=++reloadSequence.current;if(window.localStorage.getItem(LEGACY_PROJECTS_KEY)!==null)await migrateLegacyProjects(); const listed = await projectRepository.list('local'); if(sequence!==reloadSequence.current)return;if (!listed.ok) { setStatus('Project storage is unavailable. Retry to load your projects.'); return; } setRecoveryIssues(listed.issues); const loaded = await Promise.all(listed.summaries.map(async summary => { const result = await projectRepository.get({ namespaceId:'local', projectId:summary.id }); return result.ok ? result.value : undefined; })); if(sequence!==reloadSequence.current)return;setProjects(loaded.filter((p):p is Project => !!p)); setStatus(''); };
  const exportRecoveryCopy=async(recoveryId:string)=>{const blob=await projectRepository.exportRecovery(recoveryId);if(!blob){setStatus('Recovery data could not be read.');return;}const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`plankplan-recovery-${recoveryId.replace(/[^a-z0-9-]/gi,'-')}.bin`;anchor.click();URL.revokeObjectURL(url);setRecoveryFeedback('Recovery copy exported. Restore projects to add them here, or archive the notice to keep the original data on this device.');};
  const resolveRecovery = async (recoveryId: string, archive: boolean) => {
    setRecoveryBusy(true);
    try {
      if (archive) {
        await projectRepository.archiveRecovery(recoveryId);
        setRecoveryFeedback('Notice archived. Original data is still saved on this device.');
      } else {
        const result = await projectRepository.restoreRecovery(recoveryId);
        setRecoveryFeedback(`${result.restored} project${result.restored === 1 ? '' : 's'} restored as new copies.${result.remaining ? ` ${result.remaining} unreadable item${result.remaining === 1 ? '' : 's'} remain. Export the original data for repair, or archive the notice.` : ' Recovery complete.'}`);
      }
      await reload();
    } catch (error) {
      setRecoveryFeedback(error instanceof Error ? error.message : 'Recovery could not be saved. Please retry.');
    } finally { setRecoveryBusy(false); }
  };
  useEffect(() => { const scheduleReload=()=>{ queueMicrotask(()=>{ if(pathname==='/')void reload(); }); }; scheduleReload(); const unsubscribe=projectRepository.subscribe('local', scheduleReload); const stopWatching=watchLegacyPayloadChanges(result=>{if(result.state==='needs-recovery')setStatus('Legacy project data changed. Recovery copies were preserved for review.');scheduleReload();}); return () => {unsubscribe();stopWatching();}; }, [pathname]);
  const create = async (name = 'Untitled project') => { const p = createProject(name); const result = await projectRepository.create('local',p); if (!result.ok) { ++reloadSequence.current; setStatus('Project could not be saved. Retry after checking local storage.'); return undefined; } ++reloadSequence.current;setProjects(current => [result.value,...current]); setStatus(''); return result.value; };
  const restore = async (file?: File) => { if (!file) return; try { const imported = importProjectAsNew(await file.text(), projects); const result=await projectRepository.create('local',imported); if(!result.ok)throw new Error('Save failed');++reloadSequence.current;setProjects(current=>[result.value,...current]); setStatus('Project imported as a new copy.'); } catch { setStatus('This project file could not be imported. The saved projects were not changed.'); } };
  const startProject = () => { void create(); };
  const preview = () => { void navigate({ to: '/design-preview' }); };
  const deletionTarget = projects.find(project => project.id === pendingDeletionId);
  const deleteProject = async () => {
    if (!deletionTarget || deletingRef.current) return;
    const id = deletionTarget.id;
    const index = projects.findIndex(project => project.id === id);
    const survivor = projects[index === 0 ? 1 : index - 1];
    deletingRef.current = true;
    setDeleting(true);
    let deleted = false;
    try {
      const current = await projectRepository.get({ namespaceId: 'local', projectId: id });
      const result = current.ok ? await projectRepository.delete({ namespaceId: 'local', projectId: id }, current.token) : { ok: false };
      if (result.ok) {
        deleted = true;
        ++reloadSequence.current;
        setProjects(items => items.filter(project => project.id !== id));
      } else setStatus('Project changed elsewhere and was not deleted. Reload and retry.');
    } catch {
      setStatus('Project could not be deleted. Reload and retry.');
    } finally {
      deletingRef.current = false;
      setDeleting(false);
      setPendingDeletionId(null);
      window.setTimeout(() => {
        const target = deleted ? (survivor ? document.getElementById(`project-actions-${survivor.id}`) : document.getElementById('home-new-project')) : deletionTrigger.current;
        (target ?? document.getElementById('home-new-project'))?.focus();
      }, 0);
    }
  };
  const infoProject = projects.find(project => project.id === infoProjectId);
  const openProjectInfo = async (project: Project) => {
    infoTrigger.current = document.getElementById(`project-actions-${project.id}`);
    setInfoProjectId(project.id);
    setInfoSnapshot(null);
    setInfoDraft({ name: project.name, notes: project.notes ?? '', unitSystem: project.unitSystem, previewView: project.previewView ?? 'auto' });
    setInfoError('');
    setInfoLoading(true);
    try {
      const result = await projectRepository.get({ namespaceId: 'local', projectId: project.id });
      if (result.ok) {
        setInfoSnapshot({ project: result.value, token: result.token });
        setInfoDraft({ name: result.value.name, notes: result.value.notes ?? '', unitSystem: result.value.unitSystem, previewView: result.value.previewView ?? 'auto' });
      } else setInfoError('Project could not be loaded. Close this dialog and try again.');
    } catch { setInfoError('Project could not be loaded. Close this dialog and try again.'); }
    finally { setInfoLoading(false); }
  };
  const closeProjectInfo = () => {
    setInfoProjectId(null);
    setInfoSnapshot(null);
    window.setTimeout(() => infoTrigger.current?.focus(), 0);
  };
  const saveProjectInfo = async () => {
    if (!infoSnapshot || !infoProject || infoSnapshot.project.id !== infoProject.id) return;
    const name = infoDraft.name.trim();
    if (!name) { setInfoError('Enter a project name.'); return; }
    if (name.length > 256) { setInfoError('Project names must be 256 characters or fewer.'); return; }
    if (infoDraft.notes.length > 16384) { setInfoError('Notes must be 16,384 characters or fewer.'); return; }
    setInfoSaving(true);
    setInfoError('');
    try {
      const result = await projectRepository.save({ namespaceId: 'local', projectId: infoProject.id }, { ...infoSnapshot.project, name, notes: infoDraft.notes, unitSystem: infoDraft.unitSystem, previewView: infoDraft.previewView, updatedAt: new Date().toISOString() }, infoSnapshot.token);
      if (!result.ok) { setInfoError(result.kind === 'conflict' ? 'Project changed elsewhere. Your changes are still here; refresh and try again.' : 'Project information could not be saved. Your changes are still here; try again.'); return; }
      ++reloadSequence.current;
      setProjects(items => items.map(project => project.id === result.value.id ? result.value : project));
      closeProjectInfo();
    } catch { setInfoError('Project information could not be saved. Your changes are still here; try again.'); }
    finally { setInfoSaving(false); }
  };
  return <main className="app-shell home-page">
    <DeleteConfirmationDialog deletion={deletionTarget ? { kind: 'project', id: deletionTarget.id, name: deletionTarget.name } : null} saving={deleting} onOpenChange={open => { if (!open) setPendingDeletionId(null); }} restoreFocus={() => deletionTrigger.current?.focus()} onConfirm={() => { void deleteProject(); }} />
    {infoProject && <ProjectInfoDialog open onOpenChange={open => { if (!open && !infoSaving) closeProjectInfo(); }} project={infoSnapshot?.project ?? infoProject} draft={infoDraft} onDraftChange={setInfoDraft} error={infoError} saving={infoSaving} loading={infoLoading} canSave={!!infoSnapshot} onSave={() => void saveProjectInfo()} />}
    <header className="topbar">
      <div className="brand"><img src="/plankplan-studio-stock-mix-v02.svg" alt=""/><span>PlankPlan <b>Studio</b></span></div>
      <div className="topbar-tools">
        <span className="local-badge home-preview-label">Preview</span>
        <Popover.Root>
          <Popover.Trigger asChild><button type="button" className="home-info-button" aria-label="About this workspace"><Info size={21} aria-hidden="true"/></button></Popover.Trigger>
          <Popover.Portal><Popover.Content className="home-popover" sideOffset={10} align="end" aria-label="About this workspace">
            <Popover.Close className="home-popover-close" aria-label="Close workspace information"><X size={17} aria-hidden="true"/></Popover.Close>
            <h2>Your local workspace</h2>
            <p>Projects are saved on this device. Export a project from its workspace to keep a backup or move it elsewhere.</p>
            <p>Plan cuts and stock in Cutlist, or build your project in Design, currently in beta.</p>
            <button type="button" className="secondary compact" onClick={preview}><ArrowSquareOut size={17} aria-hidden="true"/>Explore workspace preview</button>
          </Popover.Content></Popover.Portal>
        </Popover.Root>
        <ThemeToggle />
      </div>
    </header>
    <section className="home-intro" aria-labelledby="home-intro-heading">
      <div className="home-intro-copy">
        <h1 id="home-intro-heading">Make a plan. <span>Make the cut.</span></h1>
        <p>Design your next build, plan your stock, and turn dimensions into a clear cutlist.</p>
      </div>
      <div className="home-intro-art" aria-hidden="true">
        <HomeTableIllustration />
      </div>
    </section>
    <aside className="home-preview-notice" aria-label="Preview and project backups">
      <strong>Projects are saved in this browser</strong>
      <p>Export each project as JSON from its Cutlist workspace to back it up. Projects won’t automatically move to the final website or another browser, and clearing browser data can delete them.</p>
    </aside>
    <section className="project-section home-projects" aria-labelledby="projects-heading">
      <div className="home-project-heading">
        <div className="home-title"><h2 id="projects-heading">Projects</h2><span className="home-project-count" aria-label={`${projects.length} saved projects`}>{projects.length}</span></div>
        <div className="home-project-actions">
          {(hasRecovery || recoveryOpen) && <Popover.Root open={recoveryOpen} onOpenChange={setRecoveryOpen}>
            <Popover.Trigger asChild><button type="button" className="home-info-button home-recovery-button" aria-label="Review older project data"><Info size={21} aria-hidden="true"/></button></Popover.Trigger>
            <Popover.Portal><Popover.Content className="home-popover home-recovery-popover" sideOffset={8} align="end" aria-label="Project recovery">
              <Popover.Close className="home-popover-close" aria-label="Close recovery details"><X size={17} aria-hidden="true"/></Popover.Close>
              <h2>Older project data</h2>
              <p>Restore readable projects as new copies. Original data stays saved on this device.</p>
              {recoveryFeedback && <p role="status">{recoveryFeedback}</p>}
              {!hasRecovery && <p>All recovery notices are resolved.</p>}
              {recoveryIssues.map((issue, index) => <article className="home-recovery-item" key={issue.recoveryId}>
                <strong>{issue.sourceProjectId ? `Project ${issue.sourceProjectId}` : `Recovery copy ${index + 1}`}</strong>
                <button type="button" className="primary compact" disabled={recoveryBusy} onClick={() => void resolveRecovery(issue.recoveryId, false)}>Restore projects</button>
                <button type="button" className="secondary compact" disabled={recoveryBusy} onClick={() => void exportRecoveryCopy(issue.recoveryId)}>Export original data</button>
                <button type="button" className="home-text-button" disabled={recoveryBusy} onClick={() => void resolveRecovery(issue.recoveryId, true)}>Archive notice · keep original data</button>
              </article>)}
            </Popover.Content></Popover.Portal>
          </Popover.Root>}
          <button type="button" className="secondary" onClick={() => importInput.current?.click()}><UploadSimple size={18} aria-hidden="true"/>Import</button>
          <input ref={importInput} className="home-file-input" type="file" accept="application/json,.json" aria-label="Import project" onChange={e => { void restore(e.target.files?.[0]); e.currentTarget.value = ''; }}/>
          <button id="home-new-project" type="button" className="primary" onClick={startProject}><Plus size={18} weight="bold" aria-hidden="true"/>New project</button>
        </div>
      </div>
      {status && <p className="home-status" role="status">{status}{!status.startsWith('Loading') && <button type="button" className="home-text-button" onClick={() => void reload()}>Refresh</button>}</p>}
      {projects.length ? <div className="project-grid">{projects.map(p => <ProjectCard key={p.id} project={p} onInfo={() => void openProjectInfo(p)} onDuplicate={() => { const copy=copyProjectDocument(p); void projectRepository.create('local',copy).then(r=>{if(r.ok){++reloadSequence.current;setProjects(current=>[r.value,...current]);}else setStatus('Could not duplicate project.');}); }} onDelete={() => { deletionTrigger.current = document.getElementById(`project-actions-${p.id}`); setPendingDeletionId(p.id); }}/>)}</div> : !status.startsWith('Loading') && !status.includes('unavailable') && <div className="empty-state"><div className="empty-mark">⌂</div><h2>No projects yet</h2><p>Create a project or import one to get started.</p><button type="button" className="primary" onClick={startProject}><Plus size={18} weight="bold" aria-hidden="true"/>New project</button></div>}
    </section>
  </main>;
}
