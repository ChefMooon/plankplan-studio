import { describe, expect, it } from 'vitest';
import { createProject } from './storage';
import { assignPartToCutlist, createCutlist, createPlanningGroup, deleteCutlist, duplicateCutlist, findCutlistMoveConflicts, renameCutlist, updatePlanningGroup } from './cutlists';
import { importProject, normalizeProjectDocument } from './model';
import { applyDesignCommand, newDesignDocument } from './design/commands';
import type { Part, Project } from './model';
import { optimizePlanningScope } from './planning-scope';

function linkedProject(): Project {
  const project = createCutlist(createProject(), 'Doors', 'doors');
  const cutlistId = project.cutlists[0].id;
  const part: Part = { id: 'rail', name: 'Rail', materialId: 'wood', cutlistId, length: { um: 10 }, quantity: 1 };
  const link = { state: 'active' as const, cutlistId, current: { definitionId: 'def', instanceIds: ['instance'] }, lastApplied: { sources: { definitionId: 'def', instanceIds: ['instance'] }, fields: { name: 'Rail', materialId: 'wood', length: { um: 10 }, quantity: 1 } } };
  const design = { ...newDesignDocument(), definitions: [{ id: 'def', name: 'Rail', geometry: { vertices: [], edges: [], faces: [], extrusions: [] }, appearance: { color: '#aabbcc' } }], instances: [{ id: 'instance', definitionId: 'def', pose: { positionUm: [0, 0, 0], rotation: [0, 0, 0, 1] }, scalePpm: [1_000_000, 1_000_000, 1_000_000], hidden: false, locked: false, projectionCutlistIds: [cutlistId] }], partLinks: { rail: link } } as NonNullable<Project['design']>;
  return { ...project, materials: [{ id: 'wood', name: 'Wood', type: 'linear', stocks: [] }], parts: [part], design };
}

function partiallyOverlappingProject(): Project {
  const base = linkedProject();
  const sourceId = base.cutlists[0].id;
  const destinationId = base.cutlists[1].id;
  const incoming: Part = { ...base.parts[0], name: 'Incoming manual rail', quantity: 2 };
  const existing: Part = { ...incoming, id: 'existing-rail', cutlistId: destinationId, name: 'Existing manual rail' };
  const link = (cutlistId: string, name: string, instanceIds: string[]) => ({
    state: 'active' as const,
    cutlistId,
    current: { definitionId: 'def', instanceIds },
    lastApplied: { sources: { definitionId: 'def', instanceIds }, fields: { name, materialId: 'wood', length: { um: 10 }, quantity: 2 } },
  });
  const instance = (id: string, cutlistIds: string[]) => ({ id, definitionId: 'def', pose: { positionUm: [0, 0, 0], rotation: [0, 0, 0, 1] }, scalePpm: [1_000_000, 1_000_000, 1_000_000], hidden: false, locked: false, projectionCutlistIds: cutlistIds });
  const design = { ...base.design!, instances: [instance('incoming-only', [sourceId]), instance('shared', [sourceId, destinationId]), instance('existing-only', [destinationId])], partLinks: { rail: link(sourceId, incoming.name, ['incoming-only', 'shared']), 'existing-rail': link(destinationId, existing.name, ['shared', 'existing-only']) } } as unknown as NonNullable<Project['design']>;
  return { ...base, parts: [incoming, existing], design };
}

