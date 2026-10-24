import type { LinearResult, Project } from './model';
import { optimizeLinear } from './linear';
import { optimizeSheets } from './sheet';
import { preparePlanningProject } from './part-stock';

export function optimizeMixedProject(project: Project) {
  const prepared = preparePlanningProject(project);
  const planningProject = prepared.project;
  const linear: LinearResult = { plans: [], warnings: [], totalCostCents: 0, valid: true };
  const sheets: ReturnType<typeof optimizeSheets> = { plans: [], warnings: [], totalCostCents: 0, valid: true };
  const used = new Map<string, { owned: number; purchased: number }>();
  // Reserve explicitly selected stock first, then let legacy material assignments use the remainder.
  const materials = [...planningProject.materials].sort((a, b) => Number(b.id.startsWith('stock:')) - Number(a.id.startsWith('stock:')));
  for (const material of materials) {
    const available = { ...material, stocks: material.stocks.map(stock => {
      const consumed = used.get(stock.id) ?? { owned: 0, purchased: 0 };
      return { ...stock, ownedQuantity: Math.max(0, stock.ownedQuantity - consumed.owned), ...(stock.quantityLimit !== undefined ? { quantityLimit: Math.max(0, stock.quantityLimit - consumed.purchased) } : {}) };
    }) };
    const subset = { ...planningProject, parts: planningProject.parts.filter(part => part.materialId === material.id), materials: [available] };
    if (material.type === 'linear') {
      const result = optimizeLinear(subset, [available]);
      linear.plans.push(...result.plans); linear.warnings.push(...result.warnings); linear.valid &&= result.valid;
    } else {
      const result = optimizeSheets(subset, [available]);
      sheets.plans.push(...result.plans); sheets.warnings.push(...result.warnings); sheets.valid &&= result.valid;
    }
    for (const plan of [...linear.plans, ...sheets.plans].filter(plan => available.stocks.some(stock => stock.id === plan.stockId))) {
      // Only account for plans created in this group.
      if (!subset.parts.some(part => 'cuts' in plan ? plan.cuts.some(cut => cut.partId === part.id) : plan.placements.some(placement => placement.partId === part.id))) continue;
      const consumed = used.get(plan.stockId) ?? { owned: 0, purchased: 0 };
      used.set(plan.stockId, { owned: consumed.owned + plan.ownedUsed, purchased: consumed.purchased + plan.stockCount - plan.ownedUsed });
    }
  }
  sheets.totalCostCents = sheets.plans.reduce((total, plan) => total + plan.costCents, 0);
  if (prepared.unresolved.length) {
    linear.valid = false;
    linear.warnings.push(...prepared.unresolved.map(part => ({ code: 'stock-needed', message: `${part.name} needs a compatible stock option for panel placement or its selected dimensions.`, partId: part.id })));
  }
  for (const plan of linear.plans) if (prepared.genericStockIds.has(plan.stockId)) plan.costCents = 0;
  linear.totalCostCents = linear.plans.reduce((total, plan) => total + plan.costCents, 0);
  const subtotalCents = linear.totalCostCents + sheets.totalCostCents;
  const taxCents = Math.round(subtotalCents * (project.taxRate ?? 0) / 100);
  return {
    planningProject,
    genericStockIds: prepared.genericStockIds,
    unresolved: prepared.unresolved,
    linear,
    sheets,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    warnings: [...linear.warnings, ...sheets.warnings],
    valid: linear.valid && sheets.valid,
  };
}
