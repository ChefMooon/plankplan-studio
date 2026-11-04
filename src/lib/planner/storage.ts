import { copyProjectDocument, importProject, type Project } from './model';
export function importProjectAsNew(json: string, existing: Project[]): Project {
  const imported = importProject(json);
  void existing;
  return copyProjectDocument(imported, imported.name);
}
export function createProject(name = 'Untitled project'): Project {
  const now = new Date().toISOString();
  return { schemaVersion: 3, id: crypto.randomUUID(), name, unitSystem: 'imperial', kerf: { um: 3_175 }, trim: { um: 0 }, minOffcutLinear: { um: 304_800 }, minOffcutSheet: { shortSideUm: 150_000, longSideUm: 300_000 }, currency: 'CAD', cutlists: [{ id: crypto.randomUUID(), name: 'Default' }], planningGroups: [], parts: [], materials: [], createdAt: now, updatedAt: now };
}
