import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Project } from '@/lib/planner/model';
import { DesignWorkspace } from './DesignWorkspace';
import { rectangleGeometry } from '@/lib/planner/design/geometry';
import { readDesignViewPreferences } from '@/lib/planner/design/view-preferences';

vi.mock('./DesignViewport', () => ({ DesignViewport: ({ onSelect, onEnterDefinition, editingDefinitionId, editingObjectId }: { onSelect: (id?: string) => void; onEnterDefinition?:(id:string)=>void; editingDefinitionId?:string; editingObjectId?:string }) => <><button type="button" aria-label="Select sample in model" onClick={() => onSelect('instance-1')}>Sample viewport</button><button type="button" onClick={()=>onEnterDefinition?.('definition-1')}>Enter shared definition</button><button type="button" onClick={()=>onEnterDefinition?.('loose-1')}>Enter loose shape edit</button>{editingDefinitionId&&<span role="status">Editing {editingDefinitionId}</span>}{editingObjectId&&<span role="status">Editing shape {editingObjectId}</span>}</> }));

const project: Project = {
  schemaVersion: 2, id: 'workspace-test', name: 'Sample bench', unitSystem: 'imperial', kerf: { um: 0 }, trim: { um: 0 }, minOffcutLinear: { um: 0 }, minOffcutSheet: { shortSideUm: 0, longSideUm: 0 }, currency: 'CAD', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', parts: [], materials: [],
  design: { schemaVersion: 1, definitions: [{ id: 'definition-1', name: 'Side panel', geometry: rectangleGeometry(400_000,300_000,(()=>{let id=0;return p=>`fixture-${p}-${id++}`;})(),18_000), cutSpec: { kind: 'panel', lengthUm: 400_000, widthUm: 300_000, thicknessUm: 18_000, grainAxis: 'length', confirmation: 'confirmed' }, appearance: { color: '#bd8a56' } }], instances: [{ id: 'instance-1', definitionId: 'definition-1', name: 'Left side', pose: { positionUm: [0,0,0], rotation: [0,0,0,1] }, scalePpm: [1_000_000,1_000_000,1_000_000], hidden: false, locked: false }], looseObjects: [], partLinks: {} },
};

