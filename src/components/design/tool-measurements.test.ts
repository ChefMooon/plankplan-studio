import { describe, expect, it } from 'vitest';
import { parseMeasurement, previewMove, previewRotate, previewScale, rotationAngleFromDrag, updateMeasurementField, type ToolMeasurementSession } from './tool-measurements';
import { rectangleGeometry } from '@/lib/planner/design/geometry';
import { geometryCenter } from './transform-pivot';

describe('reusable tool measurements', () => {
  it('parses finite values and enforces the descriptor minimum', () => {
    expect(parseMeasurement('12.5', 0.001)).toBe(12.5);
    expect(parseMeasurement('0', 0.001)).toBeUndefined();
    expect(parseMeasurement('Infinity')).toBeUndefined();
    expect(parseMeasurement('')).toBeUndefined();
  });

  it('rebases screen rotation drags from the displayed angle and preserves snapping', () => {
    expect(rotationAngleFromDrag(100, 100, 30, true)).toBe(30);
    expect(rotationAngleFromDrag(100, 112, 30, true)).toBe(45);
    expect(rotationAngleFromDrag(100, 110, -15, false)).toBe(-6);
  });

  it('updates one field without changing the session identity or sibling values', () => {
    const session: ToolMeasurementSession = { id: 's1', tool: 'Rectangle', canPlace: false, fields: [{ id: 'width', label: 'Width', value: '12', unit: 'mm' }, { id: 'depth', label: 'Depth', value: '8', unit: 'mm' }] };
    const changed = updateMeasurementField(session, 'width', '15');
    expect(changed.id).toBe('s1');
    expect(changed.fields.map(field => field.value)).toEqual(['15', '8']);
  });

  it('previews an exact Move distance along the cursor direction, with +X fallback', () => {
    const pose={positionUm:[10,20,30] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]};
    expect(previewMove(pose,[0,0,0],'world',false,25_000).pose.positionUm).toEqual([25_010,20,30]);
    expect(previewMove(pose,[3_000,4_000,0],'world',false,10_000).pose.positionUm).toEqual([6_010,8_020,30]);
  });

  it('previews signed rotation from the captured transform and honors the center pivot', () => {
    const pose={positionUm:[0,0,0] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]};
    const rotated=previewRotate(pose,[1_000_000,1_000_000,1_000_000],[10_000,0,0],-30,'z','center');
    expect(rotated.valid).toBe(true);
    expect(Math.abs(rotated.pose.rotation[2])).toBeGreaterThan(0);
    expect(rotated.pose.positionUm).not.toEqual(pose.positionUm);
  });

  it('previews a uniform relative scale while preserving proportions and rejects zero/out-of-range factors', () => {
    const geometry=rectangleGeometry(40_000,20_000,()=>`id-${Math.random()}`);
    const center=geometryCenter(geometry);const pose={positionUm:[0,0,0] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]};
    const scaled=previewScale(pose,[2_000_000,1_000_000,500_000],center,1.25,'center');
    expect(scaled.valid).toBe(true);expect(scaled.scalePpm).toEqual([2_500_000,1_250_000,625_000]);
    expect(previewScale(pose,[1_000_000,1_000_000,1_000_000],center,0,'origin').valid).toBe(false);
    expect(previewScale(pose,[1_000_000,1_000_000,1_000_000],center,2_000,'origin').valid).toBe(false);
  });
});
