import type { Geometry } from '@/lib/planner/design/schema';
import { umToMeters } from '@/lib/planner/design/geometry';

export type SubElement = { type: 'face'|'edge'|'vertex'; id: string };
export function resolveSubElement(geometry:Geometry, point:readonly [number,number,number], edgeToleranceM=0.008):SubElement|undefined {
  const vertices=new Map(geometry.vertices.map(vertex=>[vertex.id,vertex.positionUm.map(umToMeters) as [number,number,number]]));
  let nearestEdge:{id:string;distance:number}|undefined;
  for(const edge of geometry.edges){const a=vertices.get(edge.vertexIds[0]),b=vertices.get(edge.vertexIds[1]);if(!a||!b)continue;const ab=b.map((value,index)=>value-a[index]);const ap=point.map((value,index)=>value-a[index]);const denominator=ab.reduce((sum,value)=>sum+value*value,0)||1;const t=Math.max(0,Math.min(1,ap.reduce((sum,value,index)=>sum+value*ab[index],0)/denominator));const distance=Math.hypot(...point.map((value,index)=>value-(a[index]+ab[index]*t)));if(!nearestEdge||distance<nearestEdge.distance)nearestEdge={id:edge.id,distance};}
  if(nearestEdge&&nearestEdge.distance<edgeToleranceM)return {type:'edge',id:nearestEdge.id};
  let nearestFace:{id:string;distance:number}|undefined;
  for(const face of geometry.faces){const points=face.vertexIds.map(id=>vertices.get(id)).filter((value):value is [number,number,number]=>!!value);if(points.length<3)continue;const a=points[0],u=points[1].map((value,index)=>value-a[index]),v=points[2].map((value,index)=>value-a[index]);const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];const length=Math.hypot(...normal)||1;const distance=Math.abs(normal.reduce((sum,value,index)=>sum+value*(point[index]-a[index]),0))/length;if(!nearestFace||distance<nearestFace.distance)nearestFace={id:face.id,distance};}
  return nearestFace?{type:'face',id:nearestFace.id}:undefined;
}
