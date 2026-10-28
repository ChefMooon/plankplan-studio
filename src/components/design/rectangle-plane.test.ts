import { describe, expect, it } from 'vitest';
import { transformLocalPoint, rectangleGeometry } from '@/lib/planner/design/geometry';
import { designVertices, directRectangleEnd, fromPlane, geometryCorners, planeCoordinates, rectangleCommand, reorientRectangleEnd, type RectangleAxis } from './rectangle-plane';

describe('rectangle drawing planes', () => {
  for (const axis of ['x', 'y', 'z'] as RectangleAxis[]) {
    it(`anchors a rectangle at an elevated off-grid corner on ${axis}`, () => {
      const start = [123456, 456789, 789012];
      const command = rectangleCommand(start, start.map(n => n + 200000), axis, 100000, 150000);
      expect(command?.type).toBe('create-loose');
      if (command?.type !== 'create-loose') return;
      const object = command.object;
      const points = object.geometry.vertices.map(v => transformLocalPoint(v.positionUm, object.pose, object.scalePpm).map(Math.round));
      expect(points).toContainEqual(start);
      const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      expect(points.every(p => p[index] === start[index])).toBe(true);
    });
  }
  it('keeps the anchor and dimensions when switching a live rectangle to another plane', () => {
    const start = [123456, 456789, 789012];
    const end = fromPlane(223456, -989012, 456789, 'y');
    for (const axis of ['x', 'z'] as RectangleAxis[]) {
      const next = reorientRectangleEnd(start, end, 'y', axis);
      const a = planeCoordinates(start, axis), b = planeCoordinates(next, axis);
      expect(b[0] - a[0]).toBe(100000);
      expect(b[1] - a[1]).toBe(-200000);
      expect(b[2]).toBe(a[2]);
    }
  });
  for (const axis of ['x', 'y', 'z'] as RectangleAxis[]) {
    it(`resolves explicit world directions on the ${axis} plane`, () => {
      const start = [100000, 200000, 300000];
      const end = start.map(n => n + 10000);
      const positive = directRectangleEnd(start, end, axis, '++');
      const negative = directRectangleEnd(start, end, axis, '--');
      const normal = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      expect(positive[normal]).toBe(start[normal]);
      expect(negative[normal]).toBe(start[normal]);
      for (const index of [0,1,2].filter(i => i !== normal)) {
        expect(positive[index]).toBeGreaterThan(start[index]);
        expect(negative[index]).toBeLessThan(start[index]);
      }
    });
  }
  it('includes top corners of extruded profiles', () => {
    let next = 0;
    const geometry = rectangleGeometry(100000, 200000, p => `${p}-${next++}`);
    geometry.extrusions = [{ id: 'extrusion', faceId: geometry.faces[0].id, distanceUm: 50000 }];
    expect(geometryCorners(geometry)).toHaveLength(8);
    expect(geometryCorners(geometry).filter(v => v.point[2] === 50000)).toHaveLength(4);
    const design={schemaVersion:1 as const,definitions:[],instances:[],looseObjects:[{id:'loose',name:'Extruded',geometry,pose:{positionUm:[0,0,0] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]},scalePpm:[1_000_000,1_000_000,1_000_000] as [number,number,number],appearance:{color:'#fff'},hidden:false,locked:false}],partLinks:{}};
    expect(designVertices(design).find(vertex=>vertex.id==='v-0@extrusion')?.localPoint).toEqual([0,0,50000]);
  });
  it('finds transformed board corners with odd dimensions and skips hidden instances', () => {
    const geometry = rectangleGeometry(100000, 100000, p => p);
    const definition = { id: 'board', name: 'Board', geometry, appearance: { color: '#fff' }, cutSpec: { kind: 'board' as const, confirmation: 'confirmed' as const, lengthUm: 100001, widthUm: 200001, thicknessUm: 30001, grainAxis: 'length' as const } };
    const instance = { id: 'instance', definitionId: 'board', pose: { positionUm: [0, 500000, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] }, scalePpm: [2000000, 1000000, 1000000] as [number, number, number], hidden: false, locked: false };
    const design = { schemaVersion: 1 as const, definitions: [definition], instances: [instance], looseObjects: [], partLinks: {} };
    const corners = designVertices(design);
    expect(corners).toHaveLength(8);
    expect(corners.some(c => c.point[0] === 0.100001 && c.point[1] > 0.5)).toBe(true);
    expect(corners.find(c=>c.id==='corner-1-1-1')?.localPoint).toEqual([50000.5,100000.5,15000.5]);
    expect(designVertices({ ...design, instances: [{ ...instance, hidden: true }] })).toEqual([]);
  });
  it('rejects invalid typed dimensions', () => {
    expect(rectangleCommand([0, 0, 0], [100, 100, 100], 'y', NaN)).toBeUndefined();
  });
});
