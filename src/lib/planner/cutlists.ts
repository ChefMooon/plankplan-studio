import type { Cutlist, Part, PlanningGroup, Project } from './model';

const newId = () => crypto.randomUUID();
const linkSources = (link: NonNullable<Project['design']>['partLinks'][string]) => new Set([
  ...(link.current?.instanceIds ?? link.lastApplied.sources.instanceIds),
]);
const hasManualPartEdits = (part: Part, link: NonNullable<Project['design']>['partLinks'][string]) => {
  const fields = link.lastApplied.fields;
  return (['name', 'materialId', 'length', 'width', 'crossSection', 'grainLocked', 'quantity'] as const)
    .some(key => JSON.stringify(part[key]) !== JSON.stringify(fields[key]));
};

export type CutlistMoveConflict = {
  id: string;
  incomingPartId: string;
  incomingName: string;
  incomingQuantity: number;
  incomingSourceIds: string[];
  existingPartId: string;
  existingName: string;
  existingQuantity: number;
  existingSourceIds: string[];
  kind: 'exact' | 'partial';
  canSplit: boolean;
  overlappingInstanceIds: string[];
  incomingOnlyInstanceIds: string[];
  existingOnlyInstanceIds: string[];
  sourceSignature: string;
};
export type CutlistMoveResolutions = Record<string, 'existing' | 'incoming'>;
export type CutlistMoveAllocations = Record<string, number>;
export const cutlistMoveAllocationId = (partId: string, segment: 'shared' | 'unshared') => JSON.stringify([partId, segment]);

export function findCutlistMoveConflicts(project: Project, sourceId: string, destinationId: string): CutlistMoveConflict[] {
  if (!project.design) return [];
  const scopeOf = (partId: string, link: NonNullable<Project['design']>['partLinks'][string]) =>
    link.cutlistId ?? project.parts.find(part => part.id === partId)?.cutlistId ?? project.cutlists[0]?.id;
  const sourceLinks = Object.entries(project.design.partLinks).filter(([partId, link]) => scopeOf(partId, link) === sourceId);
  const destinationLinks = Object.entries(project.design.partLinks).filter(([partId, link]) =>
    scopeOf(partId, link) === destinationId,
  );
  const result: CutlistMoveConflict[] = [];
  for (const [incomingPartId, incomingLink] of sourceLinks) {
    const incomingSources = linkSources(incomingLink);
    for (const [existingPartId, existingLink] of destinationLinks) {
      const existingSources = linkSources(existingLink);
      if (![...incomingSources].some(instanceId => existingSources.has(instanceId))) continue;
      const overlappingInstanceIds = [...incomingSources].filter(instanceId => existingSources.has(instanceId)).sort();
      const incomingOnlyInstanceIds = [...incomingSources].filter(instanceId => !existingSources.has(instanceId)).sort();
      const existingOnlyInstanceIds = [...existingSources].filter(instanceId => !incomingSources.has(instanceId)).sort();
      const incomingPart = project.parts.find(part => part.id === incomingPartId);
      const existingPart = project.parts.find(part => part.id === existingPartId);
      const incomingDefinitionId = incomingLink.current?.definitionId ?? incomingLink.lastApplied.sources.definitionId;
      const existingDefinitionId = existingLink.current?.definitionId ?? existingLink.lastApplied.sources.definitionId;
      const exact = incomingDefinitionId === existingDefinitionId &&
        incomingSources.size === existingSources.size && [...incomingSources].every(instanceId => existingSources.has(instanceId));
      const canSplit = !!incomingPart && !!existingPart && !!incomingLink.current && !!existingLink.current &&
        incomingLink.state === 'active' && existingLink.state === 'active';
      const sourceSignature = JSON.stringify([incomingDefinitionId, [...incomingSources].sort(), existingDefinitionId, [...existingSources].sort(), incomingLink, existingLink, incomingPart, existingPart]);
      result.push({ id: JSON.stringify([incomingPartId, existingPartId]), incomingPartId, incomingName: incomingPart?.name ?? String(incomingLink.lastApplied.fields.name ?? incomingPartId), incomingQuantity: incomingPart?.quantity ?? 0, incomingSourceIds: [...incomingSources].sort(), existingPartId, existingName: existingPart?.name ?? String(existingLink.lastApplied.fields.name ?? existingPartId), existingQuantity: existingPart?.quantity ?? 0, existingSourceIds: [...existingSources].sort(), kind: exact ? 'exact' : 'partial', canSplit, overlappingInstanceIds, incomingOnlyInstanceIds, existingOnlyInstanceIds, sourceSignature });
    }
  }
  return result;
}

