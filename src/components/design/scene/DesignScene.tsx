import { VertexDrawing } from './VertexDrawing';
import { useEffect, useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { DesignCanvas as Canvas } from './DesignCanvas';
import { Grid, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { DesignDocumentV1, Geometry } from '@/lib/planner/design/schema';
import type { UnitSystem } from '@/lib/planner/model';
import { umToMeters } from '@/lib/planner/design/geometry';
import type { DesignCommand } from '@/lib/planner/design/commands';
import { createHitCycle } from '../planar-gesture';
import { type AxisMode, type PivotMode, type RotationPivotMode } from '../transform-pivot';
import { type SubElement } from '../sub-selection';
import type { ToolMeasurementSession } from '../tool-measurements';
import { type MoveAxis } from '../move-gesture';
import { AnnotationLayer } from './AnnotationLayer';
import type { AnnotationSceneProps } from './AnnotationLayer';
import { InstanceMesh, TransformPreview } from './SceneObject';
import { useLineDrawing } from './useLineDrawing';
import { useTapeMeasure } from './useTapeMeasure';
import { useTransformInteractions } from './useTransformInteractions';
import { TransformGizmos } from './TransformGizmos';
export { TransformPreview } from './SceneObject';

export type Props = { design?: DesignDocumentV1; unitSystem: UnitSystem; selectedId?: string; selectedCount?:number; selectedElement?:{objectId:string}&SubElement; editingDefinitionId?: string; editingObjectId?: string; onSelect: (id?: string, additive?: boolean, subtractive?: boolean, shiftOnly?:boolean) => void; onSubSelect?: (objectId:string, element?:SubElement)=>void; onEnterDefinition:(id:string)=>void; rectangleAxis?: 'x'|'y'|'z'; rectangleDirection?: 'pointer'|'++'|'-+'|'+-'|'--'; activeTool: string; snap: boolean; exactUm?: number; pivotMode: PivotMode; rotationPivotMode: RotationPivotMode; axisMode: AxisMode; moveConstraint?: MoveAxis|null; moveShiftHeld?: boolean; onCommand: (command: DesignCommand) => void; onMeasure: (value?: number) => void; onToolError:(message:string)=>void; preset: 'iso'|'top'|'front'|'right'; projection: 'perspective'|'orthographic'; grid: boolean; axes: boolean; frameRequest: number; toolMeasurement?:ToolMeasurementSession; onToolMeasurementChange:(session?:ToolMeasurementSession)=>void; onRegisterMeasurementActions:(actions?:{commit:()=>void;cancel:()=>void})=>void; onContextLoss: () => void; onContextRestore: () => void; annotations?: AnnotationSceneProps };
function ContextLifecycle({ onContextLoss, onContextRestore }: Pick<Props, 'onContextLoss'|'onContextRestore'>) {
  const canvas = useThree(state => state.gl.domElement);
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onContextLoss(); };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', onContextRestore);
    return () => { canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', onContextRestore); };
  }, [canvas, onContextLoss, onContextRestore]);
  return null;
}

