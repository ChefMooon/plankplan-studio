import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { routeTree } from './routeTree.gen';
import { createProject } from './lib/planner/storage';
import { projectRepository } from './lib/planner/repository.indexeddb';
import { ThemeProvider } from './components/theme-provider';

it.each(['parts', 'materials', 'stocks'] as const)('shows drop feedback and persists insertions and swaps for %s', async kind => {
  const project = createProject(`Drag ${kind}`);
  project.parts = [0, 1, 2].map(i => ({ id: crypto.randomUUID(), name: `Part ${i}`, materialId: '', length: { um: 100000 }, quantity: 1 }));
  project.materials = [0, 1, 2].map(i => ({ id: crypto.randomUUID(), name: `Material ${i}`, type: 'linear', stocks: [0, 1, 2].map(j => ({ id: crypto.randomUUID(), name: `Stock ${i}-${j}`, length: { um: 1000000 }, ownedQuantity: 1 })) }));
  expect((await projectRepository.create('local', project)).ok).toBe(true);
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [`/projects/${project.id}/cutlist`] }) });
  await router.load();
  render(<ThemeProvider><RouterProvider router={router}/></ThemeProvider>);
  await screen.findByRole('heading', { name: 'What are you making?' });
  const items = kind === 'parts' ? project.parts : kind === 'materials' ? project.materials : project.materials[0].stocks;
  const handle = (i: number) => screen.getByRole('button', { name: `Reorder ${items[i].name}` });
  const row = (i: number) => handle(i).closest('.reorderable-row') as HTMLElement;
  const transfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() };
  const hover = (element: HTMLElement, y: number, type: 'dragOver' | 'drop' = 'dragOver') => {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 100 } as DOMRect);
    const event = createEvent[type](element, { dataTransfer: transfer });
    Object.defineProperty(event, 'clientY', { value: y });
    fireEvent(element, event);
  };
  const readIds = async () => {
    const saved = await projectRepository.get({ namespaceId: 'local', projectId: project.id });
    if (!saved.ok) throw new Error('Missing saved project');
    return kind === 'stocks' ? saved.value.editorOrder?.stocks?.[project.materials[0].id] : saved.value.editorOrder?.[kind];
  };
  for (const [y, intent, expected] of [
    [110, 'before', [items[2].id, items[0].id, items[1].id]],
    [190, 'after', [items[0].id, items[2].id, items[1].id]],
    [150, 'swap', [items[2].id, items[0].id, items[1].id]],
  ] as const) {
    fireEvent.dragStart(handle(2), { dataTransfer: transfer });
    hover(row(0), y);
    expect(row(0)).toHaveAttribute('data-drop-intent', intent);
    expect(row(2).hasAttribute('data-swap-source')).toBe(intent === 'swap');
    hover(row(0), y, 'drop');
    await waitFor(async () => expect(await readIds()).toEqual(expected));
    expect(document.querySelector('[data-drop-intent]')).toBeNull();
    expect(document.querySelector('[data-swap-source]')).toBeNull();
  }
  fireEvent.dragStart(handle(2), { dataTransfer: transfer });
  if (kind === 'materials') {
    hover(row(0).querySelector('.stock-editor') as HTMLElement, 150);
    expect(row(0)).toHaveAttribute('data-drop-intent', 'swap');
  }
  if (kind === 'stocks') {
    const foreignStock = screen.getByRole('button', { name: 'Reorder Stock 1-0' }).closest('.stock-editor') as HTMLElement;
    hover(foreignStock, 150);
    expect(document.querySelector('[data-drop-intent]')).toBeNull();
  }
  hover(row(2), 150);
  expect(document.querySelector('[data-drop-intent]')).toBeNull();
  hover(row(0), 150);
  fireEvent.dragEnd(handle(2));
  expect(document.querySelector('[data-drop-intent]')).toBeNull();
  expect(document.querySelector('[data-swap-source]')).toBeNull();
});
