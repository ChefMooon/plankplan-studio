import { describe, expect, it } from 'vitest';
import { validateDesignDocument } from './schema';
import type { Part } from '../model';

const part:Part={id:'part',name:'Panel',materialId:'sheet',length:{um:100},width:{um:80},quantity:1};
const definition={id:'def',name:'Panel',geometry:{vertices:[],edges:[],faces:[],extrusions:[]},appearance:{color:'#aabbcc'}};
const instance={id:'inst',definitionId:'def',pose:{positionUm:[0,0,0],rotation:[0,0,0,1]},scalePpm:[1_000_000,1_000_000,1_000_000],hidden:false,locked:false};
const fields={name:'Panel',materialId:'sheet',length:{um:100},width:{um:80},grainLocked:false,quantity:1};
const snapshot={sources:{definitionId:'old-definition',instanceIds:['old-instance']},fields};
const validate=(value:Record<string,unknown>,parts:Part[]=[part])=>validateDesignDocument({schemaVersion:1,definitions:[definition],instances:[instance],looseObjects:[],partLinks:{},...value},parts,new Set(['sheet']));

describe('DesignDocumentV1 portable schema',()=>{
  it('accepts active and pending lifecycle records with historical source snapshots',()=>{
    const active={part:{state:'active',current:{definitionId:'def',instanceIds:['inst']},lastApplied:{sources:{definitionId:'def',instanceIds:['inst']},fields}}};
    expect(validate({partLinks:active})).toEqual([]);
    expect(validate({partLinks:{part:{state:'pending-reconcile',reasons:['made-unique','definition-edited'],current:{definitionId:'def',instanceIds:['inst']},lastApplied:snapshot}}})).toEqual([]);
    expect(validate({partLinks:{part:{state:'pending-removal',reasons:['source-deleted'],lastApplied:snapshot}}})).toEqual([]);
    expect(validate({partLinks:{part:{state:'pending-part-deletion',reasons:['part-deleted'],lastApplied:snapshot}}},[])).toEqual([]);
  });

  it('rejects malformed active references, duplicate contributors, unknown record fields, and nested assemblies',()=>{
    expect(validate({partLinks:{part:{state:'active',current:{definitionId:'missing',instanceIds:['inst']},lastApplied:snapshot}}}).some(issue=>issue.code==='dangling-source-definition')).toBe(true);
    expect(validate({partLinks:{part:{state:'active',current:{definitionId:'def',instanceIds:['inst','inst']},lastApplied:snapshot}}}).some(issue=>issue.code==='invalid-source-instances')).toBe(true);
    expect(validate({definitions:[{...definition,children:[]}]}).some(issue=>issue.code==='unknown-field')).toBe(true);
    expect(validate({definitions:[{...definition,geometry:{...definition.geometry,vertices:[{id:'v',positionUm:[0,0,0],rendererMesh:{}}]}}]}).some(issue=>issue.code==='unknown-field')).toBe(true);
  });

  it('enforces approved object-count and aggregate-geometry protection limits',()=>{
    const atDefinitionLimit=Array.from({length:1000},(_,i)=>({...definition,id:`def-${i}`}));
    expect(validate({definitions:atDefinitionLimit}).some(issue=>issue.code==='count-limit')).toBe(false);
    const definitions=Array.from({length:1001},(_,i)=>({...definition,id:`def-${i}`}));
    expect(validate({definitions}).some(issue=>issue.code==='count-limit')).toBe(true);
    const atInstanceLimit=Array.from({length:5000},(_,i)=>({...instance,id:`inst-${i}`}));
    expect(validate({instances:atInstanceLimit}).some(issue=>issue.code==='count-limit')).toBe(false);
    const vertices=Array.from({length:20_001},(_,i)=>({id:`v-${i}`,positionUm:[0,0,0]}));
    const oversized={...definition,geometry:{vertices,edges:[],faces:[],extrusions:[]}};
    expect(validate({definitions:[oversized]}).some(issue=>issue.code==='geometry-count-limit')).toBe(true);
    const manyInstances=Array.from({length:5001},(_,i)=>({...instance,id:`inst-${i}`}));
    expect(validate({instances:manyInstances}).some(issue=>issue.code==='count-limit')).toBe(true);
    const appearance={color:'#aabbcc'},pose={positionUm:[0,0,0],rotation:[0,0,0,1]},scalePpm=[1_000_000,1_000_000,1_000_000];
    const looseObjects=Array.from({length:1000},(_,i)=>({id:`loose-${i}`,name:'Loose',geometry:{vertices:[],edges:[],faces:[],extrusions:[]},appearance,pose,scalePpm,hidden:false,locked:false}));
    expect(validate({looseObjects}).some(issue=>issue.code==='count-limit')).toBe(false);
    expect(validate({looseObjects:[...looseObjects,{...looseObjects[0],id:'loose-over'}]}).some(issue=>issue.code==='count-limit')).toBe(true);
  });

  it('requires generated primitive dimensions to match its local rectangular profile and extrusion',()=>{
    const validGeometry={vertices:[{id:'a',positionUm:[0,0,0]},{id:'b',positionUm:[100,0,0]},{id:'c',positionUm:[100,80,0]},{id:'d',positionUm:[0,80,0]}],edges:[{id:'e1',vertexIds:['a','b']},{id:'e2',vertexIds:['b','c']},{id:'e3',vertexIds:['c','d']},{id:'e4',vertexIds:['d','a']}],faces:[{id:'f',vertexIds:['a','b','c','d']}],extrusions:[{id:'x',faceId:'f',distanceUm:20}]};
    const board={...definition,geometry:validGeometry,cutSpec:{kind:'board',lengthUm:100,widthUm:80,thicknessUm:20,grainAxis:'length',confirmation:'confirmed'}};
    expect(validate({definitions:[board]})).toEqual([]);
    expect(validate({definitions:[{...board,cutSpec:{...board.cutSpec,widthUm:81}}]}).some(issue=>issue.code==='primitive-cut-spec-geometry-mismatch')).toBe(true);
  });
});
