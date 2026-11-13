import { useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { DesignDocumentV1 } from '@/lib/planner/design/schema';
import type { DesignCommand } from '@/lib/planner/design/commands';
import { metersToUm } from '@/lib/planner/design/geometry';
import { buildPlanarGesture, createCapturedPlanarSession } from '../planar-gesture';

type Options = { design?: DesignDocumentV1; selectedId?: string; selectedCount?: number; editingDefinitionId?: string; snap: boolean; exactUm?: number; onCommand: (command: DesignCommand) => void; onToolError: (message: string) => void };

export function useLineDrawing({ design, selectedId, selectedCount, editingDefinitionId, snap, exactUm, onCommand, onToolError }: Options) {
  const session=useRef(createCapturedPlanarSession<THREE.Vector3>());
  const begin=(event:ThreeEvent<PointerEvent>)=>{(event.target as unknown as {setPointerCapture?:(id:number)=>void}).setPointerCapture?.(event.pointerId);session.current.begin(event.point.clone());};
  const finish=(event:ThreeEvent<PointerEvent>)=>{
    if(!session.current.active)return;
    event.stopPropagation();
    const b=event.point.clone();const a=session.current.takeEnd()??b;
  const from:[number,number,number]=[metersToUm(a.x),metersToUm(a.y),0],to:[number,number,number]=[metersToUm(b.x),metersToUm(b.y),0];
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
  const result=buildPlanarGesture('line',from,to,snap&&!event.nativeEvent.altKey,exactUm);if(result.command)onCommand(result.command);
  };
  return { begin, finish, cancel:()=>session.current.cancel() };
}
