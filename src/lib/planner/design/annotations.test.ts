import { describe, expect, it } from 'vitest';
import { copyProjectDocument, exportProject, importProject, type Project } from '../model';
import { applyDesignCommand } from './commands';
import { IDENTITY_POSE, IDENTITY_SCALE, rectangleGeometry, transformLocalPoint } from './geometry';
import { commitSessionCommand, createDesignHistory, undoSession } from './history';
import { validateDesignDocument } from './schema';
import type { Annotation } from './annotations';

const empty: Project = { schemaVersion: 3, id: 'p', name: 'Project', unitSystem: 'metric', kerf: { um: 0 }, trim: { um: 0 }, minOffcutLinear: { um: 0 }, minOffcutSheet: { shortSideUm: 0, longSideUm: 0 }, currency: 'CAD', cutlists: [{ id: 'default-cutlist', name: 'Default' }], planningGroups: [], parts: [], materials: [{ id: 'wood', name: 'Wood', type: 'linear', stocks: [] }], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', design: { schemaVersion: 1, definitions: [], instances: [], looseObjects: [], partLinks: {} } };
let geometryId = 0;
const makeGeometry = (prefix: string) => rectangleGeometry(100, 80, part => `${prefix}-${part}-${geometryId++}`);
const loose = { id: 'loose-1', name: 'Part', geometry: makeGeometry('loose'), pose: { ...IDENTITY_POSE, positionUm: [500, 0, 0] as [number, number, number] }, scalePpm: [...IDENTITY_SCALE] as [number, number, number], appearance: { color: '#aabbcc' }, hidden: false, locked: false };
const anchor = { target: { kind: 'loose' as const, id: 'loose-1' }, element: { type: 'vertex' as const, id: loose.geometry.vertices[0].id }, localUm: [0, 0, 0] as [number, number, number] };
const text: Annotation = { id: 'text-1', kind: 'text', anchor, text: 'Hello', labelLocalUm: [10, 20, 0] };
const dimension: Annotation = { id: 'dimension-1', kind: 'dimension', start: anchor, end: { ...anchor, element: { type: 'vertex', id: loose.geometry.vertices[1].id }, localUm: [100, 0, 0] }, measure: 'x', offsetUm: [0, 10, 0] };
const valid = (annotations: unknown) => validateDesignDocument({ ...empty.design, looseObjects: [loose], annotations }, empty.parts, new Set(['wood']));
const must = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => { if (!result.ok) throw new Error('command failed'); return result as Extract<T, { ok: true }>; };
const withLoose = must(applyDesignCommand(empty, { type: 'create-loose', object: loose })).project;

describe('design annotations data model', () => {
  it('accepts old documents and valid text and dimension annotations', () => {
    expect(validateDesignDocument(empty.design, empty.parts, new Set(['wood']))).toEqual([]);
    expect(valid([text, dimension])).toEqual([]);
  });

  it('rejects invalid fields and values using the documented issue codes', () => {
    const has = (annotations: unknown, code: string) => expect(valid(annotations).some(issue => issue.code === code)).toBe(true);
    has([{ ...text, extra: true }], 'unknown-field');
    has([{ ...text, text: 'x'.repeat(501) }], 'invalid-annotation-text');
    has([{ ...text, text: '   ' }], 'invalid-annotation-text');
    has([text, text], 'invalid-or-duplicate-id');
    has([{ ...text, anchor: { ...anchor, target: { kind: 'loose', id: 'missing' } } }], 'dangling-annotation-target');
    has([{ ...text, anchor: { ...anchor, element: { type: 'edge', id: 'edge-1' } } }], 'invalid-annotation-anchor');
    has([{ ...text, anchor: { ...anchor, element: { ...anchor.element, edgeTPpm: 2 } } }], 'invalid-annotation-anchor');
    has([{ ...text, anchor: { ...anchor, localUm: [0, 1.5, 0] } }], 'invalid-annotation-vector');
    has([{ ...dimension, measure: 'w' }], 'invalid-dimension-measure');
    has(Array.from({ length: 501 }, (_, index) => ({ ...text, id: `text-${index}` })), 'count-limit');
  });

  it('adds, updates, deletes and undoes annotations as individual commands', () => {
    const added = must(applyDesignCommand(withLoose, { type: 'add-annotation', annotation: text }));
    expect(added.label).toBe('Add annotation');
    const updated = must(applyDesignCommand(added.project, { type: 'update-annotation', annotation: { ...text, text: 'Updated' } }));
    expect(updated.project.design?.annotations?.[0]).toMatchObject({ text: 'Updated' });
    const deleted = must(applyDesignCommand(updated.project, { type: 'delete-annotation', annotationId: text.id }));
    expect(deleted.project.design?.annotations).toEqual([]);
    const session = commitSessionCommand(createDesignHistory(), withLoose, { type: 'add-annotation', annotation: text });
    expect(undoSession(session.history, session.project).project.design?.annotations).toBeUndefined();
    const missing = applyDesignCommand(added.project, { type: 'delete-annotation', annotationId: 'missing' });
    expect(missing).toMatchObject({ ok: false, code: 'annotation-not-found' });
  });

  it('prunes with deleted parts, retains with geometry edits and does not copy on duplicate', () => {
    const two = must(applyDesignCommand(withLoose, { type: 'add-annotation', annotation: text })).project;
    const other: Annotation = { ...text, id: 'text-2', anchor: { ...anchor, target: { kind: 'loose', id: 'loose-2' } } };
    const second = must(applyDesignCommand(two, { type: 'create-loose', object: { ...loose, id: 'loose-2' } }));
    const both = must(applyDesignCommand(second.project, { type: 'add-annotation', annotation: other })).project;
    const erased = must(applyDesignCommand(both, { type: 'erase-loose-geometry', objectId: 'loose-1', target: 'edge', elementId: loose.geometry.edges[0].id }));
    expect(erased.project.design?.annotations).toHaveLength(2);
    const replaced = must(applyDesignCommand(erased.project, { type: 'set-loose-geometry', objectId: 'loose-1', geometry: rectangleGeometry(200, 80, prefix => `new-${prefix}-${geometryId++}`, 20) }));
    expect(replaced.project.design?.annotations).toHaveLength(2);
    const moved = must(applyDesignCommand(replaced.project, { type: 'set-loose-transform', objectId: 'loose-1', pose: { ...loose.pose, positionUm: [10, 20, 30] } }));
    expect(moved.project.design?.annotations).toHaveLength(2);
    const removed = must(applyDesignCommand(moved.project, { type: 'delete-loose', objectId: 'loose-1' }));
    expect(removed.project.design?.annotations?.map(a => a.id)).toEqual(['text-2']);
    const history = commitSessionCommand(createDesignHistory(), both, { type: 'delete-loose', objectId: 'loose-1' });
    expect(undoSession(history.history, history.project).project.design?.annotations).toHaveLength(2);
    const board = must(applyDesignCommand(empty, { type: 'create-board', id: 'instance-1', definitionId: 'definition-1', name: 'Board', materialId: 'wood', lengthUm: 100, widthUm: 80, thicknessUm: 20 })).project;
    const instanceAnnotation: Annotation = { ...text, anchor: { ...anchor, target: { kind: 'instance', id: 'instance-1' } } };
    const annotated = must(applyDesignCommand(board, { type: 'add-annotation', annotation: instanceAnnotation })).project;
    expect(must(applyDesignCommand(annotated, { type: 'duplicate-instance', sourceId: 'instance-1', id: 'instance-2' })).project.design?.annotations).toHaveLength(1);
    const deletedInstance = must(applyDesignCommand(annotated, { type: 'delete-instance', instanceId: 'instance-1' }));
    expect(deletedInstance.project.design?.annotations).toEqual([]);
    const instanceHistory = commitSessionCommand(createDesignHistory(), annotated, { type: 'delete-instance', instanceId: 'instance-1' });
    expect(undoSession(instanceHistory.history, instanceHistory.project).project.design?.annotations).toEqual([instanceAnnotation]);
    const deletedDefinition = must(applyDesignCommand(annotated, { type: 'delete-definition', definitionId: 'definition-1' }));
    expect(deletedDefinition.project.design?.annotations).toEqual([]);
    const definitionHistory = commitSessionCommand(createDesignHistory(), annotated, { type: 'delete-definition', definitionId: 'definition-1' });
    expect(undoSession(definitionHistory.history, definitionHistory.project).project.design?.annotations).toEqual([instanceAnnotation]);
  });

  it('retargets Make Component anchors and label points without moving them in world space', () => {
    const annotated = must(applyDesignCommand(withLoose, { type: 'add-annotation', annotation: text })).project;
    const before = transformLocalPoint(text.anchor.localUm, loose.pose, loose.scalePpm);
    const made = must(applyDesignCommand(annotated, { type: 'make-component', objectId: loose.id, definitionId: 'new-def', instanceId: 'new-inst', name: 'Component' }));
    const moved = made.project.design?.annotations?.[0];
    expect(moved?.kind).toBe('text');
    if (moved?.kind === 'text') {
      expect(moved.anchor.target).toEqual({ kind: 'instance', id: 'new-inst' });
      expect(transformLocalPoint(moved.anchor.localUm, IDENTITY_POSE, IDENTITY_SCALE)).toEqual(before);
      expect(transformLocalPoint(moved.labelLocalUm, IDENTITY_POSE, IDENTITY_SCALE)).toEqual(transformLocalPoint(text.labelLocalUm, loose.pose, loose.scalePpm));
    }
  });

  it('round trips annotations through project export/import and project copy', () => {
    const annotated = must(applyDesignCommand(withLoose, { type: 'add-annotation', annotation: text })).project;
    expect(importProject(exportProject(annotated)).design?.annotations).toEqual([text]);
    expect(copyProjectDocument(annotated).design?.annotations).toEqual([text]);
  });
});
