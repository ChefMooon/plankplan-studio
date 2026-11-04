import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { createProject } from '@/lib/planner/storage';
import { PlanningScopeControls } from './PlanningScopeControls';

afterEach(() => window.localStorage.clear());

it('starts expanded and remembers its state independently for each project', async () => {
  const user = userEvent.setup();
  const project = createProject('First');
  const props = { project, activeCutlistId: project.cutlists[0].id, selection: { kind: 'cutlist' as const, cutlistId: project.cutlists[0].id }, onSelectionChange: vi.fn(), onSaveGroup: vi.fn(), onDeleteGroup: vi.fn() };
  const view = render(<PlanningScopeControls {...props} />);
  expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute('aria-expanded', 'true');
  await user.click(screen.getByRole('button', { name: 'Collapse' }));
  expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('combobox', { name: 'Planning scope' })).not.toBeInTheDocument();
  view.unmount();
  const reopened = render(<PlanningScopeControls {...props} />);
  expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
  reopened.unmount();
  const other = createProject('Second');
  render(<PlanningScopeControls {...props} project={other} activeCutlistId={other.cutlists[0].id} selection={{ kind: 'cutlist', cutlistId: other.cutlists[0].id }} />);
  expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
});
