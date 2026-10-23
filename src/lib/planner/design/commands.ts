import { normalizeProjectDocument, type Part, type Project } from '../model';
import type { CutSpec, Definition, DesignDocumentV1, Geometry, LinkReason, LooseObject, Pose, ScalePpm } from './schema';
import { IDENTITY_POSE, IDENTITY_SCALE, normalizeQuaternion, rectangleGeometry, roundSignedUm, transformLocalPoint, validateGeometryTopology } from './geometry';
import { appendProfileSegment } from './profile-segment';

export type DesignCommand =
  | {type:'create-board'|'create-panel';id:string;definitionId:string;name:string;materialId?:string;lengthUm:number;widthUm:number;thicknessUm:number;grainAxis?:CutSpec['grainAxis'];pose?:Pose}
  | {type:'create-loose';object:LooseObject}
  | {type:'append-profile-segment';target:'loose'|'definition';id:string;startUm:[number,number,number];endUm:[number,number,number];vertexId:string;edgeId:string;faceId:string}
  | {type:'make-component';objectId?:string;objectIds?:string[];definitionId:string;instanceId:string;name:string;cutSpec?:CutSpec}
  | {type:'set-geometry';definitionId:string;geometry:Geometry}
  | {type:'set-loose-geometry';objectId:string;geometry:Geometry}
  | {type:'set-primitive-dimensions';definitionId:string;lengthUm:number;widthUm:number;thicknessUm:number}
  | {type:'set-material';target:'definition'|'instance';id:string;materialId?:string}
  | {type:'erase-geometry';definitionId:string;target:'edge'|'face';elementId:string}
  | {type:'erase-loose-geometry';objectId:string;target:'edge'|'face';elementId:string}
  | {type:'set-instance-transform';instanceId:string;pose?:Pose;scalePpm?:ScalePpm;reason?:'instance-scaled'}
  | {type:'set-loose-transform';objectId:string;pose?:Pose;scalePpm?:ScalePpm}
  | {type:'set-appearance';definitionId?:string;instanceId?:string;objectId?:string;color:string;opacity?:number}
  | {type:'set-cut-spec';definitionId:string;cutSpec:CutSpec}
  | {type:'confirm-cut-spec';definitionId:string;cutSpec:CutSpec}
  | {type:'rename';target:'definition'|'instance'|'loose';id:string;name:string}
  | {type:'set-state';target:'instance'|'loose';id:string;hidden?:boolean;locked?:boolean}
  | {type:'duplicate-instance';sourceId:string;id:string;offsetUm?:number}
  | {type:'make-unique';instanceId:string;definitionId:string}
  | {type:'delete-instance';instanceId:string}
  | {type:'delete-loose';objectId:string}
  | {type:'delete-definition';definitionId:string}
  | {type:'include-in-projection';instanceIds:string[]}
  | {type:'detach-part';partId:string}
  | {type:'delete-part';partId:string}
  | {type:'edit-part';part:Part};

