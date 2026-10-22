import { describe, expect, it } from 'vitest';
import { exactLinearCostCents, naiveLinearCostCents, optimizeLinear, validateLinearPlan } from './linear';
import { umFromInches, type Project } from './model';
const project: Project = { schemaVersion: 1, id: 'p', name: 'Test', unitSystem: 'imperial', kerf: { um: umFromInches(.125) }, trim: { um: umFromInches(.25) }, minOffcutLinear: { um: umFromInches(12) }, minOffcutSheet: { shortSideUm: 150000, longSideUm: 300000 }, currency: 'CAD', createdAt: '', updatedAt: '', parts: [{ id: 'a', name: 'Rail', materialId: 'm', length: { um: umFromInches(48) }, quantity: 2 }, { id: 'b', name: 'Stile', materialId: 'm', length: { um: umFromInches(24) }, quantity: 2 }], materials: [] };
const material = { id: 'm', name: 'Pine', type: 'linear' as const, stocks: [{ id: 's', name: '8 ft board', length: { um: umFromInches(96) }, price: { cents: 2000 }, widthUm: umFromInches(6), thicknessUm: umFromInches(1), priceBasis: 'board-foot' as const, ownedQuantity: 0 }] };
describe('linear optimizer contracts', () => {
  it('emits complete, independently valid, kerf and trim aware plans', () => {
    const result = optimizeLinear(project, [material]);
    expect(result.valid).toBe(true); expect(result.plans.length).toBe(2); expect(result.totalCostCents).toBe(16000);
    expect(validateLinearPlan(project, [material], result.plans)).toEqual([]);
  });
  it('warns when pieces exceed available stock', () => {
    const oversized = { ...project, parts: [{ ...project.parts[0], length: { um: umFromInches(100) }, quantity: 1 }] };
    const result = optimizeLinear(oversized, [material]);
    expect(result.warnings[0]?.code).toBe('oversize');
    expect(result.valid).toBe(false);
    expect(validateLinearPlan(oversized, [material], result.plans)).toContain('Part quantity mismatch: a');
  });
  it('accounts for owned boards before purchased boards', () => {
    const owned = { ...material, stocks: [{ ...material.stocks[0], ownedQuantity: 1 }] };
    expect(optimizeLinear({ ...project, parts: [{ ...project.parts[0], quantity: 1 }] }, [owned]).totalCostCents).toBe(0);
  });
  it('combines stock choices when one option is quantity limited', () => {
    const limited = { ...material, stocks: [
      { ...material.stocks[0], id: 'owned', ownedQuantity: 1, quantityLimit: 0, price: { cents: 1 } },
      { ...material.stocks[0], id: 'buy', ownedQuantity: 0, quantityLimit: 2 },
    ] };
    const result = optimizeLinear(project, [limited]);
    expect(result.valid).toBe(true);
    expect(new Set(result.plans.map(p => p.stockId))).toEqual(new Set(['owned', 'buy']));
    expect(validateLinearPlan(project, [limited], result.plans)).toEqual([]);
  });
  it('does not claim validity when available stock quantity is insufficient', () => {
    const limited = { ...material, stocks: [{ ...material.stocks[0], ownedQuantity: 0, quantityLimit: 1 }] };
    const result = optimizeLinear(project, [limited]);
    expect(result.valid).toBe(false);
    expect(result.warnings.some(w => w.code === 'capacity')).toBe(true);
  });
  it('benchmarks a small case against exact and naive costs', () => {
    const pieces = [{ id: 'a', lengthUm: umFromInches(48) }, { id: 'b', lengthUm: umFromInches(48) }, { id: 'c', lengthUm: umFromInches(24) }];
    const exact = exactLinearCostCents(pieces, material.stocks, project.kerf.um, project.trim.um);
    const result = optimizeLinear({ ...project, parts: pieces.map(p => ({ id: p.id, name: p.id, materialId: 'm', length: { um: p.lengthUm }, quantity: 1 })) }, [material]);
    expect(result.valid).toBe(true);
    expect(result.totalCostCents).toBeLessThanOrEqual(naiveLinearCostCents(pieces, material.stocks, project.trim.um));
    expect(result.totalCostCents).toBe(exact);
  });
  it('rejects stock use that exceeds the independent quantity limit', () => {
    const plans = optimizeLinear(project, [material]).plans;
    expect(validateLinearPlan(project, [{ ...material, stocks: [{ ...material.stocks[0], quantityLimit: 1 }] }], plans)).toContain('Stock limit exceeded: 8 ft board');
  });
  it('handles adversarial kerf and trim boundaries exactly', () => {
    const boundary = { ...project, kerf: { um: umFromInches(.125) }, trim: { um: umFromInches(.25) }, parts: [{ id: 'x', name: 'Exact fit', materialId: 'm', length: { um: umFromInches(95.625) }, quantity: 1 }] };
    expect(optimizeLinear(boundary, [material]).valid).toBe(true);
    const tooLong = { ...boundary, parts: [{ ...boundary.parts[0], length: { um: umFromInches(95.751) } }] };
    expect(optimizeLinear(tooLong, [material]).valid).toBe(false);
  });
  it('explains missing manual prices while allowing owned stock', () => {
    const unpriced = { ...material, stocks: [{ ...material.stocks[0], price: undefined, ownedQuantity: 0 }] };
    const noOwned = optimizeLinear({ ...project, parts: [{ ...project.parts[0], quantity: 1 }] }, [unpriced]);
    expect(noOwned.warnings.some(w => /manual price/i.test(w.message))).toBe(true);
    const owned = { ...unpriced, stocks: [{ ...unpriced.stocks[0], ownedQuantity: 1 }] };
    expect(optimizeLinear({ ...project, parts: [{ ...project.parts[0], quantity: 1 }] }, [owned]).valid).toBe(true);
  });
  it('keeps sheet materials out of the linear optimizer without invalidating a linear subplan', () => {
    const sheet = { ...material, type: 'sheet' as const };
    const result = optimizeLinear({ ...project, parts: [{ ...project.parts[0], quantity: 1 }] }, [sheet]);
    expect(result.plans).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => /sheet planning/i.test(w.message))).toBe(false);
  });
});
