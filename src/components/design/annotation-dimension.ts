import { roundSignedUm } from '@/lib/planner/design/geometry';
import type { DimensionMeasure } from '@/lib/planner/design/annotations';
import type { Vec3Um } from '@/lib/planner/design/schema';

export const MIN_DRAG_UM = 1000;
export const PERPENDICULAR_COS = 0.34;
export const AXIS_COS = 0.9;

type Vec3 = readonly number[];
const subtract = (a: Vec3, b: Vec3) => a.map((value, index) => value - b[index]);
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const length = (value: Vec3) => Math.hypot(...value);
const axisIndex = (measure: Exclude<DimensionMeasure, 'direct'>) => ({ x: 0, y: 1, z: 2 })[measure];

export function dimensionValueUm(start: Vec3Um, end: Vec3Um, measure: DimensionMeasure): number {
  return measure === 'direct' ? Math.round(Math.hypot(...subtract(end, start))) : Math.abs(end[axisIndex(measure)] - start[axisIndex(measure)]);
}

export function chooseDimensionMeasure(start: Vec3Um, end: Vec3Um, drag: readonly number[]): DimensionMeasure {
  const d = subtract(end, start), dLength = length(d), gLength = length(drag);
  if (gLength < MIN_DRAG_UM || dLength < 1) return 'direct';
  if (Math.abs(dot(d, drag) / (dLength * gLength)) < PERPENDICULAR_COS) return 'direct';
  const ratios = drag.map(value => Math.abs(value) / gLength);
  const largest = ratios.indexOf(Math.max(...ratios));
  if (ratios[largest] >= AXIS_COS && Math.abs(d[largest]) >= 1) return (['x', 'y', 'z'] as const)[largest];
  return 'direct';
}

export function dimensionOffsetFromDrag(start: Vec3Um, end: Vec3Um, measure: DimensionMeasure, drag: readonly number[]): Vec3Um {
  if (length(drag) < MIN_DRAG_UM || length(subtract(end, start)) < 1) return [0, 0, 0];
  let component: number[];
  if (measure === 'direct') {
    const d = subtract(end, start), squaredLength = dot(d, d);
    const projection = squaredLength === 0 ? 0 : dot(drag, d) / squaredLength;
    component = drag.map((value, index) => value - projection * d[index]);
  } else {
    const index = axisIndex(measure);
    component = drag.map((value, current) => current === index ? 0 : value);
  }
  return component.map(value => {
    const rounded = roundSignedUm(value);
    return rounded === 0 ? 0 : rounded;
  }) as Vec3Um;
}

export function dimensionLayoutUm(start: Vec3Um, end: Vec3Um, measure: DimensionMeasure, offsetUm: Vec3Um): { lineStart: number[]; lineEnd: number[]; extensionA: [number[], number[]]; extensionB: [number[], number[]]; labelPoint: number[] } {
  const lineStart = start.map((value, index) => value + offsetUm[index]);
  let lineEnd: number[];
  if (measure === 'direct') lineEnd = end.map((value, index) => value + offsetUm[index]);
  else {
    lineEnd = [...lineStart];
    const axis = axisIndex(measure);
    lineEnd[axis] += end[axis] - start[axis];
  }
  return {
    lineStart,
    lineEnd,
    extensionA: [[...start], [...lineStart]],
    extensionB: [[...end], [...lineEnd]],
    labelPoint: lineStart.map((value, index) => (value + lineEnd[index]) / 2),
  };
}
