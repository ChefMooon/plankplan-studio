import type { ReactNode } from 'react';
import * as THREE from 'three';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rectangleGeometry } from '@/lib/planner/design/geometry';
import { designCanvasThreeElements } from './design-canvas-elements';
import { DesignScene } from './DesignScene';

vi.mock('./DesignCanvas', async importOriginal => ({
  ...await importOriginal<typeof import('./DesignCanvas')>(),
  DesignCanvas: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@react-three/drei', () => ({
  Edges: () => null,
  Grid: () => null,
  Line: () => null,
  OrbitControls: () => null,
}));

const createDesign = () => ({
  schemaVersion: 1 as const,
  definitions: [{
    id: 'definition-1',
    name: 'Side panel',
    geometry: rectangleGeometry(400_000, 300_000, prefix => `${prefix}-${crypto.randomUUID()}`, 18_000),
    cutSpec: { kind: 'panel' as const, lengthUm: 400_000, widthUm: 300_000, thicknessUm: 18_000, grainAxis: 'length' as const, confirmation: 'confirmed' as const },
    appearance: { color: '#bd8a56' },
  }],
  instances: [{
    id: 'instance-1',
    definitionId: 'definition-1',
    name: 'Left side',
    pose: { positionUm: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] },
    scalePpm: [1_000_000, 1_000_000, 1_000_000] as [number, number, number],
    hidden: false,
    locked: false,
  }],
  looseObjects: [],
  partLinks: {},
});

const createProps = () => ({
  design: createDesign(),
  unitSystem: 'metric' as const,
  onSelect: vi.fn(),
  onSubSelect: vi.fn(),
  onEnterDefinition: vi.fn(),
  activeTool: 'select',
  snap: true,
  pivotMode: 'center' as const,
  rotationPivotMode: 'center' as const,
  axisMode: 'world' as const,
  onCommand: vi.fn(),
  onMeasure: vi.fn(),
  onToolError: vi.fn(),
  preset: 'iso' as const,
  projection: 'perspective' as const,
  grid: false,
  axes: false,
  frameRequest: 0,
  onToolMeasurementChange: vi.fn(),
  onRegisterMeasurementActions: vi.fn(),
  onContextLoss: vi.fn(),
  onContextRestore: vi.fn(),
});

describe('DesignScene rotation rendering', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it('renders the selected-object rotation gizmo without throwing and registers its sphere geometry', async () => {
    expect(designCanvasThreeElements.SphereGeometry).toBe(THREE.SphereGeometry);

    const props = createProps();
    const renderer = await ReactThreeTestRenderer.create(<DesignScene {...props} />);
    await renderer.update(<DesignScene {...props} selectedId="instance-1" activeTool="rotate" />);

    const gizmoSpheres = renderer.scene.findAll(node => node.instance instanceof THREE.Mesh && node.instance.geometry instanceof THREE.SphereGeometry);
    expect(gizmoSpheres).toHaveLength(1);

    await renderer.unmount();
  });
});
