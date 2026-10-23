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
