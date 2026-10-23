import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { routeTree } from './routeTree.gen';
import { exportProject } from './lib/planner/model';
import { createProject } from './lib/planner/storage';
import { ThemeProvider } from './components/theme-provider';

async function renderApp(path = '/') {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  render(<ThemeProvider><RouterProvider router={router}/></ThemeProvider>);
  return router;
}

describe('local project workflow', () => {
  it('creates, edits, saves, reopens, duplicates and deletes a project', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(await screen.findByRole('button', { name: /start a cutlist project/i }));
    const projectName = await screen.findByRole('textbox', { name: 'Project name' });
    await user.clear(projectName); await user.type(projectName, 'Shop stool');
    await user.click(screen.getByRole('button', { name: /add part/i }));
    await user.clear(screen.getByRole('textbox', { name: 'Part name' }));
    await user.type(screen.getByRole('textbox', { name: 'Part name' }), 'Seat rail');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Part quantity' }), { target: { value: '2' } });
    const saved = JSON.parse(localStorage.getItem('plankplan-studio.projects.v1') ?? '[]');
    expect(saved[0].name).toBe('Shop stool'); expect(saved[0].parts[0].name).toBe('Seat rail'); expect(saved[0].parts[0].quantity).toBe(2);
    await user.click(screen.getByRole('link', { name: /all projects/i }));
    expect(await screen.findByText('Shop stool')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /open cutlist/i }));
    expect(await screen.findByDisplayValue('Seat rail')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /all projects/i }));
    await user.click(screen.getByRole('button', { name: 'Duplicate Shop stool' }));
    expect(await screen.findByText('Shop stool copy')).toBeInTheDocument();
    vi.stubGlobal('confirm', () => true);
    await user.click(screen.getByRole('button', { name: 'Delete Shop stool copy' }));
    await waitFor(() => expect(screen.queryByText('Shop stool copy')).not.toBeInTheDocument());
    vi.unstubAllGlobals();
  });

  it('imports a versioned project and navigates between Design and Cutlist', async () => {
    const user = userEvent.setup(); await renderApp();
    const project = createProject('Imported bench');
    const file = new File([exportProject(project)], 'bench.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText(/import project/i), file);
    await screen.findByText('Imported bench');
    await user.click(screen.getByRole('link', { name: /open cutlist/i }));
    await user.click(await screen.findByRole('link', { name: /design/i }));
    expect(await screen.findByText('3D design tools are planned for Phase 2.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Cutlist' }));
    expect(await screen.findByRole('heading', { name: 'What are you making?' })).toBeInTheDocument();
    expect(localStorage.getItem('plankplan-studio.projects.v1')).toContain('Imported bench');
  });

  it('opens the dashboard preview without persisting a new project', async () => {
    const user = userEvent.setup(); await renderApp();
    await user.click(screen.getByRole('button', { name: /open 3d workspace preview/i }));
    expect(await screen.findByText(/This preview does not create a project or save a model/)).toBeInTheDocument();
    expect(localStorage.getItem('plankplan-studio.projects.v1')).toBeNull();
  });

  it('lets users maintain a manual stock price and shows plan, diagram, and offcut outputs', async () => {
    const user = userEvent.setup(); await renderApp();
    await user.click(await screen.findByRole('button', { name: /start a cutlist project/i }));
    await user.click(await screen.findByRole('button', { name: /add part/i }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Owned stock quantity' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Stock purchase limit' }), { target: { value: '0' } });
    expect(await screen.findByText(/Estimated purchase subtotal/)).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /cut diagram for 1×6 · 8 ft/i })).toBeInTheDocument();
    expect(await screen.findByText(/Offcut:/)).toBeInTheDocument();
    const persisted = JSON.parse(localStorage.getItem('plankplan-studio.projects.v1') ?? '[]');
    expect(persisted[0].materials[0].stocks[0].ownedQuantity).toBe(1);
  });

  it('exposes CSV export and opens the browser print flow from results', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:cutlist'); const revokeObjectURL = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const print = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL }); vi.stubGlobal('print', print);
    try {
      await renderApp();
      await user.click(await screen.findByRole('button', { name: /start a cutlist project/i }));
      await user.click(await screen.findByRole('button', { name: /add part/i }));
      await user.click(screen.getByRole('button', { name: /export csv/i }));
      expect(createObjectURL).toHaveBeenCalledOnce(); expect(anchorClick).toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: /print \/ save pdf/i }));
      expect(print).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); anchorClick.mockRestore(); }
  });

  it('offers imperial and metric stock presets and accepts fractional inch dimensions', async () => {
    const user = userEvent.setup(); await renderApp();
    await user.click(await screen.findByRole('button', { name: /start a cutlist project/i }));
    await user.click(await screen.findByRole('button', { name: /add part/i }));
    const length = screen.getByRole('textbox', { name: 'Part length' });
    fireEvent.change(length, { target: { value: '2 3/8' } }); fireEvent.blur(length);
    let saved = JSON.parse(localStorage.getItem('plankplan-studio.projects.v1') ?? '[]');
    expect(saved[0].parts[0].length.um).toBe(60325);
    await user.click(screen.getByRole('combobox', { name: 'Units' }));
    await user.keyboard('{ARROWDOWN}{ENTER}');
    saved = JSON.parse(localStorage.getItem('plankplan-studio.projects.v1') ?? '[]');
    expect(saved[0].parts[0].length.um).toBe(60325);
    await user.click(screen.getByRole('combobox', { name: 'Starter stock preset' }));
    await user.keyboard('{ARROWDOWN}{ENTER}');
    await user.click(screen.getByRole('button', { name: /add material/i }));
    saved = JSON.parse(localStorage.getItem('plankplan-studio.projects.v1') ?? '[]');
    expect(saved[0].materials.at(-1).stocks[0]).toMatchObject({ length: { um: 2400000 }, widthUm: 89000, thicknessUm: 19000 });
  });
});
