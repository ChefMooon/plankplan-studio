/* eslint-disable react-refresh/only-export-components */
import { createFileRoute } from '@tanstack/react-router';
import { ProjectWorkspaceShell } from '@/components/ProjectWorkspaceShell';

export const Route = createFileRoute('/projects/$projectId')({ component: ProjectLayout });
function ProjectLayout() { const { projectId } = Route.useParams(); return <ProjectWorkspaceShell key={projectId} projectId={projectId} />; }
