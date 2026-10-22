import { describe, expect, it } from 'vitest';
import { optimizeMixedProject } from './combined';
import { exactLinearCostCents, naiveLinearCostCents, validateLinearPlan } from './linear';
import { umFromInches, type Material, type Project } from './model';
import { naiveSheetCostCents, validateSheetPlan } from './sheet';

const inch = (value: number) => ({ um: umFromInches(value) });

// A small, reproducible shop job: an entry bench frame and two plywood panels.
const entryBench: Project = {
  schemaVersion: 1, id: 'entry-bench', name: 'Entry bench', unitSystem: 'imperial',
  kerf: inch(.125), trim: inch(.25), minOffcutLinear: inch(12),
  minOffcutSheet: { shortSideUm: umFromInches(6), longSideUm: umFromInches(12) },
  currency: 'CAD', createdAt: '', updatedAt: '',
  parts: [
    { id: 'leg', name: 'Leg', materialId: 'poplar', length: inch(18), quantity: 4 },
    { id: 'long-apron', name: 'Long apron', materialId: 'poplar', length: inch(36), quantity: 2 },
    { id: 'short-apron', name: 'Short apron', materialId: 'poplar', length: inch(12), quantity: 2 },
    { id: 'seat', name: 'Seat panel', materialId: 'plywood', length: inch(36), width: inch(18), quantity: 1 },
    { id: 'lower-shelf', name: 'Lower shelf', materialId: 'plywood', length: inch(30), width: inch(12), quantity: 1 },
  ],
  materials: [
    { id: 'poplar', name: 'Poplar', type: 'linear', stocks: [{ id: 'poplar-8ft', name: '8 ft poplar board', length: inch(96), price: { cents: 2600 }, ownedQuantity: 0 }] },
    { id: 'plywood', name: 'Birch plywood', type: 'sheet', stocks: [{ id: 'plywood-4x8', name: '4 × 8 ft sheet', length: inch(96), widthUm: umFromInches(48), price: { cents: 7000 }, ownedQuantity: 0 }] },
  ],
};

describe('MVP release readiness', () => {
  it('plans and independently validates the complete entry-bench shop job against naive baselines', () => {
    const result = optimizeMixedProject(entryBench);
    const linearParts = entryBench.parts.filter(part => part.materialId === 'poplar').flatMap(part =>
      Array.from({ length: part.quantity }, () => ({ id: part.id, lengthUm: part.length.um })),
    );
    const poplar = entryBench.materials.find(material => material.id === 'poplar')!;
    const plywood = entryBench.materials.find(material => material.id === 'plywood')!;

    expect(result.valid).toBe(true);
    expect(validateLinearPlan(entryBench, entryBench.materials, result.linear.plans)).toEqual([]);
    expect(validateSheetPlan(entryBench, plywood, result.sheets.plans)).toEqual([]);
    expect(result.linear.totalCostCents).toBeLessThanOrEqual(naiveLinearCostCents(linearParts, poplar.stocks, entryBench.trim.um));
    expect(result.sheets.totalCostCents).toBeLessThanOrEqual(naiveSheetCostCents(entryBench, plywood));
    expect(result.totalCents).toBe(12_200);
    expect(result.linear.plans).toHaveLength(2);
    expect(result.sheets.plans).toHaveLength(1);
    expect(result.sheets.plans[0].placements).toHaveLength(2);
  });

  it('records the heuristic gap against the exact small-case linear oracle', () => {
    const material = entryBench.materials.find(candidate => candidate.id === 'poplar')!;
    const pieces = entryBench.parts.filter(part => part.materialId === 'poplar').flatMap(part =>
      Array.from({ length: part.quantity }, () => ({ id: part.id, lengthUm: part.length.um })),
    );
    const exact = exactLinearCostCents(pieces, material.stocks, entryBench.kerf.um, entryBench.trim.um);
    const mixed = optimizeMixedProject(entryBench);
    const gapCents = mixed.linear.totalCostCents - exact;
    console.info(`entry-bench 1D exact gap: ${gapCents} cents (${exact} exact / ${mixed.linear.totalCostCents} heuristic)`);
    expect(gapCents).toBe(0);
  });

  it('fails closed with warnings for oversized parts, missing prices, and materials with no stock', () => {
    const linear = entryBench.materials.find(material => material.id === 'poplar')!;
    const oversizedProject = { ...entryBench, parts: [{ ...entryBench.parts[0], length: inch(100), quantity: 1 }] };
    const oversized = optimizeMixedProject({ ...oversizedProject, materials: [linear] });
    expect(oversized.valid).toBe(false);
    expect(oversized.warnings.some(warning => warning.code === 'oversize')).toBe(true);

    const unpriced = { ...linear, stocks: [{ ...linear.stocks[0], price: undefined }] };
    const missingPrice = optimizeMixedProject({ ...entryBench, parts: [entryBench.parts[0]], materials: [unpriced] });
    expect(missingPrice.valid).toBe(false);
    expect(missingPrice.warnings.some(warning => warning.code === 'missing-price')).toBe(true);

    const noStock: Material = { ...linear, stocks: [] };
    const absent = optimizeMixedProject({ ...entryBench, parts: [entryBench.parts[0]], materials: [noStock] });
    expect(absent.valid).toBe(false);
    expect(absent.warnings.some(warning => warning.code === 'no-stock')).toBe(true);

    const plywood = entryBench.materials.find(material => material.id === 'plywood')!;
    const oversizedSheet = optimizeMixedProject({ ...entryBench, parts: [{ ...entryBench.parts[3], length: inch(60), width: inch(60) }] });
    expect(oversizedSheet.valid).toBe(false);
    expect(oversizedSheet.warnings.some(warning => warning.code === 'oversize' && warning.partId === 'seat')).toBe(true);

    const unpricedSheet = optimizeMixedProject({ ...entryBench, parts: [entryBench.parts[3]], materials: [{ ...plywood, stocks: [{ ...plywood.stocks[0], price: undefined }] }] });
    expect(unpricedSheet.valid).toBe(false);
    expect(unpricedSheet.warnings.some(warning => warning.code === 'missing-price')).toBe(true);

    const noSheetStock = optimizeMixedProject({ ...entryBench, parts: [entryBench.parts[3]], materials: [{ ...plywood, stocks: [] }] });
    expect(noSheetStock.valid).toBe(false);
    expect(noSheetStock.warnings.some(warning => warning.code === 'no-stock')).toBe(true);
  });
});
