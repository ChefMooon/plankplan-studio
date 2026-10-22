import type { LinearPlan, LinearResult, Material, Project, StockOption } from './model';
import { boardFootCents } from './model';

type Unit = { id: string; lengthUm: number };
const priceOf = (stock: StockOption): number | undefined => {
  if (!stock.price || stock.price.cents <= 0) return undefined;
  return stock.priceBasis === 'board-foot' ? boardFootCents(stock) : stock.price.cents;
};
const fits = (cuts: Unit[], stock: StockOption, kerf: number, trim: number) => trim + cuts.reduce((n, p) => n + p.lengthUm, 0) + Math.max(0, cuts.length - 1) * kerf <= stock.length.um;
const usedLength = (cuts: Unit[], kerf: number, trim: number) => trim + cuts.reduce((n, p) => n + p.lengthUm, 0) + Math.max(0, cuts.length - 1) * kerf;

/** Independent verifier. Checks part/material accounting, stock capacity, limits, ownership and totals. */
export function validateLinearPlan(project: Project, materials: Material[], plans: LinearPlan[]): string[] {
  const errors: string[] = [];
  const linearMaterialIds = new Set(materials.filter(m => m.type === 'linear').map(m => m.id));
  const linearParts = project.parts.filter(p => linearMaterialIds.has(p.materialId));
  const parts = new Map(linearParts.map(p => [p.id, p]));
  const expected = new Map(linearParts.map(p => [p.id, p.quantity]));
  const seen = new Map<string, number>();
  const stocks = new Map(materials.flatMap(m => m.stocks.map(s => [s.id, { stock: s, materialId: m.id }] as const)));
  const usage = new Map<string, { purchased: number; owned: number }>();
  for (const plan of plans) {
    const record = stocks.get(plan.stockId);
    if (!record || !Number.isInteger(plan.stockCount) || plan.stockCount < 1) { errors.push('Unknown stock or invalid stock count'); continue; }
    const { stock, materialId } = record;
    let used = project.trim.um;
    for (const cut of plan.cuts) {
      const part = parts.get(cut.partId);
      if (!part || part.materialId !== materialId || cut.lengthUm !== part.length.um) errors.push(`Unexpected part cut: ${cut.partId}`);
      else seen.set(cut.partId, (seen.get(cut.partId) ?? 0) + 1);
      used += cut.lengthUm;
    }
    used += Math.max(0, plan.cuts.length - 1) * project.kerf.um;
    if (used > stock.length.um) errors.push(`Stock length exceeded: ${stock.name}`);
    if (plan.usedUm !== used || plan.wasteUm !== stock.length.um - used) errors.push(`Length totals mismatch: ${stock.name}`);
    if (!Number.isInteger(plan.ownedUsed) || plan.ownedUsed < 0 || plan.ownedUsed > plan.stockCount) errors.push(`Owned stock mismatch: ${stock.name}`);
    const prior = usage.get(stock.id) ?? { purchased: 0, owned: 0 };
    prior.purchased += plan.stockCount - plan.ownedUsed;
    prior.owned += plan.ownedUsed;
    usage.set(stock.id, prior);
    const purchased = plan.stockCount - plan.ownedUsed;
    const unitPrice = priceOf(stock);
    if (purchased > 0 && unitPrice === undefined) errors.push(`Missing manual price: ${stock.name}`);
    if (plan.costCents !== (unitPrice ?? 0) * purchased) errors.push(`Cost mismatch: ${stock.name}`);
  }
  for (const [id, quantity] of expected) if ((seen.get(id) ?? 0) !== quantity) errors.push(`Part quantity mismatch: ${id}`);
  for (const [id, used] of usage) {
    const stock = stocks.get(id)?.stock;
    if (!stock) continue;
    if (used.owned > stock.ownedQuantity) errors.push(`Owned stock exceeded: ${stock.name}`);
    if (stock.quantityLimit !== undefined && used.purchased > stock.quantityLimit) errors.push(`Stock limit exceeded: ${stock.name}`);
  }
  return errors;
}

function pack(parts: Unit[], stock: StockOption, kerf: number, trim: number): Unit[][] {
  const bins: Unit[][] = [];
  for (const part of [...parts].sort((a, b) => b.lengthUm - a.lengthUm || a.id.localeCompare(b.id))) {
    const bin = bins.find(items => fits([...items, part], stock, kerf, trim));
    if (bin) bin.push(part); else if (fits([part], stock, kerf, trim)) bins.push([part]);
  }
  return bins;
}

function permutations<T>(items: T[], limit = 720): T[][] {
  if (items.length > 5) {
    const bounded: T[][] = [];
    items.forEach((first, i) => items.forEach((second, j) => {
      if (i !== j) bounded.push([first, second, ...items.filter((_, k) => k !== i && k !== j)]);
    }));
    return bounded.slice(0, 720);
  }
  const result: T[][] = [];
  const visit = (left: T[], built: T[]) => {
    if (result.length >= limit) return;
    if (!left.length) { result.push(built); return; }
    left.forEach((item, i) => visit([...left.slice(0, i), ...left.slice(i + 1)], [...built, item]));
  };
  visit(items, []); return result;
}

