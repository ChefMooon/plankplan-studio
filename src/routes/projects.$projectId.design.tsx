/* TanStack file routes export a Route object alongside their page component. */
/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/lib/planner/model';
import { projectRepository } from '@/lib/planner/repository.indexeddb';
import { ThemeToggle } from '@/components/theme-toggle';
import { DesignWorkspace } from '@/components/design/DesignWorkspace';

export const Route = createFileRoute('/projects/$projectId/design')({ component: Design });

function Design() {
  const { projectId } = Route.useParams();
  const [project, setProject] = useState<Project>();
  const [message, setMessage] = useState('Loading project…');
  const [localGeneration, setLocalGeneration] = useState(0);
  const token = useRef<{localGeneration:number} | undefined>(undefined);
  const saving = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await projectRepository.get({ namespaceId: 'local', projectId });
      if (!active) return;
      if (result.ok) { token.current=result.token; setLocalGeneration(result.token.localGeneration); setProject(result.value); setMessage(''); }
      else { setProject(undefined); setMessage(result.kind === 'not-found' ? 'Project not found.' : 'Project could not be opened. Your saved data has not been changed.'); }
    };
    void load();
    const unsubscribe = projectRepository.subscribe('local', changed => { if (!saving.current && changed.some(key => key.projectId === projectId)) { setLocalGeneration(value=>value+1); setMessage('Conflict · this project changed elsewhere. Reload before reviewing or saving.'); } });
    return () => { active = false; unsubscribe(); };
  }, [projectId]);
  if (!project) return <main className="app-shell"><Link to="/">← Dashboard</Link><h1>{message}</h1><button type="button" onClick={() => { setMessage('Loading project…'); void projectRepository.get({ namespaceId: 'local', projectId }).then(result => { if (result.ok) { setProject(result.value); setMessage(''); } else setMessage(result.kind === 'not-found' ? 'Project not found.' : 'Project could not be opened.'); }); }}>Retry</button></main>;
  const commit = (next: Project): Promise<boolean> => {
    const operation=saveQueue.current.then(async()=>{
      if (!token.current) return false;
      saving.current=true;
      setMessage('Saving…');
      const result=await projectRepository.save({namespaceId:'local',projectId},next,token.current);
      saving.current=false;
      if(result.ok){token.current=result.token;setLocalGeneration(result.token.localGeneration);setProject(result.value);setMessage('Saved locally');return true;}
      setMessage(result.kind==='conflict'?'Conflict · another tab saved newer project data. Reload before retrying.':'Not saved · the previous saved project remains available.');return false;
    }).catch(()=>{saving.current=false;setMessage('Not saved · the previous saved project remains available.');return false;});
    saveQueue.current=operation.then(()=>undefined);
    return operation;
  };
  return <main className="app-shell workspace design-page">
    <header className="topbar"><Link to="/" className="brand"><img src="/plankplan-studio-stock-mix-v02.svg" alt="" /><span>PlankPlan <b>Studio</b></span></Link><strong>{project.name}</strong><div className="topbar-tools"><span className="local-badge" role="status">{message || 'Saved locally'}</span>{message.startsWith('Conflict')&&<button type="button" onClick={()=>window.location.reload()}>Reload project</button>}<ThemeToggle /></div></header>
    <div className="workspace-head"><div><Link className="back-link" to="/">← All projects</Link><h1>{project.name}</h1></div><nav className="tabs" aria-label="Project areas"><Link to="/projects/$projectId/design" params={{ projectId }} aria-current="page" className="tab active">Design</Link><Link to="/projects/$projectId/cutlist" params={{ projectId }} className="tab">Cutlist</Link></nav></div>
    <DesignWorkspace key={project.id} project={project} localGeneration={localGeneration} saveStatus={message || 'Saved locally'} onCommit={commit} />
  </main>;
}
