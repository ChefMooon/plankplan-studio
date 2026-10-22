import { importProject, type Project } from './model';

const KEY = 'plankplan-studio.projects.v1';
export function loadProjects(): Project[] {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as unknown[]).map(item => importProject(JSON.stringify(item))) : []; }
  catch { return []; }
}
export function saveProjects(projects: Project[]) { localStorage.setItem(KEY, JSON.stringify(projects.map(p => JSON.parse(JSON.stringify(p))))); }
export function importProjectAsNew(json: string, existing: Project[]): Project {
  const imported = importProject(json);
  if (existing.some(project => project.id === imported.id)) imported.id = crypto.randomUUID();
  return imported;
}
export function createProject(name = 'Untitled project'): Project {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id: crypto.randomUUID(), name, unitSystem: 'imperial', kerf: { um: 3_175 }, trim: { um: 0 }, minOffcutLinear: { um: 304_800 }, minOffcutSheet: { shortSideUm: 150_000, longSideUm: 300_000 }, currency: 'CAD', parts: [], materials: [], createdAt: now, updatedAt: now };
}
