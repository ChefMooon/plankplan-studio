import type { Geometry, Pose, ScalePpm, Vec3Um } from './schema';

export const DESIGN_LIMIT_UM = 1_000_000_000;
export const GEOMETRY_TOLERANCE_UM = 1;
export const IDENTITY_POSE: Pose = { positionUm: [0, 0, 0], rotation: [0, 0, 0, 1] };
export const IDENTITY_SCALE: ScalePpm = [1_000_000, 1_000_000, 1_000_000];
export const umToMeters = (um: number) => um / 1_000_000;
export const roundSignedUm = (value:number) => Math.sign(value)*Math.floor(Math.abs(value)+0.5);
export const metersToUm = (meters: number) => {
  if (!Number.isFinite(meters)) throw new Error('Coordinate must be finite');
  const rounded = roundSignedUm(meters * 1_000_000);
  if (!Number.isSafeInteger(rounded) || Math.abs(rounded) > DESIGN_LIMIT_UM) throw new Error('Coordinate is outside design bounds');
  return rounded;
};
export const roundPositiveUm = (value: number) => {
  if (!Number.isFinite(value) || value <= 0 || value > DESIGN_LIMIT_UM + 0.5) throw new Error('Dimension is outside design bounds');
  return Math.floor(value + 0.5);
};
export const scaleDimensionUm = (dimensionUm: number, scalePpm: number) => {
  if(!Number.isSafeInteger(dimensionUm)||dimensionUm<=0||dimensionUm>DESIGN_LIMIT_UM||!Number.isSafeInteger(scalePpm)||scalePpm<1||scalePpm>1_000_000_000)throw new Error('Invalid scaled dimension');
  const result=(BigInt(dimensionUm)*BigInt(scalePpm)+500_000n)/1_000_000n;
  if(result<1n||result>BigInt(DESIGN_LIMIT_UM))throw new Error('Dimension is outside design bounds');
  return Number(result);
};

export function normalizeQuaternion(q: readonly number[]): [number, number, number, number] {
  if (q.length !== 4 || q.some(v => !Number.isFinite(v))) throw new Error('Invalid quaternion');
  const n = Math.hypot(...q);
  if (!Number.isFinite(n)||n < Number.EPSILON) throw new Error('Invalid quaternion');
  return q.map(v => v / n) as [number, number, number, number];
}

export function transformLocalPoint(point: Vec3Um, pose: Pose, scale: ScalePpm): Vec3Um {
  if(!Array.isArray(point)||point.length!==3||point.some(v=>!Number.isSafeInteger(v)||Math.abs(v)>DESIGN_LIMIT_UM)||!Array.isArray(pose.positionUm)||pose.positionUm.length!==3||pose.positionUm.some(v=>!Number.isSafeInteger(v)||Math.abs(v)>DESIGN_LIMIT_UM)||!Array.isArray(scale)||scale.length!==3||scale.some(v=>!Number.isSafeInteger(v)||v<1||v>1_000_000_000))throw new Error('Invalid transform input');
  const [x, y, z] = point.map((v, i) => v * scale[i] / 1_000_000);
  const [qx, qy, qz, qw] = normalizeQuaternion(pose.rotation);
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  const out: Vec3Um = [x + qw * tx + qy * tz - qz * ty + pose.positionUm[0], y + qw * ty + qz * tx - qx * tz + pose.positionUm[1], z + qw * tz + qx * ty - qy * tx + pose.positionUm[2]];
  return out.map(v => {
    const rounded = roundSignedUm(v);
    if (!Number.isSafeInteger(rounded) || Math.abs(rounded) > DESIGN_LIMIT_UM) throw new Error('Transformed coordinate is outside design bounds');
    return rounded;
  }) as Vec3Um;
}

export function scalePoseKeepingLocalPivot(pose:Pose,oldScale:ScalePpm,newScale:ScalePpm,localPivot:Vec3Um):Pose {
  const oldWorld=transformLocalPoint(localPivot,pose,oldScale),newWorld=transformLocalPoint(localPivot,pose,newScale);
  const positionUm=pose.positionUm.map((position,index)=>position+oldWorld[index]-newWorld[index]) as Vec3Um;
  if(positionUm.some(value=>!Number.isSafeInteger(value)||Math.abs(value)>DESIGN_LIMIT_UM))throw new Error('Pivoted scale is outside design bounds');
  return {...pose,positionUm};
}

