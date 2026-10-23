import { normalizeProjectDocument, type Part, type Project } from '../model';
import type { DesignDocumentV1, ProjectionSnapshot, Sources } from './schema';
import { scaleDimensionUm } from './geometry';

export type ProjectionRow = { key: string; sources: Sources; fields: Omit<Part,'id'|'group'|'notes'> & { crossSection?: Part['crossSection'] }; designThicknessUm: number };
export type FieldName = 'name'|'materialId'|'length'|'width'|'crossSection'|'grainLocked'|'quantity';
export type RowChange = { kind:'add'|'update'|'remove'|'split'|'merge'; rowKey:string; partId?:string; relatedPartIds?:string[]; sources?:Sources; fields?:ProjectionRow['fields']; conflicts: FieldName[]; changedFields: FieldName[]; requiresDisposition:boolean };
export type ProjectionPreview = { editSequence:number; localGeneration:number; rows:ProjectionRow[]; changes:RowChange[]; reservedIds:Record<string,string> };
export type RowDecision = { fieldChoices?: Partial<Record<FieldName,'manual'|'design'>>; disposition?: 'apply'|'keep'|'detach'|'remove'; partId?:string };
const fields: FieldName[]=['name','materialId','length','width','crossSection','grainLocked','quantity'];
const eq=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const srcKey=(s:Sources)=>`${s.definitionId}:${[...s.instanceIds].sort().join(',')}`;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;

export function projectEligibleRows(project: Project): ProjectionRow[] {
  const design=project.design; if(!design)return [];
  const definitions=new Map(design.definitions.map(d=>[d.id,d])); const materials=new Map(project.materials.map(m=>[m.id,m.type]));
  const groups=new Map<string,ProjectionRow>();
  for(const instance of design.instances){
    if(instance.projectionExcluded)continue;
    const def=definitions.get(instance.definitionId), spec=def?.cutSpec;
    if(!def||!spec||spec.confirmation!=='confirmed')continue;
    const materialId=instance.materialId??def.materialId, kind=materialId?materials.get(materialId):undefined;
    if(!materialId||!kind||spec.kind==='board'&&kind!=='linear'||spec.kind==='panel'&&kind!=='sheet'||kind==='linear'&&spec.grainAxis!=='length')continue;
    const scales=instance.scalePpm;
    const length=scaleDimensionUm(spec.lengthUm,scales[0]), width=scaleDimensionUm(spec.widthUm,scales[1]), thickness=scaleDimensionUm(spec.thicknessUm,scales[2]);
    let partLength=length, partWidth:Part['width'], grainLocked:Part['grainLocked'];
    if(kind==='linear') partWidth=undefined;
    else if(spec.grainAxis==='width'){partLength=width;partWidth={um:length};grainLocked=true;}
    else {partWidth={um:width};grainLocked=spec.grainAxis==='length';}
    const crossSection=kind==='linear'?{width:{um:width},thickness:{um:thickness}}:undefined;
    const key=JSON.stringify([def.id,materialId,partLength,partWidth,thickness,crossSection,grainLocked]);
    const old=groups.get(key); const instanceIds=old?[...old.sources.instanceIds,instance.id]:[instance.id];
    const partFields={name:def.name,materialId,length:{um:partLength},...(partWidth?{width:partWidth}:{}),...(crossSection?{crossSection}:{}),...(grainLocked!==undefined?{grainLocked}:{}),quantity:instanceIds.length};
    groups.set(key,{key,sources:{definitionId:def.id,instanceIds},fields:partFields,designThicknessUm:thickness});
  }
  return [...groups.values()].sort((a,b)=>cmp(a.key,b.key));
}

function snapshotOf(sources:Sources, part:Part):ProjectionSnapshot { return {sources:{definitionId:sources.definitionId,instanceIds:[...sources.instanceIds]},fields:{name:part.name,materialId:part.materialId,length:part.length,...(part.width?{width:part.width}:{}),...(part.crossSection?{crossSection:part.crossSection}:{}),...(part.grainLocked!==undefined?{grainLocked:part.grainLocked}:{}),quantity:part.quantity}}; }
function valueFor(part:Part|undefined,key:FieldName):unknown { return part?.[key]; }

