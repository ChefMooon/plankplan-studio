export type MeasurementField = {
  id: string;
  label: string;
  value: string;
  unit: string;
  step?: string;
  min?: number;
  error?: string;
  exact?: boolean;
};

/** A renderer- and tool-agnostic set of editable values for one live gesture. */
export type ToolMeasurementSession = {
  id: string;
  tool: string;
  fields: MeasurementField[];
  canPlace: boolean;
  rotationAxis?: RotationAxis;
};

export function parseMeasurement(value: string, min = Number.NEGATIVE_INFINITY): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : undefined;
}

export function rotationAngleFromDrag(startClientX: number, clientX: number, baseDegrees: number, snap: boolean): number {
  const raw = baseDegrees + (clientX - startClientX) * 0.9;
  return snap ? Math.round(raw / 15) * 15 : raw;
}

export function updateMeasurementField(session: ToolMeasurementSession, id: string, value: string): ToolMeasurementSession {
  return { ...session, fields: session.fields.map(field => field.id === id ? { ...field, value, error: undefined } : field) };
}
import type { Pose, ScalePpm } from '@/lib/planner/design/schema';
import { keepGeometryCenter, localizeDelta, rotateAroundWorkspaceAxis, worldToLocalDelta, type AxisMode, type PivotMode, type RotationAxis } from './transform-pivot';

export function previewMove(pose: Pose, rawWorldDelta: readonly [number,number,number], axisMode: AxisMode, snap: boolean, exactDistanceUm?: number) {
  let delta = axisMode === 'local' ? worldToLocalDelta(rawWorldDelta, pose) : [...rawWorldDelta] as [number,number,number];
  if (exactDistanceUm !== undefined) {
    const length = Math.hypot(...delta);
    const direction = length > 0 ? delta.map(value => value / length) as [number,number,number] : [1,0,0] as [number,number,number];
    delta = direction.map(value => Math.round(value * exactDistanceUm)) as [number,number,number];
  } else if (snap) delta = delta.map(value => Math.round(value / 10_000) * 10_000) as [number,number,number];
  const worldDelta = axisMode === 'local' ? localizeDelta(delta, pose, 'local') : delta;
  return { pose: { ...pose, positionUm: pose.positionUm.map((value,index) => value + worldDelta[index]) as Pose['positionUm'] }, distanceUm: Math.hypot(...delta) };
}

export function previewRotate(pose: Pose, scalePpm: ScalePpm, centerLocal: readonly [number,number,number], degrees: number, axis: RotationAxis, pivotMode: PivotMode) {
  const rotation = rotateAroundWorkspaceAxis(pose.rotation, degrees * Math.PI / 180, axis);
  const nextPose = keepGeometryCenter(centerLocal, pose, scalePpm, { ...pose, rotation }, scalePpm, pivotMode);
  return { pose: nextPose, valid: Number.isFinite(degrees) && Math.abs(degrees) > 0 };
}

export function previewScale(pose: Pose, scalePpm: ScalePpm, centerLocal: readonly [number,number,number], factor: number, pivotMode: PivotMode) {
  const nextScale = scalePpm.map(value => Math.round(value * factor)) as ScalePpm;
  const valid = Number.isFinite(factor) && factor > 0 && nextScale.every(value => value >= 1 && value <= 1_000_000_000);
  return { pose: valid ? keepGeometryCenter(centerLocal, pose, scalePpm, pose, nextScale, pivotMode) : pose, scalePpm: nextScale, valid };
}
