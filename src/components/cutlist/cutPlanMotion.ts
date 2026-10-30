export type DiagramGeometry = {
  stockId: string;
  stockLength: number;
  stockWidth?: number;
  parts: { partId: string; x: number; y: number; width: number; height: number; orientation?: boolean }[];
};

export type DiagramMotion = 'initial' | 'grow-shrink' | 'crossfade';
export type PlanPresenceRecord = { stockId: string; geometry: string };

/** Match complete stock diagrams by exact geometry; never guess across a rearrangement. */
export function getPlanPresenceDiff(previous: PlanPresenceRecord[], next: PlanPresenceRecord[]) {
  const entering: number[] = [];
  const exiting: number[] = [];
  const stockIds = new Set([...previous.map((item) => item.stockId), ...next.map((item) => item.stockId)]);
  for (const stockId of stockIds) {
    const oldItems = previous.map((item, index) => ({ ...item, index })).filter((item) => item.stockId === stockId);
    const newItems = next.map((item, index) => ({ ...item, index })).filter((item) => item.stockId === stockId);
    if (oldItems.length === newItems.length) continue;
    const hasRepeatedGeometry = (items: typeof oldItems) => items.some((item, _, all) => all.filter((candidate) => candidate.geometry === item.geometry).length > 1);
    if (hasRepeatedGeometry(oldItems) || hasRepeatedGeometry(newItems)) continue;
    const newGeometry = new Set(newItems.map((item) => item.geometry));
    const oldGeometry = new Set(oldItems.map((item) => item.geometry));
    const unmatchedOld = oldItems.filter((item) => !newGeometry.has(item.geometry));
    const unmatchedNew = newItems.filter((item) => !oldGeometry.has(item.geometry));
    if (unmatchedOld.length && unmatchedNew.length) continue;
    exiting.push(...unmatchedOld.map((item) => item.index));
    entering.push(...unmatchedNew.map((item) => item.index));
  }
  return { entering, exiting };
}

/**
 * Permit per-part motion only where every surviving part has one exact,
 * unambiguous placement in both plans. Part IDs identify definitions, not
 * copies, so duplicate placements are deliberately treated as ambiguous.
 */
export function classifyDiagramChange(previous: DiagramGeometry | null, next: DiagramGeometry): DiagramMotion {
  if (!previous) return 'initial';
  if (
    previous.stockId !== next.stockId ||
    previous.stockLength !== next.stockLength ||
    previous.stockWidth !== next.stockWidth
  ) return 'crossfade';

  const key = (part: DiagramGeometry['parts'][number]) => `${part.partId}:${part.x}:${part.y}:${part.width}:${part.height}:${part.orientation ?? ''}`;
  const oldCounts = countKeys(previous.parts.map(key));
  const newCounts = countKeys(next.parts.map(key));
  // Exact placements identify surviving copies despite the model having no copy IDs.
  // If unmatched copies exist on both sides for one part definition, movement and
  // add/remove cannot be distinguished safely, so use a whole-diagram crossfade.
  const unmatchedOld = new Map<string, number>();
  const unmatchedNew = new Map<string, number>();
  for (const [geometry, count] of oldCounts) {
    if (count > 1) return 'crossfade';
    const partId = geometry.slice(0, geometry.indexOf(':'));
    const matched = Math.min(count, newCounts.get(geometry) ?? 0);
    if (count > matched) unmatchedOld.set(partId, (unmatchedOld.get(partId) ?? 0) + count - matched);
  }
  for (const [geometry, count] of newCounts) {
    if (count > 1) return 'crossfade';
    const partId = geometry.slice(0, geometry.indexOf(':'));
    const matched = Math.min(count, oldCounts.get(geometry) ?? 0);
    if (count > matched) unmatchedNew.set(partId, (unmatchedNew.get(partId) ?? 0) + count - matched);
  }
  for (const [partId, count] of unmatchedOld) {
    if (count > 0 && (unmatchedNew.get(partId) ?? 0) > 0) return 'crossfade';
  }
  return 'grow-shrink';
}

function countKeys(keys: string[]) {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

/** Match unchanged ordering and orientation, including repeated copies, for geometry edits. */
export function canAnimateGeometry(previous: DiagramGeometry, next: DiagramGeometry): boolean {
  return previous.stockId === next.stockId && previous.stockLength === next.stockLength &&
    previous.stockWidth === next.stockWidth && previous.parts.length === next.parts.length &&
    previous.parts.length > 0 && previous.parts.every((part, index) =>
      part.partId === next.parts[index].partId && part.orientation === next.parts[index].orientation &&
      part.width > 0 && part.height > 0 && next.parts[index].width > 0 && next.parts[index].height > 0);
}

export function animateGeometry(svg: SVGSVGElement | null, previous: DiagramGeometry['parts'], next: DiagramGeometry['parts'], scale = 1): Animation[] {
  if (!svg) return [];
  return Array.from(svg.querySelectorAll<SVGGElement>('[data-cut-plan-piece]')).flatMap((element, index) => {
    const old = previous[index]; const current = next[index];
    if (!old || !current || typeof element.animate !== 'function') return [];
    const dx = (old.x - current.x) * scale; const dy = (old.y - current.y) * scale;
    const sx = old.width / current.width; const sy = old.height / current.height;
    if (dx === 0 && dy === 0 && sx === 1 && sy === 1) return [];
    return [element.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transform: 'translate(0px, 0px) scale(1, 1)' },
    ], { duration: 220, easing: 'cubic-bezier(.2, 0, 0, 1)' })];
  });
}
