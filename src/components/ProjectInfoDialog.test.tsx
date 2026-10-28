import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createProject } from '@/lib/planner/storage';
import { ProjectInfoDialog, type ProjectInfoDraft } from './ProjectInfoDialog';

describe('project preview choice', () => {
  it('offers the cutlist when parts exist and updates the live preview', async () => {
    const project = { ...createProject('Both'), parts: [{ id: 'rail', name: 'Rail', materialId: '', length: { um: 100000 }, quantity: 1 }] };
    function Settings() {
      const [draft, setDraft] = useState<ProjectInfoDraft>({ name: project.name, notes: '', unitSystem: project.unitSystem, previewView: 'auto' });
      return <ProjectInfoDialog open onOpenChange={vi.fn()} project={project} draft={draft} onDraftChange={setDraft} error="" onSave={vi.fn()}/>;
    }
    const user = userEvent.setup();
    render(<Settings/>);
    await user.click(screen.getByRole('combobox', { name: 'Dashboard preview' }));
    await user.click(screen.getByRole('option', { name: 'Cutlist' }));
    expect(screen.getByRole('combobox', { name: 'Dashboard preview' })).toHaveTextContent('Cutlist');
    expect(document.querySelector('[data-cutlist-piece="rail"]')).toBeTruthy();
  });
});
