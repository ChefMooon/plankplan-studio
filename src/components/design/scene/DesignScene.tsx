import { VertexDrawing } from './VertexDrawing';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { DesignCanvas as Canvas } from './DesignCanvas';
import { Edges, Grid, Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { DesignDocumentV1, Geometry, Instance, LooseObject } from '@/lib/planner/design/schema';
import type { UnitSystem } from '@/lib/planner/model';
import { getRectangularProfile, umToMeters, metersToUm, rectangularProfileSide, resizeRectangularProfile, setExtrusionDistance, transformLocalPoint } from '@/lib/planner/design/geometry';
import type { DesignCommand } from '@/lib/planner/design/commands';
import { buildPlanarGesture, createCapturedPlanarSession, createHitCycle } from '../planar-gesture';
import { designVertices } from '../rectangle-plane';
import { geometryCenter, keepGeometryCenter, localizeDelta, resolveRotationPivotLocal, rotationGizmoRadiusPixels, worldToLocalDelta, type AxisMode, type PivotMode, type RotationAxis, type RotationPivotMode } from '../transform-pivot';
import { resolveSubElement, type SubElement } from '../sub-selection';
import { buildModelGeometry } from './mesh-geometry';
import { isPushPullEndFace, rectangularPushPullFace, shouldShowPushPullFaceIndicator } from '../push-pull';
import type { ToolMeasurementSession } from '../tool-measurements';
import { parseMeasurement, previewMove, previewRotate, previewScale } from '../tool-measurements';
import { moveAxisDirection, pickProjectedMoveAxis, previewMoveOnAxis, projectedMoveAxes, rayAtClientPoint, rayAxisCoordinate, resolveMoveConstraint, type MoveAxis } from '../move-gesture';

type Props = { design?: DesignDocumentV1; unitSystem: UnitSystem; selectedId?: string; selectedCount?:number; selectedElement?:{objectId:string}&SubElement; editingDefinitionId?: string; editingObjectId?: string; onSelect: (id?: string, additive?: boolean, subtractive?: boolean, shiftOnly?:boolean) => void; onSubSelect?: (objectId:string, element?:SubElement)=>void; onEnterDefinition:(id:string)=>void; rectangleAxis?: 'x'|'y'|'z'; rectangleDirection?: 'pointer'|'++'|'-+'|'+-'|'--'; activeTool: string; snap: boolean; exactUm?: number; pivotMode: PivotMode; rotationPivotMode: RotationPivotMode; axisMode: AxisMode; moveConstraint?: MoveAxis|null; moveShiftHeld?: boolean; onCommand: (command: DesignCommand) => void; onMeasure: (value?: number) => void; onToolError:(message:string)=>void; preset: 'iso'|'top'|'front'|'right'; projection: 'perspective'|'orthographic'; grid: boolean; axes: boolean; frameRequest: number; toolMeasurement?:ToolMeasurementSession; onToolMeasurementChange:(session?:ToolMeasurementSession)=>void; onRegisterMeasurementActions:(actions?:{commit:()=>void;cancel:()=>void})=>void; onContextLoss: () => void; onContextRestore: () => void };
const colors = { board: '#bd8a56', selected: '#e6a94e', locked: '#747f86', hover: '#d4a979' };
function createDotTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=16;
  const context=canvas.getContext('2d');if(context){context.fillStyle='#000';context.beginPath();context.arc(8,8,3,0,Math.PI*2);context.fill();}
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function dotSpacingWorld(camera:THREE.Camera,point:THREE.Vector3,height:number) {
  if(camera instanceof THREE.PerspectiveCamera)return Math.max(0.01,2*camera.position.distanceTo(point)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/(camera.zoom*height)*12);
  if(camera instanceof THREE.OrthographicCamera)return Math.max(0.01,(camera.top-camera.bottom)/(camera.zoom*height)*12);
  return 0.01;
}
function worldPerPixel(camera:THREE.Camera,point:THREE.Vector3,height:number) {
  const value=camera instanceof THREE.PerspectiveCamera?2*camera.position.distanceTo(point)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/(camera.zoom*height):camera instanceof THREE.OrthographicCamera?(camera.top-camera.bottom)/(camera.zoom*height):0.01;
  return Number.isFinite(value)&&value>0?value:0.01;
}
function hitFaceNormalLocal(event:ThreeEvent<PointerEvent>):[number,number,number] {
  const normal=event.face?.normal.clone()??new THREE.Vector3(0,0,1);
  const origin=event.object.worldToLocal(event.ray.origin.clone());
  const rayEnd=event.object.worldToLocal(event.ray.origin.clone().add(event.ray.direction));
  if(rayEnd.sub(origin).dot(normal)>0)normal.negate();
  return normal.toArray() as [number,number,number];
}

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

function ObjectGeometry({ geometry, targetId, color, selected, invalid = false, preview = false, overlay, onFaceOut, onSelect, onPushPullPointerDown, onPushPullPointerMove }: { geometry: Geometry; targetId:string; color: string; selected: boolean; invalid?: boolean; preview?:boolean; overlay?:{axis:'x'|'y'|'z';side:-1|1;active:boolean}; onFaceOut?:()=>void; onSelect: (event:ThreeEvent<MouseEvent>) => void; onPushPullPointerDown?:(event:ThreeEvent<PointerEvent>)=>void; onPushPullPointerMove?:(event:ThreeEvent<PointerEvent>)=>void }) {
  const [hovered, setHovered] = useState(false);
  const rect=getRectangularProfile(geometry);const axis=overlay?.axis;const side=overlay?.side??1;
  const distance=geometry.extrusions[0]?.distanceUm??0;
  const centerX=umToMeters(((rect?.minX??0)+(rect?.maxX??0))/2),centerY=umToMeters(((rect?.minY??0)+(rect?.maxY??0))/2),centerZ=umToMeters((rect?.z??0)+distance/2);
  const depth=umToMeters(Math.abs(distance)),width=umToMeters((rect?.maxX??0)-(rect?.minX??0)),height=umToMeters((rect?.maxY??0)-(rect?.minY??0));
  const indicatorPosition:[number,number,number]=axis==='x'?[umToMeters(side>0?rect?.maxX??0:rect?.minX??0),centerY,centerZ]:axis==='y'?[centerX,umToMeters(side>0?rect?.maxY??0:rect?.minY??0),centerZ]:[centerX,centerY,umToMeters((rect?.z??0)+(side>0?Math.max(0,distance):Math.min(0,distance)))];
  const indicatorSize:[number,number]=axis==='x'?[depth,height]:axis==='y'?[width,depth]:[width,height];
  const indicatorRotation:[number,number,number]=axis==='x'?[0,Math.PI/2,0]:axis==='y'?[Math.PI/2,0,0]:[0,0,0];
  const dotTexture=useMemo(()=>createDotTexture(),[]);const meshRef=useRef<THREE.Mesh>(null);const {camera,size}=useThree();
  useFrame(()=>{if(!overlay||!meshRef.current)return;const worldPosition=meshRef.current.getWorldPosition(new THREE.Vector3());const scale=meshRef.current.getWorldScale(new THREE.Vector3());const planeScale=axis==='x'?[scale.z,scale.y]:axis==='y'?[scale.x,scale.z]:[scale.x,scale.y];const pitch=dotSpacingWorld(camera,worldPosition,size.height);dotTexture.repeat.set(Math.max(1,indicatorSize[0]*planeScale[0]/pitch),Math.max(1,indicatorSize[1]*planeScale[1]/pitch));});
  useEffect(()=>()=>dotTexture.dispose(),[dotTexture]);
  const built = useMemo(() => buildModelGeometry(geometry), [geometry]);
  return <mesh ref={meshRef} geometry={built} userData={{designTargetId:targetId}} onPointerDown={onPushPullPointerDown} onPointerMove={onPushPullPointerMove} onClick={(event) => { event.stopPropagation(); onSelect(event); }} onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }} onPointerOut={() => {setHovered(false);onFaceOut?.();}} castShadow receiveShadow>
    <meshStandardMaterial color={preview?'#e6a94e':invalid ? '#c56b62' : selected ? colors.selected : hovered ? colors.hover : color} roughness={0.78} side={THREE.DoubleSide} transparent={preview} opacity={preview?0.5:1} depthWrite={!preview} />
    {invalid && <Edges scale={1} color="#a52f2f" threshold={12} />}
    <Edges scale={1} color="#000000" threshold={12} />
    {overlay&&rect&&<mesh position={indicatorPosition} rotation={indicatorRotation} raycast={()=>null} renderOrder={1}><planeGeometry args={indicatorSize}/><meshBasicMaterial map={dotTexture} color={overlay.active?'#f2ae36':'#80c7e8'} transparent opacity={overlay.active?0.72:0.5} side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1}/></mesh>}
  </mesh>;
}

function nearestSubElement(event:ThreeEvent<MouseEvent>, geometry:Geometry, cutSpec?:DesignDocumentV1['definitions'][number]['cutSpec']):SubElement|undefined {
  const point=event.object.worldToLocal(event.point.clone());
  if(cutSpec?.confirmation==='confirmed'){point.x+=umToMeters(cutSpec.lengthUm/2);point.y+=umToMeters(cutSpec.widthUm/2);point.z=0;}
  return resolveSubElement(geometry,[point.x,point.y,point.z]);
}

function pointerOnAxisPlane(camera:THREE.Camera,canvas:HTMLCanvasElement,center:THREE.Vector3,axis:RotationAxis,clientX:number,clientY:number):THREE.Vector3|undefined {
  const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return undefined;
  const pointer=new THREE.Vector2(((clientX-rect.left)/rect.width)*2-1,-((clientY-rect.top)/rect.height)*2+1);
  const axisVector=new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0);
  const raycaster=new THREE.Raycaster();raycaster.setFromCamera(pointer,camera);
  const intersection=raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(axisVector,center),new THREE.Vector3());
  return intersection&&intersection.distanceToSquared(center)>1e-10?intersection:undefined;
}

