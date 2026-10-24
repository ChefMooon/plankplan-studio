import type { EditorOrder } from './model';

/** Resolve a saved display order without changing the canonical data order. */
export function resolveEditorOrder<T extends { id: string }>(items: T[], saved?: string[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]));
  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const id of saved ?? []) {
    const item = byId.get(id);
    if (item && !seen.has(id)) { ordered.push(item); seen.add(id); }
  }
  for (const item of items) if (!seen.has(item.id)) ordered.push(item);
  return ordered;
}

export function moveEditorItem(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return ids;
  const result = [...ids];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}

export function insertEditorCopy(ids: string[], sourceId: string, copyId: string): string[] {
  const index = ids.indexOf(sourceId);
  const result = [...ids];
  result.splice(index < 0 ? result.length : index + 1, 0, copyId);
  return result;
}

export function removeEditorId(ids: string[], id: string): string[] {
  return ids.filter(itemId => itemId !== id);
}

export function withEditorOrder(order: EditorOrder | undefined, updates: Partial<EditorOrder>): EditorOrder {
  return { ...order, ...updates };
}

export type EditorDropIntent = 'before' | 'swap' | 'after';

export function getEditorDropIntent(clientY: number, top: number, height: number): EditorDropIntent {
  const ratio = height > 0 ? (clientY - top) / height : 0.5;
  return ratio < 0.25 ? 'before' : ratio >= 0.75 ? 'after' : 'swap';
}

/** Apply a drop to display order only, preserving relative order for insertions. */
export function dropEditorItem(ids: string[], sourceId: string, targetId: string, intent: EditorDropIntent): string[] {
  const from = ids.indexOf(sourceId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return ids;
  const result = [...ids];
  if (intent === 'swap') [result[from], result[to]] = [result[to], result[from]];
  else {
    result.splice(from, 1);
    result.splice(result.indexOf(targetId) + (intent === 'after' ? 1 : 0), 0, sourceId);
  }
  return result;
}