function planForOrder(parts: Unit[], order: StockOption[], kerf: number, trim: number): LinearPlan[] | undefined {
  let remaining = [...parts];
  const plans: LinearPlan[] = [];
  for (const stock of order) {
    const unitPrice = priceOf(stock);
    const purchaseAllowance = unitPrice === undefined ? 0 : (stock.quantityLimit ?? Number.MAX_SAFE_INTEGER);
    const available = stock.ownedQuantity + purchaseAllowance;
    const bins = pack(remaining, stock, kerf, trim).slice(0, available);
    let ownedLeft = stock.ownedQuantity;
    for (const bin of bins) {
      const ownedUsed = ownedLeft > 0 ? 1 : 0;
      ownedLeft -= ownedUsed;
      const usedUm = usedLength(bin, kerf, trim);
      plans.push({ cuts: bin.map(p => ({ partId: p.id, lengthUm: p.lengthUm })), stockId: stock.id, stockCount: 1, usedUm, wasteUm: stock.length.um - usedUm, costCents: ownedUsed ? 0 : (unitPrice ?? 0), ownedUsed });
    }
    const picked = new Set(bins.flatMap(bin => bin));
    remaining = remaining.filter(p => !picked.has(p));
    if (!remaining.length) return plans;
  }
  return undefined;
}

function selectStockMix(parts: Unit[], stocks: StockOption[], kerf: number, trim: number): LinearPlan[] | undefined {
  let best: LinearPlan[] | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const order of permutations(stocks)) {
    const candidate = planForOrder(parts, order, kerf, trim);
    if (!candidate) continue;
    const cost = candidate.reduce((n, p) => n + p.costCents, 0);
    if (cost < bestCost || (cost === bestCost && candidate.length < (best?.length ?? Infinity))) { best = candidate; bestCost = cost; }
  }
  return best;
}

/**
 * Exact cost oracle for small, unlimited-stock benchmark fixtures (at most 16 pieces).
 * Owned inventory and purchase limits are intentionally excluded; use optimizeLinear for those cases.
 */
export function exactLinearCostCents(parts: Unit[], stocks: StockOption[], kerf: number, trim: number): number {
  if (parts.length > 16) throw new Error('Exact 1D benchmark is limited to 16 pieces');
  const n = parts.length;
  const memo = new Map<number, number>();
  const solve = (mask: number): number => {
    if (!mask) return 0;
    const cached = memo.get(mask); if (cached !== undefined) return cached;
    const first = 31 - Math.clz32(mask & -mask);
    let best = Number.POSITIVE_INFINITY;
    for (let subset = mask; subset; subset = (subset - 1) & mask) {
      if (!(subset & (1 << first))) continue;
      const cuts = Array.from({ length: n }, (_, i) => i).filter(i => subset & (1 << i)).map(i => parts[i]);
      for (const stock of stocks) { const price = priceOf(stock); if (price !== undefined && fits(cuts, stock, kerf, trim)) best = Math.min(best, price + solve(mask ^ subset)); }
    }
    memo.set(mask, best); return best;
  };
  return solve((1 << n) - 1);
}

/** Naive baseline: buy one cheapest fitting board per part, without combining cuts. */
export function naiveLinearCostCents(parts: Unit[], stocks: StockOption[], trim: number): number {
  return parts.reduce((sum, part) => {
    const fitting = stocks.filter(stock => part.lengthUm + trim <= stock.length.um).map(priceOf).filter((price): price is number => price !== undefined);
    return sum + (fitting.length ? Math.min(...fitting) : Number.POSITIVE_INFINITY);
  }, 0);
}

export function optimizeLinear(project: Project, materials: Material[]): LinearResult {
  const warnings: LinearResult['warnings'] = [];
  const plans: LinearPlan[] = [];
  for (const material of materials) {
    if (material.type === 'sheet') {
      continue;
    }
    const parts: Unit[] = project.parts.filter(p => p.materialId === material.id).flatMap(p => Array.from({ length: Math.max(0, p.quantity) }, () => ({ id: p.id, lengthUm: p.length.um })));
    if (!parts.length) continue;
    const stocks = material.stocks.filter(s => s.length.um > 0).sort((a, b) => a.id.localeCompare(b.id));
    if (!stocks.length) { warnings.push({ code: 'no-stock', message: `No stock options for ${material.name}` }); continue; }
    for (const part of project.parts.filter(p => p.materialId === material.id && !stocks.some(s => fits([{ id: p.id, lengthUm: p.length.um }], s, project.kerf.um, project.trim.um)))) warnings.push({ code: 'oversize', message: `${part.name} does not fit available stock`, partId: part.id });
    if (warnings.some(w => w.code === 'oversize' && project.parts.find(p => p.id === w.partId)?.materialId === material.id)) continue;
    const selected = selectStockMix(parts, stocks, project.kerf.um, project.trim.um);
    if (!selected) {
      if (stocks.some(s => priceOf(s) === undefined && (s.quantityLimit === undefined || s.quantityLimit > 0))) warnings.push({ code: 'missing-price', message: `${material.name} has stock without a positive manual price. Enter a price or provide enough owned quantity.` });
      warnings.push({ code: 'capacity', message: `Available owned and limited stock quantities are insufficient for ${material.name}` }); continue;
    }
    plans.push(...selected);
  }
  const totalCostCents = plans.reduce((sum, p) => sum + p.costCents, 0);
  const validation = validateLinearPlan(project, materials, plans);
  for (const message of validation) warnings.push({ code: 'invalid-plan', message });
  return { plans, warnings, totalCostCents, valid: validation.length === 0 };
}
