import { describe, expect, it } from 'vitest';
import { boardFootCents, centsFromDollars, copyProjectDocument, exportProject, importProject, parseFractionalInches, restoreProjectDocument, umFromInches, umFromMillimeters } from './model';
import type { DesignDocumentV1 } from './design/schema';

describe('planner units and serialization', () => {
  it('converts inches, millimeters and cents using integers', () => {
    expect(umFromInches(1)).toBe(25400); expect(umFromMillimeters(1)).toBe(1000); expect(centsFromDollars(12.345)).toBe(1235);
    expect(umFromMillimeters(25.4)).toBe(umFromInches(1));
    expect(parseFractionalInches('1/3')).toBe(8467);
  });
  it('parses common fractional inch forms', () => {
    expect(parseFractionalInches('2 3/8')).toBe(umFromInches(2.375));
    expect(parseFractionalInches('2-3/8')).toBe(umFromInches(2.375));
    expect(() => parseFractionalInches('1/0')).toThrow();
  });
  it('imports only supported schema and computes board foot cost without a yield factor', () => {
    const project = { schemaVersion: 1, id: 'p', name: 'Bench', unitSystem: 'imperial', kerf: { um: 0 }, trim: { um: 0 }, parts: [], materials: [], updatedAt: '2026-10-22T00:00:00.000Z', currency: 'CAD', minOffcutLinear: { um: 304800 }, minOffcutSheet: { shortSideUm: 150000, longSideUm: 300000 } };
    expect(importProject(JSON.stringify(project))).toMatchObject({ name: 'Bench', schemaVersion: 2 });
    expect(() => importProject('{"schemaVersion":2}')).toThrow();
    expect(() => importProject(JSON.stringify({ ...project, sheetLayout: 'random' }))).toThrow(/sheetLayout/i);
    expect(() => importProject(JSON.stringify({ ...project, parts: [{ id: 'bad', materialId: 'missing', name: 'Bad', length: { um: 100 }, quantity: 1 }] }))).toThrow(/parts\[0\]/i);
    expect(boardFootCents({ widthUm: umFromInches(6), thicknessUm: umFromInches(1), length: { um: umFromInches(24) }, price: { cents: 500 } })).toBe(500);
    expect(boardFootCents({ widthUm: umFromInches(1), thicknessUm: umFromInches(1), length: { um: umFromInches(72) }, price: { cents: 5 } })).toBe(3);
    expect(() => boardFootCents({ widthUm: umFromInches(1), thicknessUm: umFromInches(1), length: { um: umFromInches(12) } })).toThrow(/rate/i);
  });

  it('round trips a validated dashboard preview preference while defaulting older documents to automatic', () => {
    const source={schemaVersion:1,id:'preview-project',name:'Preview',unitSystem:'metric',kerf:{um:0},trim:{um:0},parts:[],materials:[],updatedAt:'2026-10-22T00:00:00.000Z'};
    expect(importProject(JSON.stringify(source))).not.toHaveProperty('previewView');
    const project=importProject(JSON.stringify({...source,previewView:'right'}));
    expect(project.previewView).toBe('right');
    expect(importProject(exportProject(project)).previewView).toBe('right');
    const cutlist=importProject(JSON.stringify({...source,previewView:'cutlist'}));
    expect(importProject(exportProject(cutlist)).previewView).toBe('cutlist');
    expect(()=>importProject(JSON.stringify({...source,previewView:'diagonal'}))).toThrow(/previewView/i);
  });

  it('migrates every documented v1 default, keeps editorOrder and does not add design', () => {
    const early={schemaVersion:1,id:'legacy-id',name:'Early',unitSystem:'imperial',kerf:{um:0},trim:{um:0},parts:[],materials:[{id:'m',name:'Pine',stocks:[]}],updatedAt:'2026-10-22T12:00:00.000Z',editorOrder:{parts:['old-part']}};
    const migrated=importProject(JSON.stringify(early));
    expect(migrated).toMatchObject({schemaVersion:2,id:'legacy-id',createdAt:early.updatedAt,currency:'CAD',minOffcutLinear:{um:304800},minOffcutSheet:{shortSideUm:150000,longSideUm:300000},materials:[{type:'linear'}],editorOrder:early.editorOrder});
    expect(migrated).not.toHaveProperty('design');
  });

  it('rejects future versions, unknown v2 fields and invalid legacy timestamps', () => {
    const source={schemaVersion:1,id:'x',name:'Test',unitSystem:'metric',kerf:{um:0},trim:{um:0},parts:[],materials:[],updatedAt:'2026-10-22T12:00:00.000Z'};
    expect(()=>importProject(JSON.stringify({...source,schemaVersion:3}))).toThrow(/Unsupported project schema version/);
    expect(()=>importProject(JSON.stringify({...source,schemaVersion:2,createdAt:source.updatedAt,currency:'CAD',minOffcutLinear:{um:1},minOffcutSheet:{shortSideUm:1,longSideUm:2},futureField:true}))).toThrow(/unknown-field/);
    expect(()=>importProject(JSON.stringify({...source,updatedAt:''}))).toThrow(/invalid-timestamp/);
  });

  it('preserves unconfirmed design/link snapshots through copy, restore, and canonical export', () => {
    const base=importProject(JSON.stringify({schemaVersion:1,id:'p',name:'Design',unitSystem:'metric',kerf:{um:0},trim:{um:0},parts:[{id:'part',name:'Panel',materialId:'m',length:{um:50},width:{um:40},quantity:1}],materials:[{id:'m',name:'Sheet',type:'sheet',stocks:[]}],updatedAt:'2026-10-22T12:00:00.000Z'}));
    const design:DesignDocumentV1={schemaVersion:1,definitions:[{id:'def',name:'Panel',geometry:{vertices:[],edges:[],faces:[],extrusions:[]},cutSpec:{kind:'explicit',lengthUm:50,widthUm:40,thicknessUm:3,grainAxis:'width',confirmation:'requires-confirmation'},appearance:{color:'#aabbcc'}}],instances:[],looseObjects:[],partLinks:{part:{state:'pending-removal',reasons:['source-deleted'],lastApplied:{sources:{definitionId:'historic-def',instanceIds:['gone']},fields:{name:'Panel',materialId:'m',length:{um:50},width:{um:40},grainLocked:true,quantity:1}}}}};
    const withDesign=importProject(exportProject({...base,design}));
    const copied=copyProjectDocument(withDesign);
    expect(copied.id).not.toBe(withDesign.id); expect(copied.createdAt).not.toBe(withDesign.createdAt); expect(copied.design).toEqual(withDesign.design);
    expect(exportProject(importProject(exportProject(copied)))).toBe(exportProject(copied));
    const restored=restoreProjectDocument({...withDesign,id:'destination',createdAt:'2020-01-01T00:00:00.000Z'},copied);
    expect(restored.id).toBe('destination'); expect(restored.createdAt).toBe('2020-01-01T00:00:00.000Z'); expect(restored.design).toEqual(copied.design);
  });
});
