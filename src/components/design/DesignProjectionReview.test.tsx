import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { applyDesignCommand, newDesignDocument } from '@/lib/planner/design/commands';
import { createProject } from '@/lib/planner/storage';
import type { Project } from '@/lib/planner/model';
import { DesignProjectionReview } from './DesignProjectionReview';

function createFixture(): Project {
  const base = createProject('Review');
  const first = base.cutlists[0];
  const project: Project = { ...base, cutlists: [...base.cutlists, { id: 'other-list', name: 'Other list' }], materials: [{ id: 'wood', name: 'Wood', type: 'linear', stocks: [] }], design: newDesignDocument() };
  const created = applyDesignCommand(project, { type: 'create-board', id: 'instance', definitionId: 'definition', name: 'Board', materialId: 'wood', lengthUm: 100, widthUm: 20, thicknessUm: 10 });
  if (!created.ok) throw new Error(created.message);
  const assigned = applyDesignCommand(created.project, { type: 'assign-instances-to-cutlist', instanceIds: ['instance'], cutlistId: first.id, mode: 'copy' });
  if (!assigned.ok) throw new Error(assigned.message);
  const copied = applyDesignCommand(assigned.project, { type: 'assign-instances-to-cutlist', instanceIds: ['instance'], cutlistId: 'other-list', mode: 'copy' });
  if (!copied.ok) throw new Error(copied.message);
  return copied.project;
}

describe('DesignProjectionReview', () => {
  it('marks the preview stale when its cutlist target changes', async () => {
    const project = createFixture();
    const onApply = vi.fn();
    const view = render(<DesignProjectionReview project={project} cutlistId={project.cutlists[0].id} editSequence={0} localGeneration={3} saveStatus="Saved" onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: 'Update cutlist from design' }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Decision for Board' }), { target: { value: 'apply' } });
    view.rerender(<DesignProjectionReview project={project} cutlistId="other-list" editSequence={0} localGeneration={3} saveStatus="Saved" onApply={onApply} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/preview is stale/i);
    expect(screen.getByRole('button', { name: 'Apply reviewed changes' })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