export function createProjectionPreview(project:Project,editSequence:number,localGeneration:number,reserveId:(row:ProjectionRow)=>string):ProjectionPreview {
  const rows=projectEligibleRows(project), links=project.design?.partLinks??{}, parts=new Map(project.parts.map(p=>[p.id,p]));
  const tracked=Object.entries(links).map(([id,link])=>[id,link,link.state==='active'?link.current:link.current??link.lastApplied.sources] as const).sort(([a],[b])=>cmp(a,b));
  const linkedRows=new Map(tracked.map(([id,,sources])=>[id,rows.flatMap((row,index)=>row.sources.definitionId===sources.definitionId&&row.sources.instanceIds.some(v=>sources.instanceIds.includes(v))?[index]:[])]));
  const rowLinks=new Map(rows.map((row,index)=>[index,tracked.filter(([,link,sources])=>link.state!=='pending-part-deletion'&&row.sources.definitionId===sources.definitionId&&row.sources.instanceIds.some(v=>sources.instanceIds.includes(v))).map(([id])=>id)]));
  const changes:RowChange[]=[], reservedIds:Record<string,string>={}, reused=new Set<string>();
  rows.forEach((row,index)=>{
    const exact=tracked.find(([id,link,sources])=>!reused.has(id)&&link.state!=='pending-part-deletion'&&srcKey(sources)===srcKey(row.sources));
    const candidates=rowLinks.get(index)??[];
    const splitFrom=candidates.filter(id=>(linkedRows.get(id)?.length??0)>1), merging=candidates.length>1;
    const related=merging?candidates:[...new Set([...candidates,...splitFrom])];
    let partId=exact?.[0]; if(partId)reused.add(partId);
    else if(related.length){const primary=related.slice().sort(cmp)[0];const siblings=(linkedRows.get(primary)??[]).map(i=>rows[i].key).sort(cmp);if((siblings.length<=1||siblings[0]===row.key)&&!reused.has(primary)){partId=primary;reused.add(primary);}}
    const deletedIds=tracked.filter(([,link,sources])=>link.state==='pending-part-deletion'&&srcKey(sources)===srcKey(row.sources)).map(([id])=>id);
    deletedIds.forEach(id=>reused.add(id));
    const kind:RowChange['kind']=merging?'merge':splitFrom.length?'split':exact||related.length?'update':'add';
    if(!partId&&!related.length)partId=undefined;
    if(partId){const linked=tracked.find(([id])=>id===partId)?.[1],part=parts.get(partId);const changedFields=fields.filter(f=>!eq(valueFor(part,f),valueFor(row.fields as Part,f)));const conflicts=linked?fields.filter(f=>!eq(valueFor(linked.lastApplied.fields as Part,f),valueFor(part,f))&&!eq(valueFor(linked.lastApplied.fields as Part,f),valueFor(row.fields as Part,f))):[];changes.push({kind,rowKey:row.key,partId,...(related.length?{relatedPartIds:related}:{}),sources:row.sources,fields:row.fields,changedFields,conflicts,requiresDisposition:true});
    }else{const fresh=reserveId(row);reservedIds[row.key]=fresh;changes.push({kind,rowKey:row.key,...(related.length||deletedIds.length?{relatedPartIds:[...new Set([...related,...deletedIds])]}:{}),sources:row.sources,fields:row.fields,conflicts:[],changedFields:fields,requiresDisposition:true});}
  });
  const mergedAway=new Set(changes.filter(change=>change.kind==='merge').flatMap(change=>(change.relatedPartIds??[]).filter(id=>id!==change.partId)));
  for(const [id,,sources] of tracked)if(!reused.has(id)&&!mergedAway.has(id))changes.push({kind:'remove',rowKey:`removed:${id}`,partId:id,sources,conflicts:[],changedFields:[],requiresDisposition:true});
  return {editSequence,localGeneration,rows,changes,reservedIds};
}

export function isProjectionPreviewCurrent(preview:ProjectionPreview,editSequence:number,localGeneration:number){return preview.editSequence===editSequence&&preview.localGeneration===localGeneration;}

