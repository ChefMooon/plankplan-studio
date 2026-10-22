import type { Project } from './model';
import type { SheetPlan } from './sheet';
import type { LinearPlan } from './model';

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
export function exportCutCsv(project: Project, linearPlans: LinearPlan[], sheetPlans: SheetPlan[]): string {
  const rows: (string | number)[][] = [['Material', 'Stock', 'Stock count', 'Owned', 'Buy cost', 'Part', 'Length um', 'Width um', 'X um', 'Y um', 'Rotated']];
  const stocks = new Map(project.materials.flatMap(m => m.stocks.map(s => [s.id, { material: m.name, stock: s.name }] as const)));
  for (const plan of linearPlans) for (const cut of plan.cuts) {
    const entry = stocks.get(plan.stockId); rows.push([entry?.material ?? '', entry?.stock ?? '', plan.stockCount, plan.ownedUsed, plan.costCents, project.parts.find(p => p.id === cut.partId)?.name ?? cut.partId, cut.lengthUm, '', '', '', '']);
  }
  for (const plan of sheetPlans) for (const placement of plan.placements) {
    const entry = stocks.get(plan.stockId); const part = project.parts.find(p => p.id === placement.partId); rows.push([entry?.material ?? '', entry?.stock ?? '', plan.stockCount, plan.ownedUsed, plan.costCents, part?.name ?? placement.partId, part?.length.um ?? '', part?.width?.um ?? '', placement.rect.x, placement.rect.y, placement.rotated ? 'yes' : 'no']);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
