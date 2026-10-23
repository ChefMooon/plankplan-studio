/* TanStack file routes export a Route object alongside their page component. */
/* eslint-disable react-refresh/only-export-components */
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/lib/planner/model';
import { projectRepository } from '@/lib/planner/repository.indexeddb';
import { DesignWorkspace } from '@/components/design/DesignWorkspace';
import { PageSkeleton, useProjectShell } from '@/components/ProjectWorkspaceShell';

export const Route = createFileRoute('/projects/$projectId/design')({ component: Design });

function Design() {
  const shell = useProjectShell();
  const setShellProject = shell.setProject;
  const setShellStatus = shell.setStatus;
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
  useEffect(() => {
    if (project) setShellProject(project.name, message || 'Saved locally');
    else if (message.startsWith('Project not found') || message.startsWith('Project could not')) setShellStatus(message);
  }, [project, message, setShellProject, setShellStatus]);
  if (!project) return <>{message.startsWith('Project not found') || message.startsWith('Project could not') ? <section className="project-load-error"><h1>{message}</h1><button type="button" onClick={() => { setMessage('Loading project…'); void projectRepository.get({ namespaceId: 'local', projectId }).then(result => { if (result.ok) { token.current=result.token; setProject(result.value); setMessage(''); } else setMessage(result.kind === 'not-found' ? 'Project not found.' : 'Project could not be opened.'); }); }}>Retry</button></section> : <PageSkeleton page="design" />}</>;
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
  return <>
    <DesignWorkspace key={project.id} project={project} localGeneration={localGeneration} saveStatus={message || 'Saved locally'} onCommit={commit} />
  </>;
}
