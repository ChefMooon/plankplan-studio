import type { Project, ProjectPreviewView } from '@/lib/planner/model';
import type { Geometry, Pose, ScalePpm, Vec3Um } from '@/lib/planner/design/schema';
import { IDENTITY_POSE, IDENTITY_SCALE, transformLocalPoint } from '@/lib/planner/design/geometry';
import { partKind } from '@/lib/planner/part-stock';
import { useEffect, useRef, useState } from 'react';
import { getModelSnapshot, snapshotFingerprint } from '@/components/design/scene/snapshot-cache';

type Point = [number, number];
type CutlistPiece = { id: string; length: number; width: number; sheet: boolean };

// Pack representative parts using one scale, retaining minimum dimensions for visibility.
function cutlistLayout(project: Project) {
  const pieces: CutlistPiece[] = project.parts.slice(0, 9).map(part => {
    const sheet = partKind(part, project) === 'sheet';
    return { id: part.id, length: part.length.um, width: sheet ? part.width?.um ?? 0 : part.crossSection?.width.um ?? 0, sheet };
  });
  const pack = (scale: number) => {
    let x = 0, y = 0, rowHeight = 0;
    const items = pieces.map(piece => {
      const width = Math.max(12, piece.length * scale);
      const height = Math.max(piece.sheet ? 10 : 4, piece.width * scale);
      if (x > 0 && x + width > 250) { x = 0; y += rowHeight + 4; rowHeight = 0; }
      const item = { ...piece, x, y, width, height };
      x += width + 4;
      rowHeight = Math.max(rowHeight, height);
      return item;
    });
    return { items, fits: items.every(item => item.x + item.width <= 250 && item.y + item.height <= 94) };
  };
  let low = 0, high = 250 / Math.max(1, ...pieces.map(piece => Math.max(piece.length, piece.width)));
  for (let i = 0; i < 32; i++) { const mid = (low + high) / 2; if (pack(mid).fits) low = mid; else high = mid; }
  return pack(low).items;
}
type PreviewObject = { id: string; geometry: Geometry; pose: Pose; scale: ScalePpm; color: string; offset: Vec3Um };
type DesignPreviewView = Exclude<ProjectPreviewView, 'auto' | 'cutlist'>;
const views: DesignPreviewView[] = ['iso','top','front','right'];
const projectPoint = (p: readonly number[], view: DesignPreviewView): Point => {
  if (view === 'top') return [p[0], -p[1]];
  if (view === 'front') return [p[0], -p[2]];
  if (view === 'right') return [p[1], -p[2]];
  return [p[0] - p[1] * .55, -p[2] + p[1] * .45];
};
const bounds = (points: Point[]) => {
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const [x,y] of points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  return {minX,maxX,minY,maxY,area:(maxX-minX)*(maxY-minY)};
};
function extrusionOffsets(geometry: Geometry) {
  return new Map(geometry.extrusions.map(extrusion=>{
    const face=geometry.faces.find(candidate=>candidate.id===extrusion.faceId);
    const points=face?.vertexIds.slice(0,3).map(id=>geometry.vertices.find(vertex=>vertex.id===id)?.positionUm);
    if(!points||points.some(point=>!point))return [extrusion.id,[0,0,0] as Vec3Um];
    const [a,b,c]=points as Vec3Um[];
    const u=b.map((value,index)=>value-a[index]),v=c.map((value,index)=>value-a[index]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal)||1;
    return [extrusion.id,normal.map(value=>value/length*extrusion.distanceUm) as Vec3Um];
  }));
}
function drawablePositions(geometry: Geometry) {
  const positions=geometry.vertices.map(vertex=>vertex.positionUm);
  for(const extrusion of geometry.extrusions){
    const face=geometry.faces.find(candidate=>candidate.id===extrusion.faceId);if(!face)continue;
    const offset=extrusionOffsets(geometry).get(extrusion.id);if(!offset)continue;
    for(const id of face.vertexIds){const position=geometry.vertices.find(vertex=>vertex.id===id)?.positionUm;if(position)positions.push(position.map((value,index)=>value+offset[index]) as Vec3Um);}
  }
  return positions;
}