export function createCutlist(project: Project, name = 'Untitled cutlist', id: string = newId()): Project {
  if (!name.trim() || project.cutlists.some(item => item.id === id)) throw new Error('invalid-cutlist');
  return { ...project, cutlists: [...project.cutlists, { id, name: name.trim() }] };
}

export function renameCutlist(project: Project, cutlistId: string, name: string): Project {
  if (!name.trim()) throw new Error('invalid-cutlist-name');
  if (!project.cutlists.some(item => item.id === cutlistId)) throw new Error('cutlist-not-found');
  return { ...project, cutlists: project.cutlists.map(item => item.id === cutlistId ? { ...item, name: name.trim() } : item) };
}

export type DuplicateCutlistMode = 'independent' | 'linked';

/** Copy list rows, optionally keeping their Design links scoped to the new list. */
export function duplicateCutlist(project: Project, cutlistId: string, mode: DuplicateCutlistMode, id: string = newId()): Project {
  const source = project.cutlists.find(item => item.id === cutlistId);
  if (!source) throw new Error('cutlist-not-found');
  if (project.cutlists.some(item => item.id === id)) throw new Error('invalid-cutlist');
  const sourceParts = project.parts.filter(part => part.cutlistId === cutlistId);
  const sourceLinks = project.design?.partLinks ?? {};
  if (mode === 'linked' && sourceParts.some(part => sourceLinks[part.id]?.state === 'pending-part-deletion')) throw new Error('pending-part-deletion-cannot-be-duplicated');

  const copies = new Map(sourceParts.map(part => [part.id, { ...part, id: newId(), cutlistId: id, name: `${part.name} copy` }]));
  const order = source.editorOrder?.parts ?? project.editorOrder?.parts?.filter(partId => sourceParts.some(part => part.id === partId));
  const copyOrder = order?.flatMap(partId => { const copy = copies.get(partId); return copy ? [copy.id] : []; });
  const cutlist = { id, name: `${source.name} copy`, ...(copyOrder ? { editorOrder: { parts: copyOrder } } : {}) };
  let design = project.design;

  if (mode === 'linked' && design) {
    const partLinks = { ...design.partLinks };
    for (const part of sourceParts) {
      const link = partLinks[part.id];
      const copy = copies.get(part.id)!;
      if (link) partLinks[copy.id] = { ...structuredClone(link), cutlistId: id };
    }
    const defaultId = project.cutlists[0]?.id;
    const linkedSources = new Set(sourceParts.flatMap(part => {
      const link = partLinks[part.id];
      return link ? [...(link.current?.instanceIds ?? []), ...link.lastApplied.sources.instanceIds] : [];
    }));
    const instances = design.instances.map(instance => {
      if (!linkedSources.has(instance.id)) return instance;
      const ids = new Set(instance.projectionCutlistIds ?? (defaultId ? [defaultId] : []));
      ids.add(id);
      const excluded = new Set(instance.projectionExcludedCutlistIds ?? []);
      if (source.id === defaultId && instance.projectionExcluded) excluded.add(id);
      else if (excluded.has(cutlistId)) excluded.add(id);
      const next = { ...instance, projectionCutlistIds: [...ids].sort() };
      if (excluded.size) next.projectionExcludedCutlistIds = [...excluded].sort();
      return next;
    });
    design = { ...design, instances, partLinks };
  }

  return { ...project, cutlists: [...project.cutlists, cutlist], parts: [...project.parts, ...copies.values()], ...(design ? { design } : {}) };
}

