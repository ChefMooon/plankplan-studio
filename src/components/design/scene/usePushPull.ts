import { useEffect, useRef, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { DesignDocumentV1, Geometry, Instance, LooseObject } from '@/lib/planner/design/schema';
import type { UnitSystem } from '@/lib/planner/model';
import { getRectangularProfile, rectangularProfileSide, resizeRectangularProfile, setExtrusionDistance } from '@/lib/planner/design/geometry';
import type { DesignCommand } from '@/lib/planner/design/commands';
import { resolveSubElement } from '../sub-selection';
import { isPushPullEndFace, rectangularPushPullFace, shouldShowPushPullFaceIndicator } from '../push-pull';
import { parseMeasurement, type ToolMeasurementSession } from '../tool-measurements';

function hitFaceNormalLocal(event:ThreeEvent<PointerEvent>):[number,number,number] {
  const normal=event.face?.normal.clone()??new THREE.Vector3(0,0,1);
  const origin=event.object.worldToLocal(event.ray.origin.clone());
  const rayEnd=event.object.worldToLocal(event.ray.origin.clone().add(event.ray.direction));
  if(rayEnd.sub(origin).dot(normal)>0)normal.negate();
  return normal.toArray() as [number,number,number];
}

type PushPullProps = {
  item: Instance | LooseObject;
  geometry: Geometry;
  cutSpec?: DesignDocumentV1['definitions'][number]['cutSpec'];
  tool: string;
  snap: boolean;
  onCommand: (command: DesignCommand) => void;
  exactUm?: number;
  onToolError: (message: string) => void;
  toolMeasurement?: ToolMeasurementSession;
  onToolMeasurementChange: (session?: ToolMeasurementSession) => void;
  onRegisterMeasurementActions: (actions?: { commit: () => void; cancel: () => void }) => void;
  unitSystem: UnitSystem;
  componentEditMode: boolean;
};

export function usePushPull({ item, geometry, cutSpec, tool, snap, onCommand, exactUm, onToolError, toolMeasurement, onToolMeasurementChange, onRegisterMeasurementActions, unitSystem, componentEditMode }: PushPullProps) {
  const { camera, size, gl } = useThree();
  const pushPullRef=useRef<{faceId:string;startX:number;startY:number;screenDirection:[number,number];baseDistance:number;worldPerPixel:number;primitive:boolean;profileSide:boolean;anchor?:{axis:'x'|'y'|'z';side:-1|1};sessionId:string}|undefined>(undefined);
  const lastPointer=useRef<[number,number]>([0,0]);
  const [pushPullPreview,setPushPullPreview]=useState<Geometry>();
  const [primitiveDimensionPreview,setPrimitiveDimensionPreview]=useState<{lengthUm:number;widthUm:number;thicknessUm:number}>();
  const [primitiveFaceIndicator,setPrimitiveFaceIndicator]=useState<{axis:'x'|'y'|'z';side:-1|1}>();
  const [profileFaceIndicator,setProfileFaceIndicator]=useState<{axis:'x'|'y'|'z';side:-1|1}>();
  const [primitiveActiveFace,setPrimitiveActiveFace]=useState<{axis:'x'|'y'|'z';side:-1|1}>();
  const [pushPullActive,setPushPullActive]=useState(false);
  const canShowDotFace=shouldShowPushPullFaceIndicator(geometry,cutSpec?.confirmation,tool);
  const previewAtRef=useRef<(clientX:number,clientY:number)=>void>(()=>{});
  const commitAtRef=useRef<(clientX:number,clientY:number)=>void>(()=>{});
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
  return { pushPullPreview, primitiveDimensionPreview, primitiveFaceIndicator, profileFaceIndicator, primitiveActiveFace, pushPullActive, canShowDotFace, setPrimitiveFaceIndicator, setProfileFaceIndicator, pushPullPointerDown, pushPullPointerMove };
}
