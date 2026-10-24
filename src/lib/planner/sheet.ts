import type { Material, Part, PlanWarning, Project, StockOption } from './model';

export type Rect = { x: number; y: number; width: number; height: number };
export type SheetCutTree = { type: 'part'; partId: string; rect: Rect; rotated: boolean } | { type: 'offcut'; rect: Rect } | { type: 'cut'; axis: 'x' | 'y'; at: number; kerfUm: number; before: SheetCutTree; after: SheetCutTree };
export type SheetPlan = { stockId: string; stockCount: number; ownedUsed: number; costCents: number; usedAreaUm2: number; wasteAreaUm2: number; layout: 'guillotine' | 'strips'; placements: { partId: string; rect: Rect; rotated: boolean }[]; cutTree: SheetCutTree; offcuts: Rect[] };
export type SheetResult = { plans: SheetPlan[]; warnings: PlanWarning[]; totalCostCents: number; valid: boolean };
type Item = { part: Part; index: number };
type Open = { rect: Rect; tree: SheetCutTree };
type Packed = { tree: SheetCutTree; placements: SheetPlan['placements']; offcuts: Rect[] };
const priceOf = (stock: StockOption) => stock.price && stock.price.cents > 0 ? stock.price.cents : undefined;
const area = (r: Rect) => r.width * r.height;
const cutCount = (tree: SheetCutTree): number => tree.type === 'cut' ? 1 + cutCount(tree.before) + cutCount(tree.after) : 0;

function tryPlacement(open: Open, item: Item, kerf: number, rotationAllowed: boolean): { tree: SheetCutTree; opens: Open[]; rect: Rect; rotated: boolean } | undefined {
  const partWidth = item.part.width?.um;
  if (!partWidth || partWidth <= 0 || item.part.length.um <= 0) return undefined;
  const options = [{ width: partWidth, height: item.part.length.um, rotated: false }, ...(item.part.grainLocked || !rotationAllowed ? [] : [{ width: item.part.length.um, height: partWidth, rotated: true }])];
  for (const option of options) {
    const { x, y, width, height } = open.rect;
    if (option.width > width || option.height > height) continue;
    const rect = { x, y, width: option.width, height: option.height };
    const partTree: SheetCutTree = { type: 'part', partId: item.part.id, rect, rotated: option.rotated };
    const opens: Open[] = [];
    const firstWidth = option.width + (width > option.width ? kerf : 0);
    const rightWidth = width - firstWidth;
    const lowerHeight = height - option.height - (height > option.height ? kerf : 0);
    let firstTree: SheetCutTree = partTree;
    if (lowerHeight > 0) {
      const lower = { x, y: y + option.height + kerf, width: option.width, height: lowerHeight };
      const lowerTree: SheetCutTree = { type: 'offcut', rect: lower };
      firstTree = { type: 'cut', axis: 'y', at: option.height, kerfUm: kerf, before: partTree, after: lowerTree };
      opens.push({ rect: lower, tree: lowerTree });
    }
    if (rightWidth > 0) {
      const right = { x: x + firstWidth, y, width: rightWidth, height };
      const rightTree: SheetCutTree = { type: 'offcut', rect: right };
      opens.push({ rect: right, tree: rightTree });
      return { tree: { type: 'cut', axis: 'x', at: option.width, kerfUm: kerf, before: firstTree, after: rightTree }, opens, rect, rotated: option.rotated };
    }
    return { tree: firstTree, opens, rect, rotated: option.rotated };
  }
  return undefined;
}

function pack(items: Item[], stock: StockOption, kerf: number, trim: number, minShort: number, minLong: number, rotationAllowed = true): Packed | undefined {
  const width = stock.widthUm ?? 0;
  const height = stock.length.um;
  if (width <= trim * 2 || height <= trim * 2) return undefined;
  let tree: SheetCutTree = { type: 'offcut', rect: { x: trim, y: trim, width: width - trim * 2, height: height - trim * 2 } };
  const opens: Open[] = [{ rect: tree.rect, tree }];
  const placements: SheetPlan['placements'] = [];
  for (const item of items) {
    let choice: { index: number; result: NonNullable<ReturnType<typeof tryPlacement>> } | undefined;
    for (let i = 0; i < opens.length; i++) {
      const result = tryPlacement(opens[i], item, kerf, rotationAllowed);
      if (result) { choice = { index: i, result }; break; }
    }
    if (!choice) { if (!placements.length) return undefined; break; }
    const [open] = opens.splice(choice.index, 1);
    if (open.tree === tree) tree = choice.result.tree;
    else tree = replaceTree(tree, open.tree, choice.result.tree);
    opens.push(...choice.result.opens);
    placements.push({ partId: item.part.id, rect: choice.result.rect, rotated: choice.result.rotated });
  }
  const offcuts = opens.map(o => o.rect).filter(r => Math.min(r.width, r.height) >= minShort && Math.max(r.width, r.height) >= minLong);
  return { tree, placements, offcuts };
}