/** Move all list parts to a remaining destination and remove list references from saved planning groups. */
export function deleteCutlist(project: Project, cutlistId: string, destinationId?: string, resolutions?: CutlistMoveResolutions, excludedDestinationInstanceIds: string[] = [], allocations?: CutlistMoveAllocations): Project {
  if (project.cutlists.length <= 1) throw new Error('last-cutlist');
  if (!project.cutlists.some(item => item.id === cutlistId)) throw new Error('cutlist-not-found');
  const destination = destinationId ?? project.cutlists.find(item => item.id !== cutlistId)!.id;
  if (destination === cutlistId || !project.cutlists.some(item => item.id === destination)) throw new Error('invalid-destination');
  const conflicts = findCutlistMoveConflicts(project, cutlistId, destination);
  const conflictIds = new Set(conflicts.map(conflict => conflict.id));
  if (resolutions && Object.keys(resolutions).some(partId => !conflictIds.has(partId))) throw new Error('cutlist-move-resolution-stale');
  const allocationIds = new Set<string>();
  for (const conflict of conflicts) {
    const resolution = resolutions?.[conflict.id];
    if (resolution !== 'existing' && resolution !== 'incoming') throw new Error('cutlist-move-review-required');
    if (!conflict.canSplit) throw new Error('cutlist-partial-aggregate-unsupported');
  }
  let partsBeforeMove = [...project.parts];
  const movedLinks = project.design ? { ...project.design.partLinks } : undefined;
  const putRow = (part: Part) => {
    const index = partsBeforeMove.findIndex(item => item.id === part.id);
    if (index < 0) partsBeforeMove.push(part); else partsBeforeMove[index] = part;
  };
  const writeLinkPartition = (partId: string, link: NonNullable<Project['design']>['partLinks'][string], instanceIds: string[], snapshotIds?: string[]) => {
    if (!movedLinks || !link.current) throw new Error('cutlist-partial-aggregate-unsupported');
    const sortedIds = [...instanceIds].sort();
    movedLinks[partId] = {
      ...structuredClone(link),
      cutlistId: destination,
      current: { ...link.current, instanceIds: sortedIds },
      ...(snapshotIds ? { lastApplied: { ...link.lastApplied, sources: { ...link.lastApplied.sources, instanceIds: [...snapshotIds].sort() }, fields: { ...link.lastApplied.fields, quantity: snapshotIds.length } } } : {}),
    };
  };
  const originalParts = new Map(project.parts.map(part => [part.id, part]));
  const originalLinks = project.design?.partLinks ?? {};
  const affectedIds = new Set(conflicts.flatMap(conflict => [conflict.incomingPartId, conflict.existingPartId]));
  for (const partId of affectedIds) {
    const part = originalParts.get(partId);
    const link = originalLinks[partId];
    if (!part || !link?.current) throw new Error('cutlist-partial-aggregate-unsupported');
    const relevant = conflicts.filter(conflict => conflict.incomingPartId === partId || conflict.existingPartId === partId);
    const sources = [...new Set(link.current.instanceIds)].sort();
    const shared: string[] = [];
    const unshared: string[] = [];
    for (const instanceId of sources) {
      const pair = relevant.find(conflict => conflict.overlappingInstanceIds.includes(instanceId));
      if (!pair) unshared.push(instanceId);
      else if ((resolutions![pair.id] === 'incoming' ? pair.incomingPartId : pair.existingPartId) === partId) shared.push(instanceId);
      // The chosen opposite row owns this source, so it is omitted from this row.
    }
    const buckets = [
      ...(shared.length ? [{ key: 'shared' as const, ids: shared }] : []),
      ...(unshared.length ? [{ key: 'unshared' as const, ids: unshared }] : []),
    ];
    if (!buckets.length) {
      if (movedLinks) delete movedLinks[partId];
      if (hasManualPartEdits(part, link)) putRow({ ...part, cutlistId: destination });
      else partsBeforeMove = partsBeforeMove.filter(item => item.id !== partId);
      continue;
    }
    let quantities = buckets.map(bucket => part.quantity === sources.length ? bucket.ids.length : part.quantity);
    if (buckets.length > 1) {
      if (part.quantity !== sources.length) {
        quantities = buckets.map(bucket => allocations?.[cutlistMoveAllocationId(partId, bucket.key)] ?? 0);
        for (const bucket of buckets) allocationIds.add(cutlistMoveAllocationId(partId, bucket.key));
        if (quantities.some(quantity => !Number.isSafeInteger(quantity) || quantity < 1) || quantities.reduce((sum, quantity) => sum + quantity, 0) !== part.quantity) throw new Error('cutlist-move-allocation-required');
      }
    }
    let snapshots: (string[] | undefined)[] = buckets.map(() => undefined);
    if (buckets.length > 1) {
      const historical = link.lastApplied.sources.instanceIds;
      const currentSet = new Set(sources);
      if (historical.some(id => !currentSet.has(id)) || link.lastApplied.fields.quantity !== historical.length) throw new Error('cutlist-move-history-ambiguous');
      snapshots = buckets.map(bucket => historical.filter(id => bucket.ids.includes(id)));
      if (snapshots.some(ids => !ids?.length)) throw new Error('cutlist-move-history-ambiguous');
    }
    buckets.forEach((bucket, index) => {
      const rowId = index === 0 ? partId : newId();
      putRow({ ...part, id: rowId, cutlistId: destination, quantity: quantities[index] });
      writeLinkPartition(rowId, link, bucket.ids, snapshots[index]);
    });
  }
  if (allocations && Object.keys(allocations).some(key => !allocationIds.has(key))) throw new Error('cutlist-move-resolution-stale');
  const projectDesign = project.design && movedLinks ? { ...project.design, partLinks: movedLinks } : undefined;
  const remainingCutlists = project.cutlists.filter(item => item.id !== cutlistId);
  const defaultId = project.cutlists[0]?.id;
  const nextDefaultId = remainingCutlists[0]?.id;
  const excludedFromDestination = new Set(excludedDestinationInstanceIds);
  const design = projectDesign ? {
    ...projectDesign,
    partLinks: Object.fromEntries(Object.entries(projectDesign.partLinks).map(([partId, link]) => {
      const scope = link.cutlistId ?? project.parts.find(part => part.id === partId)?.cutlistId ?? defaultId;
      const rowMoves = partsBeforeMove.some(part => part.id === partId && part.cutlistId === cutlistId);
      return [partId, rowMoves || scope === cutlistId ? { ...link, cutlistId: destination } : link];
    })),
    instances: projectDesign.instances.map(instance => {
      const implicit = instance.projectionCutlistIds === undefined ? (defaultId ? [defaultId] : []) : instance.projectionCutlistIds;
      if (!implicit.includes(cutlistId) && !instance.projectionExcludedCutlistIds?.includes(cutlistId) && !(cutlistId === defaultId && instance.projectionExcluded)) return instance;
      const memberships = new Set(implicit);
      if (memberships.delete(cutlistId) && !excludedFromDestination.has(instance.id)) memberships.add(destination);
      const exclusions = new Set(instance.projectionExcludedCutlistIds ?? []);
      if (exclusions.delete(cutlistId)) exclusions.add(destination);
      const next = { ...instance, projectionCutlistIds: [...memberships].sort() };
      if (cutlistId === defaultId && instance.projectionExcluded) {
        delete next.projectionExcluded;
        if (!excludedFromDestination.has(instance.id)) {
          if (destination === nextDefaultId) next.projectionExcluded = true;
          else exclusions.add(destination);
        }
      }
      if (exclusions.size) next.projectionExcludedCutlistIds = [...exclusions].sort();
      else delete next.projectionExcludedCutlistIds;
      return next;
    }),
  } : undefined;
  return {
    ...project,
    cutlists: remainingCutlists,
    parts: partsBeforeMove.map(part => part.cutlistId === cutlistId ? { ...part, cutlistId: destination } : part),
    planningGroups: project.planningGroups
      .map(group => ({ ...group, cutlistIds: group.cutlistIds.filter(id => id !== cutlistId) }))
      .filter(group => group.cutlistIds.length > 0),
    ...(design ? { design } : {}),
  };
}