function InstanceMesh({ item, geometry, cutSpec, selected, selectedElement, onSelect, onEnterDefinition, baseColor, tool, snap, onCommand, exactUm, onToolError, pickHit,toolMeasurement,onToolMeasurementChange,onRegisterMeasurementActions,unitSystem,componentEditMode=false }: { item:Instance|LooseObject; geometry:Geometry; cutSpec?:DesignDocumentV1['definitions'][number]['cutSpec']; selected:boolean; selectedElement?:SubElement; onSelect:(event:ThreeEvent<MouseEvent>,targetId?:string,subElement?:SubElement)=>void; onEnterDefinition:(id:string)=>void; baseColor?:string; tool:string; snap:boolean; onCommand:(command:DesignCommand)=>void; exactUm?:number; onToolError:(message:string)=>void; pickHit:(event:ThreeEvent<MouseEvent>,fallbackId:string)=>string; toolMeasurement?:ToolMeasurementSession; onToolMeasurementChange:(session?:ToolMeasurementSession)=>void; onRegisterMeasurementActions:(actions?:{commit:()=>void;cancel:()=>void})=>void; unitSystem:UnitSystem; componentEditMode?:boolean }) {
  const {camera,size,gl}=useThree();
  const pushPullRef=useRef<{faceId:string;startX:number;startY:number;screenDirection:[number,number];baseDistance:number;worldPerPixel:number;primitive:boolean;profileSide:boolean;anchor?:{axis:'x'|'y'|'z';side:-1|1};sessionId:string}|undefined>(undefined);
  const lastPointer=useRef<[number,number]>([0,0]);
  const [pushPullPreview,setPushPullPreview]=useState<Geometry>();
  const [primitiveDimensionPreview,setPrimitiveDimensionPreview]=useState<{lengthUm:number;widthUm:number;thicknessUm:number}>();
  const [primitiveFaceIndicator,setPrimitiveFaceIndicator]=useState<{axis:'x'|'y'|'z';side:-1|1}>();
  const [profileFaceIndicator,setProfileFaceIndicator]=useState<{axis:'x'|'y'|'z';side:-1|1}>();
  const [primitiveActiveFace,setPrimitiveActiveFace]=useState<{axis:'x'|'y'|'z';side:-1|1}>();
  const [pushPullActive,setPushPullActive]=useState(false);
  const canShowDotFace=shouldShowPushPullFaceIndicator(geometry,cutSpec?.confirmation,tool);
  const dotFace=canShowDotFace?(pushPullActive?primitiveActiveFace:primitiveFaceIndicator):undefined;const dotDims=primitiveDimensionPreview??cutSpec;const dotWidth=dotFace?.axis==='x'?dotDims?.thicknessUm:dotFace?.axis==='y'?dotDims?.lengthUm:dotDims?.lengthUm;const dotHeight=dotFace?.axis==='x'?dotDims?.widthUm:dotFace?.axis==='y'?dotDims?.thicknessUm:dotDims?.widthUm;
  const primitiveDotTexture=useMemo(()=>createDotTexture(),[]);const boxRef=useRef<THREE.Mesh>(null);
  useEffect(()=>()=>primitiveDotTexture.dispose(),[primitiveDotTexture]);
  useFrame(()=>{if(!dotFace||!boxRef.current)return;const worldPosition=boxRef.current.getWorldPosition(new THREE.Vector3());const scale=boxRef.current.getWorldScale(new THREE.Vector3());const planeScale=dotFace.axis==='x'?[scale.z,scale.y]:dotFace.axis==='y'?[scale.x,scale.z]:[scale.x,scale.y];const pitch=dotSpacingWorld(camera,worldPosition,size.height);primitiveDotTexture.repeat.set(Math.max(1,umToMeters(dotWidth??1)*planeScale[0]/pitch),Math.max(1,umToMeters(dotHeight??1)*planeScale[1]/pitch));});
  const previewAtRef=useRef<(clientX:number,clientY:number)=>void>(()=>{});
  const commitAtRef=useRef<(clientX:number,clientY:number)=>void>(()=>{});
  const position = item.pose.positionUm.map(umToMeters) as [number, number, number];
  const quaternion = item.pose.rotation as [number, number, number, number];
  const scale = item.scalePpm.map(v => v / 1_000_000) as [number, number, number];
  const [hovered, setHovered] = useState(false);
  const invalid = cutSpec?.confirmation === 'requires-confirmation';
  const color = invalid ? '#c56b62' : item.locked ? colors.locked : selected ? colors.selected : hovered ? colors.hover : baseColor ?? ('appearance' in item && item.appearance ? item.appearance.color : colors.board);
  const clickedFace=(event:ThreeEvent<PointerEvent>)=>{
    const local=event.object.worldToLocal(event.point.clone());
    return resolveSubElement(geometry,[local.x,local.y,local.z],0);
  };
  const distanceFor=(clientX:number,clientY:number)=>{
    const gesture=pushPullRef.current;if(!gesture)return 0;
    const raw=Math.round(((clientX-gesture.startX)*gesture.screenDirection[0]+(clientY-gesture.startY)*gesture.screenDirection[1])*gesture.worldPerPixel*1_000_000);
    const field=toolMeasurement?.id===gesture.sessionId?toolMeasurement.fields[0]:undefined;
    const exact=field?.exact?parseMeasurement(field.value):undefined;
    if(field?.exact&&exact===undefined)return Number.NaN;
    const delta=exact!==undefined?Math.round(exact*(unitSystem === 'imperial' ? 25400 : 1000)):exactUm!==undefined?Math.sign(raw||1)*Math.abs(exactUm):snap?Math.round(raw/10_000)*10_000:raw;
    return gesture.baseDistance+delta;
  };
  const previewAt=(clientX:number,clientY:number)=>{
    const gesture=pushPullRef.current;if(!gesture)return;
    lastPointer.current=[clientX,clientY];
    const distance=distanceFor(clientX,clientY);if(!Number.isFinite(distance)){setPushPullPreview(undefined);setPrimitiveDimensionPreview(undefined);return;}
    const deltaUm=distance-gesture.baseDistance;
    if(toolMeasurement?.id===gesture.sessionId){const field=toolMeasurement.fields[0];const valid=deltaUm!==0&&(gesture.primitive?distance>0&&distance<=1_000_000_000:true);const display=unitSystem==='imperial'?deltaUm/25_400:deltaUm/1_000;const nextField=field.exact?field:{...field,value:display.toFixed(unitSystem==='imperial'?3:1)};if(!field.exact||toolMeasurement.canPlace!==valid)onToolMeasurementChange({...toolMeasurement,fields:[nextField],canPlace:valid});}
    if(gesture.primitive){
      if(distance<=0||distance>1_000_000_000){setPrimitiveDimensionPreview(undefined);onToolError('The opposite face cannot be crossed');return;}
      const anchor=gesture.anchor!;setPrimitiveDimensionPreview({lengthUm:anchor.axis==='x'?distance:cutSpec!.lengthUm,widthUm:anchor.axis==='y'?distance:cutSpec!.widthUm,thicknessUm:anchor.axis==='z'?distance:cutSpec!.thicknessUm});return;
    }
    if(gesture.profileSide){const rect=getRectangularProfile(geometry);if(!rect||distance<=0||distance>1_000_000_000){setPushPullPreview(undefined);return;}try{setPushPullPreview(resizeRectangularProfile(geometry,{lengthUm:gesture.anchor!.axis==='x'?distance:rect.maxX-rect.minX,widthUm:gesture.anchor!.axis==='y'?distance:rect.maxY-rect.minY},gesture.anchor,`preview-${item.id}`));}catch(error){setPushPullPreview(undefined);onToolError(error instanceof Error?error.message:'Unsupported rectangular resize');}return;}
    if(!distance){setPushPullPreview(undefined);return;}
    try{setPushPullPreview(setExtrusionDistance(geometry,gesture.faceId,distance,`preview-${item.id}-${gesture.faceId}`));}
    catch(error){setPushPullPreview(undefined);onToolError(error instanceof Error?error.message:'Unsupported Push/Pull movement');}
  };
  const commitPushPull=(clientX=lastPointer.current[0],clientY=lastPointer.current[1])=>{
    const current=pushPullRef.current;if(!current)return;
    const distance=distanceFor(clientX,clientY);
    if(!distance){onToolError('Move the face before placing it');return;}
    try{
      if(current.primitive&&cutSpec&&'definitionId' in item){
        if(distance<=0||distance>1_000_000_000)throw Error('The end cap cannot cross the base');
        const anchor=current.anchor!;onCommand({type:'set-primitive-dimensions',definitionId:item.definitionId,lengthUm:anchor.axis==='x'?distance:cutSpec.lengthUm,widthUm:anchor.axis==='y'?distance:cutSpec.widthUm,thicknessUm:anchor.axis==='z'?distance:cutSpec.thicknessUm,anchor});
      }else{
        const nextGeometry=current.profileSide?resizeRectangularProfile(geometry,{lengthUm:current.anchor!.axis==='x'?distance:getRectangularProfile(geometry)!.maxX-getRectangularProfile(geometry)!.minX,widthUm:current.anchor!.axis==='y'?distance:getRectangularProfile(geometry)!.maxY-getRectangularProfile(geometry)!.minY},current.anchor,`extrusion-${Date.now()}`):setExtrusionDistance(geometry,current.faceId,distance,`extrusion-${Date.now()}`);
        onCommand('definitionId' in item?{type:'set-geometry',definitionId:item.definitionId,geometry:nextGeometry}:{type:'set-loose-geometry',objectId:item.id,geometry:nextGeometry});
      }
      pushPullRef.current=undefined;setPushPullActive(false);setPushPullPreview(undefined);setPrimitiveDimensionPreview(undefined);onToolMeasurementChange(undefined);onRegisterMeasurementActions(undefined);onToolError('Face placed');
    }catch(error){onToolError(error instanceof Error?error.message:'Unsupported Push/Pull movement');}
  };
  useEffect(()=>{previewAtRef.current=previewAt;commitAtRef.current=commitPushPull;});
  useEffect(()=>{if(pushPullRef.current){onRegisterMeasurementActions({commit:()=>commitPushPull(),cancel:()=>{pushPullRef.current=undefined;setPushPullActive(false);setPushPullPreview(undefined);setPrimitiveDimensionPreview(undefined);onToolMeasurementChange(undefined);onRegisterMeasurementActions(undefined);}});}});
  useEffect(()=>{if(pushPullRef.current&&toolMeasurement?.id===pushPullRef.current.sessionId&&toolMeasurement.fields[0]?.exact)previewAtRef.current(...lastPointer.current);},[toolMeasurement]);
  useEffect(()=>{
    if(!pushPullActive)return;
    const move=(event:PointerEvent)=>{if(!(event.target instanceof Node)||!gl.domElement.contains(event.target))return;previewAtRef.current(event.clientX,event.clientY);};
    const down=(event:PointerEvent)=>{
      if(event.button!==0||!(event.target instanceof Node)||!gl.domElement.contains(event.target))return;
      if((event.target as Element).closest?.('.design-measurement-box'))return;
      commitAtRef.current(event.clientX,event.clientY);
      event.preventDefault();event.stopImmediatePropagation();
    };
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerdown',down,true);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerdown',down,true);};
  },[pushPullActive,gl.domElement]);
  const pushPullPointerDown=(event:ThreeEvent<PointerEvent>)=>{
    if(tool!=='push-pull')return;
    event.stopPropagation();
    if(event.button!==0)return;
    if(item.locked){onToolError('This entity is locked');return;}
    const current=pushPullRef.current;
    if(current){
      commitPushPull(event.nativeEvent.clientX,event.nativeEvent.clientY);
      return;
    }
    if(cutSpec?.confirmation==='confirmed'&&!event.face){onToolError('Select a box face to start Push/Pull');return;}
    const primitive=cutSpec?.confirmation==='confirmed';
    const localPoint=event.object.worldToLocal(event.point.clone());const hitNormal=hitFaceNormalLocal(event);const profileAnchor=!primitive&&(!('definitionId'in item)||componentEditMode)&&event.face?rectangularProfileSide(geometry,[localPoint.x,localPoint.y,localPoint.z],hitNormal):undefined;const profileRect=profileAnchor?getRectangularProfile(geometry):undefined;
    const sub=clickedFace(event);
    if(!primitive&&!profileAnchor&&sub?.type!=='face'){onToolError('Select a rectangular side or profile face to start Push/Pull');return;}
    const face=primitive?geometry.faces[0]:geometry.faces.find(candidate=>candidate.id===sub?.id)??(profileAnchor?geometry.faces[0]:undefined);if(!face)return;
    if(!primitive&&!profileAnchor&&!isPushPullEndFace(geometry,face.id,[localPoint.x,localPoint.y,localPoint.z])){onToolError('Push/Pull can move the source face or rectangular sides');return;}
    const existing=primitive?undefined:geometry.extrusions.find(extrusion=>extrusion.faceId===face.id);
    const boxNormal=primitive?event.face!.normal:new THREE.Vector3(0,0,1);const anchor=primitive?{axis:(Math.abs(boxNormal.x)>0.5?'x':Math.abs(boxNormal.y)>0.5?'y':'z') as 'x'|'y'|'z',side:(Math.sign(boxNormal.x||boxNormal.y||boxNormal.z)||1) as -1|1}:undefined;
    const profileSide=!!profileAnchor;const profileBase=profileSide?(profileAnchor.axis==='x'?profileRect!.maxX-profileRect!.minX:profileRect!.maxY-profileRect!.minY):0;const primitiveBase=primitive?({x:cutSpec!.lengthUm,y:cutSpec!.widthUm,z:cutSpec!.thicknessUm}[anchor!.axis]):0;
    let worldPerPixel:number;
    if(camera instanceof THREE.PerspectiveCamera){
      const distance=camera.position.distanceTo(event.point);
      worldPerPixel=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/(camera.zoom*size.height);
    }else if(camera instanceof THREE.OrthographicCamera){
      worldPerPixel=(camera.top-camera.bottom)/(camera.zoom*size.height);
    }else worldPerPixel=0.001;
    const localNormal=event.face?.normal.clone()??new THREE.Vector3(0,0,1);const normalLocalPoint=event.object.worldToLocal(event.point.clone());const screenOrigin=event.point.clone().project(camera);const screenTip=event.object.localToWorld(normalLocalPoint.clone().add(localNormal)).project(camera);let directionX=(screenTip.x-screenOrigin.x)*size.width/2;let directionY=-(screenTip.y-screenOrigin.y)*size.height/2;const directionLength=Math.hypot(directionX,directionY);if(directionLength<1e-5){directionX=0;directionY=1;}else{directionX/=directionLength;directionY/=directionLength;}
    const sessionId=`push-pull-${item.id}-${Date.now()}`;pushPullRef.current={faceId:primitive?'':face.id,startX:event.nativeEvent.clientX,startY:event.nativeEvent.clientY,screenDirection:[directionX,directionY],baseDistance:primitive?primitiveBase:profileSide?profileBase:existing?.distanceUm??0,worldPerPixel,primitive,profileSide,anchor:primitive?anchor:profileAnchor,sessionId};setPrimitiveActiveFace(anchor??rectangularPushPullFace(geometry,[localPoint.x,localPoint.y,localPoint.z],hitNormal));lastPointer.current=[event.nativeEvent.clientX,event.nativeEvent.clientY];
    onToolMeasurementChange({id:sessionId,tool:'Push/Pull',canPlace:false,fields:[{id:'distance',label:'Length',value:'0',unit:unitSystem === 'imperial' ? 'in' : 'mm',step:'any'}]});
    setPushPullActive(true);
    setPushPullPreview(undefined);onToolError('Face selected · move the pointer to preview, then click to place');
  };
  const pushPullPointerMove=(event:ThreeEvent<PointerEvent>)=>{if(tool==='push-pull'&&pushPullRef.current){previewAt(event.nativeEvent.clientX,event.nativeEvent.clientY);return;}if(!canShowDotFace){setPrimitiveFaceIndicator(undefined);setProfileFaceIndicator(undefined);return;}if(cutSpec?.confirmation==='confirmed'&&event.face){const n=event.face.normal;setPrimitiveFaceIndicator({axis:(Math.abs(n.x)>0.5?'x':Math.abs(n.y)>0.5?'y':'z'),side:(Math.sign(n.x||n.y||n.z)||1) as -1|1});}else if(event.face){const point=event.object.worldToLocal(event.point.clone());setProfileFaceIndicator(rectangularPushPullFace(geometry,[point.x,point.y,point.z],hitFaceNormalLocal(event)));}};
  const click = (event:ThreeEvent<MouseEvent>) => { event.stopPropagation(); if(item.locked){onToolError('This entity is locked');return;} if(tool==='erase'){ if(selectedElement?.type==='vertex'){onToolError('Vertex selected · select an edge, face, or object to erase');return;} if(selectedElement?.id&&'definitionId' in item){if(selectedElement.type==='face')onCommand({type:'erase-geometry',definitionId:item.definitionId,target:'face',elementId:selectedElement.id});else onCommand({type:'erase-geometry',definitionId:item.definitionId,target:'edge',elementId:selectedElement.id});}else if(selectedElement?.id&&!('definitionId' in item)){onCommand({type:'erase-loose-geometry',objectId:item.id,target:selectedElement.type,elementId:selectedElement.id});}else if('definitionId' in item)onCommand({type:'delete-instance',instanceId:item.id});else onCommand({type:'delete-loose',objectId:item.id}); return; } if(tool==='paint'){if('definitionId' in item)onCommand({type:'set-appearance',instanceId:item.id,color:'#d18a45'});else onCommand({type:'set-appearance',objectId:item.id,color:'#d18a45'});return;} if(tool==='push-pull')return;const sub=event.nativeEvent.altKey?nearestSubElement(event,geometry,cutSpec):undefined;onSelect(event,event.nativeEvent.altKey?item.id:pickHit(event,item.id),sub); };
  if (cutSpec && cutSpec.confirmation === 'confirmed') {const face=dotFace;const dims=primitiveDimensionPreview??cutSpec;const axis=face?.axis;const side=face?.side??1;const planePosition: [number,number,number]=axis==='x'?[side*umToMeters(dims.lengthUm/2),0,0]:axis==='y'?[0,side*umToMeters(dims.widthUm/2),0]:[0,0,side*umToMeters(dims.thicknessUm/2)];const planeSize: [number,number]=axis==='x'?[umToMeters(dims.thicknessUm),umToMeters(dims.widthUm)]:axis==='y'?[umToMeters(dims.lengthUm),umToMeters(dims.thicknessUm)]:[umToMeters(dims.lengthUm),umToMeters(dims.widthUm)];const planeRotation: [number,number,number]=axis==='x'?[0,Math.PI/2,0]:axis==='y'?[Math.PI/2,0,0]:[0,0,0];return <mesh ref={boxRef} userData={{designTargetId:item.id}} position={position} quaternion={quaternion} scale={scale} onPointerDown={pushPullPointerDown} onPointerMove={pushPullPointerMove} onClick={click} onDoubleClick={event=>{if(tool==='select'&&'definitionId' in item){event.stopPropagation();onEnterDefinition(item.definitionId);}}} onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }} onPointerOut={() => {setHovered(false);setPrimitiveFaceIndicator(undefined);}} castShadow>
    <boxGeometry args={[umToMeters(primitiveDimensionPreview?.lengthUm??cutSpec.lengthUm), umToMeters(primitiveDimensionPreview?.widthUm??cutSpec.widthUm), umToMeters(primitiveDimensionPreview?.thicknessUm??cutSpec.thicknessUm)]} />
    <meshStandardMaterial color={primitiveDimensionPreview?'#e6a94e':color} roughness={0.78} transparent={primitiveDimensionPreview!==undefined} opacity={primitiveDimensionPreview!==undefined?0.55:1} depthWrite={primitiveDimensionPreview===undefined} />
    <Edges scale={1} color="#000000" threshold={12} />
    {face&&<mesh position={planePosition} rotation={planeRotation} raycast={()=>null} renderOrder={1}><planeGeometry args={planeSize}/><meshBasicMaterial map={primitiveDotTexture} color={pushPullActive?'#f2ae36':'#80c7e8'} transparent opacity={pushPullActive?0.72:0.5} side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1}/></mesh>}
  </mesh>;}
  const previewDistance=pushPullPreview?.extrusions[0]?.distanceUm;
  const activeProfileFace=primitiveActiveFace?.axis==='z'&&!geometry.extrusions.length&&previewDistance?{...primitiveActiveFace,side:Math.sign(previewDistance) as -1|1}:primitiveActiveFace;
  const profileOverlay=canShowDotFace?(pushPullActive&&activeProfileFace?{...activeProfileFace,active:true}:profileFaceIndicator?{...profileFaceIndicator,active:false}:undefined):undefined;
  return <group position={position} quaternion={quaternion} scale={scale} onDoubleClick={event=>{if(tool==='select'){event.stopPropagation();if('definitionId'in item)onEnterDefinition(item.definitionId);else onEnterDefinition(item.id);}}}><ObjectGeometry geometry={pushPullPreview??geometry} targetId={item.id} color={color} selected={selected} invalid={invalid} preview={!!pushPullPreview} overlay={profileOverlay} onFaceOut={()=>setProfileFaceIndicator(undefined)} onSelect={click} onPushPullPointerDown={pushPullPointerDown} onPushPullPointerMove={pushPullPointerMove} /></group>;
}