const cross = (a: Vec3Um, b: Vec3Um, c: Vec3Um): [bigint, bigint, bigint] => [BigInt(b[1]-a[1])*BigInt(c[2]-a[2])-BigInt(b[2]-a[2])*BigInt(c[1]-a[1]), BigInt(b[2]-a[2])*BigInt(c[0]-a[0])-BigInt(b[0]-a[0])*BigInt(c[2]-a[2]), BigInt(b[0]-a[0])*BigInt(c[1]-a[1])-BigInt(b[1]-a[1])*BigInt(c[0]-a[0])];
const orient2 = (a: readonly number[], b: readonly number[], c: readonly number[]) => BigInt(b[0]-a[0])*BigInt(c[1]-a[1])-BigInt(b[1]-a[1])*BigInt(c[0]-a[0]);
function segmentsCross(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]) {
  const o1=orient2(a,b,c), o2=orient2(a,b,d), o3=orient2(c,d,a), o4=orient2(c,d,b);
  const on=(p:readonly number[],q:readonly number[],r:readonly number[])=>orient2(p,q,r)===0n&&r[0]>=Math.min(p[0],q[0])&&r[0]<=Math.max(p[0],q[0])&&r[1]>=Math.min(p[1],q[1])&&r[1]<=Math.max(p[1],q[1]);
  return (o1 > 0n && o2 < 0n || o1 < 0n && o2 > 0n) && (o3 > 0n && o4 < 0n || o3 < 0n && o4 > 0n) || on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}

export function validateGeometryTopology(geometry: Geometry): string[] {
  const errors: string[] = [], vertices = new Map(geometry.vertices.map(v => [v.id, v.positionUm]));
  const edges = new Set<string>();
  for (const edge of geometry.edges) {
    if (edge.vertexIds[0] === edge.vertexIds[1] || !vertices.has(edge.vertexIds[0]) || !vertices.has(edge.vertexIds[1])) errors.push(`edge:${edge.id}:reference`);
    const key = [...edge.vertexIds].sort().join('\0'); if (edges.has(key)) errors.push(`edge:${edge.id}:duplicate`); edges.add(key);
  }
  const extruded = new Set<string>();
  for (const e of geometry.extrusions) { if (extruded.has(e.faceId)) errors.push(`extrusion:${e.id}:duplicate-face`); extruded.add(e.faceId); }
  for (const face of geometry.faces) {
    const points = face.vertexIds.map(id => vertices.get(id));
    if (points.length < 3 || new Set(face.vertexIds).size !== face.vertexIds.length || points.some(p => !p)) { errors.push(`face:${face.id}:loop`); continue; }
    const p = points as Vec3Um[];
    let normal: [bigint,bigint,bigint] = [0n,0n,0n];
    for(let i=0;i<p.length;i++){ const n=cross([0,0,0],p[i],p[(i+1)%p.length]); normal=[normal[0]+n[0],normal[1]+n[1],normal[2]+n[2]]; }
    const absNormal=normal.map(n=>n<0n?-n:n); const axis = absNormal.indexOf(absNormal.reduce((a,b)=>a>b?a:b));
    if (normal.every(n => n === 0n)) { errors.push(`face:${face.id}:degenerate`); continue; }
    const base=p[0]; if(p.some(v=>{const dot=BigInt(v[0]-base[0])*normal[0]+BigInt(v[1]-base[1])*normal[1]+BigInt(v[2]-base[2])*normal[2];return dot*dot>BigInt(GEOMETRY_TOLERANCE_UM)**2n*(normal[0]*normal[0]+normal[1]*normal[1]+normal[2]*normal[2]);})) errors.push(`face:${face.id}:nonplanar`);
    const project=(v:Vec3Um):number[]=>axis===0?[v[1],v[2]]:axis===1?[v[0],v[2]]:[v[0],v[1]];
    const q=p.map(project); let area=0n; for(let i=0;i<q.length;i++)area+=BigInt(q[i][0])*BigInt(q[(i+1)%q.length][1])-BigInt(q[(i+1)%q.length][0])*BigInt(q[i][1]);
    if(area===0n)errors.push(`face:${face.id}:degenerate`);
    for(let i=0;i<q.length;i++) for(let j=i+1;j<q.length;j++) { if(j===i+1 || i===0&&j===q.length-1) continue; if(segmentsCross(q[i],q[(i+1)%q.length],q[j],q[(j+1)%q.length]))errors.push(`face:${face.id}:self-intersection`); }
    for(let i=0;i<p.length;i++) if(!edges.has([face.vertexIds[i],face.vertexIds[(i+1)%p.length]].sort().join('\0'))) errors.push(`face:${face.id}:open`);
  }
  for(const e of geometry.extrusions) if(!geometry.faces.some(f=>f.id===e.faceId)||!Number.isSafeInteger(e.distanceUm)||!e.distanceUm||Math.abs(e.distanceUm)>DESIGN_LIMIT_UM) errors.push(`extrusion:${e.id}:invalid`);
  return [...new Set(errors)];
}

