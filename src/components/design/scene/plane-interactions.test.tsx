import { useRef, useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import type { ThreeEvent } from '@react-three/fiber';
import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ToolMeasurementSession } from '../tool-measurements';
import { useLineDrawing } from './useLineDrawing';
import { useTapeMeasure } from './useTapeMeasure';

function hit(x: number) {
  return { point: new Vector3(x, 0, 0), pointerId: 1, target: { setPointerCapture: vi.fn() }, stopPropagation: vi.fn(), nativeEvent: { altKey: false } } as unknown as ThreeEvent<PointerEvent>;
}

describe('plane drawing interactions', () => {
  it('captures a line pointer and discards a cancelled session', () => {
    const onCommand = vi.fn();
    const { result } = renderHook(() => useLineDrawing({ snap: false, onCommand, onToolError: vi.fn() }));
    const start = hit(0);
    act(() => result.current.begin(start));
    expect((start.target as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture).toHaveBeenCalledWith(1);
    act(() => result.current.cancel());
    act(() => result.current.finish(hit(1)));
    expect(onCommand).not.toHaveBeenCalled();
    act(() => result.current.begin(start));
    act(() => result.current.finish(hit(1)));
    expect(onCommand).toHaveBeenCalledOnce();
  });

  it('uses an exact measurement and clears the interaction on commit', () => {
    const onMeasure = vi.fn();
    const register = vi.fn();
    const { result } = renderHook(() => {
      const [measurement, setMeasurement] = useState<ToolMeasurementSession>();
      const completedSessions = useRef(new Set<string>());
      const interaction = useTapeMeasure({ activeTool: 'measure', unitSystem: 'metric', toolMeasurement: measurement, onToolMeasurementChange: setMeasurement, onRegisterMeasurementActions: register, onMeasure, onToolError: vi.fn(), completedSessions });
      return { ...interaction, measurement, setMeasurement };
    });
    act(() => result.current.placeMeasurePoint(hit(0)));
    act(() => result.current.updateMeasurePointer(hit(1)));
    expect(result.current.measurement?.fields[0].value).toBe('1000.0');
    act(() => result.current.setMeasurement(current => current && { ...current, fields: [{ ...current.fields[0], value: '25', exact: true }] }));
    expect(result.current.measurePreview?.end[0]).toBeCloseTo(0.025);
    act(() => result.current.commitMeasure());
    expect(onMeasure).toHaveBeenCalledWith(25_000);
    expect(result.current.measureGesture).toBeUndefined();
    expect(result.current.measurement).toBeUndefined();
    expect(register).toHaveBeenLastCalledWith(undefined);
  });
});
