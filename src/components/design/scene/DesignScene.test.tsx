import type { ReactNode } from 'react';
import { act, useEffect, useState } from 'react';
import * as THREE from 'three';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rectangleGeometry } from '@/lib/planner/design/geometry';
import { designCanvasThreeElements } from './design-canvas-elements';
import { CameraSetup, DesignScene, TransformPreview } from './DesignScene';
import type { ToolMeasurementSession } from '../tool-measurements';
import { projectedMoveAxes, type MoveAxis } from '../move-gesture';
import { designVertices } from '../rectangle-plane';
import { snapshotObjects } from './model-snapshot';
import type { Project } from '@/lib/planner/model';

vi.mock('./DesignCanvas', async importOriginal => ({
  ...await importOriginal<typeof import('./DesignCanvas')>(),
  DesignCanvas: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@react-three/drei', async importOriginal => {
  const actual = await importOriginal<typeof import('@react-three/drei')>();
  return {
    ...actual,
    Edges: () => null,
    Grid: actual.Grid,
    Line: () => null,
    OrbitControls: () => null,
  };
});

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

function CameraHarness({ design, frameRequest = 0 }: { design?: ReturnType<typeof createDesign>; frameRequest?: number }) {
  const set = useThree(state => state.set);
  useEffect(() => {
    const controls = { target: new THREE.Vector3(), update: () => {} };
    set({ controls: controls as unknown as THREE.EventDispatcher });
    return () => set({ controls: null });
  }, [set]);
  return <CameraSetup preset="iso" design={design} frameRequest={frameRequest} />;
}

type MoveHarnessControls = {
  setConstraint: (axis: MoveAxis | null | undefined) => void;
  setShift: (held: boolean) => void;
  setMeasurement: (session: ToolMeasurementSession | undefined) => void;
  measurement?: ToolMeasurementSession;
};

function MoveSceneHarness({ props, onReady }: { props: ReturnType<typeof createProps>; onReady: (controls: MoveHarnessControls) => void }) {
  const [moveConstraint, setMoveConstraint] = useState<MoveAxis | null>();
  const [moveShiftHeld, setMoveShiftHeld] = useState(false);
  const [toolMeasurement, setToolMeasurement] = useState<ToolMeasurementSession>();
  onReady({setConstraint:setMoveConstraint,setShift:setMoveShiftHeld,setMeasurement:setToolMeasurement,measurement:toolMeasurement});
  return <DesignScene {...props} selectedId="instance-1" activeTool="move" moveConstraint={moveConstraint} moveShiftHeld={moveShiftHeld} toolMeasurement={toolMeasurement} onToolMeasurementChange={setToolMeasurement} />;
}

type SceneRenderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;
const moveHandle = (renderer: SceneRenderer, axis: MoveAxis) => renderer.scene.find(node => node.instance instanceof THREE.Mesh && node.instance.userData.moveAxis === axis);
let sceneCanvas: HTMLCanvasElement;
const fixedBounds = (canvas: HTMLCanvasElement) => { sceneCanvas = canvas; canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) }); };

const createGroundPlaneProps = () => {
  const props = createProps();
  return {
    ...props,
    design: {
      ...props.design,
      instances: [],
      looseObjects: [{
        id: 'ground-rectangle',
        name: 'Ground rectangle',
        geometry: rectangleGeometry(400_000, 300_000, prefix => `${prefix}-${crypto.randomUUID()}`),
        pose: { positionUm: [0, 0, 0] as [number, number, number], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as [number, number, number, number] },
        scalePpm: [1_000_000, 1_000_000, 1_000_000] as [number, number, number],
        appearance: { color: '#bd8a56' },
        hidden: false,
        locked: false,
      }],
    },
    grid: true,
  };
};

describe('camera framing', () => {
  it('keeps the view when the first design document is created and still honors explicit framing', async () => {
    const camera = new THREE.PerspectiveCamera(45, 4 / 3, .1, 100);
    const renderer = await ReactThreeTestRenderer.create(<CameraHarness />, { camera });
    camera.position.set(3, 4, 5);
    const positioned = camera.position.clone();

    const design = createDesign();
    await renderer.update(<CameraHarness design={design} />);
    expect(camera.position.toArray()).toEqual(positioned.toArray());

    await renderer.update(<CameraHarness design={design} frameRequest={1} />);
    expect(camera.position.toArray()).not.toEqual(positioned.toArray());
    await renderer.unmount();
  });
});

