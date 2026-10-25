import { ArrowRight, Copy, Cube, ListChecks, Trash } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';
import { Tooltip } from 'radix-ui';
import type { Project } from '@/lib/planner/model';

interface ProjectCardProps {
  project: Project;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function ProjectCard({ project, onDuplicate, onDelete }: ProjectCardProps) {
  const materials = project.materials.map(material => material.name).join(', ');

  return <article className="project-card">
    <div className="project-thumb">
      <div className="project-timber" aria-hidden="true"><span/><span/><span/></div>
      <div className="project-tools">
        <Tooltip.Provider delayDuration={250}>
          {[{ label: 'Duplicate', Icon: Copy, action: onDuplicate }, { label: 'Delete', Icon: Trash, action: onDelete }].map(({ label, Icon, action }) =>
            <Tooltip.Root key={label}>
              <Tooltip.Trigger asChild>
                <button id={label === 'Delete' ? `project-delete-${project.id}` : undefined} type="button" className={`project-icon-button ${label === 'Delete' ? 'project-delete' : ''}`} aria-label={`${label} ${project.name}`} onClick={action}>
                  <Icon size={18} aria-hidden="true"/>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal><Tooltip.Content className="project-tooltip" sideOffset={6}>{label} project<Tooltip.Arrow className="project-tooltip-arrow"/></Tooltip.Content></Tooltip.Portal>
            </Tooltip.Root>,
          )}
        </Tooltip.Provider>
      </div>
    </div>
    <div className="project-body">
      <h3>{project.name}</h3>
      <p className="project-materials">{materials || 'No materials yet'}</p>
      <p className="project-meta"><span>{project.parts.length} {project.parts.length === 1 ? 'part' : 'parts'}</span><span>Updated <time dateTime={project.updatedAt}>{new Date(project.updatedAt).toLocaleDateString()}</time></span></p>
      <div className="project-open-actions">
        <Link className="project-open-link project-cutlist-link" to="/projects/$projectId/cutlist" params={{ projectId: project.id }} aria-label={`Open cutlist for ${project.name}`}><ListChecks size={18} aria-hidden="true"/><span>Open cutlist</span><ArrowRight size={16} aria-hidden="true"/></Link>
        <Link className="project-open-link" to="/projects/$projectId/design" params={{ projectId: project.id }} aria-label={`Open design for ${project.name}`}><Cube size={18} aria-hidden="true"/><span>Open design</span><ArrowRight size={16} aria-hidden="true"/></Link>
      </div>
    </div>
  </article>;
}
