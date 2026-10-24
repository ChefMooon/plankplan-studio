import { describe, expect, it } from 'vitest';
import { dropEditorItem, getEditorDropIntent } from './editor-order';

describe('editor drop zones', () => {
  it.each([[100, 'before'], [124, 'before'], [125, 'swap'], [174, 'swap'], [175, 'after'], [200, 'after']] as const)('resolves y=%s as %s', (y, intent) => {
    expect(getEditorDropIntent(y, 100, 100)).toBe(intent);
  });
  it.each([
    ['a', 'c', 'before', ['b', 'a', 'c', 'd']],
    ['a', 'c', 'after', ['b', 'c', 'a', 'd']],
    ['d', 'b', 'before', ['a', 'd', 'b', 'c']],
    ['d', 'b', 'after', ['a', 'b', 'd', 'c']],
    ['a', 'd', 'swap', ['d', 'b', 'c', 'a']],
  ] as const)('drops %s %s with %s', (source, target, intent, expected) => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(dropEditorItem(ids, source, target, intent)).toEqual(expected);
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });
  it('ignores self drops and missing IDs', () => {
    const ids = ['a', 'b'];
    expect(dropEditorItem(ids, 'a', 'a', 'swap')).toBe(ids);
    expect(dropEditorItem(ids, 'missing', 'b', 'after')).toBe(ids);
  });
});
