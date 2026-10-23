import { describe, expect, it } from 'vitest';
import { getRectangularProfile, metersToUm, rectangleGeometry, rectangularProfileSide, resizeRectangularProfile, scaleDimensionUm, scalePoseKeepingLocalPivot, setExtrusionDistance, transformLocalPoint, validateGeometryTopology } from './geometry';
import { applyDesignCommand } from './commands';
import { beginCommandSession, commitCommandSession, commitSessionCommand, createDesignHistory, redoSession, undoSession, updateCommandSession } from './history';
import { createApplyIntent, createProjectionPreview, projectEligibleRows } from './projection';
import type { Project } from '../model';
import { copyProjectDocument, exportProject, importProject } from '../model';

const empty:Project={schemaVersion:2,id:'p',name:'Project',unitSystem:'metric',kerf:{um:0},trim:{um:0},minOffcutLinear:{um:0},minOffcutSheet:{shortSideUm:0,longSideUm:0},currency:'CAD',parts:[],materials:[{id:'wood',name:'Wood',type:'linear',stocks:[]}],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',design:{schemaVersion:1,definitions:[],instances:[],looseObjects:[],partLinks:{}}};
const applyReviewed=(project:Project,preview:ReturnType<typeof createProjectionPreview>,editSequence:number,localGeneration:number)=>createApplyIntent(project,preview,Object.fromEntries(preview.changes.map(c=>[c.rowKey,{disposition:'apply' as const,fieldChoices:Object.fromEntries(c.conflicts.map(field=>[field,'design' as const]))}])),{editSequence,localGeneration});

describe('renderer-free design geometry',()=>{
  it('detects and resizes axis-aligned rectangular profiles while preserving IDs and the anchored opposite edge',()=>{
    const geometry=rectangleGeometry(100,80,p=>`${p}-${Math.random()}`,20);const ids=geometry.vertices.map(vertex=>vertex.id);const faceId=geometry.faces[0].id;
    expect(getRectangularProfile(geometry)).toMatchObject({minX:0,maxX:100,minY:0,maxY:80,depthUm:20});
    expect(rectangularProfileSide(geometry,[0.0001,0.00004,0.01],[1,0,0])).toEqual({axis:'x',side:1});
    const resized=resizeRectangularProfile(geometry,{lengthUm:120,widthUm:60,depthUm:30},{axis:'x',side:1});
    expect(resized.vertices.map(vertex=>vertex.id)).toEqual(ids);expect(resized.faces[0].id).toBe(faceId);expect(resized.vertices.map(vertex=>vertex.positionUm)).toContainEqual([0,0,0]);expect(resized.vertices.map(vertex=>vertex.positionUm)).toContainEqual([120,60,0]);expect(resized.extrusions[0].distanceUm).toBe(30);
    expect(resizeRectangularProfile(geometry,{lengthUm:120,widthUm:80},{axis:'x',side:-1}).vertices.map(vertex=>vertex.positionUm)).toContainEqual([-20,0,0]);
  });
  it('rejects non-rectangular profiles and flat-profile depth anchoring',()=>{
    const geometry=rectangleGeometry(100,80,p=>`${p}-${Math.random()}`);geometry.vertices[2].positionUm[0]=90;
    expect(getRectangularProfile(geometry)).toBeUndefined();expect(()=>resizeRectangularProfile(geometry,{lengthUm:120,widthUm:80})).toThrow('Unsupported rectangular profile');
    expect(()=>resizeRectangularProfile(rectangleGeometry(100,80,p=>`${p}-${Math.random()}`),{lengthUm:100,widthUm:80,depthUm:10},{axis:'z',side:1})).toThrow('no opposite extrusion face');
  });
  it('rounds positive half-micrometers upward and composes scale before pose',()=>{
    expect(scaleDimensionUm(3,500_000)).toBe(2);
    expect(transformLocalPoint([1_000_000,0,0],{positionUm:[10,0,0],rotation:[0,0,0,1]},[2_000_000,1_000_000,1_000_000])).toEqual([2_000_010,0,0]);
    expect(validateGeometryTopology(rectangleGeometry(10,5,p=>`${p}-${Math.random()}`))).toEqual([]);
    expect(metersToUm(0.0000005)).toBe(1);expect(metersToUm(-0.0000005)).toBe(-1);
    const pivoted=scalePoseKeepingLocalPivot({positionUm:[0,0,0],rotation:[0,0,0,1]},[1_000_000,1_000_000,1_000_000],[2_000_000,1_000_000,1_000_000],[10,0,0]);
    expect(transformLocalPoint([10,0,0],pivoted,[2_000_000,1_000_000,1_000_000])).toEqual([10,0,0]);
  });
  it('rejects an open/nonplanar invalid profile without altering the input project',()=>{
    const before=empty; const result=applyDesignCommand(empty,{type:'create-board',id:'i',definitionId:'d',name:'Board',lengthUm:100,widthUm:50,thicknessUm:20});
    expect(result.ok).toBe(true); if(!result.ok)return;
    const bad={...result.project.design!.definitions[0].geometry,edges:[]};
    const rejected=applyDesignCommand(result.project,{type:'set-geometry',definitionId:'d',geometry:bad});
    expect(rejected.ok).toBe(false); expect(rejected.project).toBe(result.project); expect(before.design!.definitions).toHaveLength(0);
  });
  it('rejects out-of-bound effective dimensions without changing valid project state',()=>{
    const created=applyDesignCommand(empty,{type:'create-board',id:'i',definitionId:'d',name:'Maximum',lengthUm:1_000_000_000,widthUm:1,thicknessUm:1});expect(created.ok).toBe(true);if(!created.ok)return;
    const invalid=applyDesignCommand(created.project,{type:'set-instance-transform',instanceId:'i',scalePpm:[2_000_000,1_000_000,1_000_000]});
    expect(invalid.ok).toBe(false);expect(invalid.project).toBe(created.project);
  });
  it('enforces one-micrometer planarity tolerance and rejects self-crossing loops',()=>{
    const ids=(p:string)=>`${p}-${Math.random()}`;const planar=rectangleGeometry(100,100,ids);
    planar.vertices[2].positionUm[2]=1;expect(validateGeometryTopology(planar)).toEqual([]);
    planar.vertices[2].positionUm[2]=200;expect(validateGeometryTopology(planar)).toContain('face:'+planar.faces[0].id+':nonplanar');
    const bow=rectangleGeometry(100,100,ids);bow.faces[0].vertexIds=[bow.faces[0].vertexIds[0],bow.faces[0].vertexIds[2],bow.faces[0].vertexIds[1],bow.faces[0].vertexIds[3]];
    expect(validateGeometryTopology(bow).some(e=>e.includes('self-intersection')||e.includes(':open')||e.includes(':degenerate'))).toBe(true);
  });
  it('rejects push-pull sign changes that move an existing cap through its base',()=>{
    const geometry=rectangleGeometry(100,100,p=>`${p}-${Math.random()}`,10);
    expect(()=>setExtrusionDistance(geometry,geometry.faces[0].id,-1,'x')).toThrow('cannot cross');
  });
});

describe('commands and history',()=>{
  it('creates a board as one reversible command',()=>{
    const committed=commitSessionCommand(createDesignHistory(),empty,{type:'create-board',id:'i',definitionId:'d',name:'Board',lengthUm:100,widthUm:50,thicknessUm:20});
    expect(committed.project.design!.definitions[0].cutSpec?.confirmation).toBe('confirmed');
    const undone=undoSession(committed.history,committed.project); expect(undone.project).toBe(empty);
    expect(redoSession(undone.history,undone.project).project).toBe(committed.project);
  });
  it('updates primitive dimensions with its geometry and confirmation in one command',()=>{
    const created=applyDesignCommand(empty,{type:'create-panel',id:'i',definitionId:'d',name:'Panel',lengthUm:100,widthUm:50,thicknessUm:20});if(!created.ok)throw Error(created.message);
    const resized=applyDesignCommand(created.project,{type:'set-primitive-dimensions',definitionId:'d',lengthUm:120,widthUm:60,thicknessUm:25});expect(resized.ok).toBe(true);if(!resized.ok)return;
    expect(resized.project.design!.definitions[0].cutSpec).toMatchObject({lengthUm:120,widthUm:60,thicknessUm:25,confirmation:'confirmed'});
    expect(resized.project.design!.definitions[0].geometry.vertices.map(v=>v.positionUm)).toContainEqual([120,60,0]);
  });
  it('keeps the opposite box face fixed for each shared instance when resizing a side',()=>{
    const created=applyDesignCommand(empty,{type:'create-board',id:'i',definitionId:'d',name:'Board',lengthUm:100,widthUm:50,thicknessUm:20});if(!created.ok)throw Error(created.message);
    const duplicated=applyDesignCommand(created.project,{type:'duplicate-instance',sourceId:'i',id:'i2'});if(!duplicated.ok)throw Error(duplicated.message);
    const resized=applyDesignCommand(duplicated.project,{type:'set-primitive-dimensions',definitionId:'d',lengthUm:120,widthUm:50,thicknessUm:20,anchor:{axis:'x',side:1}});expect(resized.ok).toBe(true);if(!resized.ok)return;
    for(const instance of resized.project.design!.instances){const fixedLocal: [number,number,number]=[-60,0,0];const fixedWorld=transformLocalPoint(fixedLocal,instance.pose,instance.scalePpm)[0];expect(fixedWorld).toBe(instance.id==='i'?-50:99_950);}
    expect(resized.project.design!.definitions[0].cutSpec?.lengthUm).toBe(120);
  });
  it('erases loose faces with their extrusion and rejects erasing a supporting edge alone',()=>{
    const geometry=rectangleGeometry(30,20,p=>`${p}-${Math.random()}`,10);
    const loose={id:'solid',name:'Solid',geometry,pose:{positionUm:[0,0,0] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]},scalePpm:[1_000_000,1_000_000,1_000_000] as [number,number,number],appearance:{color:'#123456'},hidden:false,locked:false};
    const created=applyDesignCommand(empty,{type:'create-loose',object:loose});if(!created.ok)throw Error(created.message);
    const rejected=applyDesignCommand(created.project,{type:'erase-loose-geometry',objectId:'solid',target:'edge',elementId:geometry.edges[0].id});expect(rejected.ok).toBe(false);expect(rejected.project).toBe(created.project);
    const erased=applyDesignCommand(created.project,{type:'erase-loose-geometry',objectId:'solid',target:'face',elementId:geometry.faces[0].id});expect(erased.ok).toBe(true);if(!erased.ok)return;
    expect(erased.project.design!.looseObjects[0].geometry.faces).toHaveLength(0);expect(erased.project.design!.looseObjects[0].geometry.extrusions).toHaveLength(0);
  });
  it('pushes and pulls a loose face through one undoable geometry command',()=>{
    const geometry=rectangleGeometry(30,20,p=>`${p}-${Math.random()}`);
    const object={id:'push-pull-loose',name:'Panel',geometry,pose:{positionUm:[0,0,0] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]},scalePpm:[1_000_000,1_000_000,1_000_000] as [number,number,number],appearance:{color:'#123456'},hidden:false,locked:false};
    const created=applyDesignCommand(empty,{type:'create-loose',object});if(!created.ok)throw Error(created.message);
    const pushedGeometry=setExtrusionDistance(geometry,geometry.faces[0].id,15,'push-pull-extrusion');
    const pushed=commitSessionCommand(createDesignHistory(),created.project,{type:'set-loose-geometry',objectId:object.id,geometry:pushedGeometry});
    expect(pushed.project.design!.looseObjects[0].geometry.extrusions).toEqual([{id:'push-pull-extrusion',faceId:geometry.faces[0].id,distanceUm:15}]);
    expect(undoSession(pushed.history,pushed.project).project).toBe(created.project);
  });
  it('applies anchored loose rectangular side resizing as one undoable geometry command',()=>{
    const geometry=rectangleGeometry(100,80,p=>`${p}-${Math.random()}`,20);const object={id:'rect-side',name:'Rectangle',geometry,pose:{positionUm:[0,0,0] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]},scalePpm:[1_000_000,1_000_000,1_000_000] as [number,number,number],appearance:{color:'#123456'},hidden:false,locked:false};const created=applyDesignCommand(empty,{type:'create-loose',object});if(!created.ok)throw Error(created.message);
    const resizedGeometry=resizeRectangularProfile(geometry,{lengthUm:130,widthUm:80},{axis:'x',side:1});const resized=commitSessionCommand(createDesignHistory(),created.project,{type:'set-loose-geometry',objectId:object.id,geometry:resizedGeometry});
    expect(getRectangularProfile(resized.project.design!.looseObjects[0].geometry)?.maxX).toBe(130);expect(undoSession(resized.history,resized.project).project).toBe(created.project);
  });
  it('applies loose-object transforms and appearance through reversible domain commands',()=>{
    const object={id:'loose-paint',name:'Loose',geometry:rectangleGeometry(30,20,p=>`${p}-${Math.random()}`),pose:{positionUm:[0,0,0] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]},scalePpm:[1_000_000,1_000_000,1_000_000] as [number,number,number],appearance:{color:'#123456'},hidden:false,locked:false};
    const created=applyDesignCommand(empty,{type:'create-loose',object});if(!created.ok)throw Error(created.message);
    const painted=applyDesignCommand(created.project,{type:'set-appearance',objectId:object.id,color:'#abcdef'});expect(painted.ok).toBe(true);if(!painted.ok)return;expect(painted.project.design!.looseObjects[0].appearance.color).toBe('#abcdef');
    const transformed=applyDesignCommand(painted.project,{type:'set-loose-transform',objectId:object.id,pose:{positionUm:[5,6,7],rotation:[0,0,0,1]},scalePpm:[2_000_000,2_000_000,2_000_000]});expect(transformed.ok).toBe(true);if(!transformed.ok)return;
    expect(transformed.project.design!.looseObjects[0]).toMatchObject({pose:{positionUm:[5,6,7]},scalePpm:[2_000_000,2_000_000,2_000_000],appearance:{color:'#abcdef'}});
    const history=commitSessionCommand(createDesignHistory(),painted.project,{type:'set-loose-transform',objectId:object.id,pose:{positionUm:[5,6,7],rotation:[0,0,0,1]}});expect(undoSession(history.history,history.project).project).toBe(painted.project);
  });
  it('keeps only the last valid provisional gesture and records one undo entry',()=>{
    const created=applyDesignCommand(empty,{type:'create-board',id:'i',definitionId:'d',name:'Board',lengthUm:100,widthUm:50,thicknessUm:20});if(!created.ok)throw Error(created.message);
    const session=beginCommandSession(created.project);
    const first=updateCommandSession(session,{type:'set-instance-transform',instanceId:'i',pose:{positionUm:[10,0,0],rotation:[0,0,0,1]}});
    const invalid=updateCommandSession(first,{type:'set-instance-transform',instanceId:'i',scalePpm:[0,1_000_000,1_000_000]});expect(invalid.valid).toBe(false);expect(invalid.provisional.design!.instances[0].pose.positionUm).toEqual([10,0,0]);
    const repaired=updateCommandSession(invalid,{type:'set-instance-transform',instanceId:'i',scalePpm:[2_000_000,1_000_000,1_000_000]});const committed=commitCommandSession(createDesignHistory(),repaired);
    expect(committed.committed).toBe(true);expect(committed.history.entries).toHaveLength(1);expect(undoSession(committed.history,committed.project).project).toBe(created.project);
  });
  it('retains explicit dimensions while requiring confirmation after geometry edits',()=>{
    const created=applyDesignCommand(empty,{type:'create-board',id:'i',definitionId:'d',name:'Board',lengthUm:100,widthUm:50,thicknessUm:20});if(!created.ok)throw Error(created.message);
    const confirmed=applyDesignCommand(created.project,{type:'set-cut-spec',definitionId:'d',cutSpec:{kind:'explicit',lengthUm:111,widthUm:51,thicknessUm:21,grainAxis:'length',confirmation:'confirmed'}});if(!confirmed.ok)throw Error(confirmed.message);
    const edited=applyDesignCommand(confirmed.project,{type:'set-geometry',definitionId:'d',geometry:confirmed.project.design!.definitions[0].geometry});if(!edited.ok)throw Error(edited.message);
    expect(edited.project.design!.definitions[0].cutSpec).toMatchObject({lengthUm:111,confirmation:'requires-confirmation'});
    const reopened=importProject(exportProject(edited.project));expect(reopened.design!.definitions[0].cutSpec).toMatchObject({lengthUm:111,widthUm:51,thicknessUm:21,confirmation:'requires-confirmation'});
  });
  it('makes a loose selection into one shared definition and rejects missing/nested references',()=>{
    const geometry=rectangleGeometry(30,20,p=>`${p}-${Math.random()}`);
    const loose={id:'loose',name:'Profile',geometry,pose:{positionUm:[5,6,7] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]},scalePpm:[1_000_000,1_000_000,1_000_000] as [number,number,number],appearance:{color:'#123456'},hidden:false,locked:false};
    const created=applyDesignCommand(empty,{type:'create-loose',object:loose});if(!created.ok)throw Error(created.message);
    const second=applyDesignCommand(created.project,{type:'create-loose',object:{...loose,id:'loose2',pose:{...loose.pose,positionUm:[50,0,0]}}});if(!second.ok)throw Error(second.message);
    const component=applyDesignCommand(second.project,{type:'make-component',objectIds:['loose','loose2'],definitionId:'def',instanceId:'instance',name:'Profile'});expect(component.ok).toBe(true);if(!component.ok)return;
    expect(component.project.design!.looseObjects).toHaveLength(0);expect(component.project.design!.instances[0].pose.positionUm).toEqual([0,0,0]);expect(component.project.design!.definitions[0].geometry.vertices[0].positionUm).toEqual([5,6,7]);expect(component.project.design!.definitions[0].geometry.faces).toHaveLength(2);
    expect(applyDesignCommand(component.project,{type:'make-component',objectId:'missing',definitionId:'nested',instanceId:'i2',name:'Bad'}).ok).toBe(false);
  });
});

