import { describe, expect, it } from 'vitest';
import { optimizeMixedProject } from './combined';
import { umFromInches } from './model';
import type { Project } from './model';
import { createProject } from './storage';
import { exportProject, importProject } from './model';

describe('mixed-material plan aggregation', () => {
  it('round trips unassigned panels and plans them on generic sheets without thickness or cost', () => {
    const project = createProject();
    project.parts.push({ kind: 'sheet', id: 'unassigned', name: 'Top', materialId: '', length: { um: 600000 }, width: { um: 300000 }, quantity: 1 });
    expect(importProject(exportProject(project))).toEqual(project);
    const result = optimizeMixedProject(project);
    expect(result.valid).toBe(true);
    expect(result.unresolved).toEqual([]);
    expect(result.linear.plans).toEqual([]);
    expect(result.sheets.plans).toHaveLength(1);
    expect(result.sheets.plans[0].placements[0].partId).toBe('unassigned');
    expect(result.sheets.plans[0].costCents).toBe(0);
    expect(result.totalCents).toBe(0);
    expect(result.planningProject.materials[0].stocks[0]).toMatchObject({ widthUm: umFromInches(48), length: { um: umFromInches(96) } });
    expect(result.planningProject.materials[0].stocks[0].thicknessUm).toBeUndefined();
    expect(project.materials).toEqual([]);
  });
  it('combines independent linear and sheet totals with display-only tax', () => {
    const project: Project = { schemaVersion: 2, id: 'mix', name: 'Mixed', unitSystem: 'imperial', kerf: { um: 0 }, trim: { um: 0 }, minOffcutLinear: { um: 0 }, minOffcutSheet: { shortSideUm: 0, longSideUm: 0 }, currency: 'CAD', taxRate: 10, createdAt: '', updatedAt: '', parts: [
      { id: 'board-part', name: 'Leg', materialId: 'board', length: { um: umFromInches(24) }, quantity: 1 },
      { id: 'sheet-part', name: 'Top', materialId: 'sheet', length: { um: umFromInches(24) }, width: { um: umFromInches(18) }, quantity: 1 },
    ], materials: [
      { id: 'board', name: 'Pine', type: 'linear', stocks: [{ id: 'b-stock', name: 'Board', length: { um: umFromInches(96) }, price: { cents: 1000 }, ownedQuantity: 0 }] },
      { id: 'sheet', name: 'Plywood', type: 'sheet', stocks: [{ id: 's-stock', name: 'Sheet', length: { um: umFromInches(48) }, widthUm: umFromInches(48), price: { cents: 2000 }, ownedQuantity: 0 }] },
    ] };
    const mixed = optimizeMixedProject(project);
    expect(mixed.valid).toBe(true);
    expect(mixed.subtotalCents).toBe(3000);
    expect(mixed.taxCents).toBe(300);
    expect(mixed.totalCents).toBe(3300);
  });
});
