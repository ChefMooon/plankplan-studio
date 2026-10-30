import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LinearCutDiagram } from './LinearCutDiagram';

afterEach(() => vi.useRealTimers());

it('keeps quantity animations running across parent rerenders with unchanged geometry', () => {
  vi.useFakeTimers();
  const part = { partId: 'a', length: 24, name: 'Part' };
  const diagram = (quantity: number) => <LinearCutDiagram stockId="s" stockLength={96} trim={0} kerf={0} stockName="Board" parts={Array.from({ length: quantity }, () => ({ ...part }))} />;
  const { rerender } = render(diagram(1));
  rerender(diagram(2));
  const svg = screen.getByRole('img', { name: 'Cut diagram for Board' });
  expect(svg.querySelectorAll('.cut-plan-part-enter')).toHaveLength(1);
  rerender(diagram(2));
  expect(svg.querySelectorAll('.cut-plan-part-enter')).toHaveLength(1);
  act(() => vi.advanceTimersByTime(220));
  expect(svg.querySelectorAll('.cut-plan-part-enter')).toHaveLength(0);
  rerender(diagram(1));
  expect(svg.querySelectorAll('.cut-plan-part-exit[aria-hidden="true"]')).toHaveLength(1);
  rerender(diagram(1));
  expect(svg.querySelectorAll('.cut-plan-part-exit')).toHaveLength(1);
  act(() => vi.advanceTimersByTime(220));
  expect(svg.querySelectorAll('.cut-plan-part-exit')).toHaveLength(0);
});