export function rectangleGeometry(lengthUm: number, widthUm: number, ids: (prefix: string) => string, extrusionUm?:number): Geometry {
  if (![lengthUm,widthUm].every(n=>Number.isSafeInteger(n)&&n>0&&n<=DESIGN_LIMIT_UM)||extrusionUm!==undefined&&(!Number.isSafeInteger(extrusionUm)||extrusionUm<=0||extrusionUm>DESIGN_LIMIT_UM)) throw new Error('Rectangle dimensions must be positive bounded integers');
  const vertexIds=[ids('v'),ids('v'),ids('v'),ids('v')];
  const geometry: Geometry={vertices:[{id:vertexIds[0],positionUm:[0,0,0]},{id:vertexIds[1],positionUm:[lengthUm,0,0]},{id:vertexIds[2],positionUm:[lengthUm,widthUm,0]},{id:vertexIds[3],positionUm:[0,widthUm,0]}],edges:[],faces:[{id:ids('f'),vertexIds}],extrusions:[]};
  geometry.edges=vertexIds.map((id,i)=>({id:ids('e'),vertexIds:[id,vertexIds[(i+1)%4]]}));
  if(extrusionUm!==undefined)geometry.extrusions.push({id:ids('x'),faceId:geometry.faces[0].id,distanceUm:extrusionUm});
  return geometry;
}

export function setExtrusionDistance(geometry: Geometry, faceId: string, distanceUm: number, id: string): Geometry {
  if (!Number.isSafeInteger(distanceUm)||!distanceUm||Math.abs(distanceUm)>DESIGN_LIMIT_UM) throw new Error('Extrusion distance must be nonzero and bounded');
  if (!geometry.faces.some(f=>f.id===faceId)) throw new Error('Extrusion face does not exist');
  const prior=geometry.extrusions.find(e=>e.faceId===faceId);if(prior&&Math.sign(prior.distanceUm)!==Math.sign(distanceUm))throw new Error('Extrusion cap cannot cross its base');
  const next: Geometry={...geometry,extrusions:[...geometry.extrusions.filter(e=>e.faceId!==faceId),{id,faceId,distanceUm}]};
  const errors=validateGeometryTopology(next); if(errors.length)throw new Error(errors[0]); return next;
}

export type RectangularProfile = { minX:number;maxX:number;minY:number;maxY:number;z:number;faceId:string;depthUm?:number;extrusionId?:string };
export function getRectangularProfile(geometry:Geometry):RectangularProfile|undefined {
  if(geometry.vertices.length!==4||geometry.edges.length!==4||geometry.faces.length!==1||geometry.extrusions.length>1)return;
  const face=geometry.faces[0],extrusion=geometry.extrusions[0];if(face.vertexIds.length!==4||new Set(face.vertexIds).size!==4||face.vertexIds.some(id=>!geometry.vertices.some(vertex=>vertex.id===id))||extrusion&&extrusion.faceId!==face.id)return;
  const points=geometry.vertices.map(vertex=>vertex.positionUm);const z=points[0][2];if(points.some(point=>point[2]!==z))return;
  const xs=[...new Set(points.map(point=>point[0]))].sort((a,b)=>a-b),ys=[...new Set(points.map(point=>point[1]))].sort((a,b)=>a-b);if(xs.length!==2||ys.length!==2)return;
  const corners=new Set(points.map(point=>`${point[0]},${point[1]}`));if(corners.size!==4||points.some(point=>!xs.includes(point[0])||!ys.includes(point[1])))return;
  const edges=new Set(geometry.edges.map(edge=>edge.vertexIds.slice().sort().join('|')));if(edges.size!==4||geometry.edges.some(edge=>!edge.vertexIds.every(id=>geometry.vertices.some(vertex=>vertex.id===id))))return;
  const expected=new Set<string>();for(let i=0;i<4;i++){const a=face.vertexIds[i],b=face.vertexIds[(i+1)%4];if(!a||!b)return;expected.add([a,b].sort().join('|'));}if(expected.size!==4||[...expected].some(edge=>!edges.has(edge)))return;
  return {minX:xs[0],maxX:xs[1],minY:ys[0],maxY:ys[1],z,faceId:face.id,...(extrusion?{depthUm:Math.abs(extrusion.distanceUm),extrusionId:extrusion.id}:{})};
}

