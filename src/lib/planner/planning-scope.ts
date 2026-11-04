import { optimizeMixedProject } from './combined';
import type { Project } from './model';

export type PlanningSelection =
  | { kind: 'cutlist'; cutlistId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'combined'; cutlistIds: string[] };

export type SharedDesignSourceWarning = {
  key: string;
  sourceId: string;
  cutlistIds: string[];
  partIds: string[];
  acknowledgmentRequired: true;
  acknowledged: boolean;
};

export function resolvePlanningScope(project: Project, selection: PlanningSelection): string[] {
  let requestedIds: string[];
  if (selection.kind === 'cutlist') requestedIds = [selection.cutlistId];
  else if (selection.kind === 'group') {
    const group = project.planningGroups.find(item => item.id === selection.groupId);
    if (!group) throw new Error('planning-group-not-found');
    requestedIds = group.cutlistIds;
  } else requestedIds = selection.cutlistIds;

  if (!requestedIds.length || new Set(requestedIds).size !== requestedIds.length) throw new Error('invalid-planning-scope');
  const available = new Set(project.cutlists.map(item => item.id));
  if (requestedIds.some(id => !available.has(id))) throw new Error('cutlist-not-found');
  // Keep project order stable for consumers, independent of selection order.
  const selected = new Set(requestedIds);
  return project.cutlists.filter(item => selected.has(item.id)).map(item => item.id);
}

function findSharedDesignSources(project: Project, cutlistIds: string[], acknowledgedSourceIds: Set<string>): SharedDesignSourceWarning[] {
  if (!project.design) return [];
  const selected = new Set(cutlistIds);
  const uses = new Map<string, { cutlistIds: Set<string>; partIds: Set<string> }>();
  for (const part of project.parts) {
    if (!selected.has(part.cutlistId)) continue;
    const link = project.design.partLinks[part.id];
    if (!link) continue;
    const sources = [link.lastApplied.sources, ...(link.state === 'active' ? [link.current] : link.current ? [link.current] : [])];
    for (const source of sources) {
      // Definitions are reusable templates; only an instance ID identifies the same physical component across lists.
      for (const sourceId of source.instanceIds) {
        const use = uses.get(sourceId) ?? { cutlistIds: new Set<string>(), partIds: new Set<string>() };
        use.cutlistIds.add(part.cutlistId);
        use.partIds.add(part.id);
        uses.set(sourceId, use);
      }
    }
  }
  return [...uses.entries()]
    .filter(([, use]) => use.cutlistIds.size > 1)
    .map(([sourceId, use]) => ({
      key: sourceId,
      sourceId,
      cutlistIds: [...use.cutlistIds],
      partIds: [...use.partIds],
      acknowledgmentRequired: true,
      acknowledged: acknowledgedSourceIds.has(sourceId),
    }));
}

/** Runs the mixed optimizer once over the selected cutlists using shared project stock and settings. */
export function optimizePlanningScope(
  project: Project,
  selection: PlanningSelection,
  options: { acknowledgedSourceIds?: string[] } = {},
) {
  const cutlistIds = resolvePlanningScope(project, selection);
  const selected = new Set(cutlistIds);
  const scopedProject: Project = { ...project, parts: project.parts.filter(part => selected.has(part.cutlistId)) };
  const acknowledged = new Set(options.acknowledgedSourceIds ?? []);
  const sharedDesignSources = findSharedDesignSources(project, cutlistIds, acknowledged);
  return {
    result: optimizeMixedProject(scopedProject),
    scope: {
      cutlistIds,
      cutlists: project.cutlists.filter(item => selected.has(item.id)).map(({ id, name }) => ({ id, name })),
      partCutlistIds: Object.fromEntries(scopedProject.parts.map(part => [part.id, part.cutlistId])),
      sharedDesignSources,
      acknowledgmentRequired: sharedDesignSources.some(warning => !warning.acknowledged),
    },
  };
}
