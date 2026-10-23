import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { routeTree } from './routeTree.gen';
import { exportProject } from './lib/planner/model';
import { createProject } from './lib/planner/storage';
import { projectRepository } from './lib/planner/repository.indexeddb';
import { ThemeProvider } from './components/theme-provider';

async function renderApp(path = '/') {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  render(<ThemeProvider><RouterProvider router={router}/></ThemeProvider>);
  return router;
}
async function savedProject(name: string) { const list=await projectRepository.list('local'); if(!list.ok)return undefined; const item=list.summaries.filter(project=>project.name===name).sort((a,b)=>b.localGeneration-a.localGeneration)[0]; if(!item)return undefined; const result=await projectRepository.get({namespaceId:'local',projectId:item.id}); return result.ok?result.value:undefined; }

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
    await waitFor(async () => expect((await savedProject('Shop stool'))?.parts[0]).toMatchObject({ name:'Seat rail', quantity:2 }));
    await user.click(screen.getByRole('link', { name: /all projects/i }));
    expect(await screen.findByText('Shop stool')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /open cutlist/i }));
    expect(await screen.findByDisplayValue('Seat rail')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /all projects/i }));
    await user.click(await screen.findByRole('button', { name: 'Duplicate Shop stool' }));
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
    await user.click(within(screen.getByText('Imported bench').closest('article')!).getByRole('link', { name: /open cutlist/i }));
    await user.click(await screen.findByRole('link', { name: /design/i }));
    expect(await screen.findByRole('heading', { name: 'Model workspace' })).toBeInTheDocument();
    // Canvas mounting is covered by browser smoke checks; jsdom verifies route composition and navigation.
    expect(screen.getByRole('link', { name: 'Cutlist' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Cutlist' }));
    expect(await screen.findByRole('heading', { name: 'What are you making?' })).toBeInTheDocument();
    expect(await savedProject('Imported bench')).toMatchObject({schemaVersion:2,name:'Imported bench'});
  });

  it('opens the dashboard preview without persisting a new project', async () => {
    const user = userEvent.setup(); await renderApp();
    await user.click(screen.getByRole('button', { name: /open workspace preview/i }));
    expect(await screen.findByText(/This standalone preview is illustrative/)).toBeInTheDocument();
    expect(localStorage.getItem('plankplan-studio.projects.v1')).toBeNull();
  });

  it('lets users maintain a manual stock price and shows plan, diagram, and offcut outputs', async () => {
    const user = userEvent.setup(); await renderApp();
    await user.click(await screen.findByRole('button', { name: /start a cutlist project/i }));
    await user.clear(await screen.findByRole('textbox', {name:'Project name'})); await user.type(screen.getByRole('textbox', {name:'Project name'}),'Stock workflow');
    await user.click(await screen.findByRole('button', { name: /add part/i }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Owned stock quantity' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Stock purchase limit' }), { target: { value: '0' } });
    expect(await screen.findByText(/Estimated purchase subtotal/)).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /cut diagram for/i })).toBeInTheDocument();
    expect(await screen.findByText(/Offcut:/)).toBeInTheDocument();
    await waitFor(async () => expect((await savedProject('Stock workflow'))?.materials[0].stocks[0].ownedQuantity).toBe(1));
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
    await user.clear(await screen.findByRole('textbox', {name:'Project name'})); await user.type(screen.getByRole('textbox', {name:'Project name'}),'Fractional workflow');
    await user.click(await screen.findByRole('button', { name: /add part/i }));
    const length = screen.getByRole('textbox', { name: 'Part length' });
    fireEvent.change(length, { target: { value: '2 3/8' } }); fireEvent.blur(length);
    const designHref=screen.getByRole('link',{name:'Design'}).getAttribute('href')!; const fractionalId=designHref.split('/')[2];
    await waitFor(async () => { const saved=await projectRepository.get({namespaceId:'local',projectId:fractionalId}); expect(saved.ok&&saved.value.parts[0].length.um).toBe(60325); });
    await user.click(screen.getByRole('combobox', { name: 'Units' }));
    await user.keyboard('{ARROWDOWN}{ENTER}');
    await waitFor(async () => expect((await savedProject('Fractional workflow'))?.parts[0].length.um).toBe(60325));
    await user.click(screen.getByRole('combobox', { name: 'Starter stock preset' }));
    await user.keyboard('{ARROWDOWN}{ENTER}');
    await user.click(screen.getByRole('button', { name: /add material/i }));
    await waitFor(async () => expect((await savedProject('Fractional workflow'))?.materials.at(-1)?.stocks[0]).toMatchObject({ length: { um: 2_438_400 }, widthUm: 89_000, thicknessUm: 19_000 }));
  });
});