function packStrips(items: Item[], stock: StockOption, kerf: number, trim: number, minShort: number, minLong: number): Packed | undefined {
  const sheetWidth = stock.widthUm ?? 0; const sheetLength = stock.length.um;
  const usableWidth = sheetWidth - 2 * trim; const usableLength = sheetLength - 2 * trim;
  if (usableWidth <= 0 || usableLength <= 0) return undefined;
  type Strip = { width: number; usedLength: number; items: { item: Item; length: number; rotated: boolean }[] };
  const strips: Strip[] = [];
  const ordered = [...items].sort((a, b) => (b.part.length.um * (b.part.width?.um ?? 0)) - (a.part.length.um * (a.part.width?.um ?? 0)) || a.part.id.localeCompare(b.part.id));
  for (const item of ordered) {
    const width = item.part.width?.um;
    if (!width) continue;
    const orientations = [{ stripWidth: width, length: item.part.length.um, rotated: false }, ...(item.part.grainLocked ? [] : [{ stripWidth: item.part.length.um, length: width, rotated: true }])];
    const viable = orientations.filter(o => o.stripWidth <= usableWidth && o.length <= usableLength).map(o => {
      const existing = strips.map((strip, index) => ({ strip, index })).filter(x => x.strip.width === o.stripWidth && x.strip.usedLength + kerf + o.length <= usableLength).sort((a, b) => b.strip.usedLength - a.strip.usedLength)[0];
      return { ...o, existing };
    }).sort((a, b) => (a.existing ? 0 : 1) - (b.existing ? 0 : 1) || a.stripWidth - b.stripWidth || Number(a.rotated) - Number(b.rotated));
    const choice = viable.find(o => o.existing || strips.reduce((sum, strip) => sum + strip.width, 0) + strips.length * kerf + o.stripWidth <= usableWidth);
    if (!choice) continue;
    const entry = { item, length: choice.length, rotated: choice.rotated };
    if (choice.existing) {
      const strip = strips[choice.existing.index]; strip.usedLength += kerf + choice.length; strip.items.push(entry);
    } else strips.push({ width: choice.stripWidth, usedLength: choice.length, items: [entry] });
  }
  if (!strips.length) return undefined;
  const placements: SheetPlan['placements'] = [];
  const offcuts: Rect[] = [];
  const buildStrip = (strip: Strip, x: number, y: number, width: number, height: number): SheetCutTree => {
    const buildCrosscuts = (index: number, cy: number, remaining: number): SheetCutTree => {
      if (index >= strip.items.length) {
        const rect = { x, y: cy, width, height: remaining }; offcuts.push(rect); return { type: 'offcut', rect };
      }
      const cut = strip.items[index]; const rect = { x, y: cy, width, height: cut.length };
      placements.push({ partId: cut.item.part.id, rect, rotated: cut.rotated });
      const partNode: SheetCutTree = { type: 'part', partId: cut.item.part.id, rect, rotated: cut.rotated };
      const rest = remaining - cut.length - kerf;
      if (remaining <= cut.length) return partNode;
      if (rest <= 0) { const edge: Rect = { x, y: cy + cut.length + kerf, width, height: 0 }; return { type: 'cut', axis: 'y', at: cut.length, kerfUm: kerf, before: partNode, after: { type: 'offcut', rect: edge } }; }
      return { type: 'cut', axis: 'y', at: cut.length, kerfUm: kerf, before: partNode, after: buildCrosscuts(index + 1, cy + cut.length + kerf, rest) };
    };
    return buildCrosscuts(0, y, height);
  };
  const buildRips = (index: number, x: number, remainingWidth: number): SheetCutTree => {
    if (index >= strips.length) { const rect = { x, y: trim, width: remainingWidth, height: usableLength }; offcuts.push(rect); return { type: 'offcut', rect }; }
    const strip = strips[index]; const canRip = remainingWidth > strip.width;
    const stripRegionWidth = strip.width;
    const before = buildStrip(strip, x, trim, stripRegionWidth, usableLength);
    if (!canRip) return before;
    const restWidth = Math.max(0, remainingWidth - strip.width - kerf);
    if (restWidth === 0) return { type: 'cut', axis: 'x', at: strip.width, kerfUm: kerf, before, after: { type: 'offcut', rect: { x: x + strip.width + kerf, y: trim, width: 0, height: usableLength } } };
    return { type: 'cut', axis: 'x', at: strip.width, kerfUm: kerf, before, after: buildRips(index + 1, x + strip.width + kerf, restWidth) };
  };
  const tree = buildRips(0, trim, usableWidth);
  const usableOffcuts = offcuts.filter(rect => Math.min(rect.width, rect.height) >= minShort && Math.max(rect.width, rect.height) >= minLong);
  return { tree, placements, offcuts: usableOffcuts };
}

