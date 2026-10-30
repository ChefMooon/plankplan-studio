import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlanPresence } from './CutPlan';

afterEach(() => vi.useRealTimers());

it('clears an outgoing card when a later update changes the remaining diagram', () => {
  vi.useFakeTimers();
  const plans = (geometry: string[]) => <PlanPresence keys={geometry} records={geometry.map((value) => ({ stockId: 's', geometry: value }))}>
    {geometry.map((value) => <article key={value}>{value}</article>)}
  </PlanPresence>;
  const { rerender, container } = render(plans(['a', 'b']));
  rerender(plans(['a']));
  expect(container.querySelector('.cut-plan-exit-layer')).toHaveTextContent('b');
  rerender(plans(['c']));
  expect(screen.getByText('c')).toBeInTheDocument();
  expect(container.querySelector('.cut-plan-exit-layer')).not.toBeInTheDocument();
});
