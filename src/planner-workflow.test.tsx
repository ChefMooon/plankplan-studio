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

async function startCutlistProject(user: ReturnType<typeof userEvent.setup>, name?: string) {
  const projects = screen.getByRole('region', { name: 'Projects' });
  await user.click(within(projects).getAllByRole('button', { name: 'New project' })[0]);
  await screen.findByRole('heading', { name: 'What are you making?' });
  if (name) {
    await user.click(await screen.findByRole('button', { name: 'Project Info' }));
    const dialog = await screen.findByRole('dialog', { name: 'Project Info' });
    const projectName = within(dialog).getByRole('textbox', { name: 'Project name' });
    await user.clear(projectName);
    await user.type(projectName, name);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(async () => expect(await savedProject(name)).toBeDefined());
  }
}

describe('local project workflow', () => {
  it('confirms JSON replacement before changing the saved project and rejects invalid backups', async () => {
    const user = userEvent.setup(); await renderApp();
    await startCutlistProject(user, 'Replace destination');
    const before = await savedProject('Replace destination');
    const backup = { ...createProject('Replacement backup'), notes: 'Imported notes' };
    const input = screen.getByLabelText('Replace project from JSON');
    const upload = () => user.upload(input, new File([exportProject(backup)], 'backup.json', { type: 'application/json' }));
    await upload();
    let dialog = await screen.findByRole('dialog', { name: 'Replace project from JSON?' });
    expect(within(dialog).getByText(/Replace destination.*Replacement backup/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(await savedProject('Replace destination')).toEqual(before);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(input).toHaveFocus());
    expect(await savedProject('Replace destination')).toEqual(before);
    await upload();
    await screen.findByRole('dialog', { name: 'Replace project from JSON?' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(input).toHaveFocus());
    expect(await savedProject('Replace destination')).toEqual(before);
    await upload();
    dialog = await screen.findByRole('dialog', { name: 'Replace project from JSON?' });
    await user.click(within(dialog).getByRole('button', { name: 'Replace project' }));
    await waitFor(async () => expect(await savedProject('Replacement backup')).toMatchObject({ id: before!.id, notes: 'Imported notes' }));
    await waitFor(() => expect(input).toHaveFocus());
    await user.upload(input, new File(['invalid'], 'invalid.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This project backup could not be imported');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await savedProject('Replacement backup')).toMatchObject({ id: before!.id, notes: 'Imported notes' });
  });

  it('confirms stock deletion and keeps assigned parts as unassigned entries', async () => {
    const user = userEvent.setup(); await renderApp();
    await startCutlistProject(user, 'Stock deletion confirmation');
    await user.click(screen.getByRole('button', { name: /create material/i }));
    const stockName = (screen.getByRole('textbox', { name: 'Stock name' }) as HTMLInputElement).value;
    await user.click(screen.getByRole('combobox', { name: 'Stock for new parts' }));
    await user.click(await screen.findByRole('option', { name: /Material 1 ·/ }));
    await user.click(screen.getByRole('button', { name: /add part/i }));
    await waitFor(async () => expect((await savedProject('Stock deletion confirmation'))?.parts[0]?.stockId).toBeTruthy());
    const before = await savedProject('Stock deletion confirmation');
    const actions = screen.getByRole('button', { name: `${stockName} actions` });
    await user.click(actions);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    let dialog = await screen.findByRole('dialog', { name: `Delete ${stockName}?` });
    expect(within(dialog).getByText(/1 assigned part entry will become unassigned and remain in the cutlist/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(actions).toHaveFocus());
    expect(await savedProject('Stock deletion confirmation')).toEqual(before);
    await user.click(actions);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(actions).toHaveFocus());
    expect(await savedProject('Stock deletion confirmation')).toEqual(before);
    await user.click(actions);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog', { name: `Delete ${stockName}?` });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(async () => {
      const saved = await savedProject('Stock deletion confirmation');
      expect(saved?.materials[0].stocks).toEqual([]);
      expect(saved?.parts).toEqual([expect.objectContaining({ id: before!.parts[0].id, materialId: '', kind: 'linear' })]);
      expect(saved?.parts[0].stockId).toBeUndefined();
      expect(saved?.editorOrder?.stocks?.[before!.materials[0].id]).toEqual([]);
    });
    expect(document.getElementById(`add-stock-${before!.materials[0].id}`)).toHaveFocus();
  });

  it('confirms part deletion and preserves the part when cancelled or dismissed with Escape', async () => {
    const user = userEvent.setup(); await renderApp();
    await startCutlistProject(user, 'Delete confirmation');
    await user.click(screen.getByRole('button', { name: /add part/i }));
    const actions = screen.getByRole('button', { name: 'Part 1 actions' });
    await user.click(actions);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    let dialog = await screen.findByRole('dialog', { name: 'Delete Part 1?' });
    expect(within(dialog).getByText('This removes Part 1 from the cutlist.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('textbox', { name: 'Part name' })).toBeInTheDocument();
    expect(actions).toHaveFocus();

    await user.click(actions);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog', { name: 'Delete Part 1?' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Part name' })).toBeInTheDocument();

    await user.click(actions);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog', { name: 'Delete Part 1?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Part name' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /add part/i })).toHaveFocus();
  });

  it('confirms deleting a material even when no parts are assigned', async () => {
    const user = userEvent.setup(); await renderApp();
    await startCutlistProject(user, 'Empty material confirmation');
    await user.click(screen.getByRole('button', { name: /create material/i }));
    const actions = await screen.findByRole('button', { name: 'Material 1 actions' });
    await user.click(actions);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Material 1?' });
    expect(within(dialog).getByText('This removes Material 1, its stock options, and 0 assigned part entries.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Material name' })).not.toBeInTheDocument());
    expect(document.getElementById('add-material')).toHaveFocus();
  });

  it('removes material assigned parts only after confirming the cascade', async () => {
    const user = userEvent.setup(); await renderApp();
    await startCutlistProject(user, 'Material cascade confirmation');
    await user.click(screen.getByRole('button', { name: /create material/i }));
    await user.click(screen.getByRole('combobox', { name: 'Stock for new parts' }));
    await user.click(await screen.findByRole('option', { name: /Material 1 ·/ }));
    await user.click(screen.getByRole('button', { name: /add part/i }));
    await waitFor(async () => {
      const project = await savedProject('Material cascade confirmation');
      expect(project?.parts[0]?.materialId).toBe(project?.materials[0]?.id);
    });
    const actions = screen.getByRole('button', { name: 'Material 1 actions' });
    await user.click(actions);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Material 1?' });
    expect(within(dialog).getByText('This removes Material 1, its stock options, and 1 assigned part entry.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(async () => expect(await savedProject('Material cascade confirmation')).toMatchObject({ materials: [], parts: [] }));
  });

  it('creates, edits, saves, reopens, duplicates and deletes a project', async () => {
    const user = userEvent.setup();
    await renderApp();
    await startCutlistProject(user, 'Shop stool');
    await user.click(screen.getByRole('button', { name: /add part/i }));
    await user.clear(screen.getByRole('textbox', { name: 'Part name' }));
    await user.type(screen.getByRole('textbox', { name: 'Part name' }), 'Seat rail');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Part quantity' }), { target: { value: '2' } });
    await waitFor(async () => expect((await savedProject('Shop stool'))?.parts[0]).toMatchObject({ name:'Seat rail', quantity:2 }));
    await user.click(screen.getByRole('link', { name: /all projects/i }));
    expect(await screen.findByText('Shop stool')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Open cutlist for Shop stool' }));
    expect(await screen.findByDisplayValue('Seat rail')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /all projects/i }));
    await user.click(await screen.findByRole('button', { name: 'Duplicate Shop stool' }));
    expect(await screen.findByText('Shop stool copy')).toBeInTheDocument();
    const deleteButton = screen.getByRole('button', { name: 'Delete Shop stool copy' });
    await user.click(deleteButton);
    let deleteDialog = await screen.findByRole('dialog', { name: 'Delete Shop stool copy?' });
    expect(within(deleteDialog).getByText(/all its Design and Cutlist data/)).toBeInTheDocument();
    expect(within(deleteDialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(deleteDialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(deleteButton).toHaveFocus());
    expect(await savedProject('Shop stool copy')).toBeDefined();
    await user.click(deleteButton);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(deleteButton).toHaveFocus());
    expect(await savedProject('Shop stool copy')).toBeDefined();
    await user.click(deleteButton);
    deleteDialog = await screen.findByRole('dialog', { name: 'Delete Shop stool copy?' });
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Shop stool copy')).not.toBeInTheDocument());
    await waitFor(async () => expect(await savedProject('Shop stool copy')).toBeUndefined());
    await waitFor(() => expect(document.activeElement).toHaveClass('project-delete'));
  });

  it('adds unassigned parts without stock and remembers the selected material for new parts', async () => {
    const user = userEvent.setup(); await renderApp();
    await startCutlistProject(user, 'Material picker');
    await user.click(screen.getByRole('button', { name: /add part/i }));
    await waitFor(async () => expect(await savedProject('Material picker')).toMatchObject({ materials: [], parts: [expect.objectContaining({ materialId: '' })] }));
    expect(await screen.findByText(/Generic stock uses/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create material/i }));
    await user.click(screen.getByRole('combobox', { name: 'Stock for new parts' }));
    await user.click(await screen.findByRole('option', { name: /Material 1 ·/ }));
    await user.click(screen.getByRole('button', { name: /add part/i }));
    await user.click(screen.getByRole('button', { name: /add part/i }));
    await waitFor(async () => {
      const project = await savedProject('Material picker');
      expect(project?.parts.map(part => part.materialId)).toEqual(['', project?.materials[0].id, project?.materials[0].id]);
    });
    await user.click(screen.getByRole('button', { name: 'Expand details for Part 1' }));
    await user.click(screen.getByRole('combobox', { name: 'Part stock option' }));
    await user.click(await screen.findByRole('option', { name: /Material 1 ·/ }));
    expect(screen.queryByRole('checkbox', { name: 'Grain locked Part 1' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Part stock option' }));
    await user.click(await screen.findByRole('option', { name: 'Generic / unassigned' }));
    expect(screen.queryByRole('checkbox', { name: 'Grain locked Part 1' })).not.toBeInTheDocument();
  });

  it('collapses materials and stock options independently', async () => {
    const user = userEvent.setup(); await renderApp();
    await startCutlistProject(user, 'Collapsible stock');
    await user.click(screen.getByRole('button', { name: /create material/i }));

    const materialToggle = await screen.findByRole('button', { name: 'Collapse material Material 1' });
    const materialRegion = document.getElementById(materialToggle.getAttribute('aria-controls')!);
    expect(materialRegion).toHaveAttribute('aria-hidden', 'false');
    await user.click(materialToggle);
    expect(materialToggle).toHaveAttribute('aria-expanded', 'false');
    expect(materialRegion).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByRole('button', { name: 'Expand material Material 1' }));

    const stockToggle = screen.getByRole('button', { name: /^Collapse stock option/ });
    const stockRegion = document.getElementById(stockToggle.getAttribute('aria-controls')!);
    await user.click(stockToggle);
    expect(stockToggle).toHaveAttribute('aria-expanded', 'false');
    expect(stockRegion).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByRole('button', { name: /^Expand stock option/ }));
    expect(stockRegion).toHaveAttribute('aria-hidden', 'false');
  });

  it('saves part-owned lumber presets and custom dimensions independently from stock', async () => {
    const user = userEvent.setup(); await renderApp();
    await startCutlistProject(user, 'Lumber sizes');
    await user.click(screen.getByRole('button', { name: /add part/i }));
    await user.click(screen.getByRole('combobox', { name: 'Lumber size for Part 1' }));
    await user.click(await screen.findByRole('option', { name: /2×4 ·/ }));
    await waitFor(async () => expect((await savedProject('Lumber sizes'))?.parts[0]).toMatchObject({ kind: 'linear', lumberPreset: '2×4', crossSection: { width: { um: 88900 }, thickness: { um: 38100 } } }));
    await user.click(screen.getByRole('combobox', { name: 'Lumber size for Part 1' }));
    await user.click(await screen.findByRole('option', { name: 'Custom size' }));
    await user.click(screen.getByRole('button', { name: 'Expand details for Part 1' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Part cross-section width' }), { target: { value: '4' } });
    await waitFor(async () => expect((await savedProject('Lumber sizes'))?.parts[0].crossSection?.width.um).toBe(101600));
    await user.click(within(screen.getByRole('radiogroup', { name: 'Part type for Part 1' })).getByRole('radio', { name: 'Sheet material' }));
    expect(screen.getByRole('textbox', { name: 'Part width' })).toBeInTheDocument();
    await waitFor(async () => expect((await savedProject('Lumber sizes'))?.parts[0]).toMatchObject({ kind: 'sheet', crossSection: { width: { um: 101600 } } }));
  });

  it('imports a versioned project and navigates between Design and Cutlist', async () => {
    const user = userEvent.setup(); await renderApp();
    const project = createProject('Imported bench');
    const file = new File([exportProject(project)], 'bench.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText(/import project/i), file);
    await screen.findByText('Imported bench');
    await user.click(within(screen.getByText('Imported bench').closest('article')!).getByRole('link', { name: /open design/i }));
    await user.click(await screen.findByRole('tab', { name: 'Entity Info' }));
    expect(await screen.findByRole('heading', { name: 'Model workspace' })).toBeInTheDocument();
    // Canvas mounting is covered by browser smoke checks; jsdom verifies route composition and navigation.
    expect(screen.getByRole('link', { name: 'Cutlist' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Cutlist' }));
    expect(await screen.findByRole('heading', { name: 'What are you making?' })).toBeInTheDocument();
    expect(await savedProject('Imported bench')).toMatchObject({schemaVersion:2,name:'Imported bench'});
  }, 10_000);

  it('opens the dashboard preview without persisting a new project', async () => {
    const projectsBefore = await projectRepository.list('local');
    const user = userEvent.setup(); await renderApp();
    await user.click(screen.getByRole('button', { name: 'About this workspace' }));
    await user.click(await screen.findByRole('button', { name: 'Explore workspace preview' }));
    expect(await screen.findByText(/This standalone preview is illustrative/)).toBeInTheDocument();
    expect(localStorage.getItem('plankplan-studio.projects.v1')).toBeNull();
    expect(await projectRepository.list('local')).toEqual(projectsBefore);
  });

  it('lets users maintain a manual stock price and shows plan, diagram, and offcut outputs', async () => {
    const user = userEvent.setup(); await renderApp();
    await startCutlistProject(user, 'Stock workflow');
    await user.click(screen.getByRole('button', { name: /create material/i }));
    await user.click(screen.getByRole('combobox', { name: 'Stock for new parts' }));
    await user.click(await screen.findByRole('option', { name: /Material 1 ·/ }));
    await user.click(await screen.findByRole('button', { name: /add part/i }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Stock price' }), { target: { value: '12.50' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Owned stock quantity' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Stock purchase limit' }), { target: { value: '0' } });
    expect(await screen.findByText(/Estimated purchase subtotal/)).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /cut diagram for/i })).toBeInTheDocument();
    expect(await screen.findByText(/Offcut:/)).toBeInTheDocument();
    await waitFor(async () => expect((await savedProject('Stock workflow'))?.materials[0].stocks[0]).toMatchObject({ ownedQuantity: 1, quantityLimit: 0, price: { cents: 1250 } }));
  });

  it('exposes CSV export and opens the browser print flow from results', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:cutlist'); const revokeObjectURL = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const print = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL }); vi.stubGlobal('print', print);
    try {
      await renderApp();
      await startCutlistProject(user);
      await user.click(await screen.findByRole('button', { name: /add part/i }));
      await user.click(screen.getByRole('button', { name: /export csv/i }));
      expect(createObjectURL).toHaveBeenCalledOnce(); expect(anchorClick).toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: /print \/ save pdf/i }));
      expect(print).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); anchorClick.mockRestore(); }
  });

  it('offers imperial and metric stock presets and accepts fractional inch dimensions', async () => {
    const user = userEvent.setup(); await renderApp();
    await startCutlistProject(user, 'Fractional workflow');
    await user.click(await screen.findByRole('button', { name: /add part/i }));
    const length = screen.getByRole('textbox', { name: 'Part length' });
    fireEvent.change(length, { target: { value: '2 3/8' } }); fireEvent.blur(length);
    const designHref=screen.getByRole('link',{name:'Design Beta'}).getAttribute('href')!; const fractionalId=designHref.split('/')[2];
    await waitFor(async () => { const saved=await projectRepository.get({namespaceId:'local',projectId:fractionalId}); expect(saved.ok&&saved.value.parts[0].length.um).toBe(60325); });
    await user.click(screen.getByRole('button', { name: 'Project Info' }));
    const dialog = await screen.findByRole('dialog', { name: 'Project Info' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Project units' }));
    await user.click(await screen.findByRole('option', { name: 'Metric · mm' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(async () => expect(await savedProject('Fractional workflow')).toMatchObject({ unitSystem: 'metric', parts: [expect.objectContaining({ length: { um: 60325 } })] }));
    await user.click(screen.getByRole('combobox', { name: 'Stock preset' }));
    await user.click(await screen.findByRole('option', { name: '1×4 · 19.05 × 88.9 mm · 2438.4 mm' }));
    await user.click(screen.getByRole('button', { name: /create material/i }));
    await waitFor(async () => expect((await savedProject('Fractional workflow'))?.materials.at(-1)?.stocks[0]).toMatchObject({ length: { um: 2_438_400 }, widthUm: 88_900, thicknessUm: 19_050 }));
  });
});
