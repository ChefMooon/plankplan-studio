/* TanStack file routes export a Route object alongside their page component. */
/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { createProject, importProjectAsNew, loadProjects, saveProjects } from '@/lib/planner/storage';
import type { Project } from '@/lib/planner/model';

export const Route = createFileRoute('/')({ component: Home });
function Home() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const refresh = (items: Project[]) => { setProjects(items); saveProjects(items); };
  const create = (name = 'Untitled project') => { const p = createProject(name); refresh([p, ...projects]); return p; };
  const restore = async (file?: File) => { if (!file) return; try { refresh([importProjectAsNew(await file.text(), projects), ...projects]); } catch { alert('This project file is not supported or is invalid.'); } };
  const startProject = () => { const p = create(); void navigate({ to: '/projects/$projectId/cutlist', params: { projectId: p.id } }); };
  const preview = () => { void navigate({ to: '/design-preview' }); };
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><img src="/plankplan-studio-stock-mix-v02.svg"/><span>PlankPlan <b>Studio</b></span></div><span className="local-badge">Saved on this device</span></header>
    <section className="hero"><p className="eyebrow">YOUR WORKSHOP, PLANNED</p><h1>Make every board count.</h1><p>Plan precise cuts, compare stock costs, and take a clear list to the shop.</p><div className="entry-actions"><button className="primary" onClick={startProject}>＋ Start a cutlist project</button><button className="secondary" onClick={preview}>▦ Open 3D workspace preview <small>Planned · Phase 2</small></button></div><div className="availability"><span><i className="dot live"/>Cutlist <b>MVP workflow</b></span><span><i className="dot planned"/>Design <b>Preview shell</b></span></div></section>
    <section className="project-section"><div className="section-heading"><div><p className="eyebrow">LOCAL PROJECTS</p><h2>Pick up where you left off</h2></div><label className="secondary import-button">Import project<input type="file" accept="application/json,.json" onChange={e => { void restore(e.target.files?.[0]); e.currentTarget.value = ''; }}/></label></div>
      {projects.length ? <div className="project-grid">{projects.map(p => <article className="project-card" key={p.id}><div className="project-icon">⌁</div><h3>{p.name}</h3><p>{p.parts.length} parts · Updated {new Date(p.updatedAt).toLocaleDateString()}</p><div className="card-actions"><Link className="text-link" to="/projects/$projectId/cutlist" params={{ projectId: p.id }}>Open cutlist →</Link><button aria-label={`Duplicate ${p.name}`} onClick={() => refresh([{ ...p, id: crypto.randomUUID(), name: `${p.name} copy`, updatedAt: new Date().toISOString() }, ...projects])}>Duplicate</button><button aria-label={`Delete ${p.name}`} onClick={() => { if (confirm(`Delete ${p.name}?`)) refresh(projects.filter(x => x.id !== p.id)); }}>Delete</button></div></article>)}</div> : <div className="empty-state"><div className="empty-mark">⌂</div><h3>Your next shop project starts here</h3><p>Create a cutlist project to organize parts, materials, and stock.</p><button className="primary" onClick={startProject}>Start your first project</button></div>}
    </section>
  </main>;
}
