import { describe, expect, it } from 'vitest';
import type { LinearPlan } from '@/lib/planner/model';
import type { SheetPlan } from '@/lib/planner/sheet';
import { groupLinearPlans, groupSheetPlans } from './groupCutPlans';

describe('cut plan grouping', () => {
  it('groups identical boards and totals owned stock and cost without merging different cuts or stock', () => {
    const plan: LinearPlan = { stockId: 's', stockCount: 1, cuts: [{ partId: 'a', lengthUm: 10 }], usedUm: 10, wasteUm: 20, costCents: 100, ownedUsed: 0 };
    const groups = groupLinearPlans([plan, { ...plan, costCents: 0, ownedUsed: 1 }, { ...plan, stockId: 'other' }, { ...plan, cuts: [{ partId: 'b', lengthUm: 10 }] }]);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ count: 2, costCents: 100, owned: 1 });
  });

  it('groups matching sheets but keeps different cut orders and placements separate', () => {
    const rect = { x: 0, y: 0, width: 10, height: 20 };
    const plan: SheetPlan = { stockId: 's', stockCount: 1, ownedUsed: 0, costCents: 100, usedAreaUm2: 200, wasteAreaUm2: 0, layout: 'strips', placements: [{ partId: 'a', rect, rotated: false }], cutTree: { type: 'part', partId: 'a', rect, rotated: false }, offcuts: [] };
    const groups = groupSheetPlans([plan, { ...plan, ownedUsed: 1, costCents: 0 }, { ...plan, layout: 'guillotine' }, { ...plan, placements: [{ ...plan.placements[0], rotated: true }] }]);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ count: 2, costCents: 100, owned: 1 });
  });
});