function configureGroundGridDepth(mesh:THREE.Mesh) {
  const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
  if(!material)return;
  const gridMaterial=material as THREE.ShaderMaterial;
  if(!gridMaterial.userData.filteredGroundGrid){
    const originalCompile=gridMaterial.onBeforeCompile;
    gridMaterial.onBeforeCompile=(shader,renderer)=>{
      originalCompile.call(gridMaterial,shader,renderer);
      const filteredGrid=`float getGrid(float size, float thickness) {
      vec2 coordinate = localPosition.xz / size;
      vec2 footprint = max(fwidth(coordinate), vec2(0.000001));
      vec2 distanceToLine = abs(fract(coordinate - 0.5) - 0.5);
      vec2 coverage = clamp(max(thickness, 0.0) - distanceToLine / footprint, 0.0, 1.0);
      // Fade unresolved cells before they collapse into a solid band at the horizon.
      vec2 dense = smoothstep(vec2(0.75), vec2(1.5), footprint);
      coverage = mix(coverage, vec2(0.0), dense);
      return 1.0 - (1.0 - coverage.x) * (1.0 - coverage.y);
      }`;
      const pattern=/float\s+getGrid\(float\s+size,\s*float\s+thickness\)\s*\{[\s\S]*?\n\s*\}/;
      if(!pattern.test(shader.fragmentShader))throw new Error('Unable to apply filtered ground-grid shader: Drei Grid source changed');
      shader.fragmentShader=shader.fragmentShader.replace(pattern,filteredGrid);
      const alphaPattern=/\(g1\s*\+\s*g2\)\s*\*\s*pow\(d,\s*fadeStrength\)/;
      if(!alphaPattern.test(shader.fragmentShader))throw new Error('Unable to combine ground-grid line coverage: Drei Grid source changed');
      shader.fragmentShader=shader.fragmentShader.replace(alphaPattern,'(1.0 - (1.0 - g1) * (1.0 - g2)) * pow(d, fadeStrength)');
    };
    const previousCacheKey=gridMaterial.customProgramCacheKey.bind(gridMaterial);
    gridMaterial.customProgramCacheKey=()=>`${previousCacheKey()}|filtered-ground-grid-v1`;
    gridMaterial.userData.filteredGroundGrid=true;
    gridMaterial.needsUpdate=true;
  }
  // Draw the blended grid before opaque geometry without writing depth: coplanar
  // faces then cover it regardless of depth-buffer interpolation differences.
  material.transparent=false;
  material.blending=THREE.CustomBlending;
  material.blendEquation=THREE.AddEquation;
  material.blendSrc=THREE.SrcAlphaFactor;
  material.blendDst=THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha=THREE.OneFactor;
  material.blendDstAlpha=THREE.OneMinusSrcAlphaFactor;
  material.depthWrite=false;
  material.needsUpdate=true;
}

