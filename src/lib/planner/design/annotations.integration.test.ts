import { describe, expect, it } from 'vitest';
import { exportProject, importProject, type Project } from '../model';
import { resolveAllAnnotations } from '@/components/design/annotation-anchor';
import { snapshotFingerprint } from '@/components/design/scene/snapshot-cache';
import { commitSessionCommand, createDesignHistory, undoSession } from './history';
import { IDENTITY_POSE, IDENTITY_SCALE, rectangleGeometry } from './geometry';
import { validateDesignDocument } from './schema';
import type { Annotation } from './annotations';

const initial: Project = {
  schemaVersion: 3, id: 'annotations-integration', name: 'Annotations', unitSystem: 'metric', kerf: { um: 0 }, trim: { um: 0 }, minOffcutLinear: { um: 0 }, minOffcutSheet: { shortSideUm: 0, longSideUm: 0 }, currency: 'CAD', cutlists: [{ id: 'default-cutlist', name: 'Default' }], planningGroups: [], parts: [], materials: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  design: { schemaVersion: 1, definitions: [], instances: [], looseObjects: [], partLinks: {} },
};

function mustCommit(state: { project: Project; history: ReturnType<typeof createDesignHistory> }, command: Parameters<typeof commitSessionCommand>[2]) {
  const next = commitSessionCommand(state.history, state.project, command);
  if (!next.result.ok) throw new Error(`Command failed: ${next.result.code}`);
  expect(validateDesignDocument(next.project.design, next.project.parts, new Set())).toEqual([]);
  return { project: next.project, history: next.history };
}

function worldPositions(project: Project): unknown[] {
  return resolveAllAnnotations(project.design).map(annotation => annotation.kind === 'text'
    ? [annotation.anchorWorldUm, annotation.labelWorldUm]
    : [annotation.startWorldUm, annotation.endWorldUm]);
}

function assertValid(project: Project): void {
  expect(validateDesignDocument(project.design, project.parts, new Set())).toEqual([]);
}

describe('annotation lifecycle integration', () => {
  it('keeps annotations valid through geometry and component lifecycle, and restores the history on undo', () => {
    let id = 0;
    const rectangle = rectangleGeometry(100_000, 80_000, prefix => `original-${prefix}-${id++}`);
    const object = { id: 'loose-1', name: 'Board', geometry: rectangle, appearance: { color: '#bd8a56' }, pose: IDENTITY_POSE, scalePpm: IDENTITY_SCALE, hidden: false, locked: false };
    let state = mustCommit({ project: initial, history: createDesignHistory() }, { type: 'create-loose', object });
    const fingerprint = snapshotFingerprint(state.project);
    const start = { target: { kind: 'loose' as const, id: object.id }, element: { type: 'vertex' as const, id: rectangle.vertices[0].id }, localUm: [0, 0, 0] as [number, number, number] };
    const end = { ...start, element: { type: 'vertex' as const, id: rectangle.vertices[1].id }, localUm: [100_000, 0, 0] as [number, number, number] };
    const text: Annotation = { id: 'text-1', kind: 'text', anchor: start, text: 'Hello', labelLocalUm: [0, 20_000, 0] };
    const dimension: Annotation = { id: 'dimension-1', kind: 'dimension', start, end, measure: 'x', offsetUm: [0, 0, 10_000] };
    state = mustCommit(state, { type: 'add-annotation', annotation: text });
    expect(snapshotFingerprint(state.project)).toBe(fingerprint);
    state = mustCommit(state, { type: 'add-annotation', annotation: dimension });
    expect(snapshotFingerprint(state.project)).toBe(fingerprint);
    expect(resolveAllAnnotations(state.project.design)).toHaveLength(2);
    expect(importProject(exportProject(state.project)).design?.annotations).toEqual([text, dimension]);
    expect(validateDesignDocument(initial.design, initial.parts, new Set())).toEqual([]);

    state = mustCommit(state, { type: 'set-loose-transform', objectId: object.id, pose: { positionUm: [200_000, 50_000, 10_000], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } });
    expect(resolveAllAnnotations(state.project.design)).toHaveLength(2);
    let replacementId = 0;
    state = mustCommit(state, { type: 'set-loose-geometry', objectId: object.id, geometry: rectangleGeometry(200_000, 80_000, prefix => `pushed-${prefix}-${replacementId++}`, 20_000) });
    expect(resolveAllAnnotations(state.project.design)).toHaveLength(2);
    const beforeMake = worldPositions(state.project);
    state = mustCommit(state, { type: 'make-component', objectId: object.id, definitionId: 'definition-1', instanceId: 'instance-1', name: 'Board' });
    expect(resolveAllAnnotations(state.project.design)).toHaveLength(2);
    expect(worldPositions(state.project)).toEqual(beforeMake);

    state = mustCommit(state, { type: 'delete-instance', instanceId: 'instance-1' });
    expect(state.project.design?.annotations).toEqual([]);
    assertValid(state.project);

    const undo = () => {
      const undone = undoSession(state.history, state.project);
      state = { project: undone.project, history: undone.history };
      assertValid(state.project);
    };
    undo(); // Delete instance: annotations return in insertion order.
    expect(state.project.design?.annotations?.map(annotation => annotation.id)).toEqual(['text-1', 'dimension-1']);
    expect(resolveAllAnnotations(state.project.design)).toHaveLength(2);
    undo(); // Make Component: anchors return to the loose part.
    expect(state.project.design?.annotations?.map(annotation => annotation.id)).toEqual(['text-1', 'dimension-1']);
    expect(resolveAllAnnotations(state.project.design)).toHaveLength(2);
    undo(); // Push-pull geometry replacement.
    expect(state.project.design?.annotations?.map(annotation => annotation.id)).toEqual(['text-1', 'dimension-1']);
    expect(resolveAllAnnotations(state.project.design)).toHaveLength(2);
    undo(); // Move and rotate.
    expect(state.project.design?.annotations?.map(annotation => annotation.id)).toEqual(['text-1', 'dimension-1']);
    expect(resolveAllAnnotations(state.project.design)).toHaveLength(2);
    undo(); // Undo the dimension addition.
    expect(state.project.design?.annotations?.map(annotation => annotation.id)).toEqual(['text-1']);
    expect(resolveAllAnnotations(state.project.design)).toHaveLength(1);
    undo(); // Undo the text addition.
    expect(state.project.design?.annotations).toBeUndefined();
    expect(resolveAllAnnotations(state.project.design)).toHaveLength(0);
    undo(); // Undo the initial part creation.
    expect(state.project.design?.looseObjects).toEqual([]);
    expect(state.project.design?.annotations).toBeUndefined();
  });
});
