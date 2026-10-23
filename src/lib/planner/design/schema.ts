import type { Part } from '../model';
import { scaleDimensionUm, transformLocalPoint, validateGeometryTopology } from './geometry';

export type Issue = { code: string; path: string; severity: 'error' | 'warning' };
export type Vec3Um = [number, number, number];
export type Pose = { positionUm: Vec3Um; rotation: [number, number, number, number] };
export type ScalePpm = [number, number, number];
export type Appearance = { color: string; opacity?: number };
export type Geometry = { vertices: { id: string; positionUm: Vec3Um }[]; edges: { id: string; vertexIds: [string, string] }[]; faces: { id: string; vertexIds: string[] }[]; extrusions: { id: string; faceId: string; distanceUm: number }[] };
export type CutSpec = { kind: 'board' | 'panel' | 'explicit'; lengthUm: number; widthUm: number; thicknessUm: number; grainAxis: 'length' | 'width' | 'none'; confirmation: 'confirmed' | 'requires-confirmation' };
export type Sources = { definitionId: string; instanceIds: string[] };
export type ProjectionSnapshot = { sources: Sources; fields: Pick<Part, 'name' | 'materialId' | 'length' | 'width' | 'crossSection' | 'grainLocked' | 'quantity'> };
export type LinkReason = 'source-deleted' | 'definition-edited' | 'instance-scaled' | 'material-changed' | 'made-unique' | 'part-deleted';
export type ActiveLink = { state: 'active'; current: Sources; lastApplied: ProjectionSnapshot };
export type PendingLink = { state: 'pending-removal' | 'pending-reconcile' | 'pending-part-deletion'; reasons: LinkReason[]; current?: Sources; lastApplied: ProjectionSnapshot };
export type DesignDocumentV1 = { schemaVersion: 1; definitions: Definition[]; instances: Instance[]; looseObjects: LooseObject[]; partLinks: Record<string, ActiveLink | PendingLink> };
export type Definition = { id: string; name: string; geometry: Geometry; cutSpec?: CutSpec; materialId?: string; appearance: Appearance };
export type Instance = { id: string; definitionId: string; name?: string; pose: Pose; scalePpm: ScalePpm; hidden: boolean; locked: boolean; projectionExcluded?: true; materialId?: string; appearance?: Appearance };
export type LooseObject = { id: string; name: string; geometry: Geometry; pose: Pose; scalePpm: ScalePpm; appearance: Appearance; hidden: boolean; locked: boolean };

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[], path: string, issues: Issue[]) => { for (const k of Object.keys(v)) if (!allowed.includes(k)) issues.push({ code: 'unknown-field', path: `${path}.${k}`, severity: 'error' }); };
const integer = (v: unknown, min: number, max: number) => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;