function DrawingPlane({activeTool,snap,exactUm,unitSystem,pivotMode,rotationPivotMode,axisMode,moveConstraint,moveShiftHeld,onCommand,onMeasure,onSelect,onToolError,design,selectedId,selectedCount,selectedElement,editingDefinitionId,toolMeasurement,onToolMeasurementChange,onRegisterMeasurementActions}:Pick<Props,'activeTool'|'snap'|'exactUm'|'pivotMode'|'rotationPivotMode'|'axisMode'|'moveConstraint'|'moveShiftHeld'|'onCommand'|'onMeasure'|'onSelect'|'onToolError'|'design'|'selectedId'|'selectedCount'|'selectedElement'|'editingDefinitionId'|'toolMeasurement'|'onToolMeasurementChange'|'onRegisterMeasurementActions'|'unitSystem'>) {
  const completedSessions=useRef(new Set<string>());
  const lineDrawing=useLineDrawing({design,selectedId,selectedCount,editingDefinitionId,snap,exactUm,onCommand,onToolError});
  const {measureGesture,commitMeasure,cancelMeasure,placeMeasurePoint,updateMeasurePointer,measurePreview}=useTapeMeasure({activeTool,unitSystem,toolMeasurement,onToolMeasurementChange,onRegisterMeasurementActions,onMeasure,onToolError,completedSessions});
  const transform=useTransformInteractions({activeTool,snap,unitSystem,pivotMode,rotationPivotMode,axisMode,moveConstraint,moveShiftHeld,onCommand,onToolError,design,selectedId,selectedElement,editingDefinitionId,toolMeasurement,onToolMeasurementChange,onRegisterMeasurementActions,completedSessions});
  const {transformGesture,transformResult,commitTransform,cancelTransform,beginTransform,updateTransformPointer}=transform;
  useEffect(()=>{if(measureGesture){onRegisterMeasurementActions({commit:()=>commitMeasure(),cancel:cancelMeasure});}else if(transformGesture){onRegisterMeasurementActions({commit:()=>commitTransform(),cancel:cancelTransform});}});
  return <>
    <mesh key={activeTool} position={[0,0,-.002]} onPointerDown={event=>{if(event.button!==0)return;event.stopPropagation();if(activeTool==='measure'){placeMeasurePoint(event);return;}if(['move','rotate','scale'].includes(activeTool)){if(transformGesture){if(transformGesture.mode!=='move')commitTransform({...transformGesture,end:event.point.clone()},event.point.clone());}else beginTransform(event);return;}if(!['line'].includes(activeTool))return;lineDrawing.begin(event);}} onPointerMove={event=>{if(activeTool==='measure')updateMeasurePointer(event);if(['move','rotate','scale'].includes(activeTool))updateTransformPointer(event);}} onPointerUp={event=>{if(activeTool==='line')lineDrawing.finish(event);}} onLostPointerCapture={()=>{lineDrawing.cancel();}} onPointerCancel={()=>{lineDrawing.cancel();if(transformGesture?.mode==='move')cancelTransform();}} onClick={event=>{if(activeTool==='select')onSelect(undefined, event.shiftKey||event.ctrlKey, event.ctrlKey&&event.shiftKey,event.shiftKey&&!event.ctrlKey);}}>
      <planeGeometry args={[200,200]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
    {measurePreview&&<Line points={[measurePreview.start,measurePreview.end]} color="#d18a45" lineWidth={2} dashed dashSize={0.08} gapSize={0.04} raycast={()=>null} />}
    {transformGesture&&(()=>{const result=transformResult();return result?.valid?<TransformPreview design={design} {...result}/>:null;})()}
    <TransformGizmos {...transform} axisMode={axisMode} moveConstraint={moveConstraint} toolMeasurement={toolMeasurement} />

  </>;
}

export function CameraSetup({ preset, design, frameRequest }: Pick<Props, 'preset'|'design'|'frameRequest'>) {
  const camera = useThree(state => state.camera);
  const controls = useThree(state => state.controls) as { target?: THREE.Vector3; update?: () => void } | null;
  const initialized = useRef(false);
  const lastPreset = useRef(preset);
  const lastFrameRequest = useRef(frameRequest);
  useEffect(() => {
    // Design edits replace the document object, but should not move a camera the
    // user has already positioned. Only initial framing and explicit requests
    // (preset changes / Frame model) should run this setup.
    const needsInitialFrame = !initialized.current && !!controls;
    const needsRequestedFrame = initialized.current && (lastPreset.current !== preset || lastFrameRequest.current !== frameRequest);
    if (!needsInitialFrame && !needsRequestedFrame) return;
    if (!controls) return;

    const targets = { iso: [6, 5, 7], top: [0, 9, 0.001], front: [0, 0.001, 9], right: [9, 0.001, 0] } as const;
    const geometryRadius = (geometry: Geometry, scale: readonly number[] = [1_000_000, 1_000_000, 1_000_000]) => geometry.vertices.reduce((radius, vertex) => Math.max(radius, Math.hypot(...vertex.positionUm.map((n, i) => umToMeters(n * scale[i] / 1_000_000)))), 0);
    const records = [
      ...(design?.instances.map(item => {
        const def = design.definitions.find(candidate => candidate.id === item.definitionId);
        const [x, y, z] = item.pose.positionUm.map(umToMeters);
        const radius = def?.cutSpec ? Math.hypot(umToMeters(def.cutSpec.lengthUm * item.scalePpm[0] / 1_000_000), umToMeters(def.cutSpec.widthUm * item.scalePpm[1] / 1_000_000), umToMeters(def.cutSpec.thicknessUm * item.scalePpm[2] / 1_000_000)) / 2 : geometryRadius(def?.geometry ?? { vertices: [], edges: [], faces: [], extrusions: [] }, item.scalePpm);
        return { id: item.id, point: [x,y,z] as [number,number,number], radius };
      }) ?? []),
      ...(design?.looseObjects.map(item => ({ id: item.id, point: item.pose.positionUm.map(umToMeters) as [number,number,number], radius: geometryRadius(item.geometry, item.scalePpm) })) ?? []),
    ];
    const center = records.length ? records.reduce((sum, record) => sum.map((n, i) => n + record.point[i]) as [number,number,number], [0,0,0]).map(v => v / records.length) as [number,number,number] : [0,0,0];
    const maxOffset = records.reduce((max, record) => Math.max(max, Math.hypot(record.point[0]-center[0], record.point[1]-center[1], record.point[2]-center[2]) + record.radius), 0);
    const distance = Math.max(1.5, maxOffset * 2.5 + 0.8);
    const direction = targets[preset];
    const norm = Math.hypot(direction[0], direction[1], direction[2]);
    camera.position.set(center[0] + direction[0] / norm * distance, center[1] + direction[1] / norm * distance, center[2] + direction[2] / norm * distance); camera.up.set(0, 1, 0); camera.lookAt(center[0], center[1], center[2]);
    controls?.target?.set(center[0], center[1], center[2]); controls?.update?.();
    initialized.current = true;
    lastPreset.current = preset;
    lastFrameRequest.current = frameRequest;
  }, [camera, controls, design, frameRequest, preset]);
  return null;
}

export function DesignScene({ rectangleAxis = 'y', rectangleDirection = 'pointer', design, unitSystem, selectedId, selectedCount, selectedElement, editingDefinitionId, editingObjectId, onSelect, onSubSelect, onEnterDefinition, activeTool, snap, exactUm, pivotMode, rotationPivotMode, axisMode, moveConstraint, moveShiftHeld, onCommand, onMeasure, onToolError, preset, projection, grid, axes, frameRequest, toolMeasurement, onToolMeasurementChange, onRegisterMeasurementActions, onContextLoss, onContextRestore, annotations }: Props) {
  const definitionById = new Map(design?.definitions.map(d => [d.id, d]) ?? []);
  const hitCycle=useRef(createHitCycle());
  const pickHit=(event:ThreeEvent<MouseEvent>,fallbackId:string)=>{const ids=event.intersections.map(hit=>hit.object.userData.designTargetId).filter((id):id is string=>typeof id==='string');const candidateIds=ids.length?ids:[fallbackId];return hitCycle.current.pick(candidateIds,event.nativeEvent.clientX,event.nativeEvent.clientY)??fallbackId;};
  useEffect(()=>{hitCycle.current.reset();},[activeTool]);
  const selectHit=(event:ThreeEvent<MouseEvent>,targetId:string,subElement?:SubElement)=>{onSelect(targetId,event.shiftKey||event.ctrlKey,event.ctrlKey&&event.shiftKey,event.shiftKey&&!event.ctrlKey);if(subElement)onSubSelect?.(targetId,subElement);};
  return <Canvas key={projection} className="design-canvas" frameloop="demand" dpr={[1.5, 2]} orthographic={projection === 'orthographic'} shadows camera={{ position: [6, 5, 7], fov: 45, zoom: 1, near: 0.01, far: 200 }} gl={{ antialias: true, powerPreference: 'low-power' }} onPointerMissed={() => onSelect(undefined)}>
    <color attach="background" args={['#edf3f5']} />
    <ambientLight intensity={1.25} />
    {/* Offset shadow sampling away from each face to prevent self-shadow stripes. */}
    <directionalLight position={[4, 8, 5]} intensity={2.1} castShadow shadow-mapSize={[2048, 2048]} shadow-normalBias={0.02} shadow-bias={-0.0001} />
    <ContextLifecycle onContextLoss={onContextLoss} onContextRestore={onContextRestore} />
    <CameraSetup preset={preset} design={design} frameRequest={frameRequest} />
    <OrbitControls makeDefault enableDamping={false} minDistance={0.25} maxDistance={80} zoomToCursor mouseButtons={{LEFT:activeTool==='orbit'?THREE.MOUSE.ROTATE:activeTool==='pan'?THREE.MOUSE.PAN:undefined,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN}} />
    {activeTool!=='rectangle'&&<DrawingPlane key={activeTool} activeTool={activeTool} snap={snap} unitSystem={unitSystem} exactUm={exactUm} pivotMode={pivotMode} rotationPivotMode={rotationPivotMode} selectedElement={selectedElement} axisMode={axisMode} moveConstraint={moveConstraint} moveShiftHeld={moveShiftHeld} onCommand={onCommand} onMeasure={onMeasure} onSelect={onSelect} onToolError={onToolError} design={design} selectedId={selectedId} selectedCount={selectedCount} editingDefinitionId={editingDefinitionId} toolMeasurement={toolMeasurement} onToolMeasurementChange={onToolMeasurementChange} onRegisterMeasurementActions={onRegisterMeasurementActions} />}
    <VertexDrawing key={`vertices-${activeTool}`} design={design} editingDefinitionId={editingDefinitionId} selectedId={selectedId} activeTool={activeTool} axis={rectangleAxis} direction={rectangleDirection} snap={snap} unitSystem={unitSystem} selectedElement={selectedElement} onSelect={onSelect} onSubSelect={onSubSelect} onCommand={onCommand} onToolError={onToolError} toolMeasurement={toolMeasurement} onToolMeasurementChange={onToolMeasurementChange} onRegisterMeasurementActions={onRegisterMeasurementActions} />
    {grid && <Grid args={[30, 30]} cellSize={0.25} cellThickness={0.75} cellColor="#8297a1" sectionSize={1} sectionThickness={1.5} sectionColor="#476878" fadeDistance={30} infiniteGrid renderOrder={-1} onUpdate={configureGroundGridDepth} />}
    {axes && <axesHelper args={[1]} />}
    {design?.instances.filter(i => !i.hidden && (!editingDefinitionId||i.definitionId===editingDefinitionId)).map(instance => {
      const definition = definitionById.get(instance.definitionId); if (!definition) return null;
      return <InstanceMesh key={`${instance.id}-${activeTool}`} item={instance} geometry={definition.geometry} cutSpec={definition.cutSpec} componentEditMode={editingDefinitionId===instance.definitionId} selected={selectedId === instance.id} selectedElement={selectedElement?.objectId===instance.id?selectedElement:undefined} onSelect={(event,id,sub)=>selectHit(event,id??instance.id,sub)} pickHit={pickHit} onEnterDefinition={onEnterDefinition} tool={activeTool} snap={snap} onCommand={onCommand} exactUm={exactUm} onToolError={onToolError} toolMeasurement={toolMeasurement} onToolMeasurementChange={onToolMeasurementChange} onRegisterMeasurementActions={onRegisterMeasurementActions} unitSystem={unitSystem} />;
    })}
    {editingDefinitionId && !design?.instances.some(item=>item.definitionId===editingDefinitionId) && design?.definitions.find(item=>item.id===editingDefinitionId) && <InstanceMesh key={`editing-${editingDefinitionId}-${activeTool}`} item={{id:editingDefinitionId,definitionId:editingDefinitionId,pose:{positionUm:[0,0,0],rotation:[0,0,0,1]},scalePpm:[1_000_000,1_000_000,1_000_000],hidden:false,locked:false}} geometry={design.definitions.find(item=>item.id===editingDefinitionId)!.geometry} cutSpec={design.definitions.find(item=>item.id===editingDefinitionId)!.cutSpec} componentEditMode selected={selectedId===editingDefinitionId} onSelect={(event,id,sub)=>selectHit(event,id??editingDefinitionId,sub)} pickHit={pickHit} onEnterDefinition={onEnterDefinition} tool={activeTool} snap={snap} onCommand={onCommand} exactUm={exactUm} onToolError={onToolError} toolMeasurement={toolMeasurement} onToolMeasurementChange={onToolMeasurementChange} onRegisterMeasurementActions={onRegisterMeasurementActions} unitSystem={unitSystem} />}
    {!editingDefinitionId&&design?.looseObjects.filter(i => !i.hidden).map(item => <InstanceMesh key={`${item.id}-${activeTool}`} item={item} geometry={item.geometry} componentEditMode={editingObjectId===item.id} selected={selectedId === item.id} selectedElement={selectedElement?.objectId===item.id?selectedElement:undefined} onSelect={(event,id,sub)=>selectHit(event,id??item.id,sub)} pickHit={pickHit} onEnterDefinition={onEnterDefinition} tool={activeTool} snap={snap} onCommand={onCommand} exactUm={exactUm} onToolError={onToolError} toolMeasurement={toolMeasurement} onToolMeasurementChange={onToolMeasurementChange} onRegisterMeasurementActions={onRegisterMeasurementActions} unitSystem={unitSystem} />)}
    {annotations && <AnnotationLayer {...annotations} design={design} unitSystem={unitSystem} activeTool={activeTool} editingDefinitionId={editingDefinitionId} />}
  </Canvas>;
}
