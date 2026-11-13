import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import type { DesignDocumentV1, Geometry, Instance, LooseObject } from '@/lib/planner/design/schema';
import type { UnitSystem } from '@/lib/planner/model';
import { getRectangularProfile, umToMeters } from '@/lib/planner/design/geometry';
import type { DesignCommand } from '@/lib/planner/design/commands';
import { resolveSubElement, type SubElement } from '../sub-selection';
import { buildModelGeometry } from './mesh-geometry';
import type { ToolMeasurementSession } from '../tool-measurements';
import { usePushPull } from './usePushPull';

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

export function InstanceMesh({ item, geometry, cutSpec, selected, selectedElement, onSelect, onEnterDefinition, baseColor, tool, snap, onCommand, exactUm, onToolError, pickHit,toolMeasurement,onToolMeasurementChange,onRegisterMeasurementActions,unitSystem,componentEditMode=false }: { item:Instance|LooseObject; geometry:Geometry; cutSpec?:DesignDocumentV1['definitions'][number]['cutSpec']; selected:boolean; selectedElement?:SubElement; onSelect:(event:ThreeEvent<MouseEvent>,targetId?:string,subElement?:SubElement)=>void; onEnterDefinition:(id:string)=>void; baseColor?:string; tool:string; snap:boolean; onCommand:(command:DesignCommand)=>void; exactUm?:number; onToolError:(message:string)=>void; pickHit:(event:ThreeEvent<MouseEvent>,fallbackId:string)=>string; toolMeasurement?:ToolMeasurementSession; onToolMeasurementChange:(session?:ToolMeasurementSession)=>void; onRegisterMeasurementActions:(actions?:{commit:()=>void;cancel:()=>void})=>void; unitSystem:UnitSystem; componentEditMode?:boolean }) {
  const {camera,size}=useThree();
  const { pushPullPreview, primitiveDimensionPreview, primitiveFaceIndicator, profileFaceIndicator, primitiveActiveFace, pushPullActive, canShowDotFace, setPrimitiveFaceIndicator, setProfileFaceIndicator, pushPullPointerDown, pushPullPointerMove } = usePushPull({ item, geometry, cutSpec, tool, snap, onCommand, exactUm, onToolError, toolMeasurement, onToolMeasurementChange, onRegisterMeasurementActions, unitSystem, componentEditMode });
  const dotFace=canShowDotFace?(pushPullActive?primitiveActiveFace:primitiveFaceIndicator):undefined;const dotDims=primitiveDimensionPreview??cutSpec;const dotWidth=dotFace?.axis==='x'?dotDims?.thicknessUm:dotFace?.axis==='y'?dotDims?.lengthUm:dotDims?.lengthUm;const dotHeight=dotFace?.axis==='x'?dotDims?.widthUm:dotFace?.axis==='y'?dotDims?.thicknessUm:dotDims?.widthUm;
  const primitiveDotTexture=useMemo(()=>createDotTexture(),[]);const boxRef=useRef<THREE.Mesh>(null);
  useEffect(()=>()=>primitiveDotTexture.dispose(),[primitiveDotTexture]);
  useFrame(()=>{if(!dotFace||!boxRef.current)return;const worldPosition=boxRef.current.getWorldPosition(new THREE.Vector3());const scale=boxRef.current.getWorldScale(new THREE.Vector3());const planeScale=dotFace.axis==='x'?[scale.z,scale.y]:dotFace.axis==='y'?[scale.x,scale.z]:[scale.x,scale.y];const pitch=dotSpacingWorld(camera,worldPosition,size.height);primitiveDotTexture.repeat.set(Math.max(1,umToMeters(dotWidth??1)*planeScale[0]/pitch),Math.max(1,umToMeters(dotHeight??1)*planeScale[1]/pitch));});
  const position = item.pose.positionUm.map(umToMeters) as [number, number, number];
  const quaternion = item.pose.rotation as [number, number, number, number];
  const scale = item.scalePpm.map(v => v / 1_000_000) as [number, number, number];
  const [hovered, setHovered] = useState(false);
  const invalid = cutSpec?.confirmation === 'requires-confirmation';
  const color = invalid ? '#c56b62' : item.locked ? colors.locked : selected ? colors.selected : hovered ? colors.hover : baseColor ?? ('appearance' in item && item.appearance ? item.appearance.color : colors.board);
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