export function validateDesignDocument(value: unknown, projectParts: Part[], materialIds: Set<string>, basePath = 'design'): Issue[] {
  const issues: Issue[] = [];
  const issue = (code: string, path: string) => issues.push({ code, path, severity: 'error' });
  if (!record(value)) return [{ code: 'invalid-record', path: basePath, severity: 'error' }];
  keys(value, ['schemaVersion', 'definitions', 'instances', 'looseObjects', 'partLinks'], basePath, issues);
  if (value.schemaVersion !== 1) issue('unsupported-design-version', `${basePath}.schemaVersion`);
  for (const field of ['definitions', 'instances', 'looseObjects'] as const) if (!Array.isArray(value[field])) issue('invalid-array', `${basePath}.${field}`);
  const defs = Array.isArray(value.definitions) ? value.definitions : [];
  const instances = Array.isArray(value.instances) ? value.instances : [];
  const loose = Array.isArray(value.looseObjects) ? value.looseObjects : [];
  if (defs.length > 1000 || instances.length > 5000 || loose.length > 1000) issue('count-limit', basePath);
  const ids = (rows: unknown[], path: string) => {
    const found = new Set<string>();
    rows.forEach((r, i) => { if (!record(r) || typeof r.id !== 'string' || !r.id || r.id.length > 128 || found.has(r.id)) issue('invalid-or-duplicate-id', `${path}[${i}].id`); else found.add(r.id); });
    return found;
  };
  const defIds = ids(defs, `${basePath}.definitions`); ids(instances, `${basePath}.instances`); ids(loose, `${basePath}.looseObjects`);
  let totalVertices=0,totalEdges=0,totalFaces=0,totalExtrusions=0;
  const validateGeometry = (g: unknown, path: string) => {
    if (!record(g)) { issue('invalid-geometry', path); return; }
    keys(g, ['vertices', 'edges', 'faces', 'extrusions'], path, issues);
    for (const key of ['vertices', 'edges', 'faces', 'extrusions']) if (!Array.isArray(g[key])) issue('invalid-array', `${path}.${key}`);
    const vertices = Array.isArray(g.vertices) ? g.vertices : [], edges = Array.isArray(g.edges) ? g.edges : [], faces = Array.isArray(g.faces) ? g.faces : [], extrusions = Array.isArray(g.extrusions) ? g.extrusions : [];
    totalVertices+=vertices.length;totalEdges+=edges.length;totalFaces+=faces.length;totalExtrusions+=extrusions.length;
    const vIds = ids(vertices, `${path}.vertices`), fIds = ids(faces, `${path}.faces`);ids(edges,`${path}.edges`);ids(extrusions,`${path}.extrusions`);
    vertices.forEach((v, i) => { const p=`${path}.vertices[${i}]`;if(record(v))keys(v,['id','positionUm'],p,issues);if (!record(v) || !Array.isArray(v.positionUm) || v.positionUm.length !== 3 || !v.positionUm.every(n => integer(n, -1_000_000_000, 1_000_000_000))) issue('invalid-position', `${p}.positionUm`); });
    edges.forEach((e, i) => { const p=`${path}.edges[${i}]`;if(record(e))keys(e,['id','vertexIds'],p,issues);if (!record(e) || !Array.isArray(e.vertexIds) || e.vertexIds.length !== 2 || e.vertexIds[0] === e.vertexIds[1] || !e.vertexIds.every(id => typeof id === 'string' && vIds.has(id))) issue('invalid-edge-reference', p); });
    faces.forEach((f, i) => { const p=`${path}.faces[${i}]`;if(record(f))keys(f,['id','vertexIds'],p,issues);if (!record(f) || !Array.isArray(f.vertexIds) || f.vertexIds.length < 3 || f.vertexIds.length > 512 || new Set(f.vertexIds).size !== f.vertexIds.length || !f.vertexIds.every(id => typeof id === 'string' && vIds.has(id))) issue('invalid-face-loop', p); });
    extrusions.forEach((e, i) => { const p=`${path}.extrusions[${i}]`;if(record(e))keys(e,['id','faceId','distanceUm'],p,issues);if (!record(e) || !fIds.has(String(e.faceId)) || !integer(e.distanceUm, -1_000_000_000, 1_000_000_000) || e.distanceUm === 0) issue('invalid-extrusion', p); });
    const topologySafe=vertices.every(v=>record(v)&&typeof v.id==='string'&&Array.isArray(v.positionUm)&&v.positionUm.length===3&&v.positionUm.every(n=>integer(n,-1_000_000_000,1_000_000_000)))&&edges.every(e=>record(e)&&typeof e.id==='string'&&Array.isArray(e.vertexIds)&&e.vertexIds.length===2&&e.vertexIds.every(id=>typeof id==='string'))&&faces.every(f=>record(f)&&typeof f.id==='string'&&Array.isArray(f.vertexIds)&&f.vertexIds.every(id=>typeof id==='string'))&&extrusions.every(e=>record(e)&&typeof e.id==='string'&&typeof e.faceId==='string'&&Number.isSafeInteger(e.distanceUm));
    if(topologySafe) for(const code of validateGeometryTopology({vertices,edges,faces,extrusions} as Geometry))issue(code.slice(code.lastIndexOf(':')+1),`${path}.${code.slice(0,code.lastIndexOf(':'))}`);
  };
  defs.forEach((d, i) => {
    const path = `${basePath}.definitions[${i}]`;
    if (!record(d)) { issue('invalid-definition', path); return; }
    keys(d, ['id', 'name', 'geometry', 'cutSpec', 'materialId', 'appearance'], path, issues);
    if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 256) issue('invalid-name', `${path}.name`);
    validateGeometry(d.geometry, `${path}.geometry`);
    if (d.materialId !== undefined && (typeof d.materialId !== 'string' || !materialIds.has(d.materialId))) issue('invalid-material-reference', `${path}.materialId`);
    if (!record(d.appearance) || Object.keys(d.appearance).some(k=>!['color','opacity'].includes(k)) || typeof d.appearance.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(d.appearance.color) || (d.appearance.opacity !== undefined && (typeof d.appearance.opacity !== 'number' || !Number.isFinite(d.appearance.opacity) || d.appearance.opacity < 0 || d.appearance.opacity > 1))) issue('invalid-appearance', `${path}.appearance`);
    if (d.cutSpec !== undefined) {
      const c = d.cutSpec;
      if (!record(c) || Object.keys(c).some(k => !['kind', 'lengthUm', 'widthUm', 'thicknessUm', 'grainAxis', 'confirmation'].includes(k)) || !['board', 'panel', 'explicit'].includes(String(c.kind)) || !['length', 'width', 'none'].includes(String(c.grainAxis)) || !['confirmed', 'requires-confirmation'].includes(String(c.confirmation)) || ![c.lengthUm, c.widthUm, c.thicknessUm].every(n => integer(n, 1, 1_000_000_000)) || (c.kind !== 'explicit' && c.confirmation !== 'confirmed')) issue('invalid-cut-spec', `${path}.cutSpec`);
      else if(c.kind!=='explicit') {
        const geometry=d.geometry as Record<string,unknown>,vertices=record(geometry)&&Array.isArray(geometry.vertices)?geometry.vertices:[],edges=record(geometry)&&Array.isArray(geometry.edges)?geometry.edges:[],faces=record(geometry)&&Array.isArray(geometry.faces)?geometry.faces:[],extrusions=record(geometry)&&Array.isArray(geometry.extrusions)?geometry.extrusions:[];
        const points=vertices.map(v=>record(v)&&Array.isArray(v.positionUm)?v.positionUm:undefined);
        const xs=points.map(p=>p?.[0]),ys=points.map(p=>p?.[1]),zs=points.map(p=>p?.[2]);
        const rectangular=vertices.length===4&&edges.length===4&&faces.length===1&&extrusions.length===1&&points.every(Boolean)&&zs.every(z=>z===0)&&new Set(xs).size===2&&new Set(ys).size===2&&Math.min(...xs as number[])===0&&Math.min(...ys as number[])===0&&Math.max(...xs as number[])===c.lengthUm&&Math.max(...ys as number[])===c.widthUm&&record(extrusions[0])&&extrusions[0].distanceUm===c.thicknessUm;
        if(!rectangular)issue('primitive-cut-spec-geometry-mismatch',`${path}.cutSpec`);
      }
    }
  });
  const validateTransform = (r: Record<string, unknown>, path: string) => {
    const pose = r.pose;
    if (record(pose)) keys(pose,['positionUm','rotation'],`${path}.pose`,issues);
    if (!record(pose) || !Array.isArray(pose.positionUm) || pose.positionUm.length !== 3 || !pose.positionUm.every(n => integer(n, -1_000_000_000, 1_000_000_000)) || !Array.isArray(pose.rotation) || pose.rotation.length !== 4 || !pose.rotation.every(n => typeof n === 'number' && Number.isFinite(n))) issue('invalid-pose', `${path}.pose`);
    else { const norm = Math.hypot(...pose.rotation as number[]); if (Math.abs(norm - 1) > 0.000001) issue('invalid-quaternion', `${path}.pose.rotation`); }
    if (!Array.isArray(r.scalePpm) || r.scalePpm.length !== 3 || !r.scalePpm.every(n => integer(n, 1, 1_000_000_000))) issue('invalid-scale', `${path}.scalePpm`);
  };
  instances.forEach((v, i) => { const p = `${basePath}.instances[${i}]`; if (!record(v)) { issue('invalid-instance', p); return; } keys(v, ['id', 'definitionId', 'name', 'pose', 'scalePpm', 'hidden', 'locked', 'projectionExcluded', 'materialId', 'appearance'], p, issues); if (!defIds.has(String(v.definitionId))) issue('invalid-definition-reference', `${p}.definitionId`); validateTransform(v, p); if (v.name!==undefined&&(typeof v.name!=='string'||!v.name.trim()||v.name.length>256))issue('invalid-name',`${p}.name`);if (typeof v.hidden !== 'boolean' || typeof v.locked !== 'boolean' || (v.projectionExcluded !== undefined && v.projectionExcluded !== true)) issue('invalid-instance-state', p); if (v.materialId !== undefined && !materialIds.has(String(v.materialId))) issue('invalid-material-reference', `${p}.materialId`);if(v.appearance!==undefined&&(!record(v.appearance)||Object.keys(v.appearance).some(k=>!['color','opacity'].includes(k))||typeof v.appearance.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(v.appearance.color)||v.appearance.opacity!==undefined&&(typeof v.appearance.opacity!=='number'||!Number.isFinite(v.appearance.opacity)||v.appearance.opacity<0||v.appearance.opacity>1)))issue('invalid-appearance',`${p}.appearance`); });
  loose.forEach((v, i) => { const p = `${basePath}.looseObjects[${i}]`; if (!record(v)) { issue('invalid-loose-object', p); return; } keys(v, ['id', 'name', 'geometry', 'pose', 'scalePpm', 'appearance', 'hidden', 'locked'], p, issues); validateGeometry(v.geometry, `${p}.geometry`); validateTransform(v, p);if(typeof v.name!=='string'||!v.name.trim()||v.name.length>256)issue('invalid-name',`${p}.name`);if(!record(v.appearance)||Object.keys(v.appearance).some(k=>!['color','opacity'].includes(k))||typeof v.appearance.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(v.appearance.color)||v.appearance.opacity!==undefined&&(typeof v.appearance.opacity!=='number'||!Number.isFinite(v.appearance.opacity)||v.appearance.opacity<0||v.appearance.opacity>1))issue('invalid-appearance',`${p}.appearance`); if (typeof v.hidden !== 'boolean' || typeof v.locked !== 'boolean') issue('invalid-loose-state', p); });
  if(totalVertices>20_000||totalEdges>40_000||totalFaces>10_000||totalExtrusions>2_000)issue('geometry-count-limit',basePath);
  const definitionById=new Map(defs.filter(record).map(def=>[String(def.id),def]));
  const checkEffective=(geometry:unknown,pose:unknown,scale:unknown,path:string,cutSpec?:unknown)=>{
    if(!record(geometry)||!Array.isArray(geometry.vertices)||!record(pose)||!Array.isArray(pose.positionUm)||!Array.isArray(pose.rotation)||!Array.isArray(scale)||!geometry.vertices.every(v=>record(v)&&Array.isArray(v.positionUm)&&v.positionUm.length===3&&v.positionUm.every(n=>integer(n,-1_000_000_000,1_000_000_000))))return;
    try { for(const vertex of geometry.vertices)transformLocalPoint(vertex.positionUm as Vec3Um,{positionUm:pose.positionUm as Vec3Um,rotation:pose.rotation as Pose['rotation']},scale as ScalePpm); }
    catch { issue('effective-extent-limit',path); }
    if(record(cutSpec)&&Array.isArray(scale)&&scale.length===3){try{scaleDimensionUm(Number(cutSpec.lengthUm),Number(scale[0]));scaleDimensionUm(Number(cutSpec.widthUm),Number(scale[1]));scaleDimensionUm(Number(cutSpec.thicknessUm),Number(scale[2]));}catch{issue('effective-cut-dimension-limit',path);}}
  };
  instances.forEach((value,index)=>{if(!record(value))return;const def=definitionById.get(String(value.definitionId));if(def)checkEffective(def.geometry,value.pose,value.scalePpm,`${basePath}.instances[${index}]`,def.cutSpec);});
  loose.forEach((value,index)=>{if(record(value))checkEffective(value.geometry,value.pose,value.scalePpm,`${basePath}.looseObjects[${index}]`);});
  if (!record(value.partLinks)) issue('invalid-part-links', `${basePath}.partLinks`);
  else { const linkedInstances=new Set<string>(); for (const [partId, link] of Object.entries(value.partLinks)) {
    const p = `${basePath}.partLinks.${partId}`;
    if (!projectParts.some(part => part.id === partId) && (!record(link)||link.state!=='pending-part-deletion')) issue('unknown-linked-part', p);
    if (!record(link) || !['active', 'pending-removal', 'pending-reconcile', 'pending-part-deletion'].includes(String(link.state))) { issue('invalid-link', p); continue; }
    const active = link.state === 'active';
    if (active && !record(link.current)) issue('missing-current-sources', `${p}.current`);
    if (!record(link.lastApplied) || !record(link.lastApplied.sources) || !record(link.lastApplied.fields)) issue('invalid-projection-snapshot', `${p}.lastApplied`);
    else {
      const sources=link.lastApplied.sources,fields=link.lastApplied.fields;keys(link.lastApplied,['sources','fields'],`${p}.lastApplied`,issues);keys(sources,['definitionId','instanceIds'],`${p}.lastApplied.sources`,issues);keys(fields,['name','materialId','length','width','crossSection','grainLocked','quantity'],`${p}.lastApplied.fields`,issues);
      if(typeof sources.definitionId!=='string'||!Array.isArray(sources.instanceIds)||!sources.instanceIds.length||sources.instanceIds.length>5000||sources.instanceIds.some(id=>typeof id!=='string'||!id||id.length>128)||new Set(sources.instanceIds).size!==sources.instanceIds.length)issue('invalid-historical-sources',`${p}.lastApplied.sources`);
      const validDim=(v:unknown)=>record(v)&&Object.keys(v).length===1&&integer(v.um,1,1_000_000_000);
      if(typeof fields.name!=='string'||!fields.name.trim()||fields.name.length>256||typeof fields.materialId!=='string'||!fields.materialId||!validDim(fields.length)||fields.width!==undefined&&!validDim(fields.width)||fields.crossSection!==undefined&&(!record(fields.crossSection)||Object.keys(fields.crossSection).some(k=>!['width','thickness'].includes(k))||!validDim(fields.crossSection.width)||!validDim(fields.crossSection.thickness))||fields.grainLocked!==undefined&&typeof fields.grainLocked!=='boolean'||!integer(fields.quantity,1,10000))issue('invalid-snapshot-fields',`${p}.lastApplied.fields`);
    }
    const current = record(link.current) ? link.current : undefined;
    if(record(link))keys(link,link.state==='active'?['state','current','lastApplied']:['state','reasons','current','lastApplied'],p,issues);
    if(current){if(typeof current.definitionId!=='string'||!defIds.has(current.definitionId))issue('dangling-source-definition',p);if(record(current))keys(current,['definitionId','instanceIds'],`${p}.current`,issues);if(!Array.isArray(current.instanceIds)||!current.instanceIds.length||current.instanceIds.length>5000||new Set(current.instanceIds).size!==current.instanceIds.length)issue('invalid-source-instances',p);else if(current.instanceIds.some(id=>!instances.some(inst=>record(inst)&&inst.id===id&&inst.definitionId===current.definitionId)))issue('dangling-current-instance',p);else for(const id of current.instanceIds as string[]){const found=instances.find(inst=>record(inst)&&inst.id===id);if(record(found)&&found.projectionExcluded===true)issue('excluded-current-instance',p);if(linkedInstances.has(id))issue('duplicate-current-source',p);linkedInstances.add(id);}}
    if(record(link)&&link.state!=='active'&&(!Array.isArray(link.reasons)||link.reasons.length===0||link.reasons.some(reason=>!['source-deleted','definition-edited','instance-scaled','material-changed','made-unique','part-deleted'].includes(String(reason)))||new Set(link.reasons).size!==link.reasons.length))issue('invalid-link-reasons',`${p}.reasons`);
    if(record(link)&&link.state==='pending-removal'&&link.current!==undefined)issue('pending-removal-has-current',`${p}.current`);
    if(record(link)&&link.state==='pending-part-deletion'&&(!Array.isArray(link.reasons)||!link.reasons.includes('part-deleted')))issue('pending-part-deletion-missing-reason',`${p}.reasons`);
    if(record(link)&&link.state!=='pending-part-deletion'&&Array.isArray(link.reasons)&&link.reasons.includes('part-deleted'))issue('pending-state-precedence',p);
    if(record(link.lastApplied)&&record(link.lastApplied.sources)&&!Array.isArray(link.lastApplied.sources.instanceIds))issue('invalid-historical-source-instances',`${p}.lastApplied.sources.instanceIds`);
  }}
  return issues;
}
