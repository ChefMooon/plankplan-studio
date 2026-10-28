import { describe, expect, it, vi } from 'vitest';
import { createProject } from '@/lib/planner/storage';
import { getModelSnapshot } from './snapshot-cache';

const render = vi.hoisted(() => vi.fn(() => 'data:image/png;base64,c25hcA=='));
vi.mock('./model-snapshot', () => ({ renderModelSnapshot: render }));

describe('model snapshot cache', () => {
  it('reuses cached images and regenerates when the saved view or design changes', async () => {
    const project = { ...createProject('Cache'), id: 'snapshot-cache-test', design: { schemaVersion: 1 as const, definitions: [], instances: [], looseObjects: [], partLinks: {} } };
    expect(await getModelSnapshot(project)).toBe('data:image/png;base64,c25hcA==');
    expect(await getModelSnapshot(project)).toBe('data:image/png;base64,c25hcA==');
    expect(render).toHaveBeenCalledTimes(1);
    await getModelSnapshot({ ...project, previewView: 'top' });
    await getModelSnapshot({ ...project, design: { ...project.design, definitions: [{ id: 'a', name: 'A', geometry: { vertices: [], edges: [], faces: [], extrusions: [] }, appearance: { color: '#abcdef' } }] } });
    expect(render).toHaveBeenCalledTimes(3);
    await getModelSnapshot(project, 3);
    expect(render).toHaveBeenCalledTimes(4);
    expect(render).toHaveBeenLastCalledWith(project, 3);
    await getModelSnapshot(project, 3);
    expect(render).toHaveBeenCalledTimes(4);
  });
});
