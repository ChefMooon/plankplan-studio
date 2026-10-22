import { describe, expect, it } from 'vitest';
import { boardFootCents, centsFromDollars, importProject, parseFractionalInches, umFromInches, umFromMillimeters } from './model';

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
    const project = { schemaVersion: 1, id: 'p', name: 'Bench', unitSystem: 'imperial', kerf: { um: 0 }, trim: { um: 0 }, parts: [], materials: [], updatedAt: '', currency: 'CAD', minOffcutLinear: { um: 304800 }, minOffcutSheet: { shortSideUm: 150000, longSideUm: 300000 } };
    expect(importProject(JSON.stringify(project)).name).toBe('Bench');
    expect(() => importProject('{"schemaVersion":2}')).toThrow();
    expect(() => importProject(JSON.stringify({ ...project, sheetLayout: 'random' }))).toThrow(/sheet layout/i);
    expect(() => importProject(JSON.stringify({ ...project, parts: [{ id: 'bad', materialId: 'missing', name: 'Bad', length: { um: 100 }, quantity: 1 }] }))).toThrow(/part record/i);
    expect(boardFootCents({ widthUm: umFromInches(6), thicknessUm: umFromInches(1), length: { um: umFromInches(24) }, price: { cents: 500 } })).toBe(500);
    expect(boardFootCents({ widthUm: umFromInches(1), thicknessUm: umFromInches(1), length: { um: umFromInches(72) }, price: { cents: 5 } })).toBe(3);
    expect(() => boardFootCents({ widthUm: umFromInches(1), thicknessUm: umFromInches(1), length: { um: umFromInches(12) } })).toThrow(/rate/i);
  });
});
