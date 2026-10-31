import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { createProject } from '@/lib/planner/storage';
import { optimizeMixedProject } from '@/lib/planner/combined';
import { CutPlan } from './CutPlan';

it('keeps board cuts collapsed by default on desktop and supports individual and bulk controls', async () => {
  const user = userEvent.setup();
  const project = createProject();
  project.parts.push({ id: 'leg', name: 'Leg', materialId: '', length: { um: 500000 }, quantity: 6 });
  render(<CutPlan project={project} mixedResult={optimizeMixedProject(project)} expanded={false} onExpandedChange={() => {}} />);
  const toggles = screen.getAllByRole('button', { name: /^Board cuts/ });
  expect(toggles).toHaveLength(2);
  expect(toggles.every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true);
  for (const toggle of toggles) {
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toHaveProperty('hidden', true);
  }
  expect(toggles.every((button) => button.textContent?.includes('Offcut:'))).toBe(true);
  const offcuts = screen.getAllByRole('button', { name: /^Usable offcuts/ });
  expect(offcuts).toHaveLength(2);
  expect(offcuts[0]).toHaveAttribute('aria-expanded', 'false');
  await user.click(offcuts[0]);
  expect(offcuts[0]).toHaveAttribute('aria-expanded', 'true');
  expect(offcuts[1]).toHaveAttribute('aria-expanded', 'false');
  await user.click(toggles[0]);
  expect(toggles[0]).toHaveAttribute('aria-expanded', 'true');
  expect(toggles[1]).toHaveAttribute('aria-expanded', 'false');
  expect(document.getElementById(toggles[0].getAttribute('aria-controls')!)).toHaveProperty('hidden', false);
  expect(document.getElementById(toggles[1].getAttribute('aria-controls')!)).toHaveProperty('hidden', true);
  await user.click(screen.getByRole('button', { name: 'Expand all board cuts' }));
  expect(toggles.every((button) => button.getAttribute('aria-expanded') === 'true')).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Collapse all board cuts' }));
  expect(toggles.every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true);
});

it('shows board cuts by default on mobile and keeps the disclosure state synchronized', async () => {
  const user = userEvent.setup();
  const mediaQuery = {
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));

  try {
    const project = createProject();
    project.parts.push({ id: 'leg', name: 'Leg', materialId: '', length: { um: 500000 }, quantity: 6 });
    render(<CutPlan project={project} mixedResult={optimizeMixedProject(project)} expanded={false} onExpandedChange={() => {}} />);
    const toggle = screen.getAllByRole('button', { name: /^Board cuts/ })[0];
    const details = document.getElementById(toggle.getAttribute('aria-controls')!);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(details).toHaveProperty('hidden', false);
    expect(details).toHaveTextContent(/Leg:\s*\d/);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(details).toHaveProperty('hidden', true);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(details).toHaveProperty('hidden', false);
  } finally {
    vi.unstubAllGlobals();
  }
});
