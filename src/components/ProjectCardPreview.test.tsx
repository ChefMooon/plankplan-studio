import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectCardPreview } from './ProjectCardPreview';
import { createProject } from '@/lib/planner/storage';
import { rectangleGeometry, IDENTITY_POSE, IDENTITY_SCALE } from '@/lib/planner/design/geometry';
import type { DesignDocumentV1 } from '@/lib/planner/design/schema';

const geometry=()=>rectangleGeometry(100_000,40_000,prefix=>`${prefix}-${Math.random()}`,20_000);
const design=(overrides:Partial<DesignDocumentV1>={}):DesignDocumentV1=>({schemaVersion:1,definitions:[{id:'def',name:'Board',geometry:geometry(),appearance:{color:'#126789'}}],instances:[],looseObjects:[],partLinks:{},...overrides});

describe('ProjectCardPreview',()=>{
  it('keeps a chosen design view empty when geometry is missing or hidden, while automatic uses the cutlist',()=>{
    const project={...createProject('Shelf'),previewView:'top' as const,parts:[{id:'rail',name:'Rail',materialId:'',length:{um:500_000},quantity:1}]};
    const {rerender}=render(<ProjectCardPreview project={project}/>);
    expect(screen.getByText('No visible design yet')).toBeTruthy();
    expect(document.querySelector('[data-cutlist-piece="rail"]')).toBeNull();
    const hidden=design({instances:[{id:'hidden',definitionId:'def',pose:IDENTITY_POSE,scalePpm:IDENTITY_SCALE,hidden:true,locked:false}]});
    rerender(<ProjectCardPreview project={{...project,design:hidden}}/>);
    expect(screen.getByText('No visible design yet')).toBeTruthy();
    rerender(<ProjectCardPreview project={{...project,design:hidden,previewView:'auto'}}/>);
    expect(document.querySelector('[data-cutlist-piece="rail"]')).toBeTruthy();
    rerender(<ProjectCardPreview project={{...project,previewView:'auto',parts:[]}}/>);
    expect(screen.getByText('No parts or design yet')).toBeTruthy();
  });
  it('shows the chosen cutlist even when a design exists, and an empty state when its parts are removed',()=>{
    const project={...createProject('Both'),design:design(),previewView:'cutlist' as const,parts:[{id:'rail',name:'Rail',materialId:'',length:{um:500_000},quantity:1}]};
    const {rerender}=render(<ProjectCardPreview project={project}/>);
    expect(document.querySelector('[data-cutlist-piece="rail"]')).toBeTruthy();
    expect(screen.queryByRole('img',{name:/design preview/})).toBeNull();
    rerender(<ProjectCardPreview project={{...project,parts:[]}}/>);
    expect(screen.getByText('No cutlist parts yet')).toBeTruthy();
    rerender(<ProjectCardPreview project={{...project,previewView:'auto'}}/>);
    expect(screen.getByRole('img',{name:/design preview/})).toBeTruthy();
  });
  it('draws panels and boards at a shared scale, with minimum sizes for small pieces',()=>{
    const project={...createProject('Mixed'),parts:[
      {id:'panel',name:'Panel',materialId:'',kind:'sheet' as const,length:{um:1_000_000},width:{um:500_000},quantity:1},
      {id:'board',name:'Board',materialId:'',kind:'linear' as const,length:{um:500_000},crossSection:{width:{um:100_000},thickness:{um:20_000}},quantity:1},
      {id:'small',name:'Small',materialId:'',kind:'sheet' as const,length:{um:1_000},width:{um:1_000},quantity:1},
    ]};
    render(<ProjectCardPreview project={project}/>);
    const rect=(id:string)=>document.querySelector(`[data-cutlist-piece="${id}"] rect`)!;
    const dimension=(id:string,name:string)=>Number(rect(id).getAttribute(name));
    expect(dimension('panel','width') / dimension('panel','height')).toBeCloseTo(2);
    expect(dimension('panel','width') / dimension('board','width')).toBeCloseTo(2);
    expect(dimension('small','width')).toBeGreaterThanOrEqual(12);
    expect(dimension('small','height')).toBeGreaterThanOrEqual(10);
  });
  it('uses an instance appearance override and the requested view',()=>{
    const project={...createProject('Shelf'),design:design({instances:[{id:'instance',definitionId:'def',pose:IDENTITY_POSE,scalePpm:IDENTITY_SCALE,hidden:false,locked:false,appearance:{color:'#aa3355'}}]}),previewView:'right' as const};
    render(<ProjectCardPreview project={project}/>);
    expect(screen.getByRole('img',{name:'Shelf design preview, right view'})).toBeTruthy();
    expect(document.querySelector('.project-card-design-surface')).toBeTruthy();
    expect(document.querySelector('[data-preview-object="instance"]')?.getAttribute('stroke')).toBe('#aa3355');
  });

  it('adapts automatic view for edge-on geometry and separates uninstanced definitions like the design scene',()=>{
    const edgeOn={vertices:[{id:'a',positionUm:[0,0,0] as [number,number,number]},{id:'b',positionUm:[55_000,100_000,45_000] as [number,number,number]},{id:'c',positionUm:[155_000,100_000,45_000] as [number,number,number]},{id:'d',positionUm:[100_000,0,0] as [number,number,number]}],edges:[{id:'ab',vertexIds:['a','b'] as [string,string]},{id:'bc',vertexIds:['b','c'] as [string,string]},{id:'cd',vertexIds:['c','d'] as [string,string]},{id:'da',vertexIds:['d','a'] as [string,string]}],faces:[{id:'face',vertexIds:['a','b','c','d']}],extrusions:[]};
    const source=design({definitions:[{id:'one',name:'One',geometry:edgeOn,appearance:{color:'#126789'}},{id:'two',name:'Two',geometry:edgeOn,appearance:{color:'#126789'}}]});
    render(<ProjectCardPreview project={{...createProject('Panels'),design:source}}/>);
    expect(screen.getByRole('img',{name:'Panels design preview, top view'})).toBeTruthy();
    const first=document.querySelector('[data-preview-object="one"] polygon')?.getAttribute('points');
    const second=document.querySelector('[data-preview-object="two"] polygon')?.getAttribute('points');
    expect(first).not.toBe(second);
  });

  it('falls back to cutlist parts when design geometry has no drawable vertices, then shows empty state',()=>{
    const project=createProject('Parts');
    const noGeometry=design({definitions:[{id:'empty',name:'Empty',geometry:{vertices:[],edges:[],faces:[],extrusions:[]},appearance:{color:'#126789'}}]});
    const withParts={...project,design:noGeometry,parts:[{id:'part',name:'Rail',materialId:'',length:{um:900_000},quantity:1}]};
    const {rerender}=render(<ProjectCardPreview project={withParts}/>);
    expect(document.querySelector('.project-card-illustration')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.project-card-design-surface')).toBeNull();
    rerender(<ProjectCardPreview project={{...project,design:noGeometry}}/>);
    expect(screen.getByText('No parts or design yet')).toBeTruthy();
  });
});
