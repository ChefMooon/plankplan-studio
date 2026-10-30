import type { LinearPlan } from '@/lib/planner/model';
import type { SheetPlan } from '@/lib/planner/sheet';

type Group<T> = { plan: T; count: number; costCents: number; owned: number; geometry: string };

function groupPlans<T extends { stockId: string; stockCount: number; costCents: number; ownedUsed: number }>(plans: T[], geometry: (plan: T) => string): Group<T>[] {
  const groups = new Map<string, Group<T>>();
  for (const plan of plans) {
    const shape = geometry(plan);
    const key = JSON.stringify([plan.stockId, shape]);
    const group = groups.get(key);
    if (group) {
      group.count += plan.stockCount;
      group.costCents += plan.costCents;
      group.owned += plan.ownedUsed;
    } else groups.set(key, { plan, count: plan.stockCount, costCents: plan.costCents, owned: plan.ownedUsed, geometry: shape });
  }
  return [...groups.values()];
}

export const groupLinearPlans = (plans: LinearPlan[]) => groupPlans(plans, (plan) => JSON.stringify([plan.cuts, plan.wasteUm]));
export const groupSheetPlans = (plans: SheetPlan[]) => groupPlans(plans, (plan) => JSON.stringify([plan.layout, plan.placements, plan.cutTree, plan.offcuts]));