describe('DesignWorkspace', () => {
  it('persists camera view choices and synchronizes Frame model with the shared control', () => {
    const fixture = { ...project, id: 'camera-view-toggle-test' };
    const { unmount } = render(<DesignWorkspace project={fixture}/>);
    const group = screen.getByRole('radiogroup', { name: 'Camera view' });
    expect(within(group).getByRole('radio', { name: 'Isometric' })).toBeChecked();
    for (const [label, preset] of [['Top', 'top'], ['Front', 'front'], ['Right', 'right']] as const) {
      fireEvent.click(within(group).getByRole('radio', { name: label }));
      expect(readDesignViewPreferences(fixture.id).preset).toBe(preset);
    }
    unmount();
    render(<DesignWorkspace project={fixture}/>);
    expect(screen.getByRole('radio', { name: 'Right' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Frame model' }));
    expect(screen.getByRole('radio', { name: 'Isometric' })).toBeChecked();
    expect(readDesignViewPreferences(fixture.id).preset).toBe('iso');
  });

  it('renders the shared Project Info trigger in the navigation slot and opens its dialog', () => {
    const slot = document.createElement('div');
    slot.id = 'design-project-info-action';
    document.body.appendChild(slot);
    const { unmount } = render(<DesignWorkspace project={project}/>);
    try {
      const trigger = within(slot).getByRole('button', { name: 'Project Info' });
      expect(screen.getAllByRole('button', { name: 'Project Info' })).toHaveLength(1);
      expect(trigger.querySelector('svg circle')).toBeInTheDocument();
      expect(trigger).toHaveClass('project-info-icon');
      expect(trigger).not.toHaveClass('secondary');
      fireEvent.click(trigger);
      expect(screen.getByRole('dialog', { name: 'Project Info' })).toBeVisible();
    } finally {
      unmount();
      slot.remove();
    }
  });

  it('switches camera projection with the shared control and restores the saved choice', () => {
    const fixture = { ...project, id: 'projection-toggle-test' };
    const { unmount } = render(<DesignWorkspace project={fixture}/>);
    const group = screen.getByRole('radiogroup', { name: 'Camera projection' });
    expect(within(group).getByRole('radio', { name: 'Perspective' })).toBeChecked();
    fireEvent.click(within(group).getByRole('radio', { name: 'Orthographic' }));
    expect(within(group).getByRole('radio', { name: 'Orthographic' })).toBeChecked();
    expect(readDesignViewPreferences(fixture.id).projection).toBe('orthographic');
    unmount();
    render(<DesignWorkspace project={fixture}/>);
    expect(screen.getByRole('radio', { name: 'Orthographic' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Perspective' }));
    expect(readDesignViewPreferences(fixture.id).projection).toBe('perspective');
  });

  it('switches rectangle planes with X/Y/Z without intercepting undo or text input', () => {
    render(<DesignWorkspace project={project} />);
    const rectangle = screen.getByRole('button', { name: 'Rectangle (R)' });
    fireEvent.click(rectangle); rectangle.focus();
    fireEvent.keyDown(rectangle, { key: 'x' });
    expect(screen.getByRole('button', { name: 'X · YZ' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(rectangle, { key: 'Z' });
    expect(screen.getByRole('button', { name: 'Z · XY' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(rectangle, { key: 'y', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Z · XY' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(rectangle, { key: 'y' });
    expect(screen.getByRole('button', { name: 'Y · XZ' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('combobox', { name: 'Rectangle direction' }));
    expect(screen.getByRole('option', { name: '+X, -Z' })).toBeInTheDocument();
  });

  it('saves project information and shared unit preferences without changing stored dimensions', async () => {
    const onCommit=vi.fn().mockResolvedValue(true);
    render(<DesignWorkspace project={project} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button',{name:'Project Info'}));
    fireEvent.change(screen.getByLabelText('Project name'),{target:{value:'  Workbench  '}});
    fireEvent.change(screen.getByLabelText('Notes'),{target:{value:'Shop build'}});
    fireEvent.click(screen.getByRole('combobox',{name:'Project units'}));
    fireEvent.click(await screen.findByRole('option',{name:'Metric · mm'}));
    fireEvent.click(screen.getByRole('button',{name:'Save'}));
    await waitFor(()=>expect(onCommit).toHaveBeenCalledOnce());
    const saved=onCommit.mock.calls[0][0] as Project;
    expect(saved.name).toBe('Workbench');
    expect(saved.notes).toBe('Shop build');
    expect(saved.unitSystem).toBe('metric');
    expect(saved.design?.definitions[0].cutSpec?.lengthUm).toBe(400_000);
  });

  it('keeps tools and camera controls accessible and synchronizes model/list selection', async () => {
    render(<DesignWorkspace project={project} />);
    expect(screen.getByRole('button', { name: 'Select (Space)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Rectangle (R)' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Top' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Components' }));
    const panel = screen.getByRole('tabpanel');
    fireEvent.click(within(panel).getByRole('button', { name: /Left side/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Entity Info' }));
    const info = within(screen.getByRole('tabpanel'));
    expect(info.getByRole('textbox', { name: 'Entity name' })).toHaveValue('Left side');
    expect(info.getByText('Length').parentElement).toHaveTextContent('15.748 in');
  });

  it('opens and closes the canvas panel drawer with vertical tab keyboard controls', () => {
    render(<DesignWorkspace project={project} />);
    const tabs = screen.getByRole('tablist', { name: 'Workspace panels' });
    const drawer = document.querySelector('.design-drawer-content')!;
    expect(tabs).toHaveAttribute('aria-orientation', 'vertical');
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
    expect(drawer).toHaveAttribute('inert');
    expect(screen.getByRole('tab', { name: 'Entity Info' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Entity Info' }), { key: 'ArrowDown' });
    const materialsTab = screen.getByRole('tab', { name: 'Materials' });
    expect(materialsTab).toHaveFocus();
    expect(materialsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toBeVisible();
    expect(drawer).toHaveAttribute('aria-hidden', 'false');
    expect(drawer).not.toHaveAttribute('inert');
    fireEvent.keyDown(materialsTab, { key: 'Escape' });
    expect(materialsTab).toHaveFocus();
    expect(materialsTab).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(materialsTab);
    expect(screen.getByRole('tabpanel')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(materialsTab).toHaveFocus();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('does not create or persist a design while the workspace is visited', () => {
    const manualProject = { ...project, design: undefined };
    render(<DesignWorkspace project={manualProject} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Model Info' }));
    expect(screen.getByText('Not created')).toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Components' }));
    expect(screen.getByText(/does not create one/i)).toBeInTheDocument();
  });

  it('shows independent material and paint controls and applies reviewed cutlist links atomically', async () => {
    const withMaterial = { ...project, materials: [{ id: 'sheet-material', name: 'Birch plywood', type: 'sheet' as const, stocks: [{ id: 'sheet-stock', name: '4 × 8', length: { um: 2_438_400 }, widthUm: 1_219_200, price: { cents: 5000 }, ownedQuantity: 0 }] }], design: { ...project.design!, definitions: project.design!.definitions.map(definition => ({ ...definition, materialId: 'sheet-material' })) } };
    const onCommit = vi.fn();
    render(<DesignWorkspace project={withMaterial} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Entity Info' }));
    fireEvent.click(screen.getByRole('button', { name: /Left side/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Materials' }));
    expect(screen.getByText(/Paint controls visual appearance/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Cutlist material' })).toHaveTextContent('Birch plywood');
    fireEvent.click(screen.getByRole('tab', { name: 'Model Info' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review cutlist changes' }));
    const decision = await screen.findByRole('combobox', { name: 'Decision for Side panel' });
    fireEvent.change(decision, { target: { value: 'apply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed changes' }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
    expect(onCommit.mock.calls[0][0].parts).toHaveLength(1);
    expect(Object.keys(onCommit.mock.calls[0][0].design.partLinks)).toHaveLength(1);
  });

  it('rejects a cutlist preview after the repository generation changes', async () => {
    const withMaterial = { ...project, materials: [{ id: 'sheet-material', name: 'Birch plywood', type: 'sheet' as const, stocks: [{ id: 'sheet-stock', name: '4 × 8', length: { um: 2_438_400 }, widthUm: 1_219_200, price: { cents: 5000 }, ownedQuantity: 0 }] }], design: { ...project.design!, definitions: project.design!.definitions.map(definition => ({ ...definition, materialId: 'sheet-material' })) } };
    const onCommit = vi.fn();
    const view = render(<DesignWorkspace project={withMaterial} onCommit={onCommit} localGeneration={4} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Model Info' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review cutlist changes' }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Decision for Side panel' }), { target: { value: 'apply' } });
    view.rerender(<DesignWorkspace project={withMaterial} onCommit={onCommit} localGeneration={5} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/preview is stale/i);
    expect(screen.getByRole('button', { name: 'Apply reviewed changes' })).toBeDisabled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('keeps the review open and reports a failed atomic apply for retry', async () => {
    const withMaterial = { ...project, materials: [{ id: 'sheet-material', name: 'Birch plywood', type: 'sheet' as const, stocks: [{ id: 'sheet-stock', name: '4 × 8', length: { um: 2_438_400 }, widthUm: 1_219_200, price: { cents: 5000 }, ownedQuantity: 0 }] }], design: { ...project.design!, definitions: project.design!.definitions.map(definition => ({ ...definition, materialId: 'sheet-material' })) } };
    const onCommit = vi.fn().mockResolvedValue(false);
    render(<DesignWorkspace project={withMaterial} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Model Info' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review cutlist changes' }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Decision for Side panel' }), { target: { value: 'apply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed changes' }));
    expect(await screen.findByText(/cutlist changes were not saved/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cutlist review' })).toBeInTheDocument();
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('creates a board through a domain command and exposes undo/redo', () => {
    const onCommit = vi.fn();
    render(<DesignWorkspace project={{ ...project, design: undefined }} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create board' }));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit.mock.calls[0][0].design?.instances).toHaveLength(1);
    screen.getByRole('button',{name:'Create board'}).focus();
    fireEvent.keyDown(screen.getByRole('button',{name:'Create board'}),{key:'z',ctrlKey:true});
    expect(onCommit.mock.calls[1][0].design?.instances).toHaveLength(0);
    fireEvent.keyDown(screen.getByRole('button',{name:'Create board'}),{key:'z',ctrlKey:true,shiftKey:true});
    expect(onCommit.mock.calls[2][0].design?.instances).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab', { name: 'Model Info' }));
    expect(within(screen.getByRole('tabpanel')).getByText('Components').parentElement).toHaveTextContent('1');
  });

  it('applies exact values from the keyboard through a single design command', () => {
    const onCommit=vi.fn();
    render(<DesignWorkspace project={project} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Entity Info' }));
    fireEvent.click(screen.getByRole('button', { name: /Left side/ }));
    const exact=screen.getByRole('spinbutton', { name: 'Exact value' });
    fireEvent.change(exact,{target:{value:'24.015748'}});
    fireEvent.click(screen.getByRole('button',{name:'Apply exact value'}));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit.mock.calls[0][0].design?.definitions[0].cutSpec?.lengthUm).toBe(610_000);
  });

  it('guards shortcuts in editable fields and scopes tool shortcuts to workspace focus', () => {
    render(<DesignWorkspace project={project} />);
    fireEvent.click(screen.getByRole('tab',{name:'Components'}));
    const search=screen.getByRole('textbox',{name:'Search components'});
    fireEvent.keyDown(search,{key:'r'});
    expect(document.querySelector('[aria-label="Rectangle (R)"]')).toHaveAttribute('aria-pressed','false');
    fireEvent.click(screen.getByRole('button',{name:'Select (Space)'}));
    screen.getByRole('button',{name:'Select (Space)'}).focus();
    fireEvent.keyDown(screen.getByRole('button',{name:'Select (Space)' }),{key:'r'});
    expect(screen.getByRole('button',{name:'Rectangle (R)'})).toHaveAttribute('aria-pressed','true');
  });

  it('cancels the selected tool on Escape and window blur', () => {
    render(<DesignWorkspace project={project} />);
    const line=screen.getByRole('button',{name:'Line (L)'});
    fireEvent.click(line);
    line.focus();
    expect(line).toHaveAttribute('aria-pressed','true');
    fireEvent.keyDown(line,{key:'Escape'});
    expect(screen.getByRole('button',{name:'Select (Space)'})).toHaveAttribute('aria-pressed','true');
    fireEvent.click(screen.getByRole('button',{name:'Line (L)'}));
    fireEvent.blur(window);
    expect(screen.getByRole('button',{name:'Select (Space)'})).toHaveAttribute('aria-pressed','true');
  });

  it('opens shortcut help with a searchable, keyboard-dismissable dialog', () => {
    render(<DesignWorkspace project={project} />);
    fireEvent.click(screen.getByRole('button',{name:'Keyboard shortcuts'}));
    expect(screen.getByRole('dialog',{name:'Workspace shortcuts'})).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox',{name:'Search shortcuts'}),{target:{value:'Rectangle'}});
    expect(within(screen.getByRole('dialog')).getByText('Rectangle')).toBeInTheDocument();
    screen.getByRole('button',{name:'Close'}).focus();
    fireEvent.keyDown(screen.getByRole('button',{name:'Close'}),{key:'Tab'});
    expect(document.activeElement).toBe(screen.getByRole('textbox',{name:'Search shortcuts'}));
    fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'Keyboard shortcuts'}));
  });

  it('opens a bounded Radix context menu, cancels the active tool, and returns focus', async () => {
    render(<DesignWorkspace project={project} />);
    fireEvent.click(screen.getByRole('button',{name:'Rectangle (R)'}));
    const viewport=document.querySelector('.design-viewport')!;
    fireEvent.contextMenu(viewport,{clientX:1400,clientY:850});
    expect(document.querySelector('[aria-label="Rectangle (R)"]')).toHaveAttribute('aria-pressed','false');
    const item=await screen.findByRole('menuitem',{name:'Frame model'});
    const menuItems=screen.getAllByRole('menuitem');
    menuItems[0].focus();
    fireEvent.keyDown(menuItems[0],{key:'ArrowDown'});
    await waitFor(()=>expect(document.activeElement).toBe(menuItems[1]));
    fireEvent.keyDown(item,{key:'Escape'});
    await waitFor(()=>expect(document.activeElement).toBe(viewport));
  });

  it('exposes eligible object actions and focuses the name field for contextual rename', async () => {
    const onCommit=vi.fn();render(<DesignWorkspace project={project} onCommit={onCommit} />);
    fireEvent.click(document.querySelector('.design-selection-list button')!);
    const viewport=document.querySelector('.design-viewport')!;fireEvent.contextMenu(viewport,{clientX:120,clientY:90});
    expect(await screen.findByRole('menuitem',{name:'Edit Component'})).toBeInTheDocument();
    expect(screen.getByRole('menuitem',{name:'Duplicate'})).toBeInTheDocument();
    expect(screen.getByRole('menuitem',{name:'Hide'})).toBeInTheDocument();
    expect(screen.getByRole('menuitem',{name:'Erase'})).toBeInTheDocument();
    expect(screen.queryByRole('menuitem',{name:'Make Unique'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem',{name:'Rename'}));
    const name=await screen.findByRole('textbox',{name:'Entity name'});
    await waitFor(()=>expect(document.activeElement).toBe(name));
    fireEvent.change(name,{target:{value:'Renamed panel'}});fireEvent.keyDown(name,{key:'Enter'});
    expect(onCommit.mock.calls.at(-1)?.[0].design?.instances[0].name).toBe('Renamed panel');
  });

  it('offers Make Unique only for shared instances and keeps the edit target as the definition', async () => {
    const shared={...project,design:{...project.design!,instances:[...project.design!.instances,{...project.design!.instances[0],id:'instance-2'}]}};
    const onCommit=vi.fn();render(<DesignWorkspace project={shared} onCommit={onCommit} />);
    fireEvent.click(document.querySelector('.design-selection-list button')!);
    const entityInfoTab=screen.getByRole('tab', { name: 'Entity Info' });
    const drawerExpandedBeforeDoubleClick=entityInfoTab.getAttribute('aria-expanded');
    fireEvent.click(screen.getByRole('button',{name:'Enter shared definition'}));
    expect(screen.getByText('Editing definition-1')).toBeInTheDocument();
    expect(entityInfoTab).toHaveAttribute('aria-expanded', drawerExpandedBeforeDoubleClick);
    if(drawerExpandedBeforeDoubleClick==='false')fireEvent.click(entityInfoTab);
    expect(screen.getByRole('spinbutton', { name: /Length/ })).toBeInTheDocument();
    fireEvent.contextMenu(document.querySelector('.design-viewport')!,{clientX:120,clientY:90});
    fireEvent.click(await screen.findByRole('menuitem',{name:'Make Unique'}));
    expect(onCommit.mock.calls.at(-1)?.[0].design?.definitions).toHaveLength(2);
    expect(onCommit.mock.calls.at(-1)?.[0].design?.instances[0].definitionId).not.toBe('definition-1');
  });

  it('keeps loose shape dimensions collapsed after double-clicking the shape', async () => {
    const looseProject:Project={...project,design:{...project.design!,definitions:[],instances:[],looseObjects:[{id:'loose-1',name:'Loose panel',geometry:rectangleGeometry(100_000,80_000,(()=>{let id=0;return prefix=>`loose-${prefix}-${id++}`;})(),20_000),pose:{positionUm:[0,0,0],rotation:[0,0,0,1]},scalePpm:[1_000_000,1_000_000,1_000_000],appearance:{color:'#bd8a56'},hidden:false,locked:false}]}};
    render(<DesignWorkspace project={looseProject}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Enter loose shape edit'}));
    expect(screen.getByRole('tab', { name: 'Entity Info' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Entity Info' }));
    expect(screen.getByRole('spinbutton', { name: /Length/ })).toBeInTheDocument();
  });
});
