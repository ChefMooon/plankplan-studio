import { describe, expect, it } from 'vitest';
import type { Project } from '@/lib/planner/model';
import { applyDesignCommand } from '@/lib/planner/design/commands';
import { rectangleGeometry, IDENTITY_POSE, IDENTITY_SCALE } from '@/lib/planner/design/geometry';
import { snapshotFingerprint } from './snapshot-cache';

let geometryId = 0;
const project: Project = { schemaVersion: 3, id: 'p', name: 'Project', unitSystem: 'metric', kerf: { um: 0 }, trim: { um: 0 }, minOffcutLinear: { um: 0 }, minOffcutSheet: { shortSideUm: 0, longSideUm: 0 }, currency: 'CAD', cutlists: [{ id: 'default-cutlist', name: 'Default' }], planningGroups: [], parts: [], materials: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', design: { schemaVersion: 1, definitions: [], instances: [], looseObjects: [{ id: 'loose', name: 'Part', geometry: rectangleGeometry(100, 80, prefix => `${prefix}-${geometryId++}`), pose: IDENTITY_POSE, scalePpm: IDENTITY_SCALE, appearance: { color: '#aabbcc' }, hidden: false, locked: false }], partLinks: {} } };
const apply = (current: Project, command: Parameters<typeof applyDesignCommand>[1]) => { const result = applyDesignCommand(current, command); if (!result.ok) throw new Error(result.message); return result.project; };
const annotation = { id: 'note', kind: 'text' as const, anchor: { target: { kind: 'loose' as const, id: 'loose' }, element: { type: 'vertex' as const, id: 'v-0' }, localUm: [0, 0, 0] as [number, number, number] }, text: 'Note', labelLocalUm: [1, 2, 3] as [number, number, number] };

describe('snapshotFingerprint', () => {
  it('preserves the existing fingerprint for designs without annotations', () => {
    expect(snapshotFingerprint(project)).toBe(JSON.stringify([4, project.previewView ?? 'auto', 600 / 264, project.design]));
  });

  it('ignores annotation additions, updates and deletions', () => {
    const before = snapshotFingerprint(project);
    const added = apply(project, { type: 'add-annotation', annotation });
    expect(snapshotFingerprint(added)).toBe(before);
    const updated = apply(added, { type: 'update-annotation', annotation: { ...annotation, text: 'Updated' } });
    expect(snapshotFingerprint(updated)).toBe(before);
    expect(snapshotFingerprint(apply(updated, { type: 'delete-annotation', annotationId: 'note' }))).toBe(before);
  });
});