export function assignPartToCutlist(parts: Part[], partId: string, cutlistId: string, cutlists: Cutlist[]): Part[] {
  if (!cutlists.some(list => list.id === cutlistId)) throw new Error('cutlist-not-found');
  if (!parts.some(part => part.id === partId)) throw new Error('part-not-found');
  return parts.map(part => part.id === partId ? { ...part, cutlistId } : part);
}

export function createPlanningGroup(groups: PlanningGroup[], name: string, cutlistIds: string[], id: string = newId()): PlanningGroup[] {
  if (!name.trim() || !cutlistIds.length || new Set(cutlistIds).size !== cutlistIds.length || groups.some(group => group.id === id)) throw new Error('invalid-planning-group');
  return [...groups, { id, name: name.trim(), cutlistIds: [...cutlistIds] }];
}

export function updatePlanningGroup(group: PlanningGroup, name: string, cutlistIds: string[], cutlists: Cutlist[]): PlanningGroup {
  const ids = new Set(cutlists.map(list => list.id));
  if (!name.trim() || !cutlistIds.length || new Set(cutlistIds).size !== cutlistIds.length || cutlistIds.some(id => !ids.has(id))) throw new Error('invalid-planning-group');
  return { ...group, name: name.trim(), cutlistIds: [...cutlistIds] };
}

export function removePlanningGroup(groups: PlanningGroup[], id: string): PlanningGroup[] {
  return groups.filter(group => group.id !== id);
}