describe('DesignScene rotation rendering', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it('renders a confirmed primitive preview with the same centered bounds as its placed mesh', async () => {
    const design = createDesign();
    const target = design.instances[0];
    const pose = { positionUm: [200_000, 300_000, 400_000] as [number, number, number], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number] };
    const scalePpm: [number, number, number] = [2_000_000, 750_000, 1_250_000];
    const renderer = await ReactThreeTestRenderer.create(<TransformPreview design={design} target={target} geometry={design.definitions[0].geometry} pose={pose} scalePpm={scalePpm} />);
    const preview = renderer.scene.find(node => node.instance instanceof THREE.Mesh).instance as THREE.Mesh;
    preview.updateWorldMatrix(true, false);
    const bounds = new THREE.Box3().setFromObject(preview);
    const center = bounds.getCenter(new THREE.Vector3());
    expect(center.toArray()).toEqual(expect.arrayContaining([expect.closeTo(0.2), expect.closeTo(0.3), expect.closeTo(0.4)]));
    expect(bounds.getSize(new THREE.Vector3()).toArray()).toEqual([expect.closeTo(0.225), expect.closeTo(0.8), expect.closeTo(0.0225)]);
    await renderer.unmount();
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

  it('removes the board from the canvas when its last instance is deleted, while keeping its definition', async () => {
    const props = createProps();
    const renderer = await ReactThreeTestRenderer.create(<DesignScene {...props} />);
    const targets = () => renderer.scene.findAll(node => node.instance instanceof THREE.Mesh && node.instance.userData.designTargetId);
    expect(targets().some(node => node.instance.userData.designTargetId === 'instance-1')).toBe(true);
    const design = {...props.design, instances: []};
    await renderer.update(<DesignScene {...props} design={design} activeTool="erase" />);
    expect(targets()).toHaveLength(0);
    expect(designVertices(design)).toEqual([]);
    expect(snapshotObjects({design} as Project)).toEqual([]);
    await renderer.update(<DesignScene {...props} design={design} editingDefinitionId="definition-1" />);
    expect(targets().some(node => node.instance.userData.designTargetId === 'definition-1')).toBe(true);
    expect(designVertices(design, 'definition-1')).not.toHaveLength(0);
    await renderer.unmount();
  });

  it('registers every Three element the scene renders with the design canvas catalogue', async () => {
    const renderer=await ReactThreeTestRenderer.create(<DesignScene {...createProps()} selectedId="instance-1" activeTool="move"/>);
    const registered=new Set(Object.values(designCanvasThreeElements));
    const missing=new Set<string>();
    renderer.scene.instance.traverse(object=>{
      const owned=[object,...(object instanceof THREE.Mesh?[object.geometry,...[object.material].flat()]:[])];
      for(const item of owned)if(item&&!registered.has(item.constructor as never)&&item.constructor!==THREE.Scene&&item.constructor!==THREE.BufferGeometry)missing.add(item.constructor.name);
    });
    expect([...missing]).toEqual([]);
    await renderer.unmount();
  });

  it('renders the blended grid before a flat ground-plane rectangle without writing depth', async () => {
    const renderer = await ReactThreeTestRenderer.create(<DesignScene {...createGroundPlaneProps()} />);
    const grid = renderer.scene.find(node => node.instance instanceof THREE.Mesh && node.instance.material instanceof THREE.ShaderMaterial);
    const gridMesh = grid.instance as THREE.Mesh;
    const gridMaterial = gridMesh.material as THREE.ShaderMaterial;
    const rectangle = renderer.scene.find(node => node.instance instanceof THREE.Mesh && node.instance.userData.designTargetId === 'ground-rectangle').instance as THREE.Mesh;

    expect(gridMaterial.uniforms).toHaveProperty('cellSize');
    expect(gridMaterial.fragmentShader).toContain('getGrid(float size, float thickness)');
    const shader={uniforms:{},vertexShader:gridMaterial.vertexShader,fragmentShader:gridMaterial.fragmentShader};
    gridMaterial.onBeforeCompile(shader as Parameters<THREE.ShaderMaterial['onBeforeCompile']>[0],{} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('vec2 footprint = max(fwidth(coordinate), vec2(0.000001));');
    expect(shader.fragmentShader).toContain('coverage = mix(coverage, vec2(0.0), dense);');
    expect(shader.fragmentShader).toContain('vec2 coverage = clamp(max(thickness, 0.0) - distanceToLine / footprint, 0.0, 1.0);');
    expect(shader.fragmentShader).toContain('return 1.0 - (1.0 - coverage.x) * (1.0 - coverage.y);');
    expect(shader.fragmentShader).toContain('(1.0 - (1.0 - g1) * (1.0 - g2)) * pow(d, fadeStrength)');
    expect(gridMaterial.customProgramCacheKey()).toContain('filtered-ground-grid-v1');
    expect(gridMaterial.vertexShader).toContain('localPosition = position.xzy;');
    expect(gridMaterial.transparent).toBe(false);
    expect(gridMaterial.blending).toBe(THREE.CustomBlending);
    expect(gridMaterial.blendEquation).toBe(THREE.AddEquation);
    expect(gridMaterial.blendSrc).toBe(THREE.SrcAlphaFactor);
    expect(gridMaterial.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    expect(gridMaterial.blendSrcAlpha).toBe(THREE.OneFactor);
    expect(gridMaterial.blendDstAlpha).toBe(THREE.OneMinusSrcAlphaFactor);
    expect(gridMaterial.depthWrite).toBe(false);
    expect(gridMesh.renderOrder).toBe(-1);
    expect(rectangle.renderOrder).toBeGreaterThan(gridMesh.renderOrder);
    const rectangleMaterial = rectangle.material as THREE.MeshStandardMaterial;
    expect(rectangleMaterial.transparent).toBe(false);
    expect(rectangleMaterial.depthWrite).toBe(true);

    rectangle.updateWorldMatrix(true, false);
    const positions = rectangle.geometry.getAttribute('position');
    expect(positions.count).toBeGreaterThan(0);
    for (let index = 0; index < positions.count; index += 1) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(rectangle.matrixWorld);
      expect(point.y).toBeCloseTo(0, 6);
    }

    await renderer.unmount();
  });

  it('renders all three move handles and commits one axis drag on release', async () => {
    const onCommand=vi.fn();
    const camera=new THREE.PerspectiveCamera(45,4/3,.1,100);
    camera.position.set(6,5,7);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const renderer=await ReactThreeTestRenderer.create(<DesignScene {...createProps()} selectedId="instance-1" activeTool="move" onCommand={onCommand}/>,{
      width:800,height:600,camera,
      beforeReturn:fixedBounds,
    });
    const axes=renderer.scene.findAll(node=>node.instance instanceof THREE.Mesh&&node.instance.geometry instanceof THREE.CylinderGeometry&&(node.instance.geometry as THREE.CylinderGeometry).parameters.height===.54);
    expect(axes).toHaveLength(3);
    const xHandle=moveHandle(renderer,'x');
    camera.updateMatrixWorld();
    const pivot=new THREE.Vector3(.2,.15,0);
    const origin=pivot.clone().project(camera);
    const tip=pivot.clone().add(new THREE.Vector3(.4,0,0)).project(camera);
    const startX=(origin.x+1)*400,startY=(1-origin.y)*300;
    const endX=startX+(tip.x-origin.x)*400,endY=startY-(tip.y-origin.y)*300;
    const nativeEvent={clientX:startX,clientY:startY,button:0,pointerId:77,preventDefault:vi.fn()};
    await renderer.fireEvent(xHandle,'onPointerDown',{button:0,pointerId:77,nativeEvent});
    const moveEvent=Object.assign(new Event('pointermove'),{clientX:endX,clientY:endY,pointerId:77});
    await act(async()=>{window.dispatchEvent(moveEvent);});
    const upEvent=Object.assign(new Event('pointerup'),{clientX:endX,clientY:endY,pointerId:77});
    await act(async()=>{window.dispatchEvent(upEvent);});
    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand.mock.calls[0][0]).toMatchObject({type:'set-instance-transform',instanceId:'instance-1'});
    const committed=onCommand.mock.calls[0][0] as {pose:{positionUm:number[]}};
    expect(committed.pose.positionUm[0]).not.toBe(0);
    expect(committed.pose.positionUm.every(Number.isSafeInteger)).toBe(true);
    await renderer.unmount();
  });

  it('moves from a free click-move-click gesture on a constrained axis', async () => {
    const props = createProps();
    let controls!: MoveHarnessControls;
    const camera=new THREE.PerspectiveCamera(45,4/3,.1,100);
    camera.position.set(6,5,7);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const renderer=await ReactThreeTestRenderer.create(<MoveSceneHarness props={props} onReady={current=>{controls=current;}}/>,{
      width:800,height:600,camera,
      beforeReturn:fixedBounds,
    });
    const plane=renderer.scene.find(node=>node.instance instanceof THREE.Mesh&&node.instance.geometry instanceof THREE.PlaneGeometry&&(node.instance.geometry as THREE.PlaneGeometry).parameters.width===200);
    await renderer.fireEvent(plane,'onPointerDown',{button:0,pointerId:41,point:new THREE.Vector3(0,0,-.002),nativeEvent:{clientX:400,clientY:300,button:0,pointerId:41,preventDefault:vi.fn()}});
    await act(async()=>{controls.setConstraint('x');});
    const move=Object.assign(new Event('pointermove'),{clientX:650,clientY:300,pointerId:41});
    await act(async()=>{window.dispatchEvent(move);});
    expect(controls.measurement?.fields[0]?.label).toBe('Length (X)');
    expect(controls.measurement?.canPlace).toBe(true);
    expect(Number(controls.measurement?.fields[0]?.value)).toBeGreaterThan(0);

    const place=Object.assign(new Event('pointerdown'),{clientX:650,clientY:300,button:0,pointerId:41});
    await act(async()=>{sceneCanvas.dispatchEvent(place);});
    expect(props.onCommand).toHaveBeenCalledOnce();
    const command=props.onCommand.mock.calls[0][0] as {pose:{positionUm:number[]}};
    expect(command.pose.positionUm[0]).not.toBe(0);
    expect(command.pose.positionUm.slice(1)).toEqual([0,0]);
    await renderer.unmount();
  });

  it('selects the initial Shift axis, releases the lock, and applies exact distance on the chosen axis', async () => {
    const props=createProps();
    let controls!:MoveHarnessControls;
    const camera=new THREE.PerspectiveCamera(45,4/3,.1,100);
    camera.position.set(6,5,7);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const renderer=await ReactThreeTestRenderer.create(<MoveSceneHarness props={props} onReady={current=>{controls=current;}}/>,{
      width:800,height:600,camera,
      beforeReturn:fixedBounds,
    });
    const plane=renderer.scene.find(node=>node.instance instanceof THREE.Mesh&&node.instance.geometry instanceof THREE.PlaneGeometry&&(node.instance.geometry as THREE.PlaneGeometry).parameters.width===200);
    await renderer.fireEvent(plane,'onPointerDown',{button:0,pointerId:52,point:new THREE.Vector3(0,0,-.002),nativeEvent:{clientX:400,clientY:300,button:0,pointerId:52,preventDefault:vi.fn()}});
    const session=controls.measurement!;
    await act(async()=>{controls.setMeasurement({...session,fields:[{...session.fields[0],value:'25',exact:true}]});controls.setShift(true);});
    const xDirection=projectedMoveAxes(camera,new THREE.Vector3(.2,.15,0),800,600,props.design!.instances[0].pose,'world').get('x')!;
    const clientX=400+xDirection[0]*80,clientY=300+xDirection[1]*80;
    const move=Object.assign(new Event('pointermove'),{clientX,clientY,pointerId:52});
    await act(async()=>{window.dispatchEvent(move);});
    expect(controls.measurement?.fields[0]?.label).toBe('Length (X)');
    expect(controls.measurement?.fields[0]?.value).toBe('25');
    expect(controls.measurement?.canPlace).toBe(true);

    await act(async()=>{controls.setShift(false);});
    expect(controls.measurement?.fields[0]?.label).toBe('Length');
    await act(async()=>{controls.setShift(true);});
    const place=Object.assign(new Event('pointerdown'),{clientX,clientY,button:0,pointerId:52});
    await act(async()=>{sceneCanvas.dispatchEvent(place);});
    expect(props.onCommand).toHaveBeenCalledOnce();
    const command=props.onCommand.mock.calls[0][0] as {pose:{positionUm:number[]}};
    expect(command.pose.positionUm).toEqual([25_000,0,0]);
    await renderer.unmount();
  });

  it('rejects a negative exact distance during constrained movement', async () => {
    const props=createProps();
    let controls!:MoveHarnessControls;
    const camera=new THREE.PerspectiveCamera(45,4/3,.1,100);
    camera.position.set(6,5,7);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const renderer=await ReactThreeTestRenderer.create(<MoveSceneHarness props={props} onReady={current=>{controls=current;}}/>,{
      width:800,height:600,camera,
      beforeReturn:fixedBounds,
    });
    const plane=renderer.scene.find(node=>node.instance instanceof THREE.Mesh&&node.instance.geometry instanceof THREE.PlaneGeometry&&(node.instance.geometry as THREE.PlaneGeometry).parameters.width===200);
    await renderer.fireEvent(plane,'onPointerDown',{button:0,pointerId:63,point:new THREE.Vector3(0,0,-.002),nativeEvent:{clientX:400,clientY:300,button:0,pointerId:63,preventDefault:vi.fn()}});
    await act(async()=>{controls.setConstraint('x');});
    const move=Object.assign(new Event('pointermove'),{clientX:650,clientY:300,pointerId:63});
    await act(async()=>{window.dispatchEvent(move);});
    const session=controls.measurement!;
    await act(async()=>{controls.setMeasurement({...session,fields:[{...session.fields[0],value:'-25',exact:true}]});});
    expect(controls.measurement?.canPlace).toBe(false);
    expect(controls.measurement?.fields[0]?.error).toBe('Value is outside the supported range');
    expect(props.onCommand).not.toHaveBeenCalled();
    await renderer.unmount();
  });

  it('cancels a move handle gesture on pointer cancellation without committing', async () => {
    const props=createProps();
    const camera=new THREE.PerspectiveCamera(45,4/3,.1,100);
    camera.position.set(6,5,7);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const renderer=await ReactThreeTestRenderer.create(<DesignScene {...props} selectedId="instance-1" activeTool="move"/>,{
      camera,
      beforeReturn:fixedBounds,
    });
    const handle=moveHandle(renderer,'x');
    const nativeEvent={clientX:400,clientY:300,button:0,pointerId:19,preventDefault:vi.fn()};
    await renderer.fireEvent(handle,'onPointerDown',{button:0,pointerId:19,nativeEvent});
    const cancel=Object.assign(new Event('pointercancel'),{clientX:400,clientY:300,pointerId:19});
    await act(async()=>{window.dispatchEvent(cancel);});
    expect(props.onCommand).not.toHaveBeenCalled();
    expect(props.onToolMeasurementChange).toHaveBeenLastCalledWith(undefined);
    await renderer.unmount();
  });

  it('reprojects an active handle drag and updates its non-exact measurement when the axis changes', async () => {
    const props=createProps();
    const camera=new THREE.PerspectiveCamera(45,4/3,.1,100);
    camera.position.set(6,5,7);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const renderer=await ReactThreeTestRenderer.create(<DesignScene {...props} selectedId="instance-1" activeTool="move"/>,{
      width:800,height:600,camera,
      beforeReturn:fixedBounds,
    });
    const xHandle=moveHandle(renderer,'x');
    const nativeEvent={clientX:400,clientY:300,button:0,pointerId:88,preventDefault:vi.fn()};
    await renderer.fireEvent(xHandle,'onPointerDown',{button:0,pointerId:88,nativeEvent});
    const initialMeasurement=props.onToolMeasurementChange.mock.calls.at(-1)?.[0] as ToolMeasurementSession;
    const move=Object.assign(new Event('pointermove'),{clientX:520,clientY:260,pointerId:88});
    await act(async()=>{window.dispatchEvent(move);});

    await renderer.update(<DesignScene {...props} selectedId="instance-1" activeTool="move" moveConstraint="y" toolMeasurement={initialMeasurement}/>);
    const synchronized=props.onToolMeasurementChange.mock.calls.at(-1)?.[0] as ToolMeasurementSession;
    expect(synchronized.fields[0]?.label).toBe('Length (Y)');
    expect(synchronized.canPlace).toBe(true);
    expect(Number(synchronized.fields[0]?.value)).toBeGreaterThan(0);
    await renderer.unmount();
  });
  it('ignores clicks on overlaid workspace UI while a free move is active', async () => {
    const props=createProps();
    let controls!:MoveHarnessControls;
    const camera=new THREE.PerspectiveCamera(45,4/3,.1,100);
    camera.position.set(6,5,7);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const renderer=await ReactThreeTestRenderer.create(<MoveSceneHarness props={props} onReady={current=>{controls=current;}}/>,{width:800,height:600,camera,beforeReturn:fixedBounds});
    const plane=renderer.scene.find(node=>node.instance instanceof THREE.Mesh&&node.instance.geometry instanceof THREE.PlaneGeometry&&(node.instance.geometry as THREE.PlaneGeometry).parameters.width===200);
    await renderer.fireEvent(plane,'onPointerDown',{button:0,pointerId:44,point:new THREE.Vector3(0,0,-.002),nativeEvent:{clientX:400,clientY:300,button:0,pointerId:44,preventDefault:vi.fn()}});
    await act(async()=>{controls.setConstraint('x');});
    await act(async()=>{window.dispatchEvent(Object.assign(new Event('pointermove'),{clientX:650,clientY:300,pointerId:44}));});
    const toolButton=document.createElement('button');document.body.append(toolButton);
    await act(async()=>{toolButton.dispatchEvent(Object.assign(new Event('pointerdown',{bubbles:true}),{clientX:30,clientY:30,button:0,pointerId:44}));});
    expect(props.onCommand).not.toHaveBeenCalled();
    expect(controls.measurement).toBeDefined();
    toolButton.remove();
    await renderer.unmount();
  });

  it('cancels a move handle session that is clicked without dragging', async () => {
    const props=createProps();
    const camera=new THREE.PerspectiveCamera(45,4/3,.1,100);
    camera.position.set(6,5,7);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const renderer=await ReactThreeTestRenderer.create(<DesignScene {...props} selectedId="instance-1" activeTool="move"/>,{width:800,height:600,camera,beforeReturn:fixedBounds});
    await renderer.fireEvent(moveHandle(renderer,'x'),'onPointerDown',{button:0,pointerId:23,nativeEvent:{clientX:400,clientY:300,button:0,pointerId:23,preventDefault:vi.fn()}});
    await act(async()=>{window.dispatchEvent(Object.assign(new Event('pointerup'),{clientX:400,clientY:300,pointerId:23}));});
    expect(props.onToolMeasurementChange).toHaveBeenLastCalledWith(undefined);
    props.onToolMeasurementChange.mockClear();
    await act(async()=>{window.dispatchEvent(Object.assign(new Event('pointermove'),{clientX:600,clientY:280,pointerId:23}));});
    expect(props.onToolMeasurementChange).not.toHaveBeenCalled();
    expect(props.onCommand).not.toHaveBeenCalled();
    await renderer.unmount();
  });

  it('clears the selection when empty ground is clicked with the Select tool', async () => {
    const props=createProps();
    const renderer=await ReactThreeTestRenderer.create(<DesignScene {...props} selectedId="instance-1"/>);
    const plane=renderer.scene.find(node=>node.instance instanceof THREE.Mesh&&node.instance.geometry instanceof THREE.PlaneGeometry&&(node.instance.geometry as THREE.PlaneGeometry).parameters.width===200);
    await renderer.fireEvent(plane,'onClick',{shiftKey:false,ctrlKey:false});
    expect(props.onSelect).toHaveBeenCalledWith(undefined,false,false,false);
    await renderer.unmount();
  });
});