export type CommandResult = {ok:true;project:Project;label:string}|{ok:false;project:Project;code:string;message:string};
const clone=(<T>(v:T):T=>structuredClone(v));
const reasonOrder:LinkReason[]=['source-deleted','definition-edited','instance-scaled','material-changed','made-unique','part-deleted'];
function markLinks(design:DesignDocumentV1,definitionId:string,reason:LinkReason, surviving?:Set<string>):DesignDocumentV1 {
  const partLinks={...design.partLinks};
  for(const [id,link] of Object.entries(partLinks)) if(link.current?.definitionId===definitionId){
    const remain=link.current.instanceIds.filter(instanceId=>surviving?surviving.has(instanceId):design.instances.some(i=>i.id===instanceId&&i.definitionId===definitionId));
    const reasons=[...new Set([...(link.state==='active'?[]:link.reasons),reason])].sort((a,b)=>reasonOrder.indexOf(a as never)-reasonOrder.indexOf(b as never));
    const state=link.state==='pending-part-deletion'?'pending-part-deletion':remain.length?'pending-reconcile':'pending-removal';
    partLinks[id]={state,reasons,...(remain.length?{current:{definitionId,instanceIds:remain}}:{}),lastApplied:link.lastApplied};
  }
  return {...design,partLinks};
}
function markInstanceLinks(design:DesignDocumentV1,instanceId:string,reason:LinkReason):DesignDocumentV1 {
  const partLinks={...design.partLinks};
  for(const [id,link] of Object.entries(partLinks))if(link.current?.instanceIds.includes(instanceId)){
    const reasons:LinkReason[]=[...new Set([...(link.state==='active'?[]:link.reasons),reason])].sort((a,b)=>reasonOrder.indexOf(a)-reasonOrder.indexOf(b));
    partLinks[id]={state:link.state==='pending-part-deletion'?'pending-part-deletion':'pending-reconcile',reasons,...(link.current?{current:link.current}:{}),lastApplied:link.lastApplied};
  }
  return {...design,partLinks};
}
function validateNext(project:Project):string|undefined {
  const design=project.design; if(!design)return;
  for(const g of [...design.definitions.map(d=>d.geometry),...design.looseObjects.map(o=>o.geometry)]){const errors=validateGeometryTopology(g);if(errors.length)return errors[0];}
  const defs=new Map(design.definitions.map(def=>[def.id,def]));
  try {
    for(const instance of design.instances){const def=defs.get(instance.definitionId);if(!def)return 'dangling-definition';for(const vertex of def.geometry.vertices)transformLocalPoint(vertex.positionUm,instance.pose,instance.scalePpm);}
    for(const object of design.looseObjects)for(const vertex of object.geometry.vertices)transformLocalPoint(vertex.positionUm,object.pose,object.scalePpm);
  } catch(error){return error instanceof Error?error.message:'invalid-effective-extent';}
}
function primitiveSpecMatches(geometry:Geometry,cutSpec:CutSpec):boolean {
  if(cutSpec.kind==='explicit')return true;
  if(geometry.vertices.length!==4||geometry.edges.length!==4||geometry.faces.length!==1||geometry.extrusions.length!==1)return false;
  const points=geometry.vertices.map(v=>v.positionUm);return points.every(p=>p[2]===0)&&Math.min(...points.map(p=>p[0]))===0&&Math.min(...points.map(p=>p[1]))===0&&Math.max(...points.map(p=>p[0]))===cutSpec.lengthUm&&Math.max(...points.map(p=>p[1]))===cutSpec.widthUm&&geometry.extrusions[0].distanceUm===cutSpec.thicknessUm;
}