export type ApplyIntent = { parts:Part[]; design:DesignDocumentV1; consumedPreview:{editSequence:number;localGeneration:number} };
export function createApplyIntent(project:Project,preview:ProjectionPreview,decisions:Record<string,RowDecision>,current:{editSequence:number;localGeneration:number}):ApplyIntent {
  if(!isProjectionPreviewCurrent(preview,current.editSequence,current.localGeneration))throw new Error('stale-preview');
  const unresolved=preview.changes.filter(c=>!decisions[c.rowKey]?.disposition||c.conflicts.some(field=>!decisions[c.rowKey].fieldChoices?.[field])); if(unresolved.length)throw new Error('unresolved-projection-conflict');
  if(!project.design)throw new Error('missing-design');
  let nextParts=[...project.parts]; const links={...project.design.partLinks};
  const excluded=new Set<string>(), included=new Set<string>();
  for(const change of preview.changes){const decision=decisions[change.rowKey]??{disposition:'apply'}; const row=preview.rows.find(r=>r.key===change.rowKey);
    if(change.kind==='remove'){if(decision.disposition==='keep')continue;if(decision.disposition==='detach'){delete links[change.partId!];continue;} if(decision.disposition!=='remove')throw new Error('removal-disposition-required'); nextParts=nextParts.filter(p=>p.id!==change.partId);delete links[change.partId!];continue;}
    if(decision.disposition==='keep') {
      if(change.kind==='split'&&!change.partId)for(const id of change.sources?.instanceIds??[])excluded.add(id);
      if(change.kind==='add')for(const id of change.sources?.instanceIds??[])excluded.add(id);
      if(change.kind==='split'&&change.partId&&change.sources){const link=links[change.partId];if(link)links[change.partId]={...link,current:change.sources};}
      if(change.kind==='merge'&&change.partId&&change.sources){const link=links[change.partId];if(link)links[change.partId]={...link,current:change.sources};for(const priorId of change.relatedPartIds??[])if(priorId!==change.partId)delete links[priorId];}
      continue;
    }
    if(decision.disposition==='detach'){
      if(change.partId)delete links[change.partId];else for(const id of change.sources?.instanceIds??[])excluded.add(id);
      if(change.kind==='merge')for(const priorId of change.relatedPartIds??[])delete links[priorId];continue;
    }
    if(decision.disposition==='remove'){for(const id of [...(change.sources?.instanceIds??[]),...(change.partId?links[change.partId]?.lastApplied.sources.instanceIds??[]:[])])excluded.add(id);if(change.partId){nextParts=nextParts.filter(p=>p.id!==change.partId);delete links[change.partId];}for(const priorId of change.relatedPartIds??[])if(links[priorId]){nextParts=nextParts.filter(p=>p.id!==priorId);delete links[priorId];}continue;}
    if(!row)continue; const id=change.partId??preview.reservedIds[row.key]; if(!id)throw new Error('missing-reserved-part-id');
    if(change.kind==='merge'&&decision.disposition!=='apply')throw new Error('merge-disposition-required');
    const existing=nextParts.find(p=>p.id===id); let next={...(existing??{}),...structuredClone(row.fields),id} as Part;
    if(existing){ for(const f of fields){if(decision.fieldChoices?.[f]==='manual')next={...next,[f]:existing[f]};} nextParts=nextParts.map(p=>p.id===id?next:p); } else nextParts=[...nextParts,next];
    const snapshot=snapshotOf(row.sources,next); links[id]={state:'active',current:snapshot.sources,lastApplied:{...snapshot,fields:structuredClone(row.fields)}};
    row.sources.instanceIds.forEach(sourceId=>included.add(sourceId));
    if(change.kind==='merge')for(const priorId of change.relatedPartIds??[])if(priorId!==id){nextParts=nextParts.filter(p=>p.id!==priorId);delete links[priorId];}
    for(const priorId of change.relatedPartIds??[])if(links[priorId]?.state==='pending-part-deletion')delete links[priorId];
  }
  for(const change of preview.changes)if(['detach','remove'].includes(decisions[change.rowKey]?.disposition??''))for(const id of [...(change.sources?.instanceIds??[]),...(change.partId?project.design.partLinks[change.partId]?.lastApplied.sources.instanceIds??[]:[])])excluded.add(id);
  const instances=project.design.instances.map(instance=>excluded.has(instance.id)&&!included.has(instance.id)?{...instance,projectionExcluded:true as const}:instance);
  const validated=normalizeProjectDocument({...project,parts:nextParts,design:{...project.design,instances,partLinks:links}});
  return {parts:validated.parts,design:validated.design!,consumedPreview:{editSequence:preview.editSequence,localGeneration:preview.localGeneration}};
}
