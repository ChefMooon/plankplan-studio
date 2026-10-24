import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import type { ToolMeasurementSession } from '../tool-measurements';
import { fromPlane, type RectangleAxis } from '../rectangle-plane';
import { transformLocalPoint } from '@/lib/planner/design/geometry';
import { VertexDrawing } from './VertexDrawing';

const scene = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@react-three/fiber', () => ({ useThree: () => scene.state, useFrame: vi.fn() }));
vi.mock('@react-three/drei', () => ({ Line: () => null }));
afterEach(() => vi.restoreAllMocks());

describe('live rectangle direction', () => {
  for (const axis of ['x', 'y', 'z'] as RectangleAxis[]) {
    for (const mode of ['snap', 'alt', 'off-plane', 'disabled'] as const) {
    it(`${mode}: second corner on an elevated ${axis} plane`, () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
      const camera = new PerspectiveCamera(45, 800/600, 0.01, 200);
      camera.position.set(2,2,2); camera.lookAt(0,0,0); camera.updateMatrixWorld();
      scene.state = { camera, gl: { domElement: canvas }, size: { width: 800, height: 600 }, invalidate: vi.fn() };
      const start = fromPlane(123456, 234567, 345678, axis), end = fromPlane(456789, 678912, mode === 'off-plane' ? 445678 : 345678, axis);
      const onCommand = vi.fn();
      function Harness() {
        const [measurement, setMeasurement] = useState<ToolMeasurementSession>();
        return <VertexDrawing design={{ schemaVersion: 1, definitions: [], instances: [], partLinks: {}, looseObjects: [{ id: 'source', name: 'Source', geometry: { vertices: [{ id: 'a', positionUm: start }, { id: 'b', positionUm: end }], edges: [], faces: [], extrusions: [] }, pose: { positionUm: [0,0,0], rotation: [0,0,0,1] }, scalePpm: [1000000,1000000,1000000], appearance: { color: '#fff' }, hidden: false, locked: false }] }} activeTool="rectangle" axis={axis} direction="pointer" snap={mode !== 'disabled'} unitSystem="metric" onSelect={vi.fn()} onCommand={onCommand} onToolError={vi.fn()} toolMeasurement={measurement} onToolMeasurementChange={setMeasurement} onRegisterMeasurementActions={vi.fn()} />;
      }
      render(<Harness />);
      const pointer = (point: number[], type: string) => {
        const projected = new Vector3(...point.map(n => n / 1000000) as [number,number,number]).project(camera);
        act(() => { canvas.dispatchEvent(new MouseEvent(type, { button: 0, altKey: mode === 'alt' && point === end, clientX: (projected.x + 1) * 400 + 3, clientY: (1 - projected.y) * 300 + 3 })); });
      };
      pointer(start, 'pointerdown'); pointer(end, 'pointermove'); pointer(end, 'pointerdown');
      expect(onCommand).toHaveBeenCalledOnce();
      const object = onCommand.mock.calls[0][0].object;
      const vertices = object.geometry.vertices.map((vertex: { positionUm: [number,number,number] }) => transformLocalPoint(vertex.positionUm, object.pose, object.scalePpm));
      if (mode !== 'disabled') expect(vertices).toContainEqual(start);
      if (mode === 'snap') expect(vertices).toContainEqual(end);
      else expect(vertices).not.toContainEqual(end);
      canvas.remove();
    });
  }
  }
  it('preserves typed dimensions and the anchor when a plane changes before commit', () => {
    // DOM rendering deliberately replaces WebGL; only the gesture lifecycle is exercised here.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
    const camera = new PerspectiveCamera(45, 800/600, 0.01, 200);
    camera.position.set(6,5,7); camera.lookAt(0,0,0); camera.updateMatrixWorld();
    scene.state = { camera, gl: { domElement: canvas }, size: { width: 800, height: 600 }, invalidate: vi.fn() };
    const onCommand = vi.fn();
    let actions: { commit: () => void; cancel: () => void } | undefined;
    let session: ToolMeasurementSession | undefined;
    let update: (session: ToolMeasurementSession) => void;
    function Harness() {
      const [axis, setAxis] = useState<RectangleAxis>('y');
      const [measurement, setMeasurement] = useState<ToolMeasurementSession>();
      session = measurement; update = setMeasurement;
      return <><button onClick={() => setAxis('z')}>Switch plane</button><VertexDrawing activeTool="rectangle" axis={axis} direction="--" snap unitSystem="metric" onSelect={vi.fn()} onCommand={onCommand} onToolError={vi.fn()} toolMeasurement={measurement} onToolMeasurementChange={setMeasurement} onRegisterMeasurementActions={value => { actions = value; }} /></>;
    }
    render(<Harness />);
    act(() => { canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 400, clientY: 300 })); });
    expect(session).toBeDefined();
    const id = session!.id;
    act(() => update({ ...session!, fields: session!.fields.map((field, index) => ({ ...field, value: index === 0 ? '100' : '200', exact: true })) }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch plane' }));
    expect(session!.id).toBe(id);
    expect(session!.fields.every(field => field.exact)).toBe(true);
    expect(session!.fields.map(field => field.value)).toEqual(['100', '200']);
    act(() => actions!.commit());
    expect(onCommand).toHaveBeenCalledOnce();
    const object = onCommand.mock.calls[0][0].object;
    expect(object.pose.positionUm).toEqual([-100000, -200000, 0]);
    canvas.remove();
  });
});
