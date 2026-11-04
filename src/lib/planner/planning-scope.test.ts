import { describe, expect, it } from 'vitest';
import { createCutlist, createPlanningGroup } from './cutlists';
import { createProject } from './storage';
import { optimizePlanningScope, resolvePlanningScope } from './planning-scope';
import type { Project } from './model';

const linkedProject = () => {
  const base = createProject();
  const firstId = base.cutlists[0].id;
  const secondId = '11111111-1111-4111-8111-111111111111';
  const groupId = '22222222-2222-4222-8222-222222222222';
  const withSecond = createCutlist(base, 'Upper', secondId);
  const project = {
    ...withSecond,
    parts: [
      { id: 'part-a', name: 'Rail A', materialId: '', cutlistId: firstId, length: { um: 100 }, quantity: 1 },
      { id: 'part-b', name: 'Rail B', materialId: '', cutlistId: secondId, length: { um: 100 }, quantity: 1 },
      { id: 'part-c', name: 'Rail C', materialId: '', cutlistId: secondId, length: { um: 100 }, quantity: 1 },
    ],
    design: {
      schemaVersion: 1 as const,
      definitions: [], instances: [], looseObjects: [],
      partLinks: Object.fromEntries(['part-a', 'part-b', 'part-c'].map((id, index) => [id, {
        state: 'active' as const,
        current: { definitionId: index === 2 ? 'definition-other' : 'definition-shared', instanceIds: [index === 2 ? 'instance-other' : 'instance-shared'] },
        lastApplied: { sources: { definitionId: index === 2 ? 'definition-other' : 'definition-shared', instanceIds: [index === 2 ? 'instance-other' : 'instance-shared'] }, fields: { name: id, materialId: '', length: { um: 100 }, quantity: 1 } },
      }])) as NonNullable<Project['design']>['partLinks'],
    },
  } satisfies Project;
  const group = createPlanningGroup(project.planningGroups, 'Assembly', [firstId, secondId], groupId)[0];
  return { project: { ...project, planningGroups: [group] }, firstId, secondId, groupId };
};

describe('planning scopes', () => {
  it('resolves independent lists and saved combined groups while preserving project list order', () => {
    const { project, firstId, secondId, groupId } = linkedProject();
    expect(resolvePlanningScope(project, { kind: 'cutlist', cutlistId: secondId })).toEqual([secondId]);
    expect(resolvePlanningScope(project, { kind: 'group', groupId })).toEqual([firstId, secondId]);
    expect(resolvePlanningScope(project, { kind: 'combined', cutlistIds: [secondId, firstId] })).toEqual([firstId, secondId]);
    expect(() => resolvePlanningScope(project, { kind: 'group', groupId: 'missing' })).toThrow('planning-group-not-found');
    expect(() => resolvePlanningScope(project, { kind: 'combined', cutlistIds: [secondId, secondId] })).toThrow('invalid-planning-scope');
  });

  it('optimizes only selected rows once and keeps part/list identity plus shared-source acknowledgment state', () => {
    const { project, firstId, secondId, groupId } = linkedProject();
    const independent = optimizePlanningScope(project, { kind: 'cutlist', cutlistId: secondId });
    expect(independent.scope.partCutlistIds).toEqual({ 'part-b': secondId, 'part-c': secondId });
    expect(independent.scope.sharedDesignSources).toEqual([]);

    const combined = optimizePlanningScope(project, { kind: 'group', groupId });
    expect(combined.scope.cutlists).toEqual([{ id: firstId, name: 'Default' }, { id: secondId, name: 'Upper' }]);
    expect(combined.scope.partCutlistIds).toEqual({ 'part-a': firstId, 'part-b': secondId, 'part-c': secondId });
    expect(combined.scope.sharedDesignSources).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'instance-shared', cutlistIds: [firstId, secondId], partIds: ['part-a', 'part-b'], acknowledgmentRequired: true, acknowledged: false }),
    ]));
    expect(combined.scope.acknowledgmentRequired).toBe(true);

    const acknowledged = optimizePlanningScope(project, { kind: 'group', groupId }, { acknowledgedSourceIds: ['definition-shared', 'instance-shared'] });
    expect(acknowledged.scope.acknowledgmentRequired).toBe(false);
    expect(acknowledged.scope.sharedDesignSources.every(warning => warning.acknowledged)).toBe(true);
    expect(combined.result.valid).toBe(true);
  });

  it('does not warn when separate instances share only their reusable definition', () => {
    const { project, groupId } = linkedProject();
    const separateInstances = {
      ...project,
      design: {
        ...project.design!,
        partLinks: Object.fromEntries(Object.entries(project.design!.partLinks).map(([partId, link]) => {
          if (partId === 'part-a' || partId === 'part-b') {
            const instanceId = partId === 'part-a' ? 'instance-a' : 'instance-b';
            return [partId, {
              ...link,
              current: { ...link.current!, definitionId: 'definition-shared', instanceIds: [instanceId] },
              lastApplied: { ...link.lastApplied, sources: { ...link.lastApplied.sources, definitionId: 'definition-shared', instanceIds: [instanceId] } },
            }];
          }
          return [partId, link];
        })) as NonNullable<Project['design']>['partLinks'],
      },
    } satisfies Project;

    const combined = optimizePlanningScope(separateInstances, { kind: 'group', groupId });
    expect(combined.scope.sharedDesignSources).toEqual([]);
    expect(combined.scope.acknowledgmentRequired).toBe(false);
  });
});