describe('cutlist foundation', () => {
  it('migrates v2 parts into one default list without changing IDs, editor order, or design links', () => {
    const source = { schemaVersion: 2, id: 'p', name: 'Project', unitSystem: 'metric', kerf: { um: 0 }, trim: { um: 0 }, minOffcutLinear: { um: 0 }, minOffcutSheet: { shortSideUm: 0, longSideUm: 0 }, currency: 'CAD', parts: [{ id: 'part', name: 'Panel', materialId: '', length: { um: 10 }, quantity: 1 }], materials: [], editorOrder: { parts: ['part'] }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const project = importProject(JSON.stringify(source));
    expect(project).toMatchObject({ schemaVersion: 3, id: 'p', editorOrder: source.editorOrder, parts: [{ id: 'part', cutlistId: expect.any(String) }], planningGroups: [] });
    expect(project.cutlists).toHaveLength(1);
  });

  it('supports membership, names, saved groups, and safe deletion while retaining one list', () => {
    const project = createProject();
    const first = project.cutlists[0];
    const secondProject = createCutlist(project, 'Upper', 'upper');
    const withPart = { ...secondProject, parts: [{ id: 'part', name: 'Rail', materialId: '', cutlistId: first.id, length: { um: 10 }, quantity: 1 }] };
    const group = createPlanningGroup([], 'Assembly', [first.id, 'upper'], 'assembly')[0];
    const assigned = assignPartToCutlist(withPart.parts, 'part', 'upper', withPart.cutlists);
    expect(assigned[0].cutlistId).toBe('upper');
    expect(renameCutlist(secondProject, 'upper', 'Top')).toMatchObject({ cutlists: [{ id: first.id }, { id: 'upper', name: 'Top' }] });
    expect(updatePlanningGroup(group, 'Build', ['upper'], secondProject.cutlists).cutlistIds).toEqual(['upper']);
    const deleted = deleteCutlist({ ...withPart, planningGroups: [group] }, 'upper', first.id);
    expect(deleted.parts[0].cutlistId).toBe(first.id);
    expect(deleted.planningGroups[0].cutlistIds).toEqual([first.id]);
    expect(() => deleteCutlist(project, first.id)).toThrow('last-cutlist');
  });

  it('duplicates rows independently or preserves their Design links in a separate cutlist scope', () => {
    const project = linkedProject();
    const independent = duplicateCutlist(project, project.cutlists[0].id, 'independent', 'independent');
    const independentPart = independent.parts.find(part => part.cutlistId === 'independent')!;
    expect(independent.design?.partLinks[independentPart.id]).toBeUndefined();
    expect(independent.design?.instances[0].projectionCutlistIds).toEqual([project.cutlists[0].id]);

    const linked = duplicateCutlist(project, project.cutlists[0].id, 'linked', 'linked');
    const linkedPart = linked.parts.find(part => part.cutlistId === 'linked')!;
    expect(linked.design?.partLinks[linkedPart.id]).toMatchObject({ state: 'active', cutlistId: 'linked', current: { instanceIds: ['instance'] } });
    expect(linked.design?.instances[0].projectionCutlistIds).toEqual([project.cutlists[0].id, 'linked']);
    expect(() => normalizeProjectDocument(linked)).not.toThrow();
    const combined = optimizePlanningScope(linked, { kind: 'combined', cutlistIds: [project.cutlists[0].id, 'linked'] });
    expect(combined.scope.acknowledgmentRequired).toBe(true);
    expect(combined.scope.sharedDesignSources).toHaveLength(1);
  });

  it('moves link scope and membership on list deletion and blocks overlapping moves', () => {
    const project = linkedProject();
    const withDestination = createCutlist(project, 'Destination', 'destination');
    const moved = deleteCutlist(withDestination, project.cutlists[0].id, 'destination');
    expect(moved.parts[0].cutlistId).toBe('destination');
    expect(moved.design?.partLinks.rail.cutlistId).toBe('destination');
    expect(moved.design?.instances[0].projectionCutlistIds).toEqual(['destination']);
    expect(() => normalizeProjectDocument(moved)).not.toThrow();

    const duplicated = duplicateCutlist(project, project.cutlists[0].id, 'linked', 'other');
    const conflicting = { ...duplicated, parts: duplicated.parts.map(part => ({ ...part, name: part.id === 'rail' ? 'Incoming hand edit' : 'Destination hand edit' })) };
    const overlaps = findCutlistMoveConflicts(conflicting, project.cutlists[0].id, 'other');
    expect(overlaps).toMatchObject([{ incomingPartId: 'rail', incomingName: 'Incoming hand edit', existingName: 'Destination hand edit', kind: 'exact' }]);
    expect(() => deleteCutlist(conflicting, project.cutlists[0].id, 'other')).toThrow('cutlist-move-review-required');
    const keepExisting = deleteCutlist(conflicting, project.cutlists[0].id, 'other', { [overlaps[0].id]: 'existing' });
    expect(keepExisting.parts.map(part => part.id).sort()).toEqual([conflicting.parts[0].id, conflicting.parts[1].id].sort());
    expect(keepExisting.parts.find(part => part.id === conflicting.parts[0].id)?.name).toBe('Incoming hand edit');
    expect(keepExisting.parts.find(part => part.id === conflicting.parts[1].id)?.name).toBe('Destination hand edit');
    expect(keepExisting.design?.partLinks.rail).toBeUndefined();
    expect(() => normalizeProjectDocument(keepExisting)).not.toThrow();
    const keepIncoming = deleteCutlist(conflicting, project.cutlists[0].id, 'other', { [overlaps[0].id]: 'incoming' });
    expect(keepIncoming.parts.map(part => part.id).sort()).toEqual(['rail', conflicting.parts[1].id].sort());
    expect(keepIncoming.parts.find(part => part.id === 'rail')?.name).toBe('Incoming hand edit');
    expect(keepIncoming.parts.find(part => part.id === conflicting.parts[1].id)?.name).toBe('Destination hand edit');
    expect(keepIncoming.design?.partLinks.rail).toMatchObject({ state: 'active', cutlistId: 'other' });
    expect(keepIncoming.design?.partLinks[conflicting.parts[1].id]).toBeUndefined();
    expect(() => normalizeProjectDocument(keepIncoming)).not.toThrow();

    const manuallyOverridden = { ...conflicting, parts: conflicting.parts.map(part => part.id === 'rail' ? { ...part, quantity: 7 } : part) };
    const [manualConflict] = findCutlistMoveConflicts(manuallyOverridden, project.cutlists[0].id, 'other');
    const keepExistingWithManualIncoming = deleteCutlist(manuallyOverridden, project.cutlists[0].id, 'other', { [manualConflict.id]: 'existing' });
    expect(keepExistingWithManualIncoming.parts.find(part => part.id === 'rail')).toMatchObject({ quantity: 7, cutlistId: 'other', name: 'Incoming hand edit' });
    expect(keepExistingWithManualIncoming.design?.partLinks.rail).toBeUndefined();
    expect(() => normalizeProjectDocument(keepExistingWithManualIncoming)).not.toThrow();

    const partialDuplicate = duplicateCutlist(project, project.cutlists[0].id, 'linked', 'partial');
    const partialId = partialDuplicate.parts.find(part => part.cutlistId === 'partial')!.id;
    const partialLink = partialDuplicate.design!.partLinks[partialId];
    const partial = { ...partialDuplicate, design: { ...partialDuplicate.design!, partLinks: { ...partialDuplicate.design!.partLinks, [partialId]: { ...partialLink, current: { definitionId: 'def', instanceIds: ['instance', 'another-instance'] }, lastApplied: { ...partialLink.lastApplied, sources: { definitionId: 'def', instanceIds: ['instance', 'another-instance'] } } } } } };
    expect(() => deleteCutlist(partial, project.cutlists[0].id, 'partial', { [findCutlistMoveConflicts(partial, project.cutlists[0].id, 'partial')[0].id]: 'existing' })).toThrow('cutlist-move-allocation-required');

    const withDeletionDestination = createCutlist(project, 'Delete destination', 'delete-destination');
    const rowDeletion = applyDesignCommand(withDeletionDestination, { type: 'delete-part', partId: 'rail' });
    expect(rowDeletion.ok).toBe(true);
    if (rowDeletion.ok) {
      const listDeletion = deleteCutlist(rowDeletion.project, project.cutlists[0].id, 'delete-destination');
      expect(listDeletion.design?.partLinks.rail).toMatchObject({ state: 'pending-part-deletion', cutlistId: 'delete-destination' });
      expect(() => normalizeProjectDocument(listDeletion)).not.toThrow();
    }
  });

  it('removes an unchanged exact duplicate when the other row is selected', () => {
    const base = linkedProject();
    const sourceId = base.cutlists[0].id;
    const destinationId = base.cutlists[1].id;
    const existing = { ...base.parts[0], id: 'existing-rail', cutlistId: destinationId };
    const existingLink = { ...structuredClone(base.design!.partLinks.rail), cutlistId: destinationId };
    const project = { ...base, parts: [base.parts[0], existing], design: { ...base.design!, partLinks: { ...base.design!.partLinks, 'existing-rail': existingLink }, instances: base.design!.instances.map(instance => ({ ...instance, projectionCutlistIds: [sourceId, destinationId] })) } };
    const [conflict] = findCutlistMoveConflicts(project, sourceId, destinationId);
    const moved = deleteCutlist(project, sourceId, destinationId, { [conflict.id]: 'existing' });
    expect(moved.parts.map(part => part.id)).toEqual(['existing-rail']);
    expect(moved.design?.partLinks.rail).toBeUndefined();
    expect(() => normalizeProjectDocument(moved)).not.toThrow();
  });

  it('splits partially overlapping aggregates by Design instance and preserves the chosen row values', () => {
    const project = partiallyOverlappingProject();
    const sourceId = project.cutlists[0].id;
    const destinationId = project.cutlists[1].id;
    const conflict = findCutlistMoveConflicts(project, sourceId, destinationId);
    expect(conflict).toMatchObject([{ kind: 'partial', canSplit: true, incomingPartId: 'rail', existingPartId: 'existing-rail' }]);

    const keepIncoming = deleteCutlist(project, sourceId, destinationId, { [conflict[0].id]: 'incoming' });
    expect(keepIncoming.parts.map(part => [part.name, part.quantity]).sort()).toEqual([
      ['Existing manual rail', 1], ['Incoming manual rail', 1], ['Incoming manual rail', 1],
    ]);
    expect(Object.values(keepIncoming.design!.partLinks).map(link => link.current?.instanceIds[0]).sort()).toEqual(['existing-only', 'incoming-only', 'shared']);
    expect(() => normalizeProjectDocument(keepIncoming)).not.toThrow();

    const keepExisting = deleteCutlist(project, sourceId, destinationId, { [conflict[0].id]: 'existing' });
    expect(keepExisting.parts.map(part => [part.name, part.quantity]).sort()).toEqual([
      ['Existing manual rail', 1], ['Existing manual rail', 1], ['Incoming manual rail', 1],
    ]);
    expect(() => normalizeProjectDocument(keepExisting)).not.toThrow();

    const deleteIncoming = { ...project, parts: project.parts.filter(part => part.id !== 'rail'), design: { ...project.design!, partLinks: { 'existing-rail': project.design!.partLinks['existing-rail'] } } };
    const deleted = deleteCutlist(deleteIncoming, sourceId, destinationId, undefined, ['incoming-only']);
    expect(deleted.parts).toEqual([project.parts[1]]);
    expect(deleted.design?.partLinks['existing-rail']).toEqual(project.design?.partLinks['existing-rail']);
    expect(deleted.design?.instances.find(instance => instance.id === 'incoming-only')?.projectionCutlistIds).toEqual([]);
    expect(() => normalizeProjectDocument(deleted)).not.toThrow();
  });

  it('reviews each edge in a one-to-many overlap graph independently', () => {
    const base = partiallyOverlappingProject();
    const sourceId = base.cutlists[0].id;
    const destinationId = base.cutlists[1].id;
    const incoming = { ...base.parts[0], quantity: 3 };
    const secondExisting: Part = { ...base.parts[1], id: 'existing-second', quantity: 1 };
    const design = structuredClone(base.design!);
    design.instances.push({ ...design.instances[0], id: 'shared-second', projectionCutlistIds: [sourceId, destinationId] });
    design.partLinks.rail.current!.instanceIds = [...design.partLinks.rail.current!.instanceIds, 'shared-second'];
    design.partLinks.rail.lastApplied.fields.quantity = 2;
    design.partLinks['existing-second'] = {
      ...structuredClone(design.partLinks['existing-rail']), current: { definitionId: 'def', instanceIds: ['shared-second'] },
      lastApplied: { ...structuredClone(design.partLinks['existing-rail'].lastApplied), sources: { definitionId: 'def', instanceIds: ['shared-second'] }, fields: { ...structuredClone(design.partLinks['existing-rail'].lastApplied.fields), quantity: 1 } },
    };
    const project = { ...base, parts: [incoming, base.parts[1], secondExisting], design };
    const conflicts = findCutlistMoveConflicts(project, sourceId, destinationId);
    expect(conflicts).toHaveLength(2);
    expect(new Set(conflicts.map(conflict => conflict.id)).size).toBe(2);
    const moved = deleteCutlist(project, sourceId, destinationId, { [conflicts[0].id]: 'incoming', [conflicts[1].id]: 'existing' });
    expect(moved.parts.map(part => [part.quantity, part.name]).sort()).toEqual([
      [1, 'Existing manual rail'], [1, 'Existing manual rail'], [1, 'Incoming manual rail'], [1, 'Incoming manual rail'],
    ]);
    expect(Object.values(moved.design!.partLinks).flatMap(link => link.current?.instanceIds ?? []).sort()).toEqual(['existing-only', 'incoming-only', 'shared', 'shared-second']);
    expect(moved.design?.partLinks['existing-second'].current?.instanceIds).toEqual(['shared-second']);
    expect(() => normalizeProjectDocument(moved)).not.toThrow();
  });

  it('auto-allocates linked counts and requires an explicit allocation for manual quantity overrides', () => {
    const project = partiallyOverlappingProject();
    const sourceId = project.cutlists[0].id;
    const destinationId = project.cutlists[1].id;
    const overridden = { ...project, parts: project.parts.map(part => part.id === 'rail' ? { ...part, quantity: 5 } : part) };
    const [conflict] = findCutlistMoveConflicts(overridden, sourceId, destinationId);
    expect(() => deleteCutlist(overridden, sourceId, destinationId, { [conflict.id]: 'incoming' })).toThrow('cutlist-move-allocation-required');
    const moved = deleteCutlist(overridden, sourceId, destinationId, { [conflict.id]: 'incoming' }, [], { [JSON.stringify(['rail', 'shared'])]: 2, [JSON.stringify(['rail', 'unshared'])]: 3 });
    const incomingRows = moved.parts.filter(part => part.name === 'Incoming manual rail');
    expect(incomingRows.map(part => part.quantity).sort()).toEqual([2, 3]);
    expect(incomingRows.reduce((sum, part) => sum + part.quantity, 0)).toBe(5);
    expect(incomingRows.map(part => moved.design!.partLinks[part.id].lastApplied.fields.quantity).sort()).toEqual([1, 1]);
    expect(() => normalizeProjectDocument(moved)).not.toThrow();

    const keepExisting = deleteCutlist(overridden, sourceId, destinationId, { [conflict.id]: 'existing' });
    expect(keepExisting.parts.find(part => part.id === 'rail')).toMatchObject({ quantity: 5, cutlistId: destinationId });
    expect(keepExisting.design?.partLinks.rail.current?.instanceIds).toEqual(['incoming-only']);
  });

  it('blocks splitting when the historical Design source set cannot be partitioned', () => {
    const project = partiallyOverlappingProject();
    const sourceId = project.cutlists[0].id;
    const destinationId = project.cutlists[1].id;
    const incomingLink = project.design!.partLinks.rail;
    const ambiguous = { ...project, design: { ...project.design!, partLinks: { ...project.design!.partLinks, rail: { ...incomingLink, lastApplied: { ...incomingLink.lastApplied, sources: { ...incomingLink.lastApplied.sources, instanceIds: [...incomingLink.lastApplied.sources.instanceIds, 'old-unmapped-source'], }, fields: { ...incomingLink.lastApplied.fields, quantity: 3 } } } } } };
    const [conflict] = findCutlistMoveConflicts(ambiguous, sourceId, destinationId);
    expect(() => deleteCutlist(ambiguous, sourceId, destinationId, { [conflict.id]: 'incoming' })).toThrow('cutlist-move-history-ambiguous');
  });

  it('supports many-to-one overlaps with independent pair choices', () => {
    const base = linkedProject();
    const sourceId = base.cutlists[0].id;
    const destinationId = base.cutlists[1].id;
    const secondInstance = { ...base.design!.instances[0], id: 'second-instance', projectionCutlistIds: [sourceId, destinationId] };
    const incomingSecond: Part = { ...base.parts[0], id: 'rail-second', quantity: 1 };
    const existing: Part = { ...base.parts[0], id: 'existing-rail', cutlistId: destinationId, quantity: 2 };
    const firstLink = structuredClone(base.design!.partLinks.rail);
    firstLink.current!.instanceIds = ['instance'];
    firstLink.lastApplied.sources.instanceIds = ['instance'];
    const secondLink = structuredClone(firstLink);
    secondLink.current!.instanceIds = ['second-instance'];
    secondLink.lastApplied.sources.instanceIds = ['second-instance'];
    const existingLink = structuredClone(firstLink);
    existingLink.cutlistId = destinationId;
    existingLink.current!.instanceIds = ['instance', 'second-instance'];
    existingLink.lastApplied.sources.instanceIds = ['instance', 'second-instance'];
    existingLink.lastApplied.fields.quantity = 2;
    const project = { ...base, parts: [{ ...base.parts[0], quantity: 1 }, incomingSecond, existing], design: { ...base.design!, instances: [...base.design!.instances, secondInstance], partLinks: { rail: firstLink, 'rail-second': secondLink, 'existing-rail': existingLink } } };
    const conflicts = findCutlistMoveConflicts(project, sourceId, destinationId);
    expect(conflicts).toHaveLength(2);
    const moved = deleteCutlist(project, sourceId, destinationId, { [conflicts[0].id]: 'incoming', [conflicts[1].id]: 'existing' });
    expect(moved.parts.map(part => part.id).sort()).toEqual(['existing-rail', 'rail']);
    expect(moved.parts.find(part => part.id === 'rail-second')).toBeUndefined();
    expect(moved.design?.partLinks['rail-second']).toBeUndefined();
    expect(moved.design?.partLinks['existing-rail'].current?.instanceIds).toEqual(['second-instance']);
    expect(moved.design?.partLinks.rail.current?.instanceIds).toEqual(['instance']);
    expect(() => normalizeProjectDocument(moved)).not.toThrow();
  });
});