function replaceTree(root: SheetCutTree, target: SheetCutTree, replacement: SheetCutTree): SheetCutTree {
  if (root === target) return replacement;
  if (root.type !== 'cut') return root;
  return { ...root, before: replaceTree(root.before, target, replacement), after: replaceTree(root.after, target, replacement) };
}

export function validateSheetPlan(project: Project, material: Material, plans: SheetPlan[]): string[] {
  const errors: string[] = [];
  const stockMap = new Map(material.stocks.map(stock => [stock.id, stock]));
  // Parts without a width are reported as missing-width by the optimizer and
  // cannot be placed. Exclude them from placement-count validation so the
  // validator does not add a misleading quantity-mismatch error.
  const parts = new Map(project.parts.filter(p => p.materialId === material.id && p.width?.um).map(part => [part.id, part]));
  const seen = new Map<string, number>();
  const use = new Map<string, { bought: number; owned: number }>();
  for (const plan of plans) {
    const stock = stockMap.get(plan.stockId);
    if (!stock || !stock.widthUm || plan.stockCount !== 1) { errors.push('Unknown stock or invalid sheet count'); continue; }
    const bounds = { x: project.trim.um, y: project.trim.um, width: stock.widthUm - 2 * project.trim.um, height: stock.length.um - 2 * project.trim.um };
    const leaves: { id?: string; rect: Rect; rotated?: boolean }[] = [];
    const visit = (node: SheetCutTree, region: Rect): void => {
      if (node.type !== 'cut') { if (node.rect.x !== region.x || node.rect.y !== region.y || node.rect.width !== region.width || node.rect.height !== region.height) errors.push('Cut tree region mismatch'); leaves.push({ id: node.type === 'part' ? node.partId : undefined, rect: node.rect, rotated: node.type === 'part' ? node.rotated : undefined }); return; }
      const horizontal = node.axis === 'y';
      const span = horizontal ? region.height : region.width;
      if (!Number.isSafeInteger(node.at) || !Number.isSafeInteger(node.kerfUm) || node.kerfUm !== project.kerf.um || node.at <= 0 || node.at >= span) { errors.push('Invalid guillotine cut or kerf'); return; }
      const first = horizontal ? { ...region, height: node.at } : { ...region, width: node.at };
      const secondSpan = Math.max(0, span - node.at - node.kerfUm);
      const second = horizontal ? { ...region, y: region.y + node.at + node.kerfUm, height: secondSpan } : { ...region, x: region.x + node.at + node.kerfUm, width: secondSpan };
      visit(node.before, first); visit(node.after, second);
    };
    visit(plan.cutTree, bounds);
    const unmatchedPlacements = [...plan.placements];
    for (const leaf of leaves.filter(l => l.id)) {
      const part = parts.get(leaf.id!); const placementIndex = unmatchedPlacements.findIndex(p => p.partId === leaf.id && JSON.stringify(p.rect) === JSON.stringify(leaf.rect) && p.rotated === leaf.rotated); const placement = placementIndex >= 0 ? unmatchedPlacements.splice(placementIndex, 1)[0] : undefined;
      if (!part || !placement || !part.width) { errors.push(`Unexpected sheet part: ${leaf.id}`); continue; }
      seen.set(part.id, (seen.get(part.id) ?? 0) + 1);
      const expectedW = leaf.rotated ? part.length.um : part.width.um; const expectedH = leaf.rotated ? part.width.um : part.length.um;
      if (leaf.rect.width !== expectedW || leaf.rect.height !== expectedH || leaf.rect.x < bounds.x || leaf.rect.y < bounds.y || leaf.rect.x + leaf.rect.width > bounds.x + bounds.width || leaf.rect.y + leaf.rect.height > bounds.y + bounds.height)  errors.push(`Invalid placement bounds or dimensions: ${part.name}`);
      if (leaf.rotated && part.grainLocked) errors.push(`Grain-locked part rotated: ${part.name}`);
      if (JSON.stringify(leaf.rect) !== JSON.stringify(placement.rect) || leaf.rotated !== placement.rotated) errors.push(`Placement and cut tree disagree: ${part.name}`);
    }
    if (leaves.filter(l => l.id).length !== plan.placements.length || unmatchedPlacements.length) errors.push('Placement count does not match cut tree');
    for (let i = 0; i < plan.placements.length; i++) for (let j = i + 1; j < plan.placements.length; j++) {
      const a = plan.placements[i].rect; const b = plan.placements[j].rect;
      if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) errors.push('Sheet placements overlap');
    }
    const expectedArea = plan.placements.reduce((sum, p) => sum + area(p.rect), 0);
    if (expectedArea !== plan.usedAreaUm2 || stock.widthUm * stock.length.um - expectedArea !== plan.wasteAreaUm2) errors.push('Sheet area totals mismatch');
    const ownedUsed = plan.ownedUsed; const price = priceOf(stock); const bought = plan.stockCount - ownedUsed;
    if (!Number.isInteger(ownedUsed) || ownedUsed < 0 || ownedUsed > 1) errors.push('Invalid owned stock count');
    if (bought > 0 && price === undefined) errors.push(`Missing manual price: ${stock.name}`);
    if (plan.costCents !== (price ?? 0) * bought) errors.push(`Cost mismatch: ${stock.name}`);
    const prior = use.get(stock.id) ?? { bought: 0, owned: 0 }; prior.bought += bought; prior.owned += ownedUsed; use.set(stock.id, prior);
  }
  for (const [id, part] of parts) if ((seen.get(id) ?? 0) !== part.quantity) errors.push(`Part quantity mismatch: ${id}`);
  for (const [id, count] of use) { const stock = stockMap.get(id)!; if (count.owned > stock.ownedQuantity) errors.push(`Owned stock exceeded: ${stock.name}`); if (stock.quantityLimit !== undefined && count.bought > stock.quantityLimit) errors.push(`Stock limit exceeded: ${stock.name}`); }
  return errors;
}

