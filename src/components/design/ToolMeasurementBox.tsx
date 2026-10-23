import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import type { ToolMeasurementSession } from './tool-measurements';

type Props = {
  session?: ToolMeasurementSession;
  onChange: (session: ToolMeasurementSession) => void;
  onCommit: () => void;
  onCancel: () => void;
};

export function ToolMeasurementBox({ session, onChange, onCommit, onCancel }: Props) {
  if (!session) return null;
  const stop = (event: PointerEvent | MouseEvent) => event.stopPropagation();
  const keyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Enter') { event.preventDefault(); if ((event.target as HTMLElement).tagName === 'INPUT' && session.canPlace) onCommit(); }
    if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
  };
  return <form className="design-measurement-box" aria-label={`${session.tool} measurements`} onSubmit={event => { event.preventDefault(); if (session.canPlace) onCommit(); }} onPointerDown={stop} onMouseDown={stop} onClick={stop} onKeyDown={keyDown}>
    {session.tool === 'Rotate' && <div className="design-rotation-axis" role="group" aria-label="Rotation axis">{(['x','y','z'] as const).map(axis => <button key={axis} type="button" data-axis={axis} aria-label={`Rotate around ${axis.toUpperCase()} axis`} aria-pressed={session.rotationAxis === axis} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onChange({ ...session, rotationAxis: axis }); } }} onClick={() => onChange({ ...session, rotationAxis: axis })}>{axis.toUpperCase()}</button>)}</div>}
    {session.fields.map((field,index) => <label key={field.id}>{field.label}<span className="design-measurement-input-wrap"><input autoFocus={index===0} aria-label={field.label} type="number" inputMode="decimal" step={field.step ?? 'any'} min={field.min} value={field.value} aria-invalid={!!field.error} onChange={event => { const fields=session.fields.map(current => current.id === field.id ? { ...current, value: event.target.value, exact: true, error: undefined } : current); const valid=fields.every(current=>{const value=Number(current.value);return current.value.trim()!==''&&Number.isFinite(value)&&(current.min===undefined||value>=current.min);}); onChange({ ...session, fields, canPlace: valid }); }} /><span aria-hidden="true">{field.unit}</span></span>{field.error && <small role="alert">{field.error}</small>}</label>)}
  </form>;
}