export function ProjectCardPreview({ project }: { project: Project }) {
  const container = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(0);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) setAspect(Math.max(0.5, Math.min(8, Math.round(width / height * 10) / 10)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const fingerprint = snapshotFingerprint(project, aspect);
  const [snapshot, setSnapshot] = useState<{ fingerprint: string; image: string }>();
  useEffect(() => {
    if (!aspect || !project.design || project.previewView === 'cutlist' || typeof WebGLRenderingContext === 'undefined') return;
    let active = true;
    void getModelSnapshot(project, aspect).then(image => { if (active && image) setSnapshot({ fingerprint, image }); });
    return () => { active = false; };
  }, [aspect, fingerprint, project]);
  return <div ref={container} style={{ position: 'absolute', inset: 0 }}>
    {snapshot?.fingerprint === fingerprint
      ? <div className="project-card-design-surface"><img className="project-card-illustration" style={{ objectFit: 'cover' }} src={snapshot.image} alt={`${project.name} design preview`} onError={() => setSnapshot(undefined)} /></div>
      : <ProjectCardPreviewFallback project={project}/>}
  </div>;
}

function ProjectCardPreviewFallback({ project }: { project: Project }) {
  const design=project.previewView === 'cutlist' ? undefined : project.design;
  const objects:PreviewObject[]=design?[...design.instances.filter(item=>!item.hidden).flatMap(item=>{const definition=design.definitions.find(candidate=>candidate.id===item.definitionId);return definition?[{id:item.id,geometry:definition.geometry,pose:item.pose,scale:item.scalePpm,color:item.appearance?.color??definition.appearance.color,offset:[0,0,0] as Vec3Um}]:[];}),...design.looseObjects.filter(item=>!item.hidden).map(item=>({id:item.id,geometry:item.geometry,pose:item.pose,scale:item.scalePpm,color:item.appearance.color,offset:[0,0,0] as Vec3Um})),...design.definitions.filter(definition=>!design.instances.some(item=>item.definitionId===definition.id)).map((definition,index)=>({id:definition.id,geometry:definition.geometry,pose:IDENTITY_POSE,scale:IDENTITY_SCALE,color:definition.appearance.color,offset:[index*1_500_000,0,0] as Vec3Um}))]:[];
  const drawable=objects.filter(object=>drawablePositions(object.geometry).length>0);
  const designSelected = !!project.previewView && project.previewView !== 'auto' && project.previewView !== 'cutlist';
  if(!drawable.length)return !designSelected && project.parts.length?<svg className="project-card-illustration" viewBox="0 0 300 132" aria-hidden="true">{cutlistLayout(project).map(piece=><g key={piece.id} data-cutlist-piece={piece.id} transform={`translate(${25+piece.x} ${19+piece.y})`}><rect width={piece.width} height={piece.height} rx="2" fill={piece.sheet?'var(--pp-blue)':'#b98a5c'} opacity=".78"/><path d={`M3 ${Math.min(4,piece.height/2)}h${Math.max(0,piece.width-6)}`} stroke="white" opacity=".25"/></g>)}</svg>:<div className="project-thumb-empty">
    {designSelected ? <svg className="project-empty-illustration" viewBox="0 0 100 44" fill="none" aria-hidden="true"><path d="M50 4 69 13v19L50 41 31 32V13L50 4Z M31 13l19 9 19-9M50 22v19"/></svg> : <svg className="project-empty-illustration" viewBox="0 0 100 44" fill="none" aria-hidden="true"><path d="M20 8h43v23H20z"/><path d="M25 12h33M25 27h33" opacity=".4"/><path d="M43 34h39v5H43z"/><path d="M47 36.5h31" opacity=".4"/></svg>}
    <span>{designSelected ? 'No visible design yet' : project.previewView === 'cutlist' ? 'No cutlist parts yet' : 'No parts or design yet'}</span>
  </div>;
  const allPositions=drawable.flatMap(object=>drawablePositions(object.geometry).map(position=>transformLocalPoint(position,object.pose,object.scale).map((value,index)=>value+object.offset[index]) as Vec3Um));
  const chosen=project.previewView&&project.previewView!=='auto'&&project.previewView!=='cutlist'?project.previewView:(()=>{const projected=views.map(view=>({view,area:bounds(allPositions.map(point=>projectPoint(point,view))).area}));const iso=projected[0].area,largest=projected.reduce((best,item)=>item.area>best.area?item:best,projected[0]);return iso<=largest.area*.3?largest.view:'iso';})();
  const projectedPoints=drawable.flatMap(object=>drawablePositions(object.geometry).map(position=>projectPoint(transformLocalPoint(position,object.pose,object.scale).map((value,index)=>value+object.offset[index]),chosen)));
  const box=bounds(projectedPoints),spanX=box.maxX-box.minX||1,spanY=box.maxY-box.minY||1,scale=Math.min(230/spanX,86/spanY);
  const xy=(point:Point):Point=>[150+(point[0]-(box.minX+box.maxX)/2)*scale,66+(point[1]-(box.minY+box.maxY)/2)*scale];
  return <div className="project-card-design-surface"><svg className="project-card-illustration" viewBox="0 0 300 132" role="img" aria-label={`${project.name} design preview, ${chosen} view`}>
    {drawable.map(object=>{const byId=new Map(object.geometry.vertices.map(vertex=>[vertex.id,vertex.positionUm])),offsets=extrusionOffsets(object.geometry);const point=(id:string,offset?:Vec3Um)=>{const raw=byId.get(id);if(!raw)return;const world=transformLocalPoint(offset?raw.map((value,index)=>value+offset[index]) as Vec3Um:raw,object.pose,object.scale);return xy(projectPoint(world.map((value,index)=>value+object.offset[index]),chosen));};const polygon=(key:string,points:(Point|undefined)[])=>{const valid=points.filter((value):value is Point=>!!value);return valid.length>=3?<polygon key={key} points={valid.map(value=>value.join(',')).join(' ')}/>:null;};return <g key={object.id} data-preview-object={object.id} fill={object.color} fillOpacity={object.geometry.extrusions.length ? .18 : .08} stroke={object.color} strokeWidth="1.5" strokeLinejoin="round">
      {object.geometry.faces.map(face=>polygon(face.id,face.vertexIds.map(id=>point(id))))}{object.geometry.edges.map(edge=>{const a=point(edge.vertexIds[0]),b=point(edge.vertexIds[1]);return a&&b?<line key={edge.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}/>:null})}
      {object.geometry.extrusions.map(extrusion=>{const face=object.geometry.faces.find(candidate=>candidate.id===extrusion.faceId),offset=offsets.get(extrusion.id);if(!face||!offset)return null;return <g key={extrusion.id}>{face.vertexIds.map((id,index)=>{const next=face.vertexIds[(index+1)%face.vertexIds.length],a=point(id),b=point(next),c=point(next,offset),d=point(id,offset);return <g key={`${id}-${index}`}>{a&&d&&<line x1={a[0]} y1={a[1]} x2={d[0]} y2={d[1]}/>} {polygon(`side-${index}`,[a,b,c,d])}</g>})}{polygon('cap',face.vertexIds.map(id=>point(id,offset)))}</g>;})}
    </g>;})}
  </svg></div>;
}