/** Naive purchase baseline: buy one cheapest fitting sheet for each part, without nesting pieces. */
export function naiveSheetCostCents(project: Project, material: Material): number {
  return project.parts.filter(part => part.materialId === material.id).reduce((total, part) => {
    if (!part.width) return Number.POSITIVE_INFINITY;
    const partWidth = part.width.um;
    const fittingPrices = material.stocks.flatMap(stock => {
      const price = priceOf(stock); if (price === undefined || !stock.widthUm) return [];
      const usableWidth = stock.widthUm - 2 * project.trim.um; const usableLength = stock.length.um - 2 * project.trim.um;
      const fitsNormal = partWidth <= usableWidth && part.length.um <= usableLength;
      const fitsRotated = !part.grainLocked && part.length.um <= usableWidth && partWidth <= usableLength;
      return fitsNormal || fitsRotated ? [price] : [];
    });
    return fittingPrices.length ? total + Math.min(...fittingPrices) * part.quantity : Number.POSITIVE_INFINITY;
  }, 0);
}

export function optimizeSheets(project: Project, materials = project.materials): SheetResult {
  const plans: SheetPlan[] = []; const warnings: PlanWarning[] = [];
  for (const material of materials.filter(m => m.type === 'sheet')) {
    const items = project.parts.filter(p => p.materialId === material.id).flatMap(part => Array.from({ length: part.quantity }, (_, index) => ({ part, index }))).sort((a, b) => Math.max(b.part.length.um, b.part.width?.um ?? 0) - Math.max(a.part.length.um, a.part.width?.um ?? 0));
    if (!items.length) continue;
    if (items.some(i => !i.part.width)) { warnings.push({ code: 'missing-width', message: `${material.name} has parts without a width.` }); continue; }
    const stocks = material.stocks.filter(s => (s.widthUm ?? 0) > 0 && s.length.um > 0).sort((a, b) => a.length.um * (a.widthUm ?? 0) - b.length.um * (b.widthUm ?? 0));
    if (!stocks.length) { warnings.push({ code: 'no-stock', message: `No sheet stock options for ${material.name}` }); continue; }
    for (const part of project.parts.filter(p => p.materialId === material.id && p.width)) {
      const fitsAnyStock = stocks.some(stock => {
        const usableWidth = (stock.widthUm ?? 0) - project.trim.um * 2;
        const usableLength = stock.length.um - project.trim.um * 2;
        const fitsNormal = part.width!.um <= usableWidth && part.length.um <= usableLength;
        const fitsRotated = !part.grainLocked && part.length.um <= usableWidth && part.width!.um <= usableLength;
        return fitsNormal || fitsRotated;
      });
      if (!fitsAnyStock) warnings.push({ code: 'oversize', message: `${part.name} does not fit available sheet stock`, partId: part.id });
    }
    let remaining = [...items]; const used = new Map<string, { owned: number; bought: number }>();
    while (remaining.length) {
      const candidates = stocks.flatMap(stock => {
        const layouts = project.sheetLayout === 'simplestCuts' ? ['strips'] as const : ['guillotine', 'strips'] as const;
        return layouts.map(layout => {
          const packed = layout === 'strips'
            ? packStrips(remaining, stock, project.kerf.um, project.trim.um, project.minOffcutSheet.shortSideUm, project.minOffcutSheet.longSideUm)
            : pack(remaining, stock, project.kerf.um, project.trim.um, project.minOffcutSheet.shortSideUm, project.minOffcutSheet.longSideUm);
          if (!packed) return undefined;
          const stockUse = used.get(stock.id) ?? { owned: 0, bought: 0 };
          const marginalCostCents = stockUse.owned < stock.ownedQuantity ? 0 : priceOf(stock) ?? Number.POSITIVE_INFINITY;
          return { stock, packed, layout, count: packed.placements.length, price: priceOf(stock), marginalCostCents };
        });
      }).filter((x): x is NonNullable<typeof x> => !!x && (x.price !== undefined || (used.get(x.stock.id)?.owned ?? 0) < x.stock.ownedQuantity));
      candidates.sort((a, b) => a.marginalCostCents / a.count - b.marginalCostCents / b.count || cutCount(a.packed.tree) - cutCount(b.packed.tree) || (a.layout === b.layout ? 0 : a.layout === 'strips' ? -1 : 1) || a.stock.length.um * (a.stock.widthUm ?? 0) - b.stock.length.um * (b.stock.widthUm ?? 0));
      const selected = candidates.find(c => { const u = used.get(c.stock.id) ?? { owned: 0, bought: 0 }; return u.owned + u.bought < c.stock.ownedQuantity + (c.price === undefined ? 0 : c.stock.quantityLimit ?? Number.MAX_SAFE_INTEGER); });
      if (!selected) {
        if (stocks.some(stock => priceOf(stock) === undefined && (used.get(stock.id)?.owned ?? 0) >= stock.ownedQuantity)) warnings.push({ code: 'missing-price', message: `${material.name} has sheet stock without a positive manual price or remaining owned quantity.` });
        warnings.push({ code: 'capacity', message: `Available owned and limited sheet quantities are insufficient for ${material.name}` }); break;
      }
      const u = used.get(selected.stock.id) ?? { owned: 0, bought: 0 }; const ownedUsed = u.owned < selected.stock.ownedQuantity ? 1 : 0; if (ownedUsed) u.owned++; else u.bought++; used.set(selected.stock.id, u);
      const placedIds = new Set(selected.packed.placements.map(p => p.partId));
      // Duplicate quantities are distinct pieces; placement counts preserve duplicates even though part IDs repeat.
      const placedCount = selected.packed.placements.length; let removed = 0;
      remaining = remaining.filter(i => { if (placedIds.has(i.part.id) && removed < placedCount) { removed++; return false; } return true; });
      const usedAreaUm2 = selected.packed.placements.reduce((sum, p) => sum + area(p.rect), 0); const stockArea = selected.stock.length.um * selected.stock.widthUm!;
      plans.push({ stockId: selected.stock.id, stockCount: 1, ownedUsed, costCents: (selected.price ?? 0) * (1 - ownedUsed), usedAreaUm2, wasteAreaUm2: stockArea - usedAreaUm2, layout: selected.layout, placements: selected.packed.placements, cutTree: selected.packed.tree, offcuts: selected.packed.offcuts });
    }
    for (const part of project.parts.filter(p => p.materialId === material.id && !(p.width?.um))) warnings.push({ code: 'missing-width', message: `${part.name} needs a width for sheet planning.`, partId: part.id });
  }
  const errors = materials.filter(m => m.type === 'sheet').flatMap(m => validateSheetPlan(project, m, plans.filter(p => m.stocks.some(s => s.id === p.stockId))));
  errors.forEach(message => warnings.push({ code: 'invalid-plan', message }));
  return { plans, warnings, totalCostCents: plans.reduce((sum, p) => sum + p.costCents, 0), valid: errors.length === 0 };
}