export function applyDesignCommand(project:Project,command:DesignCommand):CommandResult {
  if(!project.design)return {ok:false,project,code:'missing-design',message:'This project does not contain a design document'};
  const next=clone(project); let label:string=command.type;
  try {
    let d=next.design!;
    switch(command.type){
      case 'create-board': case 'create-panel': {
        if(d.definitions.length>=1000||d.instances.length>=5000)throw Error('design-count-limit');
        const geometry=rectangleGeometry(command.lengthUm,command.widthUm,p=>`${command.definitionId}-${p}-${crypto.randomUUID()}`,command.thicknessUm);
        const def:Definition={id:command.definitionId,name:command.name,geometry,appearance:{color:'#b8895b'},...(command.materialId?{materialId:command.materialId}:{}),cutSpec:{kind:command.type==='create-board'?'board':'panel',lengthUm:command.lengthUm,widthUm:command.widthUm,thicknessUm:command.thicknessUm,grainAxis:command.grainAxis??'length',confirmation:'confirmed'}};
        d={...d,definitions:[...d.definitions,def],instances:[...d.instances,{id:command.id,definitionId:def.id,pose:command.pose??clone(IDENTITY_POSE),scalePpm:[...IDENTITY_SCALE],hidden:false,locked:false}]}; label='Create component';break;
      }
      case 'create-loose': d={...d,looseObjects:[...d.looseObjects,clone(command.object)]}; label='Create geometry';break;
      case 'append-profile-segment': {
        if(command.target==='loose'){
          const object=d.looseObjects.find(item=>item.id===command.id);if(!object||object.locked)throw Error('editable-profile-not-found');
          const geometry=appendProfileSegment(object.geometry,command.startUm,command.endUm,{vertex:command.vertexId,edge:command.edgeId,face:command.faceId});
          d={...d,looseObjects:d.looseObjects.map(item=>item.id===object.id?{...item,geometry}:item)};
        } else {
          const definition=d.definitions.find(item=>item.id===command.id);if(!definition)throw Error('editable-profile-not-found');
          const geometry=appendProfileSegment(definition.geometry,command.startUm,command.endUm,{vertex:command.vertexId,edge:command.edgeId,face:command.faceId});
          d={...d,definitions:d.definitions.map(item=>{if(item.id!==definition.id)return item;const plain={...item};delete plain.cutSpec;return {...plain,geometry};})};d=markLinks(d,definition.id,'definition-edited');
        }
        label='Append profile segment';break;
      }
      case 'make-component': {
        const objectIds=command.objectIds??(command.objectId?[command.objectId]:[]);if(!objectIds.length||new Set(objectIds).size!==objectIds.length)throw Error('invalid-component-selection');
        const selected=objectIds.map(id=>d.looseObjects.find(x=>x.id===id));if(selected.some(x=>!x))throw Error('loose-object-not-found');const sources=selected as LooseObject[];
        if(sources.some(source=>source.appearance.color!==sources[0].appearance.color||source.appearance.opacity!==sources[0].appearance.opacity||source.hidden!==sources[0].hidden||source.locked!==sources[0].locked))throw Error('incompatible-component-selection');
        const vertices:Geometry['vertices']=[],edges:Geometry['edges']=[],faces:Geometry['faces']=[],extrusions:Geometry['extrusions']=[];
        for(const source of sources){
          if(source.scalePpm[0]!==source.scalePpm[1]||source.scalePpm[0]!==source.scalePpm[2])throw Error('component-rebase-nonuniform-scale');
          const scale=source.scalePpm[0]/1_000_000,vertexMap=new Map<string,string>(),faceMap=new Map<string,string>();
          for(const vertex of source.geometry.vertices){const id=`${source.id}-v-${crypto.randomUUID()}`;vertexMap.set(vertex.id,id);vertices.push({id,positionUm:transformLocalPoint(vertex.positionUm,source.pose,source.scalePpm)});}
          for(const face of source.geometry.faces){const id=`${source.id}-f-${crypto.randomUUID()}`;faceMap.set(face.id,id);faces.push({id,vertexIds:face.vertexIds.map(v=>vertexMap.get(v)!)});}
          for(const edge of source.geometry.edges)edges.push({id:`${source.id}-e-${crypto.randomUUID()}`,vertexIds:[vertexMap.get(edge.vertexIds[0])!,vertexMap.get(edge.vertexIds[1])!]});
          for(const extrusion of source.geometry.extrusions){const distance=roundSignedUm(extrusion.distanceUm*scale);if(!Number.isSafeInteger(distance)||!distance||Math.abs(distance)>1_000_000_000)throw Error('component-rebase-extrusion-bound');extrusions.push({id:`${source.id}-x-${crypto.randomUUID()}`,faceId:faceMap.get(extrusion.faceId)!,distanceUm:distance});}
        }
        const geometry:Geometry={vertices,edges,faces,extrusions};
        const def:Definition={id:command.definitionId,name:command.name.trim(),geometry,appearance:clone(sources[0].appearance),...(command.cutSpec?{cutSpec:clone(command.cutSpec)}:{})};
        if(!def.name)throw Error('empty-name');
        d={...d,definitions:[...d.definitions,def],looseObjects:d.looseObjects.filter(x=>!objectIds.includes(x.id)),instances:[...d.instances,{id:command.instanceId,definitionId:def.id,pose:clone(IDENTITY_POSE),scalePpm:[...IDENTITY_SCALE],hidden:sources[0].hidden,locked:sources[0].locked}]};label='Make component';break;
      }
      case 'set-geometry': {
        const def=d.definitions.find(x=>x.id===command.definitionId);if(!def)throw Error('definition-not-found');
        const geometry=clone(command.geometry);const nextDef={...def,geometry,...(def.cutSpec?.kind==='explicit'?{cutSpec:{...def.cutSpec,confirmation:'requires-confirmation' as const}}:def.cutSpec&&primitiveSpecMatches(geometry,def.cutSpec)?{cutSpec:def.cutSpec}:{cutSpec:undefined})};
        d={...d,definitions:d.definitions.map(x=>x.id===def.id?nextDef:x)}; d=markLinks(d,def.id,'definition-edited');label='Edit geometry';break;
      }
      case 'set-loose-geometry': {
        const object=d.looseObjects.find(x=>x.id===command.objectId);if(!object||object.locked)throw Error('loose-object-not-found');
        d={...d,looseObjects:d.looseObjects.map(x=>x.id===object.id?{...x,geometry:clone(command.geometry)}:x)};label='Edit geometry';break;
      }
      case 'set-primitive-dimensions': {
        const def=d.definitions.find(x=>x.id===command.definitionId);if(!def?.cutSpec||def.cutSpec.kind==='explicit'||!primitiveSpecMatches(def.geometry,def.cutSpec))throw Error('not-eligible-primitive');
        if(![command.lengthUm,command.widthUm,command.thicknessUm].every(v=>Number.isSafeInteger(v)&&v>0&&v<=1_000_000_000))throw Error('invalid-dimension');
        const geometry:Geometry={...def.geometry,vertices:def.geometry.vertices.map(vertex=>{const [x,y,z]=vertex.positionUm;if(z!==0||![0,def.cutSpec!.lengthUm].includes(x)||![0,def.cutSpec!.widthUm].includes(y))throw Error('invalid-primitive-profile');return {...vertex,positionUm:[x===0?0:command.lengthUm,y===0?0:command.widthUm,0]};}),extrusions:def.geometry.extrusions.map(extrusion=>({...extrusion,distanceUm:command.thicknessUm}))};
        const cutSpec={...def.cutSpec,lengthUm:command.lengthUm,widthUm:command.widthUm,thicknessUm:command.thicknessUm,confirmation:'confirmed' as const};
        d={...d,definitions:d.definitions.map(x=>x.id===def.id?{...x,geometry,cutSpec}:x)};d=markLinks(d,def.id,'definition-edited');label='Edit primitive dimensions';break;
      }
      case 'erase-geometry': {
        const def=d.definitions.find(x=>x.id===command.definitionId);if(!def)throw Error('definition-not-found');
        let geometry:Geometry;
        if(command.target==='edge'){
          const edge=def.geometry.edges.find(x=>x.id===command.elementId);if(!edge)throw Error('edge-not-found');
          const dependent=def.geometry.faces.filter(face=>face.vertexIds.includes(edge.vertexIds[0])&&face.vertexIds.includes(edge.vertexIds[1]));
          if(dependent.some(face=>def.geometry.extrusions.some(extrusion=>extrusion.faceId===face.id)))throw Error('erase-supported-extrusion-as-solid');
          const removeFaces=new Set(dependent.map(face=>face.id));geometry={...def.geometry,edges:def.geometry.edges.filter(x=>x.id!==edge.id),faces:def.geometry.faces.filter(x=>!removeFaces.has(x.id))};
        } else {
          if(!def.geometry.faces.some(x=>x.id===command.elementId))throw Error('face-not-found');
          geometry={...def.geometry,faces:def.geometry.faces.filter(x=>x.id!==command.elementId),extrusions:def.geometry.extrusions.filter(x=>x.faceId!==command.elementId)};
        }
        const nextDef={...def,geometry,...(def.cutSpec?.kind==='explicit'?{cutSpec:{...def.cutSpec,confirmation:'requires-confirmation' as const}}:{cutSpec:undefined})};
        d={...d,definitions:d.definitions.map(x=>x.id===def.id?nextDef:x)};d=markLinks(d,def.id,'definition-edited');label='Erase geometry';break;
      }
      case 'erase-loose-geometry': {
        const object=d.looseObjects.find(x=>x.id===command.objectId);if(!object)throw Error('loose-object-not-found');let geometry:Geometry;
        if(command.target==='edge'){const edge=object.geometry.edges.find(x=>x.id===command.elementId);if(!edge)throw Error('edge-not-found');const dependent=object.geometry.faces.filter(face=>face.vertexIds.includes(edge.vertexIds[0])&&face.vertexIds.includes(edge.vertexIds[1]));if(dependent.some(face=>object.geometry.extrusions.some(extrusion=>extrusion.faceId===face.id)))throw Error('erase-supported-extrusion-as-solid');const removeFaces=new Set(dependent.map(face=>face.id));geometry={...object.geometry,edges:object.geometry.edges.filter(x=>x.id!==edge.id),faces:object.geometry.faces.filter(x=>!removeFaces.has(x.id))};}
        else{if(!object.geometry.faces.some(x=>x.id===command.elementId))throw Error('face-not-found');geometry={...object.geometry,faces:object.geometry.faces.filter(x=>x.id!==command.elementId),extrusions:object.geometry.extrusions.filter(x=>x.faceId!==command.elementId)};}
        d={...d,looseObjects:d.looseObjects.map(x=>x.id===object.id?{...x,geometry}:x)};label='Erase geometry';break;
      }
      case 'set-instance-transform': {
        const inst=d.instances.find(x=>x.id===command.instanceId);if(!inst)throw Error('instance-not-found');
        const pose=command.pose?{...command.pose,positionUm:[...command.pose.positionUm] as [number,number,number],rotation:normalizeQuaternion(command.pose.rotation)}:inst.pose;
        const scalePpm=command.scalePpm??inst.scalePpm;if(scalePpm.some(v=>!Number.isSafeInteger(v)||v<1||v>1_000_000_000))throw Error('invalid-scale');
        d={...d,instances:d.instances.map(x=>x.id===inst.id?{...x,pose,scalePpm}:x)};
        if(command.scalePpm&&command.reason==='instance-scaled') d=markLinks(d,inst.definitionId,'instance-scaled');label='Transform component';break;
      }
      case 'set-loose-transform': {
        const object=d.looseObjects.find(x=>x.id===command.objectId);if(!object)throw Error('loose-object-not-found');
        const pose=command.pose?{...command.pose,positionUm:[...command.pose.positionUm] as [number,number,number],rotation:normalizeQuaternion(command.pose.rotation)}:object.pose;
        const scalePpm=command.scalePpm??object.scalePpm;if(scalePpm.some(v=>!Number.isSafeInteger(v)||v<1||v>1_000_000_000))throw Error('invalid-scale');
        d={...d,looseObjects:d.looseObjects.map(x=>x.id===object.id?{...x,pose,scalePpm}:x)};label='Transform geometry';break;
      }
      case 'set-appearance': {
        if(command.definitionId){const def=d.definitions.find(x=>x.id===command.definitionId);if(!def)throw Error('definition-not-found');d={...d,definitions:d.definitions.map(x=>x.id===def.id?{...x,appearance:{color:command.color,...(command.opacity===undefined?{}:{opacity:command.opacity})}}:x)};}
        else if(command.instanceId){const inst=d.instances.find(x=>x.id===command.instanceId);if(!inst)throw Error('instance-not-found');d={...d,instances:d.instances.map(x=>x.id===inst.id?{...x,appearance:{color:command.color,...(command.opacity===undefined?{}:{opacity:command.opacity})}}:x)};}
        else if(command.objectId){const object=d.looseObjects.find(x=>x.id===command.objectId);if(!object)throw Error('loose-object-not-found');d={...d,looseObjects:d.looseObjects.map(x=>x.id===object.id?{...x,appearance:{color:command.color,...(command.opacity===undefined?{}:{opacity:command.opacity})}}:x)};}else throw Error('appearance-target-required');label='Paint';break;
      }
      case 'set-cut-spec': case 'confirm-cut-spec': {const def=d.definitions.find(x=>x.id===command.definitionId);if(!def)throw Error('definition-not-found');if(command.type==='confirm-cut-spec'&&command.cutSpec.confirmation!=='confirmed')throw Error('confirmation-required');d={...d,definitions:d.definitions.map(x=>x.id===def.id?{...x,cutSpec:clone(command.cutSpec)}:x)};d=markLinks(d,def.id,'definition-edited');label='Set cut dimensions';break;}
      case 'set-material': {if(command.materialId!==undefined&&!next.materials.some(m=>m.id===command.materialId))throw Error('material-not-found');if(command.target==='definition'){if(!d.definitions.some(x=>x.id===command.id))throw Error('definition-not-found');d={...d,definitions:d.definitions.map(x=>x.id===command.id?{...x,...(command.materialId?{materialId:command.materialId}:{materialId:undefined})}:x)};d=markLinks(d,command.id,'material-changed');}else{const instance=d.instances.find(x=>x.id===command.id);if(!instance)throw Error('instance-not-found');d={...d,instances:d.instances.map(x=>x.id===command.id?{...x,...(command.materialId?{materialId:command.materialId}:{materialId:undefined})}:x)};d=markInstanceLinks(d,command.id,'material-changed');}label='Set material';break;}
      case 'rename': {if(!command.name.trim()||command.name.length>256)throw Error('invalid-name');if(command.target==='definition'){if(!d.definitions.some(x=>x.id===command.id))throw Error('definition-not-found');d={...d,definitions:d.definitions.map(x=>x.id===command.id?{...x,name:command.name.trim()}:x)};d=markLinks(d,command.id,'definition-edited');}else if(command.target==='instance'){if(!d.instances.some(x=>x.id===command.id))throw Error('instance-not-found');d={...d,instances:d.instances.map(x=>x.id===command.id?{...x,name:command.name.trim()}:x)};}else{if(!d.looseObjects.some(x=>x.id===command.id))throw Error('loose-object-not-found');d={...d,looseObjects:d.looseObjects.map(x=>x.id===command.id?{...x,name:command.name.trim()}:x)};}label='Rename';break;}
      case 'set-state': {if(command.target==='instance'){if(!d.instances.some(x=>x.id===command.id))throw Error('instance-not-found');d={...d,instances:d.instances.map(x=>x.id===command.id?{...x,...(command.hidden===undefined?{}:{hidden:command.hidden}),...(command.locked===undefined?{}:{locked:command.locked})}:x)};}else{if(!d.looseObjects.some(x=>x.id===command.id))throw Error('loose-object-not-found');d={...d,looseObjects:d.looseObjects.map(x=>x.id===command.id?{...x,...(command.hidden===undefined?{}:{hidden:command.hidden}),...(command.locked===undefined?{}:{locked:command.locked})}:x)};}label='Set visibility and lock';break;}
      case 'duplicate-instance': {const source=d.instances.find(x=>x.id===command.sourceId);if(!source)throw Error('instance-not-found');const offset=command.offsetUm??100_000;d={...d,instances:[...d.instances,{...source,id:command.id,pose:{...source.pose,positionUm:[source.pose.positionUm[0]+offset,source.pose.positionUm[1],source.pose.positionUm[2]]}}]};label='Duplicate component';break;}
      case 'make-unique': {const source=d.instances.find(x=>x.id===command.instanceId);if(!source)throw Error('instance-not-found');const def=d.definitions.find(x=>x.id===source.definitionId);if(!def)throw Error('definition-not-found');const unique={...clone(def),id:command.definitionId};d={...d,definitions:[...d.definitions,unique],instances:d.instances.map(x=>x.id===source.id?{...x,definitionId:unique.id}:x)};d=markLinks(d,def.id,'made-unique');label='Make unique';break;}
      case 'delete-instance': {const inst=d.instances.find(x=>x.id===command.instanceId);if(!inst)throw Error('instance-not-found');d={...d,instances:d.instances.filter(x=>x.id!==inst.id)};d=markLinks(d,inst.definitionId,'source-deleted');label='Delete component';break;}
      case 'delete-loose': {if(!d.looseObjects.some(x=>x.id===command.objectId))throw Error('loose-object-not-found');d={...d,looseObjects:d.looseObjects.filter(x=>x.id!==command.objectId)};label='Erase geometry';break;}
      case 'delete-definition': {const def=d.definitions.find(x=>x.id===command.definitionId);if(!def)throw Error('definition-not-found');d={...d,definitions:d.definitions.filter(x=>x.id!==def.id),instances:d.instances.filter(x=>x.definitionId!==def.id)};d=markLinks(d,def.id,'source-deleted',new Set());label='Delete definition';break;}
      case 'include-in-projection': {if(!command.instanceIds.length||new Set(command.instanceIds).size!==command.instanceIds.length||command.instanceIds.some(id=>!d.instances.some(x=>x.id===id)))throw Error('invalid-instance-selection');d={...d,instances:d.instances.map(x=>{if(!command.instanceIds.includes(x.id))return x;const included={...x};delete included.projectionExcluded;return included;})};label='Include in cutlist';break;}
      case 'detach-part': {const link=d.partLinks[command.partId];if(!link)throw Error('link-not-found');const sourceIds=new Set([...(link.current?.instanceIds??[]),...link.lastApplied.sources.instanceIds]);d={...d,instances:d.instances.map(i=>sourceIds.has(i.id)?{...i,projectionExcluded:true}:i)};const partLinks={...d.partLinks};delete partLinks[command.partId];d={...d,partLinks};label='Detach cutlist row';break;}
      case 'delete-part': {const link=d.partLinks[command.partId];if(link){const reasons:LinkReason[]=[...new Set<LinkReason>([...(link.state==='active'?[]:link.reasons),'part-deleted'])];d={...d,partLinks:{...d.partLinks,[command.partId]:{state:'pending-part-deletion',reasons,lastApplied:link.lastApplied}}};}next.parts=next.parts.filter(p=>p.id!==command.partId);label='Delete cutlist row';break;}
      case 'edit-part': {if(!next.parts.some(p=>p.id===command.part.id))throw Error('part-not-found');next.parts=next.parts.map(p=>p.id===command.part.id?clone(command.part):p);label='Edit cutlist row';break;}
    }
    next.design=d; const invalid=validateNext(next);if(invalid)throw Error(invalid);
    normalizeProjectDocument(next);
    return {ok:true,project:next,label};
  } catch(error) {return {ok:false,project,code:error instanceof Error?error.message:'command-rejected',message:error instanceof Error?error.message:'Command rejected'};}
}

export function newDesignDocument():DesignDocumentV1{return {schemaVersion:1,definitions:[],instances:[],looseObjects:[],partLinks:{}};}
