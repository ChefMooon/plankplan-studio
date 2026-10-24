import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import type { ToolMeasurementSession } from '../tool-measurements';
import type { RectangleAxis } from '../rectangle-plane';
import { VertexDrawing } from './VertexDrawing';

const scene = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@react-three/fiber', () => ({ useThree: () => scene.state, useFrame: vi.fn() }));
vi.mock('@react-three/drei', () => ({ Line: () => null }));
afterEach(() => vi.restoreAllMocks());

describe('live rectangle direction', () => {
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
