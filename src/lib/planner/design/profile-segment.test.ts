import { describe, expect, it } from 'vitest';
import { applyDesignCommand } from './commands';
import { appendProfileSegment } from './profile-segment';
import { beginCommandSession, cancelCommandSession, commitCommandSession, commitSessionCommand, createDesignHistory, undoSession, updateCommandSession } from './history';
import type { Project } from '../model';
import type { LooseObject, Geometry } from './schema';

const createLooseLine = (): LooseObject => ({ id: 'line', name: 'Line', geometry: { vertices: [{ id: 'v-a', positionUm: [0, 0, 0] }, { id: 'v-b', positionUm: [100_000, 0, 0] }], edges: [{ id: 'e-a', vertexIds: ['v-a', 'v-b'] }], faces: [], extrusions: [] }, pose: { positionUm: [0, 0, 0], rotation: [0, 0, 0, 1] }, scalePpm: [1_000_000, 1_000_000, 1_000_000], appearance: { color: '#bd8a56' }, hidden: false, locked: false });
const emptyProject: Project = { schemaVersion: 2, id: 'p', name: 'Project', unitSystem: 'metric', kerf: { um: 0 }, trim: { um: 0 }, minOffcutLinear: { um: 0 }, minOffcutSheet: { shortSideUm: 0, longSideUm: 0 }, currency: 'CAD', parts: [], materials: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', design: { schemaVersion: 1, definitions: [], instances: [], looseObjects: [createLooseLine()], partLinks: {} } };
const append = (geometry: Geometry, startUm: [number, number, number], endUm: [number, number, number], prefix: string) => appendProfileSegment(geometry, startUm, endUm, { vertex: `${prefix}-v`, edge: `${prefix}-e`, face: `${prefix}-f` });

describe('single-profile Line workflow', () => {
  it('snaps the clicked start to an endpoint and appends one edge', () => {
    const result = append(createLooseLine().geometry, [99_000, 1_000, 0], [100_000, 100_000, 0], 'next');
    expect(result.vertices).toHaveLength(3);
    expect(result.edges.at(-1)?.vertexIds).toEqual(['v-b', 'next-v']);
    expect(result.vertices.at(-1)?.positionUm).toEqual([100_000, 100_000, 0]);
  });

  it('snaps the closing point to the opposite endpoint and creates a valid face', () => {
    let geometry = createLooseLine().geometry;
    geometry = append(geometry, [100_000, 0, 0], [100_000, 100_000, 0], 'b');
    geometry = append(geometry, [100_000, 100_000, 0], [0, 100_000, 0], 'c');
    geometry = append(geometry, [0, 100_000, 0], [1_000, 1_000, 0], 'close');
    expect(geometry.faces).toHaveLength(1);
    expect(new Set(geometry.faces[0].vertexIds)).toEqual(new Set(['v-a', 'v-b', 'b-v', 'c-v']));
    expect(geometry.edges).toHaveLength(4);
  });

  it('rejects a self-intersecting closure without changing the original geometry', () => {
    let geometry = createLooseLine().geometry;
    geometry = append(geometry, [100_000, 0, 0], [0, 100_000, 0], 'b');
    geometry = append(geometry, [0, 100_000, 0], [100_000, 100_000, 0], 'c');
    const before = structuredClone(geometry);
    expect(() => appendProfileSegment(geometry, [100_000, 100_000, 0], [1_000, 1_000, 0], { vertex: 'xv', edge: 'xe', face: 'xf' })).toThrow(/segment-crossing|self-intersection/);
    expect(geometry).toEqual(before);
  });

  it('rejects joins outside endpoint tolerance and branches unchanged', () => {
    const geometry = createLooseLine().geometry;
    expect(() => append(geometry, [80_000, 20_000, 0], [50_000, 50_000, 0], 'bad')).toThrow(/start-must-snap/);
    expect(geometry.edges).toHaveLength(1);
  });

  it('commits as one undoable edit and cancelled provisional work leaves the project untouched', () => {
    const initial = emptyProject;
    const command = { type: 'append-profile-segment' as const, target: 'loose' as const, id: 'line', startUm: [100_000, 0, 0] as [number, number, number], endUm: [100_000, 100_000, 0] as [number, number, number], vertexId: 'nv', edgeId: 'ne', faceId: 'nf' };
    const history = createDesignHistory();
    const committed = commitSessionCommand(history, initial, command);
    expect(committed.result.ok).toBe(true);
    expect(committed.history.cursor).toBe(1);
    expect(undoSession(committed.history, committed.project).project).toBe(initial);
    const session = updateCommandSession(beginCommandSession(initial), command);
    expect(cancelCommandSession(session)).toBe(initial);
    expect(commitCommandSession(history, { ...session, provisional: cancelCommandSession(session) }).committed).toBe(false);
    const rejected = applyDesignCommand(initial, { ...command, startUm: [50_000, 50_000, 0] });
    expect(rejected.ok).toBe(false);
    expect(rejected.project).toBe(initial);
  });

  it('appends to one selected definition through the same domain command', () => {
    const base = structuredClone(emptyProject);
    base.design!.definitions.push({ id: 'profile', name: 'Profile', geometry: createLooseLine().geometry, appearance: { color: '#bd8a56' } });
    base.design!.looseObjects = [];
    const result = applyDesignCommand(base, { type: 'append-profile-segment', target: 'definition', id: 'profile', startUm: [100_000, 0, 0], endUm: [100_000, 100_000, 0], vertexId: 'dv', edgeId: 'de', faceId: 'df' });
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    if (result.ok) expect(result.project.design?.definitions[0].geometry.edges).toHaveLength(2);
  });
});
