import { describe, expect, it } from 'vitest';
import { canAnimateGeometry, classifyDiagramChange, getPlanPresenceDiff } from './cutPlanMotion';

const part = (partId: string, x: number, width = 10, orientation?: boolean) => ({ partId, x, y: 0, width, height: 10, orientation });
const diagram = (...parts: ReturnType<typeof part>[]) => ({ stockId: 'stock-a', stockLength: 100, parts });

describe('cut plan diagram motion classification', () => {
  it('matches repeated parts in order for size edits and rejects reordered or rotated layouts', () => {
    expect(canAnimateGeometry(diagram(part('a', 0), part('a', 10)), diagram(part('a', 0, 30), part('a', 30, 30)))).toBe(true);
    expect(canAnimateGeometry(diagram(part('a', 0), part('b', 10)), diagram(part('b', 0), part('a', 10)))).toBe(false);
    expect(canAnimateGeometry(diagram(part('a', 0, 10, false)), diagram(part('a', 0, 10, true)))).toBe(false);
  });
  it('skips animation for an initial plan', () => {
    expect(classifyDiagramChange(null, diagram(part('a', 0)))).toBe('initial');
  });

  it('allows additions and removals when surviving placement geometry is exact', () => {
    expect(classifyDiagramChange(diagram(part('a', 0)), diagram(part('a', 0), part('b', 20)))).toBe('grow-shrink');
    expect(classifyDiagramChange(diagram(part('a', 0), part('b', 20)), diagram(part('a', 0)))).toBe('grow-shrink');
    expect(classifyDiagramChange(diagram(part('a', 0)), diagram(part('a', 0), part('a', 20)))).toBe('grow-shrink');
    expect(classifyDiagramChange(diagram(part('a', 0), part('a', 20)), diagram(part('a', 0)))).toBe('grow-shrink');
  });

  it('crossfades when a surviving part moves or changes dimensions', () => {
    expect(classifyDiagramChange(diagram(part('a', 0)), diagram(part('a', 10)))).toBe('crossfade');
    expect(classifyDiagramChange(diagram(part('a', 0)), diagram(part('a', 0, 15)))).toBe('crossfade');
  });

  it('crossfades when part copies make identity ambiguous or stock changes', () => {
    expect(classifyDiagramChange(diagram(part('a', 0), part('a', 20)), diagram(part('a', 10), part('a', 20)))).toBe('crossfade');
    expect(classifyDiagramChange(diagram(part('a', 0)), { ...diagram(part('a', 0)), stockId: 'stock-b' })).toBe('crossfade');
  });

  it('uses rotation as part of exact sheet placement identity', () => {
    const before = diagram(part('a', 0, 10, false));
    const after = diagram(part('a', 0, 10, true));
    expect(classifyDiagramChange(before, after)).toBe('crossfade');
  });
});

describe('whole stock presence matching', () => {
  const record = (stockId: string, geometry: string) => ({ stockId, geometry });

  it('fades only the added or removed exact stock diagram', () => {
    expect(getPlanPresenceDiff([record('s', 'A')], [record('s', 'A'), record('s', 'B')])).toEqual({ entering: [1], exiting: [] });
    expect(getPlanPresenceDiff([record('s', 'A'), record('s', 'B')], [record('s', 'B')])).toEqual({ entering: [], exiting: [0] });
    expect(getPlanPresenceDiff([record('old', 'A')], [record('new', 'B')])).toEqual({ entering: [0], exiting: [0] });
  });

  it('does not infer stock entry or exit from a changed or reordered diagram', () => {
    expect(getPlanPresenceDiff([record('s', 'A')], [record('s', 'B')])).toEqual({ entering: [], exiting: [] });
    expect(getPlanPresenceDiff([record('s', 'A'), record('s', 'B')], [record('s', 'C'), record('s', 'B')])).toEqual({ entering: [], exiting: [] });
  });
});
