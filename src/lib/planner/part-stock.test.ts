import { expect, it } from 'vitest';
import { createProject } from './storage';
import { optimizeMixedProject } from './combined';
import { exportProject, importProject, umFromInches } from './model';
import { exportCutCsv } from './exports';

it('groups generic 96 inch boards by cross-section and keeps unspecified boards separate', () => {
  const project = createProject();
  project.parts = [1, 2, 3].map(index => ({ id: `p${index}`, name: `Part ${index}`, kind: 'linear', materialId: '', length: { um: umFromInches(40) }, quantity: 1, ...(index < 3 ? { crossSection: { width: { um: umFromInches(index === 1 ? 3.5 : 5.5) }, thickness: { um: umFromInches(1.5) } } } : {}) }));
  const result = optimizeMixedProject(project);
  expect(result.valid).toBe(true);
  expect(result.linear.plans).toHaveLength(3);
  expect(result.genericStockIds.size).toBe(3);
  expect(result.linear.totalCostCents).toBe(0);
  expect(result.planningProject.materials.every(material => material.stocks[0].length.um === umFromInches(96))).toBe(true);
  expect(exportCutCsv(project, result.linear.plans, [])).toContain('Unspecified');
  expect(importProject(exportProject(project))).toEqual(project);
});

it('restricts assigned parts to the selected stock and rejects incompatible cross-sections', () => {
  const project = createProject();
  project.materials = [{ id: 'm', name: 'Pine', type: 'linear', stocks: [{ id: 'short', name: 'Short', length: { um: umFromInches(48) }, widthUm: umFromInches(3.5), thicknessUm: umFromInches(1.5), price: { cents: 500 }, ownedQuantity: 0 }, { id: 'long', name: 'Long', length: { um: umFromInches(96) }, price: { cents: 100 }, ownedQuantity: 0 }] }];
  project.parts = [{ id: 'p', name: 'Rail', kind: 'linear', materialId: 'm', stockId: 'short', length: { um: umFromInches(40) }, quantity: 2 }];
  const result = optimizeMixedProject(project);
  expect(result.linear.plans).toHaveLength(2);
  expect(result.linear.plans.every(plan => plan.stockId === 'short')).toBe(true);
  project.parts[0].crossSection = { width: { um: umFromInches(5.5) }, thickness: { um: umFromInches(1.5) } };
  const invalid = optimizeMixedProject(project);
  expect(invalid.valid).toBe(false);
  expect(invalid.unresolved).toHaveLength(1);
});

it('reports generic parts longer than 96 inches instead of dropping them', () => {
  const project = createProject();
  project.parts = [{ id: 'p', name: 'Long rail', kind: 'linear', materialId: '', length: { um: umFromInches(100) }, quantity: 1 }];
  const result = optimizeMixedProject(project);
  expect(result.valid).toBe(false);
  expect(result.warnings.some(warning => warning.partId === 'p')).toBe(true);
});

it('shares owned inventory between specific stock assignments and legacy material assignments', () => {
  const project = createProject();
  project.materials = [{ id: 'm', name: 'Pine', type: 'linear', stocks: [{ id: 'only', name: 'Owned board', length: { um: umFromInches(96) }, ownedQuantity: 1, quantityLimit: 0 }] }];
  project.parts = [{ id: 'specific', name: 'Specific', kind: 'linear', materialId: 'm', stockId: 'only', length: { um: umFromInches(70) }, quantity: 1 }, { id: 'legacy', name: 'Legacy', materialId: 'm', length: { um: umFromInches(70) }, quantity: 1 }];
  const result = optimizeMixedProject(project);
  expect(result.valid).toBe(false);
  expect(result.linear.plans.reduce((count, plan) => count + plan.ownedUsed, 0)).toBe(1);
});