export function resizeRectangularProfile(geometry:Geometry,dimensions:{lengthUm:number;widthUm:number;depthUm?:number},anchor?:{axis:'x'|'y'|'z';side:-1|1},extrusionId='rectangle-resize'):Geometry {
  const rect=getRectangularProfile(geometry);if(!rect)throw new Error('Unsupported rectangular profile');
  if(![dimensions.lengthUm,dimensions.widthUm,...(dimensions.depthUm===undefined?[]:[dimensions.depthUm])].every(value=>Number.isSafeInteger(value)&&value>0&&value<=DESIGN_LIMIT_UM))throw new Error('Rectangle dimensions must be positive bounded integers');
  const oldLength=rect.maxX-rect.minX,oldWidth=rect.maxY-rect.minY;if(!oldLength||!oldWidth)throw new Error('Unsupported rectangular profile');
  let minX=rect.minX,maxX=rect.maxX,minY=rect.minY,maxY=rect.maxY;
  if(anchor?.axis==='x'&&anchor.side===-1)minX=maxX-dimensions.lengthUm;else maxX=minX+dimensions.lengthUm;
  if(anchor?.axis==='y'&&anchor.side===-1)minY=maxY-dimensions.widthUm;else maxY=minY+dimensions.widthUm;
  if([minX,maxX,minY,maxY].some(value=>!Number.isSafeInteger(value)||Math.abs(value)>DESIGN_LIMIT_UM))throw new Error('Rectangle dimensions exceed design bounds');
  const vertices=geometry.vertices.map(vertex=>({...vertex,positionUm:[vertex.positionUm[0]===rect.minX?minX:maxX,vertex.positionUm[1]===rect.minY?minY:maxY,rect.z] as [number,number,number]}));
  let extrusions=geometry.extrusions;
  if(dimensions.depthUm!==undefined){if(rect.depthUm!==undefined){const source=geometry.extrusions[0];extrusions=[{...source,distanceUm:Math.sign(source.distanceUm)*dimensions.depthUm}];}else extrusions=[{id:extrusionId,faceId:rect.faceId,distanceUm:dimensions.depthUm}];}
  if(anchor?.axis==='z'&&rect.depthUm===undefined)throw new Error('A flat profile has no opposite extrusion face to anchor');
  const next={...geometry,vertices,extrusions};const errors=validateGeometryTopology(next);if(errors.length)throw new Error(errors[0]);return next;
}

export function rectangularProfileSide(geometry:Geometry,point:readonly [number,number,number],normal:readonly [number,number,number],toleranceUm=2_000):{axis:'x'|'y';side:-1|1}|undefined {
  const rect=getRectangularProfile(geometry);if(!rect?.depthUm)return;
  const xAxis=Math.abs(normal[0])>0.8&&Math.abs(normal[0])>Math.abs(normal[1])&&Math.abs(normal[0])>Math.abs(normal[2]);
  const yAxis=Math.abs(normal[1])>0.8&&Math.abs(normal[1])>Math.abs(normal[0])&&Math.abs(normal[1])>Math.abs(normal[2]);if(!xAxis&&!yAxis)return;
  const axis=xAxis?'x':'y',side=(Math.sign(normal[xAxis?0:1])||1) as -1|1,expected=xAxis?(side>0?rect.maxX:rect.minX):(side>0?rect.maxY:rect.minY),coordinate=point[xAxis?0:1]*1_000_000;
  return Math.abs(coordinate-expected)<=toleranceUm?{axis,side}:undefined;
}
