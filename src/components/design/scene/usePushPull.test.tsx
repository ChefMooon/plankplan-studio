import { useRef, useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { rectangleGeometry } from '@/lib/planner/design/geometry';
import type { Instance } from '@/lib/planner/design/schema';
import type { ToolMeasurementSession } from '../tool-measurements';
import { usePushPull } from './usePushPull';

vi.mock('@react-three/fiber', () => ({ useThree: () => scene }));

const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
camera.position.set(0, 0, 2);
camera.updateMatrixWorld();
const canvas = document.createElement('canvas');
const scene = { camera, size: { width: 1000, height: 1000 }, gl: { domElement: canvas } };
const item: Instance = { id: 'instance', definitionId: 'definition', pose: { positionUm: [0, 0, 0], rotation: [0, 0, 0, 1] }, scalePpm: [1_000_000, 1_000_000, 1_000_000], hidden: false, locked: false };
let id = 0;
const geometry = rectangleGeometry(100_000, 80_000, prefix => `${prefix}-${id++}`, 20_000);
const cutSpec = { kind: 'board', confirmation: 'confirmed', grainAxis: 'length', lengthUm: 100_000, widthUm: 80_000, thicknessUm: 20_000 } as const;

function hit(x = 0, y = 0): ThreeEvent<PointerEvent> {
  return { button: 0, nativeEvent: { clientX: x, clientY: y }, stopPropagation: vi.fn(), object: new THREE.Object3D(), point: new THREE.Vector3(0, 0, 0.01), face: { normal: new THREE.Vector3(0, 0, 1) }, ray: new THREE.Ray(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1)) } as unknown as ThreeEvent<PointerEvent>;
}

function setup() {
  const onCommand = vi.fn();
  const onToolError = vi.fn();
  const hook = renderHook(() => {
    const [measurement, setMeasurement] = useState<ToolMeasurementSession>();
    const actions = useRef<{ commit: () => void; cancel: () => void } | undefined>(undefined);
    const result = usePushPull({ item, geometry, cutSpec, tool: 'push-pull', snap: false, onCommand, onToolError, toolMeasurement: measurement, onToolMeasurementChange: setMeasurement, onRegisterMeasurementActions: value => { actions.current = value; }, unitSystem: 'metric', componentEditMode: false });
    return { ...result, measurement, setMeasurement, actions };
  });
  return { ...hook, onCommand, onToolError };
}

describe('usePushPull', () => {
  it('previews pointer movement and places the chosen primitive face', () => {
    const { result, onCommand } = setup();
    act(() => result.current.pushPullPointerDown(hit()));
    expect(result.current.pushPullActive).toBe(true);
    expect(result.current.measurement?.canPlace).toBe(false);
    act(() => result.current.pushPullPointerMove(hit(0, 10)));
    expect(result.current.primitiveDimensionPreview?.thicknessUm).toBe(30_000);
    expect(result.current.measurement?.fields[0].value).toBe('10.0');
    expect(result.current.measurement?.canPlace).toBe(true);
    act(() => result.current.pushPullPointerDown(hit(0, 10)));
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-primitive-dimensions', definitionId: 'definition', lengthUm: 100_000, widthUm: 80_000, thicknessUm: 30_000, anchor: { axis: 'z', side: 1 } });
    expect(result.current.pushPullActive).toBe(false);
    expect(result.current.primitiveDimensionPreview).toBeUndefined();
    expect(result.current.measurement).toBeUndefined();
    expect(result.current.actions.current).toBeUndefined();
  });

  it('tracks canvas pointer events and places the face on the next canvas click', () => {
    document.body.appendChild(canvas);
    const { result, onCommand } = setup();
    act(() => result.current.pushPullPointerDown(hit()));
    act(() => canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 10 })));
    expect(result.current.primitiveDimensionPreview?.thicknessUm).toBe(30_000);
    act(() => canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 10 })));
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ thicknessUm: 30_000 }));
    expect(result.current.pushPullActive).toBe(false);
    canvas.remove();
  });
  it('previews and commits exact measurement input through registered actions', () => {
    const { result, onCommand } = setup();
    act(() => result.current.pushPullPointerDown(hit()));
    act(() => result.current.setMeasurement(current => current && { ...current, fields: [{ ...current.fields[0], value: '12.5', exact: true }] }));
    expect(result.current.primitiveDimensionPreview?.thicknessUm).toBe(32_500);
    expect(result.current.measurement?.canPlace).toBe(true);
    act(() => result.current.actions.current?.commit());
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ thicknessUm: 32_500 }));
    expect(result.current.actions.current).toBeUndefined();
  });

  it('cancels a preview and removes window listeners when cancelled or unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { result, unmount, onCommand } = setup();
    act(() => result.current.pushPullPointerDown(hit()));
    act(() => result.current.pushPullPointerMove(hit(0, 10)));
    act(() => result.current.actions.current?.cancel());
    expect(result.current.pushPullActive).toBe(false);
    expect(result.current.primitiveDimensionPreview).toBeUndefined();
    expect(result.current.measurement).toBeUndefined();
    expect(result.current.actions.current).toBeUndefined();
    expect(onCommand).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    act(() => result.current.pushPullPointerDown(hit()));
    remove.mockClear();
    unmount();
    expect(remove).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    remove.mockRestore();
  });
});