describe('pure projection preview and atomic intent',()=>{
  it('projects scaled eligible instances and excludes detached instances',()=>{
    const created=applyDesignCommand(empty,{type:'create-board',id:'i',definitionId:'d',name:'Board',materialId:'wood',lengthUm:100,widthUm:20,thicknessUm:10});if(!created.ok)throw Error(created.message);
    const scaled=applyDesignCommand(created.project,{type:'set-instance-transform',instanceId:'i',scalePpm:[2_000_000,1_000_000,1_000_000]});if(!scaled.ok)throw Error(scaled.message);
    expect(projectEligibleRows(scaled.project)[0].fields.length.um).toBe(200);
    const moved=applyDesignCommand(scaled.project,{type:'set-instance-transform',instanceId:'i',pose:{positionUm:[800,200,0],rotation:[0,0,0.7071067811865476,0.7071067811865476]}});if(!moved.ok)throw Error(moved.message);
    expect(projectEligibleRows(moved.project)[0].fields.length.um).toBe(200);
    const detached=applyDesignCommand(scaled.project,{type:'detach-part',partId:'unknown'});expect(detached.ok).toBe(false);
  });
  it('requires explicit dispositions and rejects stale apply intents',()=>{
    const created=applyDesignCommand(empty,{type:'create-board',id:'i',definitionId:'d',name:'Board',materialId:'wood',lengthUm:100,widthUm:20,thicknessUm:10});if(!created.ok)throw Error(created.message);
    const preview=createProjectionPreview(created.project,4,9,()=> 'part-new');
    expect(preview.changes[0].kind).toBe('add');
    expect(()=>createApplyIntent(created.project,preview,{}, {editSequence:5,localGeneration:9})).toThrow('stale-preview');
    const intent=applyReviewed(created.project,preview,4,9);
    expect(intent.parts[0].id).toBe('part-new'); expect(intent.design.partLinks['part-new'].state).toBe('active');
  });
  it('detects split and merge identities and requires reviewed decisions',()=>{
    let project=empty;
    const created=applyDesignCommand(project,{type:'create-board',id:'i1',definitionId:'d',name:'Board',materialId:'wood',lengthUm:100,widthUm:20,thicknessUm:10});if(!created.ok)throw Error(created.message);project=created.project;
    const dup=applyDesignCommand(project,{type:'duplicate-instance',sourceId:'i1',id:'i2'});if(!dup.ok)throw Error(dup.message);project=dup.project;
    const first=createProjectionPreview(project,1,1,()=> 'part-a');const applied=applyReviewed(project,first,1,1);project={...project,parts:applied.parts,design:applied.design};
    const scaled=applyDesignCommand(project,{type:'set-instance-transform',instanceId:'i2',scalePpm:[2_000_000,1_000_000,1_000_000],reason:'instance-scaled'});if(!scaled.ok)throw Error(scaled.message);project=scaled.project;
    const split=createProjectionPreview(project,2,1,()=> 'part-b');expect(split.changes.some(c=>c.kind==='split')).toBe(true);
    expect(()=>createApplyIntent(project,split,{}, {editSequence:2,localGeneration:1})).toThrow('unresolved-projection-conflict');
    const splitDecisions=Object.fromEntries(split.changes.map(c=>[c.rowKey,{disposition:'apply' as const,fieldChoices:Object.fromEntries(c.conflicts.map(f=>[f,'design' as const]))}]));
    const splitApplied=createApplyIntent(project,split,splitDecisions,{editSequence:2,localGeneration:1});project={...project,parts:splitApplied.parts,design:splitApplied.design};
    const restored=applyDesignCommand(project,{type:'set-instance-transform',instanceId:'i2',scalePpm:[1_000_000,1_000_000,1_000_000],reason:'instance-scaled'});if(!restored.ok)throw Error(restored.message);project=restored.project;
    const merge=createProjectionPreview(project,3,1,()=> 'part-c');expect(merge.changes.some(c=>c.kind==='merge')).toBe(true);
    const merged=createApplyIntent(project,merge,Object.fromEntries(merge.changes.map(c=>[c.rowKey,{disposition:c.requiresDisposition?'apply' as const:undefined,fieldChoices:Object.fromEntries(c.conflicts.map(f=>[f,'design' as const]))}])),{editSequence:3,localGeneration:1});
    expect(merged.parts).toHaveLength(1);
  });
  it('requires field decisions on a three-way conflict and keeps the manual field on choice',()=>{
    const created=applyDesignCommand(empty,{type:'create-board',id:'i',definitionId:'d',name:'Board',materialId:'wood',lengthUm:100,widthUm:20,thicknessUm:10});if(!created.ok)throw Error(created.message);
    const initial=createProjectionPreview(created.project,1,1,()=> 'part');const first=applyReviewed(created.project,initial,1,1);
    const manual={...first.parts[0],name:'Hand kept'};const project={...created.project,parts:[manual],design:first.design};
    const renamed=applyDesignCommand(project,{type:'rename',target:'definition',id:'d',name:'Design name'});if(!renamed.ok)throw Error(renamed.message);
    const preview=createProjectionPreview(renamed.project,2,1,()=> 'unused');expect(preview.changes[0].conflicts).toContain('name');
    expect(()=>createApplyIntent(renamed.project,preview,{[preview.changes[0].rowKey]:{disposition:'apply'}},{editSequence:2,localGeneration:1})).toThrow('unresolved-projection-conflict');
    const intent=createApplyIntent(renamed.project,preview,{[preview.changes[0].rowKey]:{disposition:'apply',fieldChoices:{name:'manual'}}},{editSequence:2,localGeneration:1});
    expect(intent.parts[0].name).toBe('Hand kept');expect(intent.design.partLinks.part.lastApplied.fields.name).toBe('Design name');
  });
  it('keeps detach exclusion through copy and requires an explicit new preview after include',()=>{
    const created=applyDesignCommand(empty,{type:'create-board',id:'i',definitionId:'d',name:'Board',materialId:'wood',lengthUm:100,widthUm:20,thicknessUm:10});if(!created.ok)throw Error(created.message);
    const preview=createProjectionPreview(created.project,1,1,()=> 'part');const applied=applyReviewed(created.project,preview,1,1);
    const linked={...created.project,parts:applied.parts,design:applied.design};const detached=applyDesignCommand(linked,{type:'detach-part',partId:'part'});if(!detached.ok)throw Error(detached.message);
    const copy=copyProjectDocument(detached.project,'Copy','2026-01-02T00:00:00.000Z');expect(copy.design!.instances[0].projectionExcluded).toBe(true);expect(projectEligibleRows(copy)).toEqual([]);
    const reopened=importProject(exportProject(copy));expect(reopened.design!.instances[0].projectionExcluded).toBe(true);expect(projectEligibleRows(reopened)).toEqual([]);
    const included=applyDesignCommand(copy,{type:'include-in-projection',instanceIds:['i']});if(!included.ok)throw Error(included.message);expect(included.project.design!.instances[0].projectionExcluded).toBeUndefined();
    expect(createProjectionPreview(included.project,2,2,()=> 'new-part').changes[0].kind).toBe('add');
  });
  it('keeps shared definitions independent through duplicate, Make Unique and source deletion',()=>{
    const created=applyDesignCommand(empty,{type:'create-board',id:'i1',definitionId:'d',name:'Board',materialId:'wood',lengthUm:100,widthUm:20,thicknessUm:10});if(!created.ok)throw Error(created.message);
    const duplicate=applyDesignCommand(created.project,{type:'duplicate-instance',sourceId:'i1',id:'i2'});if(!duplicate.ok)throw Error(duplicate.message);
    const unique=applyDesignCommand(duplicate.project,{type:'make-unique',instanceId:'i2',definitionId:'d2'});if(!unique.ok)throw Error(unique.message);
    expect(unique.project.design!.instances.map(i=>i.definitionId)).toEqual(['d','d2']);expect(unique.project.design!.definitions).toHaveLength(2);
    const removed=applyDesignCommand(unique.project,{type:'delete-instance',instanceId:'i1'});expect(removed.ok).toBe(true);
  });
  it('marks manual Part deletion and never silently recreates its generated row',()=>{
    const created=applyDesignCommand(empty,{type:'create-board',id:'i',definitionId:'d',name:'Board',materialId:'wood',lengthUm:100,widthUm:20,thicknessUm:10});if(!created.ok)throw Error(created.message);
    const initial=createProjectionPreview(created.project,1,1,()=> 'part');const applied=applyReviewed(created.project,initial,1,1);const linked={...created.project,parts:applied.parts,design:applied.design};
    const deleted=applyDesignCommand(linked,{type:'delete-part',partId:'part'});if(!deleted.ok)throw Error(deleted.message);expect(deleted.project.design!.partLinks.part.state).toBe('pending-part-deletion');
    const preview=createProjectionPreview(deleted.project,2,2,()=> 'part-new');expect(preview.changes[0].kind).toBe('add');expect(preview.changes[0].requiresDisposition).toBe(true);
    expect(()=>createApplyIntent(deleted.project,preview,{}, {editSequence:2,localGeneration:2})).toThrow('unresolved-projection-conflict');
    const keptOut=createApplyIntent(deleted.project,preview,{[preview.changes[0].rowKey]:{disposition:'remove'}},{editSequence:2,localGeneration:2});expect(keptOut.parts).toHaveLength(0);expect(keptOut.design.instances[0].projectionExcluded).toBe(true);
  });
  it('updates current membership and pending reasons when a linked instance becomes unique',()=>{
    const created=applyDesignCommand(empty,{type:'create-board',id:'i1',definitionId:'d',name:'Board',materialId:'wood',lengthUm:100,widthUm:20,thicknessUm:10});if(!created.ok)throw Error(created.message);
    const duplicated=applyDesignCommand(created.project,{type:'duplicate-instance',sourceId:'i1',id:'i2'});if(!duplicated.ok)throw Error(duplicated.message);
    const initial=createProjectionPreview(duplicated.project,1,1,()=> 'part');const applied=applyReviewed(duplicated.project,initial,1,1);const linked={...duplicated.project,parts:applied.parts,design:applied.design};
    const unique=applyDesignCommand(linked,{type:'make-unique',instanceId:'i2',definitionId:'d2'});if(!unique.ok)throw Error(unique.message);
    expect(unique.project.design!.partLinks.part).toMatchObject({state:'pending-reconcile',reasons:['made-unique'],current:{definitionId:'d',instanceIds:['i1']}});
  });
  it('marks shared geometry edits pending and restores links with undo and redo',()=>{
    const created=applyDesignCommand(empty,{type:'create-board',id:'i1',definitionId:'d',name:'Board',materialId:'wood',lengthUm:100,widthUm:20,thicknessUm:10});if(!created.ok)throw Error(created.message);
    const duplicated=applyDesignCommand(created.project,{type:'duplicate-instance',sourceId:'i1',id:'i2'});if(!duplicated.ok)throw Error(duplicated.message);
    const preview=createProjectionPreview(duplicated.project,1,1,()=> 'part');const applied=applyReviewed(duplicated.project,preview,1,1);const linked={...duplicated.project,parts:applied.parts,design:applied.design};
    const history=createDesignHistory();const edit=commitSessionCommand(history,linked,{type:'set-geometry',definitionId:'d',geometry:linked.design!.definitions[0].geometry});
    expect(edit.project.design!.partLinks.part.state).toBe('pending-reconcile');
    const undo=undoSession(edit.history,edit.project);expect(undo.project.design!.partLinks.part.state).toBe('active');
    expect(redoSession(undo.history,undo.project).project.design!.partLinks.part.state).toBe('pending-reconcile');
  });
  it('uses sheet grain orientation and keeps unlike grain outcomes in separate projection groups',()=>{
    const withSheet={...empty,materials:[...empty.materials,{id:'sheet',name:'Sheet',type:'sheet' as const,stocks:[]}]};
    const created=applyDesignCommand(withSheet,{type:'create-panel',id:'i1',definitionId:'panel',name:'Side',materialId:'sheet',lengthUm:100,widthUm:40,thicknessUm:18,grainAxis:'width'});if(!created.ok)throw Error(created.message);
    const duplicate=applyDesignCommand(created.project,{type:'duplicate-instance',sourceId:'i1',id:'i2'});if(!duplicate.ok)throw Error(duplicate.message);
    const rows=projectEligibleRows(duplicate.project);expect(rows).toHaveLength(1);expect(rows[0].fields).toMatchObject({length:{um:40},width:{um:100},grainLocked:true,quantity:2});
    const unique=applyDesignCommand(duplicate.project,{type:'set-instance-transform',instanceId:'i2',scalePpm:[2_000_000,1_000_000,1_000_000]});if(!unique.ok)throw Error(unique.message);
    expect(projectEligibleRows(unique.project)).toHaveLength(2);
  });
});
