import { describe, expect, it } from 'vitest';
import { optimizeLinear, validateLinearPlan } from './linear';
import { umFromInches, type Project } from './model';

describe('linear optimizer scale', () => {
  it('plans a deterministic 100-part project within the Phase 1 budget', () => {
    const parts = Array.from({ length: 100 }, (_, index) => ({ id: `part-${index}`, name: `Part ${index + 1}`, materialId: 'm', length: { um: umFromInches(12 + index % 6) }, quantity: 1 }));
    const project: Project = { schemaVersion: 2, id: 'perf', name: '100 part benchmark', unitSystem: 'imperial', kerf: { um: umFromInches(.125) }, trim: { um: umFromInches(.25) }, minOffcutLinear: { um: umFromInches(12) }, minOffcutSheet: { shortSideUm: 150000, longSideUm: 300000 }, currency: 'CAD', createdAt: '', updatedAt: '', parts, materials: [] };
    const material = { id: 'm', name: 'Pine', type: 'linear' as const, stocks: [{ id: 's', name: '8 ft board', length: { um: umFromInches(96) }, price: { cents: 2000 }, widthUm: umFromInches(6), thicknessUm: umFromInches(1), priceBasis: 'board-foot' as const, ownedQuantity: 0 }] };
    const started = performance.now();
    const result = optimizeLinear(project, [material]);
    const elapsedMs = performance.now() - started;
    console.info(`100-part optimizeLinear: ${elapsedMs.toFixed(1)} ms`);
    expect(result.plans.length).toBeGreaterThan(0);
    expect(result.valid).toBe(true);
    expect(validateLinearPlan(project, [material], result.plans)).toEqual([]);
    expect(elapsedMs).toBeLessThan(2000);
  });
});
