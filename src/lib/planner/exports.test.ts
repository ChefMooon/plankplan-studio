import { describe, expect, it } from 'vitest';
import { exportCutCsv } from './exports';
import type { Project } from './model';
import type { SheetPlan } from './sheet';

const project: Project = { schemaVersion: 1, id: 'p', name: 'CSV', unitSystem: 'metric', kerf: { um: 3000 }, trim: { um: 0 }, minOffcutLinear: { um: 300000 }, minOffcutSheet: { shortSideUm: 150000, longSideUm: 300000 }, currency: 'CAD', createdAt: '', updatedAt: '', parts: [{ id: 'a', name: 'Panel, "wide"', materialId: 'm', length: { um: 600000 }, width: { um: 300000 }, quantity: 1 }], materials: [{ id: 'm', name: 'Sheet', type: 'sheet', stocks: [{ id: 's', name: 'Stock', length: { um: 1200000 }, widthUm: 600000, ownedQuantity: 0 }] }] };
const plan: SheetPlan = { stockId: 's', stockCount: 1, ownedUsed: 0, costCents: 0, usedAreaUm2: 180000000000, wasteAreaUm2: 540000000000, layout: 'strips', placements: [{ partId: 'a', rect: { x: 0, y: 0, width: 600000, height: 300000 }, rotated: false }], cutTree: { type: 'part', partId: 'a', rect: { x: 0, y: 0, width: 600000, height: 300000 }, rotated: false }, offcuts: [] };

describe('shop output exports', () => {
  it('exports a quoted CSV with material, orientation, and placement coordinates', () => {
    const csv = exportCutCsv(project, [], [plan]);
    expect(csv).toContain('"Material","Stock"');
    expect(csv).toContain('"Panel, ""wide"""');
    expect(csv).toContain('"600000","300000","0","0","no"');
  });
});
