import { fireEvent, render, screen } from '@testing-library/react';
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

  it('offers accessible rotation axes and does not commit when an axis is activated by keyboard', () => {
    const onChange=vi.fn();const onCommit=vi.fn();
    render(<ToolMeasurementBox session={{...session,tool:'Rotate',rotationAxis:'z'}} onChange={onChange} onCommit={onCommit} onCancel={vi.fn()} />);
    const x=screen.getByRole('button',{name:'Rotate around X axis'});
    expect(x).toHaveAttribute('aria-pressed','false');
    fireEvent.keyDown(x,{key:'Enter'});
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({rotationAxis:'x'}));
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(x);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({rotationAxis:'x'}));
    expect(onCommit).not.toHaveBeenCalled();
  });
});
