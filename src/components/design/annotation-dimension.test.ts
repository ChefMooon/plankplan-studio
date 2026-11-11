import { describe, expect, it } from 'vitest';
import { chooseDimensionMeasure, dimensionLayoutUm, dimensionOffsetFromDrag, dimensionValueUm } from './annotation-dimension';
import type { Vec3Um } from '@/lib/planner/design/schema';

describe('annotation dimension geometry', () => {
  it('computes direct and axis values', () => {
    expect(dimensionValueUm([0, 0, 0], [3_000, 4_000, 0], 'direct')).toBe(5_000);
    expect(dimensionValueUm([0, 0, 0], [3_000, 4_000, 0], 'x')).toBe(3_000);
  });

  it('chooses a measure from drag direction and thresholds', () => {
    expect(chooseDimensionMeasure([0, 0, 0], [5_000, 0, 0], [0, 2_000, 0])).toBe('direct');
    expect(chooseDimensionMeasure([0, 0, 0], [5_000, 3_000, 5_000], [2_000, 0, 0])).toBe('x');
    expect(chooseDimensionMeasure([0, 0, 0], [5_000, 0, 5_000], [1_000, 0, 1_000])).toBe('direct');
    expect(chooseDimensionMeasure([0, 0, 0], [5_000, 0, 0], [999, 0, 0])).toBe('direct');
    expect(chooseDimensionMeasure([0, 0, 0], [0, 0, 0], [2_000, 0, 0])).toBe('direct');
    expect(chooseDimensionMeasure([0, 0, 0], [0, 5_000, 0], [2_000, 0, 0])).toBe('direct');
  });

  it('removes the along-measure component and rounds offsets', () => {
    expect(dimensionOffsetFromDrag([0, 0, 0], [3_000, 4_000, 0], 'direct', [3_001, 4_000, 800])).toEqual([1, 0, 800]);
    expect(dimensionOffsetFromDrag([0, 0, 0], [3_000, 4_000, 0], 'x', [2_001, 7_000, -4])).toEqual([0, 7_000, -4]);
    expect(dimensionOffsetFromDrag([0, 0, 0], [3_000, 4_000, 0], 'direct', [999, 0, 0])).toEqual([0, 0, 0]);
    expect(dimensionOffsetFromDrag([0, 0, 0], [0, 0, 0], 'direct', [2_000, 3_000, 4_000])).toEqual([0, 0, 0]);
  });

  it('lays out axis dimensions and extension lines', () => {
    const start: Vec3Um = [100, 200, 300], end: Vec3Um = [1_100, 2_200, 3_300], offset: Vec3Um = [5, 6, 7];
    const layout = dimensionLayoutUm(start, end, 'y', offset);
    expect(layout.lineStart).toEqual([105, 206, 307]);
    expect(layout.lineEnd).toEqual([105, 2_206, 307]);
    expect(layout.lineEnd.map((value, index) => value - layout.lineStart[index])).toEqual([0, 2_000, 0]);
    expect(layout.extensionA).toEqual([start, layout.lineStart]);
    expect(layout.extensionB).toEqual([end, layout.lineEnd]);
    expect(layout.labelPoint).toEqual([105, 1_206, 307]);
  });
});
