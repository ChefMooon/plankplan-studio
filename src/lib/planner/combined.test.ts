import { describe, expect, it } from 'vitest';
import { optimizeMixedProject } from './combined';
import { umFromInches } from './model';
import type { Project } from './model';

describe('mixed-material plan aggregation', () => {
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
