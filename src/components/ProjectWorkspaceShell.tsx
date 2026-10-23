/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useState } from 'react';
import { Link, Outlet, useMatches } from '@tanstack/react-router';
import { ThemeToggle } from '@/components/theme-toggle';
import { ProjectNavigation } from '@/components/ProjectNavigation';

type ShellState = { projectName: string; status: string; projectInfo?: () => void; setProject: (name: string, status: string, info?: () => void) => void; setStatus: (status: string) => void };
const ProjectShellContext = createContext<ShellState | null>(null);
export function useProjectShell() { const value = useContext(ProjectShellContext); if (!value) throw new Error('Project shell context is unavailable'); return value; }

export function ProjectWorkspaceShell({ projectId }: { projectId: string }) {
  const [state, setState] = useState({ projectName: 'Loading project…', status: 'Loading project…', projectInfo: undefined as (() => void) | undefined });
  const setProject = useCallback((projectName: string, status: string, projectInfo?: () => void) => setState({ projectName, status, projectInfo }), []);
  const setStatus = useCallback((status: string) => setState(current => ({ ...current, status })), []);
  const matches = useMatches();
  const active = matches.some(match => match.routeId.endsWith('/cutlist')) ? 'cutlist' : 'design';
  const context: ShellState = { ...state, setProject, setStatus };
  return <ProjectShellContext.Provider value={context}><main className={`app-shell workspace ${active === 'design' ? 'design-page' : ''}`}>
    <header className="topbar"><Link to="/" className="brand"><img src="/plankplan-studio-stock-mix-v02.svg" alt="" /><span>PlankPlan <b>Studio</b></span></Link><strong>{state.projectName}</strong><div className="topbar-tools"><span className="local-badge" role="status">{state.status || 'Saved locally'}</span>{state.status.startsWith('Conflict') && <button type="button" onClick={() => window.location.reload()}>Reload project</button>}<ThemeToggle /></div></header>
    <ProjectNavigation projectId={projectId} projectName={state.projectName} active={active} onProjectInfo={state.projectInfo} />
    <Outlet />
  </main></ProjectShellContext.Provider>;
}

export function PageSkeleton({ page }: { page: 'design' | 'cutlist' }) {
  return <section className={`page-skeleton ${page}-skeleton`} aria-label={`Loading ${page}`}><span className="sr-only" role="status">Loading {page}…</span>{page === 'design' ? <><div className="skeleton-canvas" aria-hidden="true"/><div className="skeleton-inspector" aria-hidden="true"><i/><i/><i/><i/><i/></div></> : <><div className="skeleton-editor" aria-hidden="true"><i/><i/><i/><i/><i/></div><div className="skeleton-results" aria-hidden="true"><i/><i/><i/></div></>}</section>;
}
