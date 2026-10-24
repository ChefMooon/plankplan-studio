import { describe, expect, it } from 'vitest';
import { umFromInches } from './model';
import { naiveSheetCostCents, optimizeSheets, validateSheetPlan } from './sheet';
import type { Project, Material } from './model';

const project: Project = { schemaVersion: 2, id: 'p', name: 'Sheet test', unitSystem: 'imperial', kerf: { um: umFromInches(.125) }, trim: { um: 0 }, minOffcutLinear: { um: umFromInches(12) }, minOffcutSheet: { shortSideUm: umFromInches(6), longSideUm: umFromInches(12) }, currency: 'CAD', createdAt: '', updatedAt: '', parts: [
  { id: 'a', name: 'Top', materialId: 'm', length: { um: umFromInches(30) }, width: { um: umFromInches(18) }, quantity: 1 },
  { id: 'b', name: 'Side', materialId: 'm', length: { um: umFromInches(20) }, width: { um: umFromInches(12) }, quantity: 2, grainLocked: true },
], materials: [] };
const material: Material = { id: 'm', name: 'Plywood', type: 'sheet', stocks: [{ id: 's', name: 'Half sheet', length: { um: umFromInches(48) }, widthUm: umFromInches(48), price: { cents: 2500 }, ownedQuantity: 0 }] };

describe('sheet guillotine optimizer', () => {
  it('packs repeated parts and returns a valid cut tree, costs and offcuts', () => {
    const result = optimizeSheets(project, [material]);
    expect(result.valid).toBe(true);
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].placements).toHaveLength(3);
    expect(result.totalCostCents).toBe(2500);
    expect(validateSheetPlan(project, material, result.plans)).toEqual([]);
    expect(result.plans[0].offcuts.length).toBeGreaterThan(0);
  });

  it('rejects overlap and grain locked rotation in independent validation', () => {
    const result = optimizeSheets(project, [material]);
    const plan = result.plans[0];
    const altered = { ...plan, placements: plan.placements.map(p => ({ ...p, rotated: p.partId === 'b' ? true : p.rotated, rect: p.partId === 'a' ? plan.placements[1].rect : p.rect })) };
    expect(validateSheetPlan(project, material, [altered]).length).toBeGreaterThan(0);
  });

  it('uses two-stage full-length strips in simplest mode and preserves grain locks', () => {
    const result = optimizeSheets({ ...project, sheetLayout: 'simplestCuts' }, [material]);
    expect(result.valid).toBe(true);
    expect(result.plans.every(plan => plan.layout === 'strips')).toBe(true);
    expect(result.plans.flatMap(plan => plan.placements).filter(p => p.partId === 'b').every(p => !p.rotated)).toBe(true);
    expect(validateSheetPlan({ ...project, sheetLayout: 'simplestCuts' }, material, result.plans)).toEqual([]);
  });

  it('allows rotation for an unlocked part when that is the only fitting orientation', () => {
    const projectWithTurn = { ...project, parts: [{ ...project.parts[0], length: { um: umFromInches(18) }, width: { um: umFromInches(30) } }] };
    const narrow = { ...material, stocks: [{ ...material.stocks[0], length: { um: umFromInches(40) }, widthUm: umFromInches(20) }] };
    const result = optimizeSheets(projectWithTurn, [narrow]);
    expect(result.valid).toBe(true);
    expect(result.plans[0].placements[0].rotated).toBe(true);
  });

  it('beats a deterministic one-sheet-per-part baseline when a larger sheet has lower cost per part', () => {
    const fourParts = { ...project, kerf: { um: 0 }, parts: Array.from({ length: 4 }, (_, i) => ({ id: `square-${i}`, name: `Square ${i + 1}`, materialId: 'm', length: { um: umFromInches(10) }, width: { um: umFromInches(10) }, quantity: 1 })) };
    const choices: Material = { id: 'm', name: 'Sheet stock', type: 'sheet', stocks: [
      { id: 'small', name: 'Cheap small sheet', length: { um: umFromInches(10) }, widthUm: umFromInches(10), price: { cents: 500 }, ownedQuantity: 0 },
      { id: 'large', name: 'Larger sheet', length: { um: umFromInches(20) }, widthUm: umFromInches(20), price: { cents: 1500 }, ownedQuantity: 0 },
    ] };
    const baseline = naiveSheetCostCents(fourParts, choices);
    const result = optimizeSheets(fourParts, [choices]);
    expect(baseline).toBe(2000);
    expect(result.valid).toBe(true);
    expect(result.totalCostCents).toBeLessThanOrEqual(baseline);
    expect(result.totalCostCents).toBe(1500);
    expect(result.plans[0].stockId).toBe('large');
  });

  it('warns when a sheet part lacks width or cannot fit the available stock', () => {
    const result = optimizeSheets({ ...project, parts: [{ ...project.parts[0], width: undefined }] }, [material]);
    expect(result.warnings.some(w => w.code === 'missing-width')).toBe(true);
    expect(result.warnings.some(w => w.code === 'invalid-plan' && w.message.includes('Part quantity mismatch'))).toBe(false);
    const tiny = { ...material, stocks: [{ ...material.stocks[0], widthUm: umFromInches(8), length: { um: umFromInches(8) } }] };
    expect(optimizeSheets(project, [tiny]).warnings.some(w => w.code === 'capacity')).toBe(true);
  });
});
