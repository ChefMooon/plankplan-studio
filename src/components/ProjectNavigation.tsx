import { Link } from '@tanstack/react-router';

export function ProjectNavigation({ projectId, projectName, active, onProjectInfo }: { projectId: string; projectName: string; active: 'design' | 'cutlist'; onProjectInfo?: () => void }) {
  return <nav className="project-navigation" aria-label="Project navigation">
    <Link className="project-navigation-back" to="/">← <span>All projects</span></Link>
    <strong className="project-navigation-title" title={projectName}>{projectName}</strong>
    <div id="design-project-info-action" className="project-navigation-info">{onProjectInfo && <button type="button" className="secondary compact project-info-icon" aria-label="Project Info" title="Project Info" onClick={onProjectInfo}>i</button>}</div>
    <div className="project-navigation-tabs" role="group" aria-label="Project areas">
      <Link to="/projects/$projectId/design" params={{ projectId }} aria-current={active === 'design' ? 'page' : undefined} className={active === 'design' ? 'active' : ''}>Design</Link>
      <Link to="/projects/$projectId/cutlist" params={{ projectId }} aria-current={active === 'cutlist' ? 'page' : undefined} className={active === 'cutlist' ? 'active' : ''}>Cutlist</Link>
    </div>
  </nav>;
}
