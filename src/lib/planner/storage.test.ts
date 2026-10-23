import { describe, expect, it } from 'vitest';
import { exportProject } from './model';
import { importProjectAsNew } from './storage';
import type { Project } from './model';

const project: Project = { schemaVersion: 2, id: 'same-id', name: 'Backup', unitSystem: 'imperial', kerf: { um: 0 }, trim: { um: 0 }, minOffcutLinear: { um: 0 }, minOffcutSheet: { shortSideUm: 0, longSideUm: 0 }, currency: 'CAD', createdAt: '2026-10-22T00:00:00.000Z', updatedAt: '2026-10-22T00:00:00.000Z', parts: [], materials: [] };

describe('project backup import', () => {
  it('assigns a fresh id when an imported backup would duplicate a local project', () => {
    const imported = importProjectAsNew(exportProject(project), [project]);
    expect(imported.id).not.toBe(project.id);
    expect(imported.name).toBe(project.name);
    expect(project.id).toBe('same-id');
  });

  it('always creates a fresh project identity for an imported copy', () => {
    expect(importProjectAsNew(exportProject(project), []).id).not.toBe(project.id);
  });

  it('does not append an imported duplicate id without changing the original record', () => {
    const imported = importProjectAsNew(exportProject({ ...project, name: 'Restored copy' }), [project]);
    expect(new Set([project.id, imported.id]).size).toBe(2);
    expect(project.name).toBe('Backup');
  });
});