export function TransformPreview({design,target,geometry,pose,scalePpm}:{design?:DesignDocumentV1;target:Instance|LooseObject;geometry:Geometry;pose:Instance['pose'];scalePpm:Instance['scalePpm']}) {
  const cutSpec='definitionId' in target?design?.definitions.find(definition=>definition.id===target.definitionId)?.cutSpec:undefined;
  return <group position={pose.positionUm.map(umToMeters) as [number,number,number]} quaternion={pose.rotation as [number,number,number,number]} scale={scalePpm.map(value=>value/1_000_000) as [number,number,number]}>
    {cutSpec?.confirmation==='confirmed'?<mesh raycast={()=>null}><boxGeometry args={[umToMeters(cutSpec.lengthUm),umToMeters(cutSpec.widthUm),umToMeters(cutSpec.thicknessUm)]}/><meshStandardMaterial color={colors.selected} roughness={0.78} transparent opacity={0.55} depthWrite={false}/><Edges scale={1} color="#000000" threshold={12}/></mesh>:<ObjectGeometry geometry={geometry} targetId={target.id} color={colors.selected} selected={false} preview onSelect={event=>event.stopPropagation()} />}
  </group>;
}

function DrawingPlane({activeTool,snap,exactUm,unitSystem,pivotMode,rotationPivotMode,axisMode,moveConstraint,moveShiftHeld,onCommand,onMeasure,onSelect,onToolError,design,selectedId,selectedCount,selectedElement,editingDefinitionId,toolMeasurement,onToolMeasurementChange,onRegisterMeasurementActions}:Pick<Props,'activeTool'|'snap'|'exactUm'|'pivotMode'|'rotationPivotMode'|'axisMode'|'moveConstraint'|'moveShiftHeld'|'onCommand'|'onMeasure'|'onSelect'|'onToolError'|'design'|'selectedId'|'selectedCount'|'selectedElement'|'editingDefinitionId'|'toolMeasurement'|'onToolMeasurementChange'|'onRegisterMeasurementActions'|'unitSystem'>) {
  const canvas=useThree(state=>state.gl.domElement);
  const camera=useThree(state=>state.camera);
  const viewportSize=useThree(state=>state.size);
  const rotationGizmoRef=useRef<THREE.Group>(null);
  const moveGizmoRef=useRef<THREE.Group>(null);
  const session=useRef(createCapturedPlanarSession<THREE.Vector3>());
  const completedSessions=useRef(new Set<string>());
  const [measureGesture,setMeasureGesture]=useState<{start:THREE.Vector3;end:THREE.Vector3;sessionId:string}>();
  const [transformGesture,setTransformGesture]=useState<{mode:'move'|'rotate'|'scale';start:THREE.Vector3;end:THREE.Vector3;rotationBaseDegrees:number;rotationDragging?:boolean;rotationPointerId?:number;rotationLastVector?:[number,number,number];rotationLastClientX?:number;rotationDragStartClient?:[number,number];rotationHadPreviewAtStart?:boolean;sessionId:string;target:Instance|LooseObject;geometry:Geometry;centerLocal:[number,number,number];rotationAxis?:RotationAxis;moveAxis?:MoveAxis;moveShiftAxis?:MoveAxis;moveAxisSigns?:Partial<Record<MoveAxis,-1|1>>;moveFromHandle?:boolean;moveStartClient?:[number,number];moveLastClient?:[number,number];movePivot?:[number,number,number];moveStartAxisCoordinate?:number;movePointerId?:number}>();
  const transformGestureRef=useRef(transformGesture);
  useLayoutEffect(()=>{transformGestureRef.current=transformGesture;},[transformGesture]);
  const rotationVertices=useMemo(()=>designVertices(design,editingDefinitionId),[design,editingDefinitionId]);
  const selectedInstance=design?.instances.find(item=>item.id===selectedId&&!item.hidden);
  const selectedLoose=design?.looseObjects.find(item=>item.id===selectedId&&!item.hidden);
  const selectedTransformTarget=selectedInstance??selectedLoose;
  const selectedTransformGeometry=selectedInstance?design?.definitions.find(item=>item.id===selectedInstance.definitionId)?.geometry:selectedLoose?.geometry;
  const rotationTarget=activeTool==='rotate'&&selectedTransformTarget&&!selectedTransformTarget.locked&&selectedTransformGeometry?selectedTransformTarget:undefined;
  const rotationGeometry=rotationTarget?selectedTransformGeometry:undefined;
  const moveTarget=activeTool==='move'&&selectedTransformTarget&&!selectedTransformTarget.locked?selectedTransformTarget:undefined;
  const moveGeometry=moveTarget?selectedTransformGeometry:undefined;
  const movePivotFor=useCallback((target:Instance|LooseObject,geometry:Geometry)=>{
    const local=pivotMode==='center'?geometryCenter(geometry):[0,0,0] as [number,number,number];
    return transformLocalPoint(local,target.pose,target.scalePpm).map(umToMeters) as [number,number,number];
  },[pivotMode]);
  const movePivot=moveTarget&&moveGeometry?movePivotFor(moveTarget,moveGeometry):undefined;
  const measureValue=(gesture=measureGesture)=>{
    if(!gesture)return 0;
    const field=toolMeasurement?.id===gesture.sessionId?toolMeasurement.fields[0]:undefined;
    const typed=field?.exact?parseMeasurement(field.value,0.001):undefined;
    if(field?.exact&&typed===undefined)return 0;
    return typed!==undefined?Math.round(typed*(unitSystem==='imperial'?25_400:1_000)):Math.round(gesture.start.distanceTo(gesture.end)*1_000_000);
  };
  const rotationPivotFor=useCallback((target:Instance|LooseObject,geometry:Geometry):[number,number,number]=>{
    const vertex=selectedElement?.objectId===target.id&&selectedElement.type==='vertex'?selectedElement:undefined;
    const vertexLocal=vertex?rotationVertices.find(item=>item.objectId===target.id&&item.id===vertex.id)?.localPoint??geometry.vertices.find(item=>item.id===vertex.id)?.positionUm:undefined;
    const cutSpec='definitionId'in target?design?.definitions.find(definition=>definition.id===target.definitionId)?.cutSpec:undefined;
    return resolveRotationPivotLocal(geometry,rotationPivotMode,vertexLocal,cutSpec?.confirmation==='confirmed'?[0,0,0]:undefined);
  },[selectedElement,rotationVertices,design,rotationPivotMode]);
  useEffect(()=>{
    const gesture=transformGestureRef.current;
    if(gesture?.mode!=='rotate'||!gesture.rotationDragging||gesture.rotationLastClientX===undefined)return;
    const centerUm=transformLocalPoint(rotationPivotFor(gesture.target,gesture.geometry),gesture.target.pose,gesture.target.scalePpm);
    const center=new THREE.Vector3(...centerUm.map(umToMeters) as [number,number,number]);
    const clientY=gesture.rotationDragStartClient?.[1]??0;
    const point=pointerOnAxisPlane(camera,canvas,center,gesture.rotationAxis??'z',gesture.rotationLastClientX,clientY);
    setTransformGesture(current=>current?.sessionId===gesture.sessionId?{...current,rotationLastVector:point?.toArray() as [number,number,number]|undefined,rotationDragStartClient:[gesture.rotationLastClientX!,clientY],rotationHadPreviewAtStart:false}:current);
    // Pivot changes invalidate the previous pointer vector; rebase the ongoing drag at its current screen point.
  },[rotationPivotFor,camera,canvas]);
  useFrame(()=>{
    if(!rotationGizmoRef.current)return;
    const target=transformGesture?.mode==='rotate'?transformGesture.target:rotationTarget;
    const geometry=transformGesture?.mode==='rotate'?transformGesture.geometry:rotationGeometry;
    if(!target||!geometry){rotationGizmoRef.current.visible=false;return;}
    rotationGizmoRef.current.visible=true;
    const pivotLocal=rotationPivotFor(target,geometry);
    const worldPivot=transformLocalPoint(pivotLocal,target.pose,target.scalePpm).map(umToMeters) as [number,number,number];
    const point=new THREE.Vector3(...worldPivot);
    const projectedPivot=point.clone().project(camera);
    const pivotX=(projectedPivot.x+1)*viewportSize.width/2,pivotY=(1-projectedPivot.y)*viewportSize.height/2;
    const cornerRadius=rotationPivotMode==='origin'?rotationVertices.filter(vertex=>vertex.objectId===target.id).reduce((radius,vertex)=>{const projected=new THREE.Vector3(...vertex.point).project(camera);if(projected.z< -1||projected.z>1)return radius;return Math.max(radius,Math.hypot((projected.x+1)*viewportSize.width/2-pivotX,(1-projected.y)*viewportSize.height/2-pivotY));},0):0;
    const radiusPixels=rotationGizmoRadiusPixels(rotationPivotMode,cornerRadius);
    rotationGizmoRef.current.scale.setScalar(Math.max(0.0001,worldPerPixel(camera,point,viewportSize.height)*radiusPixels));
  });
  useFrame(()=>{
    if(!moveGizmoRef.current)return;
    if(!moveTarget||!moveGeometry||!movePivot){moveGizmoRef.current.visible=false;return;}
    moveGizmoRef.current.visible=true;
    const point=new THREE.Vector3(...movePivot);
    moveGizmoRef.current.scale.setScalar(Math.max(0.0001,worldPerPixel(camera,point,viewportSize.height)*42));
  });
  const transformResult=useCallback((gesture=transformGesture,end=gesture?.end)=>{
    if(!gesture||!end)return undefined;
    const {target,geometry,centerLocal,mode}=gesture;const field=toolMeasurement?.id===gesture.sessionId?toolMeasurement.fields[0]:undefined;
    const typed=field?.exact?parseMeasurement(field.value):undefined;const exactInvalid=!!field?.exact&&(typed===undefined||mode==='move'&&typed<=0);
    let pose:typeof target.pose;let scalePpm=target.scalePpm as [number,number,number];let display:string;let valid:boolean;
    if(mode==='move'){
      const raw:[number,number,number]=[metersToUm(end.x-gesture.start.x),metersToUm(end.y-gesture.start.y),metersToUm(end.z-gesture.start.z)];
      const exact=typed===undefined?undefined:Math.round(typed*(unitSystem==='imperial'?25_400:1_000));
      const constrainedAxis=resolveMoveConstraint(moveConstraint,gesture.moveAxis,gesture.moveShiftAxis);
      if(constrainedAxis){
        const direction=moveAxisDirection(constrainedAxis,target.pose,axisMode).toArray() as [number,number,number];
        const coordinate=Math.round(raw[0]*direction[0]+raw[1]*direction[1]+raw[2]*direction[2]);
        const preview=previewMoveOnAxis(target.pose,constrainedAxis,coordinate,axisMode,snap,exact,gesture.moveAxisSigns?.[constrainedAxis]);
        pose=preview.pose;display=(unitSystem==='imperial'?preview.distanceUm/25_400:preview.distanceUm/1_000).toFixed(unitSystem==='imperial'?3:1);valid=preview.valid&&(preview.distanceUm>0||exact!==undefined&&exact!==0);
      }else{
        const preview=previewMove(target.pose,raw,axisMode,snap,exact);
        pose=preview.pose;display=(unitSystem==='imperial'?preview.distanceUm/25_400:preview.distanceUm/1_000).toFixed(unitSystem==='imperial'?3:1);valid=preview.valid&&preview.distanceUm>0;
      }
    }else if(mode==='rotate'){
      const rawDegrees=typed??gesture.rotationBaseDegrees;const degrees=typed??(snap?Math.round(rawDegrees/15)*15:rawDegrees);const axis=toolMeasurement?.id===gesture.sessionId?toolMeasurement.rotationAxis:gesture.rotationAxis;display=degrees.toFixed(2);valid=!!axis&&Number.isFinite(degrees)&&Math.abs(degrees)>0;
      pose=previewRotate(target.pose,scalePpm,centerLocal,axis?degrees:0,axis??'z',rotationPivotFor(target,geometry)).pose;
    }else{
      const center=transformLocalPoint(centerLocal,target.pose,target.scalePpm).map(umToMeters) as [number,number,number];const startRadius=Math.hypot(gesture.start.x-center[0],gesture.start.y-center[1]);const endRadius=Math.hypot(end.x-center[0],end.y-center[1]);const factor=typed??(startRadius>1e-6?endRadius/startRadius:0);display=`${factor.toFixed(3)}×`;
      const preview=previewScale(target.pose,target.scalePpm,centerLocal,factor,pivotMode);scalePpm=preview.scalePpm;valid=preview.valid;pose=preview.pose;
    }
    return {pose,scalePpm,display,valid:valid&&!exactInvalid,geometry,target};
  },[transformGesture,toolMeasurement,axisMode,moveConstraint,snap,pivotMode,unitSystem,rotationPivotFor]);
  const commitTransform=useCallback((gesture=transformGesture,end=gesture?.end)=>{
    const result=transformResult(gesture,end);if(!gesture||completedSessions.current.has(gesture.sessionId))return;if(!result?.valid){onToolError('Enter a valid nonzero value for this transform');return;}completedSessions.current.add(gesture.sessionId);
    const target=gesture.target;const instance=design?.instances.some(item=>item.id===target.id);
    onCommand(instance?{type:'set-instance-transform',instanceId:target.id,pose:result.pose,...(gesture.mode==='scale'?{scalePpm:result.scalePpm,reason:'instance-scaled' as const}:{})}:{type:'set-loose-transform',objectId:target.id,pose:result.pose,...(gesture.mode==='scale'?{scalePpm:result.scalePpm}:{})});
    setTransformGesture(undefined);onToolMeasurementChange(undefined);onRegisterMeasurementActions(undefined);onToolError(`${gesture.mode[0].toUpperCase()+gesture.mode.slice(1)} placed`);
  },[transformGesture,transformResult,design,onCommand,onToolMeasurementChange,onRegisterMeasurementActions,onToolError]);
  const cancelTransform=useCallback(()=>{setTransformGesture(undefined);onToolMeasurementChange(undefined);onRegisterMeasurementActions(undefined);onToolError('Transform canceled');},[onToolMeasurementChange,onRegisterMeasurementActions,onToolError]);
  // Synchronize the provisional transform with the selected model target; stale previews must not be committed.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{if(!transformGesture)return;const current=design?.instances.find(item=>item.id===transformGesture.target.id)??design?.looseObjects.find(item=>item.id===transformGesture.target.id);if(selectedId!==transformGesture.target.id||current!==transformGesture.target)cancelTransform();});
  const commitMeasure=(gesture=measureGesture)=>{
    if(!gesture||completedSessions.current.has(gesture.sessionId))return;completedSessions.current.add(gesture.sessionId);const value=measureValue(gesture);if(value>0)onMeasure(value);
    setMeasureGesture(undefined);onToolMeasurementChange(undefined);onRegisterMeasurementActions(undefined);onToolError(value>0?'Measurement captured · temporary only':'Enter a positive distance');
  };
  const cancelMeasure=()=>{setMeasureGesture(undefined);onToolMeasurementChange(undefined);onRegisterMeasurementActions(undefined);onToolError('Measurement canceled');};
  useEffect(()=>{if(measureGesture){onRegisterMeasurementActions({commit:()=>commitMeasure(),cancel:cancelMeasure});}else if(transformGesture){onRegisterMeasurementActions({commit:()=>commitTransform(),cancel:cancelTransform});}});
  const finish=(point:THREE.Vector3, event:ThreeEvent<PointerEvent>)=>{
    event.stopPropagation();
    const a=session.current.takeEnd()??point;const b=point;
    if(['line','measure'].includes(activeTool)){
      const from:[number,number,number]=[metersToUm(a.x),metersToUm(a.y),0],to:[number,number,number]=[metersToUm(b.x),metersToUm(b.y),0];
      if(activeTool==='line'){
        if((selectedCount??0)>1&&!editingDefinitionId){onToolError('Joining multiple selected profiles is not supported; select one open profile');return;}
        const loose=selectedCount===1?design?.looseObjects.find(item=>item.id===selectedId&&!item.hidden&&!item.locked):undefined;
        const instance=design?.instances.find(item=>item.id===selectedId&&!item.hidden&&!item.locked&&item.definitionId===editingDefinitionId);
        const targetPose=loose?.pose??instance?.pose??{positionUm:[0,0,0] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]};
        const targetScale=loose?.scalePpm??instance?.scalePpm??[1_000_000,1_000_000,1_000_000] as [number,number,number];
        const targetId=loose?.id??(editingDefinitionId&&design?.definitions.some(item=>item.id===editingDefinitionId)?editingDefinitionId:undefined);
        const targetKind=loose?'loose':'definition';
        if(targetId){
          const worldToLocal=(point:[number,number,number])=>{const [x,y,z]=point.map((value,index)=>value-targetPose.positionUm[index]);const [qx,qy,qz,qw]=targetPose.rotation;const tx=2*(-qy*z+qz*y),ty=2*(-qz*x+qx*z),tz=2*(-qx*y+qy*x);return [x+qw*tx-qy*tz+qz*ty,y+qw*ty-qz*tx+qx*tz,z+qw*tz-qx*ty+qy*tx].map((value,index)=>Math.round(value*1_000_000/targetScale[index])) as [number,number,number];};
          const localStart=worldToLocal(from),localEnd=worldToLocal(to);const length=Math.hypot(localEnd[0]-localStart[0],localEnd[1]-localStart[1]);
          if(exactUm!==undefined&&length>0){localEnd[0]=Math.round(localStart[0]+(localEnd[0]-localStart[0])*exactUm/length);localEnd[1]=Math.round(localStart[1]+(localEnd[1]-localStart[1])*exactUm/length);}
          const ids=()=>globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random()}`;
          onCommand({type:'append-profile-segment',target:targetKind,id:targetId,startUm:localStart,endUm:localEnd,vertexId:`v-${ids()}`,edgeId:`e-${ids()}`,faceId:`f-${ids()}`});onToolError('Segment appended to selected profile; invalid joins are rejected unchanged');return;
        }
      }
      const result=buildPlanarGesture(activeTool as 'line'|'rectangle'|'measure',from,to,snap&&!event.nativeEvent.altKey,exactUm);if(result.command)onCommand(result.command);if(result.measurementUm!==undefined)onMeasure(result.measurementUm);return;
    }
    if(['move','rotate','scale'].includes(activeTool) && selectedId){const instance=design?.instances.find(i=>i.id===selectedId);const loose=design?.looseObjects.find(i=>i.id===selectedId);const target=instance??loose;if(!target){onToolError('Transform requires a component or loose object');return;}if(target.locked){onToolError('This entity is locked');return;}
      const transform=(pose:typeof target.pose,scalePpm?:typeof target.scalePpm)=>onCommand(instance?{type:'set-instance-transform',instanceId:target.id,pose,...(scalePpm?{scalePpm}:{}),...(scalePpm?{reason:'instance-scaled' as const}:{})}:{type:'set-loose-transform',objectId:target.id,pose,...(scalePpm?{scalePpm}:{})});
      const geometry=instance?design?.definitions.find(def=>def.id===instance.definitionId)?.geometry:loose?.geometry;const centerLocal=geometry?geometryCenter(geometry):[0,0,0] as [number,number,number];
      if(activeTool==='move'){const raw:[number,number,number]=[metersToUm(b.x-a.x),metersToUm(b.y-a.y),0];const local=axisMode==='local'?worldToLocalDelta(raw,target.pose):raw;const delta:[number,number,number]=[exactUm??(snap?Math.round(local[0]/10_000)*10_000:local[0]),snap?Math.round(local[1]/10_000)*10_000:local[1],0];const worldDelta=axisMode==='local'?localizeDelta(delta,target.pose,'local'):delta;const positionUm=target.pose.positionUm.map((n,i)=>n+worldDelta[i]) as [number,number,number];transform({...target.pose,positionUm});return;}
      if(activeTool==='rotate'){const rawDegrees=(b.x-a.x)*90;const degrees=exactUm??(snap?Math.round(rawDegrees/15)*15:rawDegrees);const pivot=rotationPivotFor(target,geometry??{vertices:[],edges:[],faces:[],extrusions:[]});const pose=previewRotate(target.pose,target.scalePpm as [number,number,number],centerLocal,degrees,toolMeasurement?.rotationAxis??'z',pivot).pose;transform(pose);return;}
      const center=transformLocalPoint(centerLocal,target.pose,target.scalePpm).map(umToMeters) as [number,number,number];const radiusA=Math.hypot(a.x-center[0],a.y-center[1]),radiusB=Math.hypot(b.x-center[0],b.y-center[1]);if(exactUm===undefined&&radiusA<0.000001){onToolError('Start Scale away from the geometry center');return;}const scalePpm:[number,number,number]=exactUm===undefined?target.scalePpm.map(value=>Math.round(value*radiusB/radiusA)) as [number,number,number]:[exactUm,exactUm,exactUm];transform(keepGeometryCenter(centerLocal,target.pose,target.scalePpm,target.pose,scalePpm,pivotMode),scalePpm);return;
    }
    onSelect(undefined);
  };
  const placeMeasurePoint=(event:ThreeEvent<PointerEvent>)=>{
    const point=event.point.clone();if(!measureGesture){const id=`measure-${Date.now()}`;setMeasureGesture({start:point,end:point,sessionId:id});onToolMeasurementChange({id,tool:'Tape Measure',canPlace:false,fields:[{id:'distance',label:'Length',value:'0',unit:unitSystem === 'imperial' ? 'in' : 'mm',min:0.001}]});onToolError('Measurement start set · move to preview or enter a distance');return;}
    commitMeasure({...measureGesture,end:point});
  };
  const updateMeasurePointer=(event:ThreeEvent<PointerEvent>)=>{
    if(!measureGesture)return;const end=event.point.clone();setMeasureGesture(current=>current?{...current,end}:current);
    if(toolMeasurement?.id===measureGesture.sessionId){const field=toolMeasurement.fields[0];if(!field.exact){const value=Math.round(measureGesture.start.distanceTo(end)*1_000_000);onToolMeasurementChange({...toolMeasurement,fields:[{...field,value:(unitSystem==='imperial'?value/25_400:value/1_000).toFixed(unitSystem==='imperial'?3:1)}],canPlace:value>0});}}
  };
  const startTransformSession=(target:Instance|LooseObject,geometry:Geometry,start:THREE.Vector3,mode:'move'|'rotate'|'scale',id:string,rotationAxis?:RotationAxis,moveAxis?:MoveAxis,client?:[number,number],fromHandle=false,pivot?:[number,number,number],startAxisCoordinate?:number,pointerId?:number)=>{
    const gesture={mode,start:start.clone(),end:start.clone(),rotationBaseDegrees:0,sessionId:id,target,geometry,centerLocal:geometryCenter(geometry),rotationAxis,moveAxis,moveFromHandle:fromHandle,moveStartClient:client,moveLastClient:client,movePivot:pivot,moveStartAxisCoordinate:startAxisCoordinate,movePointerId:pointerId} as const;
    setTransformGesture(gesture);onToolMeasurementChange({id,tool:mode[0].toUpperCase()+mode.slice(1),rotationAxis,canPlace:false,fields:[{id:'value',label:mode==='move'?'Length':mode==='rotate'?'Angle':'Scale',value:mode==='scale'?'1':'0',unit:mode==='move'?(unitSystem==='imperial'?'in':'mm'):mode==='rotate'?'°':'×',min:mode==='move'||mode==='scale'?0.001:undefined}]});
    return gesture;
  };
  const moveGestureAtPointer=useCallback((gesture:NonNullable<typeof transformGesture>,clientX:number,clientY:number)=>{
    let updated={...gesture,moveLastClient:[clientX,clientY] as [number,number]};
    if(moveShiftHeld&&!moveConstraint&&(!updated.moveAxis||moveConstraint===null)&&!updated.moveShiftAxis&&updated.moveStartClient){
      const pivot=updated.movePivot??movePivotFor(updated.target,updated.geometry);
      const pivotPoint=new THREE.Vector3(...pivot);
      const axes=projectedMoveAxes(camera,pivotPoint,viewportSize.width,viewportSize.height,updated.target.pose,axisMode,8,worldPerPixel(camera,pivotPoint,viewportSize.height)*42);
      const hit=pickProjectedMoveAxis(axes,clientX-updated.moveStartClient[0],clientY-updated.moveStartClient[1]);
      if(hit)updated={...updated,moveShiftAxis:hit.axis,moveAxisSigns:{...updated.moveAxisSigns,[hit.axis]:hit.sign}};
    }else if(!moveShiftHeld&&updated.moveShiftAxis)updated={...updated,moveShiftAxis:undefined};
    const axis=resolveMoveConstraint(moveConstraint,updated.moveAxis,updated.moveShiftAxis);
    if(axis){
      const pivot=updated.movePivot??movePivotFor(updated.target,updated.geometry);
      const origin=new THREE.Vector3(...pivot);
      const direction=moveAxisDirection(axis,updated.target.pose,axisMode);
      const from=updated.moveStartClient??[clientX,clientY];
      const startRay=rayAtClientPoint(camera,canvas,from[0],from[1]);
      const currentRay=rayAtClientPoint(camera,canvas,clientX,clientY);
      const startCoordinate=updated.moveAxis===axis&&updated.moveStartAxisCoordinate!==undefined
        ? updated.moveStartAxisCoordinate
        : startRay&&rayAxisCoordinate(startRay,origin,direction);
      const currentCoordinate=currentRay&&rayAxisCoordinate(currentRay,origin,direction);
      if(startCoordinate===undefined||currentCoordinate===undefined){
        onToolError(`${axis.toUpperCase()} axis is too close to the camera direction to move; orbit the view or choose another axis`);
        return undefined;
      }
      updated={...updated,moveStartAxisCoordinate:startCoordinate,movePivot:pivot};
      const signedCoordinate=currentCoordinate-startCoordinate;
      if(Math.abs(signedCoordinate)>1e-8)updated.moveAxisSigns={...updated.moveAxisSigns,[axis]:Math.sign(signedCoordinate) as -1|1};
      const delta=direction.multiplyScalar(signedCoordinate);
      updated.end=updated.start.clone().add(delta);
    }else{
      const ray=rayAtClientPoint(camera,canvas,clientX,clientY);
      const freePoint=ray?.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-gesture.start.z),new THREE.Vector3());
      if(freePoint){
        if(gesture.moveFromHandle&&gesture.moveStartClient){
          const startRay=rayAtClientPoint(camera,canvas,...gesture.moveStartClient);
          const startPlane=new THREE.Plane(new THREE.Vector3(0,0,1),-gesture.start.z);
          const freeStart=startRay?.intersectPlane(startPlane,new THREE.Vector3());
          if(freeStart)updated.end=gesture.start.clone().add(freePoint.clone().sub(freeStart));
        }else updated.end=freePoint.clone();
      }
      updated.moveAxis=undefined;
      updated.moveStartAxisCoordinate=undefined;
    }
    return updated;
  },[moveShiftHeld,moveConstraint,camera,canvas,viewportSize,axisMode,onToolError,movePivotFor]);
  const movePointerUpdater=useRef(moveGestureAtPointer);
  const transformResultUpdater=useRef(transformResult);
  const measurementUpdateRef=useRef(onToolMeasurementChange);
  const measurementSessionRef=useRef(toolMeasurement);
  useLayoutEffect(()=>{movePointerUpdater.current=moveGestureAtPointer;},[moveGestureAtPointer]);
  useLayoutEffect(()=>{transformResultUpdater.current=transformResult;},[transformResult]);
  useLayoutEffect(()=>{measurementUpdateRef.current=onToolMeasurementChange;measurementSessionRef.current=toolMeasurement;},[onToolMeasurementChange,toolMeasurement]);
  const commitTransformRef=useRef(commitTransform);
  const cancelTransformRef=useRef(cancelTransform);
  useLayoutEffect(()=>{commitTransformRef.current=commitTransform;cancelTransformRef.current=cancelTransform;},[commitTransform,cancelTransform]);
  // Store the gesture and mirror its axis label, distance, and placeability into the measurement box.
  const applyMoveUpdate=useCallback((updated:NonNullable<typeof transformGesture>)=>{
    transformGestureRef.current=updated;setTransformGesture(updated);
    const session=measurementSessionRef.current;if(session?.id!==updated.sessionId)return;
    const result=transformResultUpdater.current(updated,updated.end);if(!result)return;
    const axis=resolveMoveConstraint(moveConstraint,updated.moveAxis,updated.moveShiftAxis);
    const label=`Length${axis?` (${axis.toUpperCase()})`:''}`;
    const field=session.fields[0];
    if(field?.label===label&&(field.exact||field.value===result.display)&&session.canPlace===result.valid)return;
    const next={...session,canPlace:result.valid,fields:session.fields.map(current=>current.id===field?.id?{...current,label,...(!current.exact?{value:result.display}:{})}:current)};
    measurementSessionRef.current=next;measurementUpdateRef.current(next);
  },[moveConstraint]);
  const applyMoveUpdateRef=useRef(applyMoveUpdate);
  useLayoutEffect(()=>{applyMoveUpdateRef.current=applyMoveUpdate;},[applyMoveUpdate]);
  useEffect(()=>{
    const gesture=transformGestureRef.current;
    if(activeTool!=='move'||gesture?.mode!=='move'||!gesture.moveLastClient)return;
    const updated=movePointerUpdater.current(gesture,...gesture.moveLastClient);
    // Axis and Shift changes must immediately refresh the visible preview.
    if(updated)applyMoveUpdateRef.current(updated);
  },[activeTool,moveConstraint,moveShiftHeld]);
  const beginTransform=(event:ThreeEvent<PointerEvent>)=>{
    const instance=design?.instances.find(item=>item.id===selectedId);const loose=design?.looseObjects.find(item=>item.id===selectedId);const target=instance??loose;
    if(!target){onToolError('Select a component or loose object before transforming');return;}
    if(target.locked){onToolError('This entity is locked');return;}
    const geometry=instance?design?.definitions.find(def=>def.id===instance.definitionId)?.geometry:loose?.geometry;if(!geometry){onToolError('Transform target has no editable geometry');return;}
    const mode=activeTool as 'move'|'rotate'|'scale';
    const gesture=startTransformSession(target,geometry,event.point,mode,`${mode}-${target.id}-${globalThis.crypto.randomUUID()}`);
    if(mode==='move'){
      const withPointer={...gesture,moveStartClient:[event.nativeEvent.clientX,event.nativeEvent.clientY] as [number,number],moveLastClient:[event.nativeEvent.clientX,event.nativeEvent.clientY] as [number,number],movePivot:movePivotFor(target,geometry),movePointerId:event.pointerId};
      transformGestureRef.current=withPointer;setTransformGesture(withPointer);
    }
    onToolError(mode==='rotate'?'Choose an axis ring, then drag to preview':'Move start set · move to preview or enter a value');
  };
  const beginMoveAxisDrag=(axis:MoveAxis,event:ThreeEvent<PointerEvent>)=>{
    if(event.button!==0)return;
    event.stopPropagation();event.nativeEvent.preventDefault();
    // An active move owns pointer input through its window and canvas listeners.
    if(transformGestureRef.current?.mode==='move')return;
    const target=selectedTransformTarget;const geometry=selectedTransformGeometry;
    if(!target||!geometry){onToolError('Select a component or loose object before moving');return;}
    if(target.locked){onToolError('This entity is locked');return;}
    const pivot=movePivotFor(target,geometry);const ray=rayAtClientPoint(camera,canvas,event.nativeEvent.clientX,event.nativeEvent.clientY);
    const direction=moveAxisDirection(axis,target.pose,axisMode);
    const startCoordinate=ray&&rayAxisCoordinate(ray,new THREE.Vector3(...pivot),direction);
    if(startCoordinate===undefined){onToolError(`${axis.toUpperCase()} axis is too close to the camera direction to move; orbit the view or choose another axis`);return;}
    const client:[number,number]=[event.nativeEvent.clientX,event.nativeEvent.clientY];
    const base=startTransformSession(target,geometry,new THREE.Vector3(),'move',`move-${target.id}-${globalThis.crypto.randomUUID()}`,undefined,axis,client,true,pivot,startCoordinate,event.pointerId);
    const gesture={...base,moveAxis:axis,moveFromHandle:true,movePointerId:event.pointerId,moveStartAxisCoordinate:startCoordinate,moveLastClient:client};
    transformGestureRef.current=gesture;setTransformGesture(gesture);
    onToolMeasurementChange({id:gesture.sessionId,tool:'Move',canPlace:false,fields:[{id:'value',label:`Length (${axis.toUpperCase()})`,value:'0',unit:unitSystem==='imperial'?'in':'mm',min:0.001}]});
    onToolError(`Moving on ${axis.toUpperCase()} axis · drag and release to place`);
  };
  useEffect(()=>{
    if(!transformGesture?.moveFromHandle)return;
    const move=(event:PointerEvent)=>{
      const current=transformGestureRef.current;if(!current?.moveFromHandle||event.pointerId!==current.movePointerId)return;
      const updated=movePointerUpdater.current(current,event.clientX,event.clientY);
      if(updated)applyMoveUpdateRef.current(updated);
    };
    const end=(event:PointerEvent)=>{
      const current=transformGestureRef.current;if(!current?.moveFromHandle||event.pointerId!==current.movePointerId)return;
      const updated=event.type==='pointerup'?movePointerUpdater.current(current,event.clientX,event.clientY):undefined;
      // A click without a drag (or a cancelled pointer) must not leave the handle session following the cursor.
      if(updated&&transformResultUpdater.current(updated,updated.end)?.valid){applyMoveUpdateRef.current(updated);commitTransformRef.current(updated,updated.end);}
      else cancelTransformRef.current();
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);};
  },[transformGesture?.moveFromHandle]);
  useEffect(()=>{
    if(transformGesture?.mode!=='move'||transformGesture.moveFromHandle||!transformGesture.moveStartClient)return;
    const insideCanvas=(clientX:number,clientY:number)=>{
      const bounds=canvas.getBoundingClientRect();
      return clientX>=bounds.left&&clientX<=bounds.right&&clientY>=bounds.top&&clientY<=bounds.bottom;
    };
    const move=(event:PointerEvent)=>{
      const current=transformGestureRef.current;
      if(!current||current.mode!=='move'||current.moveFromHandle||event.pointerId!==current.movePointerId||!insideCanvas(event.clientX,event.clientY))return;
      const updated=movePointerUpdater.current(current,event.clientX,event.clientY);
      if(updated)applyMoveUpdateRef.current(updated);
    };
    // Listen on the canvas itself so clicks on overlaid workspace UI never place the move.
    const down=(event:PointerEvent)=>{
      if(event.button!==0)return;
      const current=transformGestureRef.current;
      if(!current||current.mode!=='move'||current.moveFromHandle)return;
      event.preventDefault();event.stopImmediatePropagation();
      const updated=movePointerUpdater.current(current,event.clientX,event.clientY);
      if(updated){applyMoveUpdateRef.current(updated);commitTransformRef.current(updated,updated.end);}
    };
    window.addEventListener('pointermove',move);
    canvas.addEventListener('pointerdown',down,true);
    return()=>{window.removeEventListener('pointermove',move);canvas.removeEventListener('pointerdown',down,true);};
  },[transformGesture?.mode,transformGesture?.moveFromHandle,transformGesture?.moveStartClient,canvas]);
  const updateTransformPointer=(event:ThreeEvent<PointerEvent>)=>{
    // Move gestures are driven by the window pointer listeners, which also handle off-plane pointers.
    if(!transformGesture||transformGesture.mode==='rotate'||transformGesture.mode==='move')return;const end=event.point.clone();const updated={...transformGesture,end};setTransformGesture(updated);
    const result=transformResult(updated,end);if(!result)return;
    if(toolMeasurement?.id===updated.sessionId){const field=toolMeasurement.fields[0];if(!field.exact){const value=updated.mode==='scale'?result.display.replace('×',''):result.display;onToolMeasurementChange({...toolMeasurement,fields:[{...field,value}],canPlace:result.valid});}}
  };
  const startRotationRingDrag=(axis:RotationAxis,event:ThreeEvent<PointerEvent>)=>{
    if(event.button!==0)return;
    const gesture=transformGesture?.mode==='rotate'?transformGesture:rotationTarget&&rotationGeometry?startTransformSession(rotationTarget,rotationGeometry,event.point,'rotate',`rotate-${rotationTarget.id}-${globalThis.crypto.randomUUID()}`,axis):undefined;
    if(!gesture)return;
    event.stopPropagation();event.nativeEvent.preventDefault();(event.target as unknown as {setPointerCapture?:(id:number)=>void}).setPointerCapture?.(event.pointerId);
    const centerUm=transformLocalPoint(rotationPivotFor(gesture.target,gesture.geometry),gesture.target.pose,gesture.target.scalePpm);
    const center=new THREE.Vector3(...centerUm.map(umToMeters) as [number,number,number]);
    const pointer=pointerOnAxisPlane(camera,canvas,center,axis,event.nativeEvent.clientX,event.nativeEvent.clientY);
    const field=toolMeasurement?.id===gesture.sessionId?toolMeasurement.fields[0]:undefined;
    const exact=field?.exact?parseMeasurement(field.value):undefined;
    const baseDegrees=exact??(field?Number(field.value):gesture.rotationBaseDegrees);
    const safeBase=Number.isFinite(baseDegrees)?baseDegrees:gesture.rotationBaseDegrees;
    const next={...gesture,rotationAxis:axis,rotationDragging:true,rotationPointerId:event.pointerId,rotationLastVector:pointer?.toArray() as [number,number,number]|undefined,rotationLastClientX:event.nativeEvent.clientX,rotationDragStartClient:[event.nativeEvent.clientX,event.nativeEvent.clientY] as [number,number],rotationHadPreviewAtStart:Math.abs(safeBase)>0,rotationBaseDegrees:safeBase};
    setTransformGesture(next);
    if(toolMeasurement?.id===gesture.sessionId){const value=safeBase.toFixed(2);onToolMeasurementChange({...toolMeasurement,rotationAxis:axis,fields:toolMeasurement.fields.map(current=>({...current,value,exact:false,error:undefined})),canPlace:Math.abs(safeBase)>0});}
    onToolError(`Rotating around ${axis.toUpperCase()} · drag the ring and release to place`);
  };
  // Ring drags rotate around the selected workspace axis using ray intersections with its plane.
  useEffect(()=>{
    if(transformGesture?.mode!=='rotate'||!transformGesture.rotationDragging||!transformGesture.rotationAxis)return;
    const move=(event:PointerEvent)=>{
      if(event.pointerId!==transformGesture.rotationPointerId)return;
      const axis=transformGesture.rotationAxis!;
      const centerUm=transformLocalPoint(rotationPivotFor(transformGesture.target,transformGesture.geometry),transformGesture.target.pose,transformGesture.target.scalePpm);
      const center=new THREE.Vector3(...centerUm.map(umToMeters) as [number,number,number]);
      const point=pointerOnAxisPlane(camera,canvas,center,axis,event.clientX,event.clientY);
      const last=transformGesture.rotationLastVector?new THREE.Vector3(...transformGesture.rotationLastVector):undefined;
      let deltaDegrees=0;let nextVector=last;
      if(point&&last){const next=point.clone().sub(center).normalize();const previous=last.clone().sub(center).normalize();const axisVector=new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0);const signedAngle=Math.atan2(axisVector.dot(previous.clone().cross(next)),THREE.MathUtils.clamp(previous.dot(next),-1,1));deltaDegrees=signedAngle*180/Math.PI;nextVector=point;}
      else if(transformGesture.rotationLastClientX!==undefined)deltaDegrees=(event.clientX-transformGesture.rotationLastClientX)*0.9;
      const baseDegrees=transformGesture.rotationBaseDegrees+deltaDegrees;
      const updated={...transformGesture,rotationBaseDegrees:baseDegrees,rotationLastVector:nextVector?.toArray() as [number,number,number]|undefined,rotationLastClientX:event.clientX};
      transformGestureRef.current=updated;setTransformGesture(updated);
      const result=transformResult(updated);
      if(result&&toolMeasurement?.id===updated.sessionId&&!toolMeasurement.fields[0]?.exact){const field=toolMeasurement.fields[0];const value=snap?(Math.round(baseDegrees/15)*15).toFixed(2):result.display;onToolMeasurementChange({...toolMeasurement,fields:[{...field,value}],canPlace:result.valid});}
    };
    const end=(event:PointerEvent)=>{const current=transformGestureRef.current;if(!current||event.pointerId!==current.rotationPointerId)return;const stopped={...current,rotationDragging:false,rotationPointerId:undefined,rotationLastVector:undefined,rotationLastClientX:undefined,rotationDragStartClient:undefined,rotationHadPreviewAtStart:undefined};transformGestureRef.current=stopped;setTransformGesture(stopped);if(event.type==='pointerup'&&transformResult(stopped)?.valid)commitTransform(stopped);};
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',end);
    window.addEventListener('pointercancel',end);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);};
  },[canvas,camera,transformGesture,toolMeasurement,onToolMeasurementChange,transformResult,snap,commitTransform,rotationPivotFor]);
  useEffect(()=>{if(transformGesture&&toolMeasurement?.id===transformGesture.sessionId&&toolMeasurement.fields[0]?.exact){const result=transformResult(transformGesture);if(result&&(result.valid!==toolMeasurement.canPlace||!!toolMeasurement.fields[0]?.error===result.valid))onToolMeasurementChange({...toolMeasurement,canPlace:result.valid,fields:toolMeasurement.fields.map(field=>({...field,error:result.valid?undefined:'Value is outside the supported range'}))});}});
  const measurePreview=(()=>{
    if(activeTool!=='measure'||!measureGesture)return undefined;
    const start=measureGesture.start.clone();const direction=measureGesture.end.clone().sub(start);if(direction.lengthSq()<1e-12)direction.set(1,0,0);else direction.normalize();
    const end=start.clone().addScaledVector(direction,measureValue()/1_000_000);
    return {start:start.toArray() as [number,number,number],end:end.toArray() as [number,number,number]};
  })();
  return <>
    <mesh key={activeTool} position={[0,0,-.002]} onPointerDown={event=>{if(event.button!==0)return;event.stopPropagation();if(activeTool==='measure'){placeMeasurePoint(event);return;}if(['move','rotate','scale'].includes(activeTool)){if(transformGesture){if(transformGesture.mode!=='move')commitTransform({...transformGesture,end:event.point.clone()},event.point.clone());}else beginTransform(event);return;}if(!['line'].includes(activeTool))return;(event.target as unknown as {setPointerCapture?:(id:number)=>void}).setPointerCapture?.(event.pointerId);session.current.begin(event.point.clone());}} onPointerMove={event=>{if(activeTool==='measure')updateMeasurePointer(event);if(['move','rotate','scale'].includes(activeTool))updateTransformPointer(event);}} onPointerUp={event=>{if(activeTool==='line'&&session.current.active)finish(event.point.clone(),event);}} onLostPointerCapture={()=>{session.current.cancel();}} onPointerCancel={()=>{session.current.cancel();if(transformGesture?.mode==='move')cancelTransform();}} onClick={event=>{if(activeTool==='select')onSelect(undefined, event.shiftKey||event.ctrlKey, event.ctrlKey&&event.shiftKey,event.shiftKey&&!event.ctrlKey);}}>
      <planeGeometry args={[200,200]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
    {measurePreview&&<Line points={[measurePreview.start,measurePreview.end]} color="#d18a45" lineWidth={2} dashed dashSize={0.08} gapSize={0.04} raycast={()=>null} />}
    {transformGesture&&(()=>{const result=transformResult();return result?.valid?<TransformPreview design={design} {...result}/>:null;})()}
    {rotationTarget&&rotationGeometry&&(()=>{const center=transformLocalPoint(rotationPivotFor(rotationTarget,rotationGeometry),rotationTarget.pose,rotationTarget.scalePpm).map(umToMeters) as [number,number,number];const selectedAxis=toolMeasurement?.tool==='Rotate'?toolMeasurement.rotationAxis:transformGesture?.mode==='rotate'?transformGesture.rotationAxis:undefined;return <group ref={rotationGizmoRef} position={center} renderOrder={20}>
        <mesh raycast={()=>null}><sphereGeometry args={[.13,12,8]} /><meshBasicMaterial color="#fff4bd" depthTest={false} /></mesh>
        {(['x','y','z'] as const).map((axis,index)=>{const color=axis==='x'?'#ee6666':axis==='y'?'#65c886':'#64b5f6';const radius=1+index*.16;const rotation=axis==='x'?[0,Math.PI/2,0] as [number,number,number]:axis==='y'?[Math.PI/2,0,0] as [number,number,number]:[0,0,0] as [number,number,number];return <group key={axis} rotation={rotation}>
          <mesh raycast={()=>null} renderOrder={21}><torusGeometry args={[radius,.035,8,96]} /><meshBasicMaterial color={selectedAxis===axis?'#fff4bd':color} transparent opacity={selectedAxis===axis?1:.92} depthTest={false} depthWrite={false} /></mesh>
          <mesh onPointerDown={event=>startRotationRingDrag(axis,event)} renderOrder={22}><torusGeometry args={[radius,.2,6,96]} /><meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} /></mesh>
        </group>;})}
      </group>;})()}
    {moveTarget&&moveGeometry&&movePivot&&<group ref={moveGizmoRef} position={movePivot} quaternion={axisMode==='local'?new THREE.Quaternion(...moveTarget.pose.rotation):new THREE.Quaternion()} renderOrder={30}>
      {(['x','y','z'] as const).map(axis=>{
        const color=axis==='x'?'#d94646':axis==='y'?'#289853':'#2676bd';
        const active=resolveMoveConstraint(moveConstraint,transformGesture?.moveAxis,transformGesture?.moveShiftAxis)===axis;
        const rotation=axis==='x'?[0,0,-Math.PI/2] as [number,number,number]:axis==='y'?[0,0,0] as [number,number,number]:[Math.PI/2,0,0] as [number,number,number];
        const onDown=(event:ThreeEvent<PointerEvent>)=>beginMoveAxisDrag(axis,event);
        const stopHandleClick=(event:ThreeEvent<MouseEvent>)=>{if(event.button===0)event.stopPropagation();};
        return <group key={axis} rotation={rotation}>
          <mesh position={[0,.27,0]}><cylinderGeometry args={[.035,.035,.54,8]}/><meshBasicMaterial color={active?'#fff1a8':color} depthTest={false}/></mesh>
          <mesh position={[0,.61,0]}><coneGeometry args={[.095,.2,10]}/><meshBasicMaterial color={active?'#fff1a8':color} depthTest={false}/></mesh>
          {/* Invisible, wider hit target (about 10 px across) so the thin shaft is easy to grab. */}
          <mesh position={[0,.36,0]} userData={{moveAxis:axis}} onPointerDown={onDown} onClick={stopHandleClick}><cylinderGeometry args={[.12,.12,.72,8]}/><meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false}/></mesh>
          <Html position={[0,.83,0]} center style={{pointerEvents:'none'}}><span className={`design-move-axis-label${active?' is-active':''}`} aria-hidden="true">{axis.toUpperCase()}</span></Html>
        </group>;
      })}
    </group>}

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
      ...(design?.definitions.filter(def => !design.instances.some(item => item.definitionId === def.id)).map((def, index) => ({ id: def.id, point: [index * 1.5,0,0] as [number,number,number], radius: def.cutSpec ? Math.hypot(umToMeters(def.cutSpec.lengthUm), umToMeters(def.cutSpec.widthUm), umToMeters(def.cutSpec.thicknessUm)) / 2 : geometryRadius(def.geometry) })) ?? []),
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

export function DesignScene({ rectangleAxis = 'y', rectangleDirection = 'pointer', design, unitSystem, selectedId, selectedCount, selectedElement, editingDefinitionId, editingObjectId, onSelect, onSubSelect, onEnterDefinition, activeTool, snap, exactUm, pivotMode, rotationPivotMode, axisMode, moveConstraint, moveShiftHeld, onCommand, onMeasure, onToolError, preset, projection, grid, axes, frameRequest, toolMeasurement, onToolMeasurementChange, onRegisterMeasurementActions, onContextLoss, onContextRestore }: Props) {
  const definitionById = new Map(design?.definitions.map(d => [d.id, d]) ?? []);
  const placed = new Set(design?.instances.map(i => i.definitionId) ?? []);
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
    {!editingDefinitionId&&design?.definitions.filter(def => !placed.has(def.id)).map((definition, index) => <group key={`${definition.id}-${activeTool}`} position={[index * 1.5,0,0]}><InstanceMesh item={{ id: definition.id, definitionId: definition.id, pose: { positionUm: [0,0,0], rotation: [0,0,0,1] }, scalePpm: [1_000_000,1_000_000,1_000_000], hidden: false, locked: false }} geometry={definition.geometry} cutSpec={definition.cutSpec} selected={selectedId === definition.id} selectedElement={selectedElement?.objectId===definition.id?selectedElement:undefined} onSelect={(event,id,sub)=>selectHit(event,id??definition.id,sub)} pickHit={pickHit} onEnterDefinition={onEnterDefinition} baseColor={definition.appearance.color} tool={activeTool} snap={snap} onCommand={onCommand} exactUm={exactUm} onToolError={onToolError} toolMeasurement={toolMeasurement} onToolMeasurementChange={onToolMeasurementChange} onRegisterMeasurementActions={onRegisterMeasurementActions} unitSystem={unitSystem} /></group>)}
  </Canvas>;
}
