import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToolMeasurementBox } from './ToolMeasurementBox';
import type { ToolMeasurementSession } from './tool-measurements';

const session: ToolMeasurementSession = { id: 'gesture-1', tool: 'Rectangle', canPlace: true, fields: [{ id: 'width', label: 'Width', value: '10', unit: 'mm', min: 0.001 }] };

describe('ToolMeasurementBox', () => {
  it('edits the active session and commits on Enter without bubbling viewport input', () => {
    const onChange=vi.fn();const onCommit=vi.fn();const bubble=vi.fn();
    render(<div onPointerDown={bubble}><ToolMeasurementBox session={session} onChange={onChange} onCommit={onCommit} onCancel={vi.fn()} /></div>);
    const field=screen.getByRole('spinbutton',{name:'Width'});
    fireEvent.change(field,{target:{value:'12.5'}});
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({id:'gesture-1',fields:[expect.objectContaining({id:'width',value:'12.5',exact:true})]}));
    fireEvent.pointerDown(field);
    expect(bubble).not.toHaveBeenCalled();
    fireEvent.keyDown(field,{key:'Enter'});
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('cancels the active session on Escape', () => {
    const onCancel=vi.fn();
    render(<ToolMeasurementBox session={session} onChange={vi.fn()} onCommit={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole('spinbutton',{name:'Width'}),{key:'Escape'});
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('switches rotation axes with pointer and arrow keys without committing the gesture', async () => {
    const user = userEvent.setup();
    const onChange=vi.fn();const onCommit=vi.fn();
    function Example() {
      const [current, setCurrent] = useState<ToolMeasurementSession>({...session,tool:'Rotate',rotationAxis:'z'});
      return <ToolMeasurementBox session={current} onChange={next => { setCurrent(next); onChange(next); }} onCommit={onCommit} onCancel={vi.fn()}/>;
    }
    render(<Example/>);
    const x=screen.getByRole('radio',{name:'Rotate around X axis'});
    expect(screen.getByRole('radiogroup',{name:'Rotation axis'})).toBeVisible();
    expect(x).not.toBeChecked();
    await user.click(x);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({rotationAxis:'x'}));
    expect(x).toBeChecked();
    await user.keyboard('{ArrowRight>}');
    await waitFor(() => expect(screen.getByRole('radio',{name:'Rotate around Y axis'})).toBeChecked());
    await user.keyboard('{/ArrowRight}');
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onCommit).not.toHaveBeenCalled();
  });
});
