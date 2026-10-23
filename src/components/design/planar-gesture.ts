import type { DesignCommand } from '@/lib/planner/design/commands';
import { rectangleGeometry } from '@/lib/planner/design/geometry';

export type PlanarPoint = readonly [number, number, number];
export type PlanarGestureResult = { command?: DesignCommand; measurementUm?: number };
export function createCapturedPlanarSession<T>() {
  let start: T | undefined;
  return {
    begin(point: T) { start = point; },
    takeEnd(): T | undefined { const point = start; start = undefined; return point; },
    cancel() { start = undefined; },
    get active() { return start !== undefined; },
  };
}
export function createHitCycle() {
  let previous: { ids: string[]; x: number; y: number; at: number; index: number } | undefined;
  return {
    pick(ids: readonly string[], x: number, y: number, at = Date.now()): string | undefined {
      const unique = [...new Set(ids)];
      if (!unique.length) return undefined;
      const repeat = previous && at - previous.at <= 1200 && Math.hypot(x - previous.x, y - previous.y) <= 5 && unique.join('|') === previous.ids.join('|');
      const index = repeat ? ((previous!.index + 1) % unique.length) : 0;
      previous = { ids: unique, x, y, at, index };
      return unique[index];
    },
    reset() { previous = undefined; },
  };
}
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Maps a captured planar gesture to canonical micrometers. Typed values replace the snapped axis value. */
export function buildPlanarGesture(tool: 'line'|'rectangle'|'measure', start: PlanarPoint, end: PlanarPoint, snap: boolean, exactUm?: number, exactRectangleUm?: readonly [number,number]): PlanarGestureResult {
  const snapPoint = (point: PlanarPoint): PlanarPoint => snap ? [Math.round(point[0]/10_000)*10_000, Math.round(point[1]/10_000)*10_000, 0] : point;
  const a=snapPoint(start),b=snapPoint(end);
  const dx=Math.abs(b[0]-a[0]),dy=Math.abs(b[1]-a[1]);
  if(tool==='measure')return {measurementUm:Math.round(Math.hypot(dx,dy))};
  if(tool==='line'){
    const length=exactUm??Math.round(Math.hypot(dx,dy));if(length<=0)return {};
    const vertexIds:[string,string]=[`v-${uid()}-a`,`v-${uid()}-b`];
    return {command:{type:'create-loose',object:{id:`line-${uid()}`,name:'Line',geometry:{vertices:[{id:vertexIds[0],positionUm:[0,0,0]},{id:vertexIds[1],positionUm:[length,0,0]}],edges:[{id:`edge-${uid()}`,vertexIds}],faces:[],extrusions:[]},pose:{positionUm:[a[0],a[1],0],rotation:[0,0,0,1]},scalePpm:[1_000_000,1_000_000,1_000_000],appearance:{color:'#bd8a56'},hidden:false,locked:false}}};
  }
  if(exactRectangleUm && exactRectangleUm.some(value=>!Number.isFinite(value)||value<=0))return {};
  if((dx<=0||dy<=0)&&!exactRectangleUm)return {};
  const geometry=rectangleGeometry(exactRectangleUm?.[0]??exactUm??dx,exactRectangleUm?.[1]??dy,p=>`${p}-${uid()}`);
  // Geometry is authored in its local XY plane. Rotate it onto the world XZ
  // floor so its local +Z extrusion axis points up along world +Y.
  const half = Math.SQRT1_2;
  const width=exactRectangleUm?.[0]??exactUm??dx,depth=exactRectangleUm?.[1]??dy;
  const directionX=Math.sign(b[0]-a[0])||1,directionY=Math.sign(b[1]-a[1])||1;
  const endX=a[0]+directionX*width,endY=a[1]+directionY*depth;
  return {command:{type:'create-loose',object:{id:`rectangle-${uid()}`,name:'Rectangle',geometry,pose:{positionUm:[Math.min(a[0],endX),0,Math.max(a[1],endY)],rotation:[-half,0,0,half]},scalePpm:[1_000_000,1_000_000,1_000_000],appearance:{color:'#bd8a56'},hidden:false,locked:false}}};
}
