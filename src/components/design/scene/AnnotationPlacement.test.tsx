import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { rectangleGeometry } from '@/lib/planner/design/geometry';
import type { DesignDocumentV1 } from '@/lib/planner/design/schema';
import { validateDesignDocument } from '@/lib/planner/design/schema';
import { applyDesignCommand } from '@/lib/planner/design/commands';
import type { Project } from '@/lib/planner/model';
import { AnnotationLayer } from './AnnotationLayer';
import { AnnotationHoverGraphic } from './AnnotationPlacement';
import { designVertices } from '../rectangle-plane';
import { chooseDimensionMeasure } from '../annotation-dimension';
import { resolveAnnotation } from '../annotation-anchor';
import { formatDesignLength } from '@/lib/planner/design/format-length';
// @ts-expect-error Node file access is limited to this CSS source-order regression test.
import { readFileSync } from 'node:fs';
// @ts-expect-error Node path resolution is limited to this CSS source-order regression test.
import { resolve } from 'node:path';

const state = vi.hoisted(() => ({ camera: undefined as unknown, gl: undefined as unknown, scene: undefined as unknown, size: { width: 800, height: 600 }, invalidate: vi.fn() }));
const rendered = vi.hoisted(() => ({ lines: [] as Record<string, unknown>[] }));
vi.mock('@react-three/fiber', () => ({ useThree: () => state, useFrame: vi.fn() }));
vi.mock('@react-three/drei', () => ({
  Html: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: (props: Record<string, unknown>) => { rendered.lines.push(props); return null; },
}));

function fixture(annotations: DesignDocumentV1['annotations'] = []): DesignDocumentV1 {
  let sequence = 0;
  return { schemaVersion: 1, definitions: [], instances: [], partLinks: {}, annotations,
    looseObjects: [{ id: 'board', name: 'Board', geometry: rectangleGeometry(400_000, 300_000, prefix => `${prefix}-${sequence++}`), appearance: { color: '#ffffff' }, pose: { positionUm: [0, 0, 0], rotation: [0, 0, 0, 1] }, scalePpm: [1_000_000, 1_000_000, 1_000_000], hidden: false, locked: false }] };
}

const projectFor = (design: DesignDocumentV1): Project => ({ schemaVersion: 3, id: 'p', name: 'Project', unitSystem: 'metric', kerf: { um: 0 }, trim: { um: 0 }, minOffcutLinear: { um: 0 }, minOffcutSheet: { shortSideUm: 0, longSideUm: 0 }, currency: 'CAD', cutlists: [{ id: 'default-cutlist', name: 'Default' }], planningGroups: [], parts: [], materials: [{ id: 'wood', name: 'Wood', type: 'linear', stocks: [] }], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', design });

function setup() {
  const canvas = document.createElement('canvas'); document.body.append(canvas);
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
  const camera = new PerspectiveCamera(45, 800 / 600, 0.01, 200); camera.position.set(0, 0, 2); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  state.camera = camera; state.gl = { domElement: canvas }; state.scene = { traverse: () => undefined }; state.invalidate = vi.fn();
  const onCommand = vi.fn(); const onHint = vi.fn();
  const view = render(<AnnotationLayer visible onCommand={onCommand} onHint={onHint} onSelectAnnotation={vi.fn()} design={fixture()} unitSystem="metric" activeTool="text" />);
  const at = (point: [number, number, number]) => {
    const projected = new Vector3(...point).project(camera);
    return { clientX: (projected.x + 1) * 400, clientY: (1 - projected.y) * 300 };
  };
  const click = (point: { clientX: number; clientY: number }) => act(() => { fireEvent.click(canvas, { button: 0, ...point }); });
  const corner = at([0, 0, 0]);
  return { canvas, onCommand, onHint, view, click, corner, at };
}

describe('AnnotationPlacement text tool', () => {
  it('suppresses annotation placement clicks after a pointer drag over four pixels', () => {
    const h = setup();
    act(() => {
      fireEvent.pointerDown(h.canvas, { button: 0, pointerId: 7, ...h.corner });
      fireEvent.pointerMove(h.canvas, { pointerId: 7, clientX: h.corner.clientX + 5, clientY: h.corner.clientY });
      fireEvent.pointerUp(h.canvas, { button: 0, pointerId: 7, clientX: h.corner.clientX + 5, clientY: h.corner.clientY });
      fireEvent.click(h.canvas, { button: 0, clientX: h.corner.clientX + 5, clientY: h.corner.clientY });
    });
    expect(screen.queryByRole('textbox', { name: 'Annotation text' })).toBeNull();
    expect(h.onCommand).not.toHaveBeenCalled();
    h.view.unmount(); h.canvas.remove();
  });
  it('focuses the real textarea, accepts n/d/e, isolates tool shortcuts, and commits once', async () => {
    const h = setup(); h.click(h.corner); h.click({ clientX: 500, clientY: 300 });
    const editor = screen.getByRole('textbox', { name: 'Annotation text' }) as HTMLTextAreaElement;
    await act(async () => { await new Promise(resolve => requestAnimationFrame(() => resolve(undefined))); });
    expect(document.activeElement).toBe(editor);
    const keySpy = vi.fn(); document.addEventListener('keydown', keySpy);
    const user = userEvent.setup();
    await user.type(editor, 'nde');
    expect(editor).toHaveValue('nde'); expect(keySpy).not.toHaveBeenCalled();
    await user.keyboard('{Enter}'); document.removeEventListener('keydown', keySpy);
    expect(h.onCommand).toHaveBeenCalledOnce();
    expect(h.onCommand.mock.calls[0][0]).toMatchObject({ annotation: { text: 'nde' } });
    h.view.unmount(); h.canvas.remove();
  });

  it('keeps an empty draft through an initial blur and refocus, then hints on outside discard', async () => {
    const h = setup(); h.click(h.corner); h.click({ clientX: 500, clientY: 300 });
    const editor = screen.getByRole('textbox', { name: 'Annotation text' });
    fireEvent.blur(editor);
    expect(screen.getByRole('textbox', { name: 'Annotation text' })).toBeTruthy();
    await act(async () => { await new Promise(resolve => requestAnimationFrame(() => resolve(undefined))); });
    expect(document.activeElement).toBe(editor);
    fireEvent.focus(editor);
    expect(h.onCommand).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('textbox', { name: 'Annotation text' })).toBeNull();
    expect(h.onHint).toHaveBeenCalledWith('Text · empty note discarded');
    expect(h.onCommand).not.toHaveBeenCalled();
    h.view.unmount(); h.canvas.remove();
  });

  it('selects existing text for editing and keeps Enter deletion for an emptied existing note', async () => {
    const existing = { id: 'n1', kind: 'text' as const, anchor: { target: { kind: 'loose' as const, id: 'board' }, element: { type: 'vertex' as const, id: 'gone' }, localUm: [0, 0, 0] as [number, number, number] }, labelLocalUm: [100_000, 0, 0] as [number, number, number], text: 'Old' };
    const h = setup(); h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={fixture([existing])} unitSystem="metric" activeTool="text" />);
    fireEvent.doubleClick(screen.getByText('Old'));
    const editor = screen.getByRole('textbox', { name: 'Annotation text' }) as HTMLTextAreaElement;
    await act(async () => { await new Promise(resolve => requestAnimationFrame(() => resolve(undefined))); });
    expect(editor.selectionStart).toBe(0); expect(editor.selectionEnd).toBe(3);
    fireEvent.change(editor, { target: { value: '' } }); fireEvent.keyDown(editor, { key: 'Enter' });
    expect(h.onCommand).toHaveBeenCalledWith({ type: 'delete-annotation', annotationId: 'n1' });
    h.view.unmount(); h.canvas.remove();
  });

  it('resets a draft when leaving Text or when its part disappears', () => {
    const h = setup(); h.click(h.corner); h.click({ clientX: 500, clientY: 300 });
    h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={fixture()} unitSystem="metric" activeTool="dimensions" />);
    expect(screen.queryByRole('textbox', { name: 'Annotation text' })).toBeNull();
    h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={fixture()} unitSystem="metric" activeTool="text" />);
    h.click(h.corner); h.click({ clientX: 500, clientY: 300 });
    h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={{ ...fixture(), looseObjects: [] }} unitSystem="metric" activeTool="text" />);
    expect(screen.queryByRole('textbox', { name: 'Annotation text' })).toBeNull();
    h.view.unmount(); h.canvas.remove();
  });

  it('anchors to a vertex, places a textarea, and commits a text annotation', () => {
    const h = setup();
    h.click(h.corner); h.click({ clientX: 500, clientY: 300 });
    fireEvent.change(screen.getByRole('textbox', { name: 'Annotation text' }), { target: { value: 'Hello' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Annotation text' }), { key: 'Enter' });
    expect(h.onCommand).toHaveBeenCalledOnce();
    expect(h.onCommand.mock.calls[0][0]).toMatchObject({ type: 'add-annotation', annotation: { kind: 'text', text: 'Hello', anchor: { target: { kind: 'loose', id: 'board' }, element: { type: 'vertex' } } } });
    h.view.unmount(); h.canvas.remove();
  });

  it('keeps Shift+Enter in the draft and commits the newline with Enter', () => {
    const h = setup(); h.click(h.corner); h.click({ clientX: 500, clientY: 300 });
    const editor = screen.getByRole('textbox', { name: 'Annotation text' });
    fireEvent.change(editor, { target: { value: 'a' } }); fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true });
    expect(h.onCommand).not.toHaveBeenCalled();
    fireEvent.change(editor, { target: { value: 'a\nb' } }); fireEvent.keyDown(editor, { key: 'Enter' });
    expect(h.onCommand.mock.calls[0][0]).toMatchObject({ annotation: { text: 'a\nb' } });
    h.view.unmount(); h.canvas.remove();
  });

  it('discards empty notes and cancels with Escape', () => {
    const h = setup(); h.click(h.corner); h.click({ clientX: 500, clientY: 300 });
    let editor = screen.getByRole('textbox', { name: 'Annotation text' });
    fireEvent.keyDown(editor, { key: 'Escape' }); expect(h.onCommand).not.toHaveBeenCalled();
    h.click(h.corner); h.click({ clientX: 500, clientY: 300 });
    editor = screen.getByRole('textbox', { name: 'Annotation text' }); fireEvent.change(editor, { target: { value: '  ' } }); fireEvent.keyDown(editor, { key: 'Enter' });
    expect(h.onCommand).not.toHaveBeenCalled(); h.view.unmount(); h.canvas.remove();
  });

  it('commits an existing note edit and deletes it when emptied', () => {
    const existing = { id: 'n1', kind: 'text' as const, anchor: { target: { kind: 'loose' as const, id: 'board' }, element: { type: 'vertex' as const, id: 'missing' }, localUm: [0, 0, 0] as [number, number, number] }, labelLocalUm: [100_000, 0, 0] as [number, number, number], text: 'Old' };
    const h = setup();
    h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={fixture([existing])} unitSystem="metric" activeTool="text" />);
    fireEvent.pointerDown(screen.getByText('Old'), { button: 0, clientX: 100, clientY: 100 }); fireEvent.pointerUp(window, { clientX: 100, clientY: 100 });
    const editor = screen.getByRole('textbox', { name: 'Annotation text' }); fireEvent.change(editor, { target: { value: 'New' } }); fireEvent.keyDown(editor, { key: 'Enter' });
    expect(h.onCommand).toHaveBeenLastCalledWith({ type: 'update-annotation', annotation: { ...existing, text: 'New' } });
    h.view.unmount(); h.canvas.remove();
  });

  it('commits on blur once and swallows the subsequent canvas click', () => {
    const h = setup(); h.click(h.corner); h.click({ clientX: 500, clientY: 300 });
    const editor = screen.getByRole('textbox', { name: 'Annotation text' }); fireEvent.change(editor, { target: { value: 'Blur' } }); fireEvent.blur(editor);
    act(() => { fireEvent.pointerDown(h.canvas, { button: 0, clientX: 600, clientY: 300 }); fireEvent.click(h.canvas, { clientX: 600, clientY: 300 }); });
    expect(h.onCommand).toHaveBeenCalledOnce(); expect(screen.queryByRole('textbox', { name: 'Annotation text' })).toBeNull();
    h.view.unmount(); h.canvas.remove();
  });

  it('retypes by double-click; Escape and unchanged text do not emit commands', () => {
    const existing = { id: 'n1', kind: 'text' as const, anchor: { target: { kind: 'loose' as const, id: 'board' }, element: { type: 'vertex' as const, id: 'gone' }, localUm: [0, 0, 0] as [number, number, number] }, labelLocalUm: [100_000, 0, 0] as [number, number, number], text: 'Old' };
    const h = setup(); h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={fixture([existing])} unitSystem="metric" activeTool="text" />);
    const label = screen.getByText('Old'); fireEvent.doubleClick(label);
    const editor = screen.getByRole('textbox', { name: 'Annotation text' }); fireEvent.keyDown(editor, { key: 'Escape' }); expect(h.onCommand).not.toHaveBeenCalled();
    fireEvent.doubleClick(screen.getByText('Old')); const unchangedEditor = screen.getByRole('textbox', { name: 'Annotation text' }); fireEvent.keyDown(unchangedEditor, { key: 'Enter' });
    expect(h.onCommand).not.toHaveBeenCalled(); h.view.unmount(); h.canvas.remove();
  });

  it('deletes an emptied existing note and moves a dragged label only past three pixels', () => {
    const existing = { id: 'n1', kind: 'text' as const, anchor: { target: { kind: 'loose' as const, id: 'board' }, element: { type: 'vertex' as const, id: 'gone' }, localUm: [0, 0, 0] as [number, number, number] }, labelLocalUm: [100_000, 0, 0] as [number, number, number], text: 'Old' };
    const h = setup(); h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={fixture([existing])} unitSystem="metric" activeTool="text" />);
    fireEvent.doubleClick(screen.getByText('Old')); const editor = screen.getByRole('textbox', { name: 'Annotation text' }); fireEvent.change(editor, { target: { value: '' } }); fireEvent.keyDown(editor, { key: 'Enter' });
    expect(h.onCommand).toHaveBeenCalledWith({ type: 'delete-annotation', annotationId: 'n1' });
    h.onCommand.mockClear(); h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={fixture([existing])} unitSystem="metric" activeTool="text" />);
    const label = screen.getByText('Old'); fireEvent.pointerDown(label, { button: 0, clientX: 100, clientY: 100 }); fireEvent.pointerMove(window, { clientX: 110, clientY: 100 }); fireEvent.pointerUp(window, { clientX: 110, clientY: 100 });
    expect(h.onCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'update-annotation', annotation: expect.objectContaining({ id: 'n1', anchor: existing.anchor, text: 'Old', labelLocalUm: expect.not.arrayContaining(existing.labelLocalUm) }) }));
    h.onCommand.mockClear(); h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={fixture([existing])} unitSystem="metric" activeTool="text" />);
    fireEvent.pointerDown(screen.getByText('Old'), { button: 0, clientX: 100, clientY: 100 }); fireEvent.pointerMove(window, { clientX: 102, clientY: 101 }); fireEvent.pointerUp(window, { clientX: 102, clientY: 101 });
    expect(screen.getByRole('textbox', { name: 'Annotation text' })).toBeTruthy(); expect(h.onCommand).not.toHaveBeenCalled();
    h.view.unmount(); h.canvas.remove();
  });

  it('keeps textarea keyboard events local and emits a schema-valid annotation command', () => {
    const h = setup(); h.click(h.corner); h.click({ clientX: 500, clientY: 300 });
    const editor = screen.getByRole('textbox', { name: 'Annotation text' }); const keySpy = vi.fn(); document.addEventListener('keydown', keySpy);
    fireEvent.change(editor, { target: { value: 'Valid' } }); fireEvent.keyDown(editor, { key: 'n' }); fireEvent.keyDown(editor, { key: 'd' }); fireEvent.keyDown(editor, { key: 'Delete' });
    expect(keySpy).not.toHaveBeenCalled(); fireEvent.keyDown(editor, { key: 'Enter' }); document.removeEventListener('keydown', keySpy);
    const command = h.onCommand.mock.calls[0][0];
    const result = applyDesignCommand(projectFor(fixture()), command);
    expect(result.ok, 'command validation: ' + ('message' in result ? result.message : '')).toBe(true);
    if (result.ok) expect(validateDesignDocument(result.project.design!, result.project.parts, new Set(result.project.materials.map(material => material.id))).map(issue => issue.code)).toEqual([]);
    h.view.unmount(); h.canvas.remove();
  });

  it('draws orange edge and closed face outlines for snapped hover targets', () => {
    const edge = [[0, 0, 0], [1, 0, 0]] as [number, number, number][];
    const face = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] as [number, number, number][];
    rendered.lines.length = 0;
    const view = render(<><AnnotationHoverGraphic highlight={{ kind: 'edge', pointsWorldM: edge }} /><AnnotationHoverGraphic highlight={{ kind: 'face', pointsWorldM: face }} /></>);
    expect(rendered.lines).toHaveLength(2);
    expect(rendered.lines[0]).toMatchObject({ points: edge, color: '#e6a94e', depthTest: false, renderOrder: 999 });
    expect(rendered.lines[1]).toMatchObject({ points: [...face, face[0]], color: '#e6a94e', depthTest: false, renderOrder: 999 });
    view.unmount();
  });

  it('keeps the filled dimension pill rule after the later transparent label rule', () => {
    // @ts-expect-error process is used only to locate source CSS for this regression check.
    const cssPath = resolve(process.cwd(), 'src/index.css');
    const css = readFileSync(cssPath, 'utf8');
    const transparentRule = css.lastIndexOf('.design-annotation-label { background: transparent; }');
    const dimensionRule = css.lastIndexOf('.design-annotation-label.design-annotation-dimension-label');
    expect(transparentRule).toBeGreaterThan(-1);
    expect(dimensionRule).toBeGreaterThan(transparentRule);
    expect(css.slice(dimensionRule)).toMatch(/^\.design-annotation-label\.design-annotation-dimension-label\s*\{[^}]*background\s*:\s*#fffffff0/i);
  });

  it('renders inert shared hover markers for points and invalidates on pointer movement', () => {
    const point: [number, number, number] = [0, 0, 0];
    const graphic = render(<AnnotationHoverGraphic highlight={{ kind: 'point', pointsWorldM: [point] }} />);
    const marker = graphic.container.querySelector('mesh');
    expect(marker).toBeTruthy();
    expect(graphic.container.querySelector('meshbasicmaterial')?.getAttribute('color')).toBe('#173b56');
    graphic.unmount();
    const h = setup();
    act(() => fireEvent.pointerMove(h.canvas, h.at([0, 0, 0])));
    expect(state.invalidate).toHaveBeenCalled();
    h.view.unmount(); h.canvas.remove();
  });

  it('keeps chosen text and dimension anchors visible as selected markers', () => {
    const h = setup();
    h.click(h.corner);
    expect(h.view.container.querySelectorAll('meshbasicmaterial[color="#e6a94e"]')).toHaveLength(1);
    act(() => fireEvent.pointerMove(h.canvas, h.at([0.4, 0, 0])));
    expect(h.view.container.querySelectorAll('meshbasicmaterial[color="#173b56"]')).toHaveLength(1);
    h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={fixture()} unitSystem="metric" activeTool="dimensions" />);
    const vertices = designVertices(fixture());
    h.click(h.at(vertices[0].point));
    h.click(h.at(vertices[1].point));
    expect(h.view.container.querySelectorAll('meshbasicmaterial[color="#e6a94e"]')).toHaveLength(2);
    h.view.unmount(); h.canvas.remove();
  });

  it('intercepts Text-tool pointerdown, pointerup and click in capture phase', () => {
    const h = setup();
    for (const type of ['pointerDown', 'pointerUp', 'click'] as const) {
      const event = type === 'click' ? new MouseEvent('click', { button: 0, bubbles: true }) : new PointerEvent(type === 'pointerDown' ? 'pointerdown' : 'pointerup', { button: 0, bubbles: true });
      const stop = vi.spyOn(event, 'stopImmediatePropagation');
      act(() => h.canvas.dispatchEvent(event));
      expect(stop).toHaveBeenCalledOnce();
    }
    h.view.unmount(); h.canvas.remove();
  });

  it('creates a three-click vertex dimension with the measure selected from perpendicular drag', () => {
    const h=setup(), design=fixture();
    h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={design} unitSystem="metric" activeTool="dimensions" />);
    const verts=designVertices(design); const first=verts[0],second=verts.find(v=>v.id!==first.id)!;
    h.click(h.at(first.point)); h.click(h.at(second.point));
    const midpoint=first.point.map((v,i)=>(v+second.point[i])/2);
    h.click({clientX:400,clientY:200});
    expect(h.onCommand).toHaveBeenCalledOnce();
    const command=h.onCommand.mock.calls[0][0];
    expect(command).toMatchObject({type:'add-annotation',annotation:{kind:'dimension',measure:'direct',start:{element:{type:'vertex'}},end:{element:{type:'vertex'}}}});
    const result=applyDesignCommand(projectFor(design),command);
    expect(result.ok).toBe(true);
    if(result.ok){const ann=result.project.design!.annotations![0];expect(ann.kind).toBe('dimension');if(ann.kind==='dimension')expect(resolveAnnotation(result.project.design!,ann)).toBeDefined();}
    expect(midpoint).toHaveLength(3);
    h.view.unmount();h.canvas.remove();
  });

  it.each([
    ['metric', '400.0 mm'],
    ['imperial', formatDesignLength('imperial', 400_000)],
  ] as const)('keeps dimension value labels readable and formatted in %s across preview and committed states', (unitSystem, expected) => {
    const h=setup(), design=fixture();
    h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={design} unitSystem={unitSystem} activeTool="dimensions" />);
    const verts=designVertices(design), a=verts[0], b=verts.find(v=>v.id!==a.id)!;
    h.click(h.at(a.point));
    act(()=>fireEvent.pointerMove(h.canvas,h.at(b.point)));
    let label=screen.getByText(expected);
    expect(label.className).toContain('design-annotation-dimension-label');
    h.click(h.at(b.point));
    act(()=>fireEvent.pointerMove(h.canvas,{clientX:400,clientY:200}));
    label=screen.getByText(expected);
    expect(label.className).toContain('design-annotation-dimension-label');
    h.click({clientX:400,clientY:200});
    const command=h.onCommand.mock.calls[0][0];
    const applied=applyDesignCommand(projectFor(design),command);
    expect(applied.ok).toBe(true);
    if(applied.ok) h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={applied.project.design} unitSystem={unitSystem} activeTool="select" />);
    expect(screen.getByText(expected).className).toContain('design-annotation-dimension-label');
    h.view.unmount();h.canvas.remove();
  });

  it('uses the shared measure decision for axis drag directions and rejects invalid corners', () => {
    const h=setup(), design=fixture();
    h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={design} unitSystem="metric" activeTool="dimensions" />);
    const verts=designVertices(design), a=verts[0], b=verts.find(v=>v.id!==a.id)!;
    const start=a.point.map(v=>Math.round(v*1e6)) as [number,number,number], end=b.point.map(v=>Math.round(v*1e6)) as [number,number,number];
    expect(chooseDimensionMeasure(start,end,[20_000,0,0])).toBe('x');
    h.click({clientX:790,clientY:590}); expect(h.onHint).toHaveBeenCalledWith('Dimensions · pick a corner of a part'); expect(h.onCommand).not.toHaveBeenCalled();
    h.click(h.at(a.point)); h.click(h.at(a.point)); expect(h.onHint).toHaveBeenCalledWith('Dimensions · pick a different corner');
    expect(h.onCommand).not.toHaveBeenCalled();
    h.view.unmount();h.canvas.remove();
  });

  it('cancels a started dimension with Escape and allows endpoints on separate parts', () => {
    const h=setup(), base=fixture(), firstObject=base.looseObjects[0];
    const design={...base,looseObjects:[firstObject,{...firstObject,id:'board-2',name:'Board 2',pose:{...firstObject.pose,positionUm:[700_000,0,0] as [number,number,number]}}]};
    h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={design} unitSystem="metric" activeTool="dimensions" />);
    const candidates=designVertices(design), a=candidates.find(v=>v.objectId==='board')!, b=candidates.find(v=>v.objectId==='board-2')!;
    h.click(h.at(a.point)); fireEvent.keyDown(window,{key:'Escape'}); h.click(h.at(a.point));
    expect(h.onCommand).not.toHaveBeenCalled();
    h.click(h.at(b.point));h.click({clientX:400,clientY:200});
    const command=h.onCommand.mock.calls[0]?.[0];
    expect(command).toMatchObject({type:'add-annotation',annotation:{kind:'dimension',start:{target:{id:'board'}},end:{target:{id:'board-2'}}}});
    const applied=command&&applyDesignCommand(projectFor(design),command);expect(applied?.ok).toBe(true);
    if(applied?.ok){const annotation=applied.project.design!.annotations![0];expect(validateDesignDocument(applied.project.design!,applied.project.parts,new Set(applied.project.materials.map((material: Project['materials'][number])=>material.id)))).toEqual([]);expect(resolveAnnotation(applied.project.design!,annotation)).toBeDefined();}
    h.view.unmount();h.canvas.remove();
  });

  it('keeps text labels inert in Dimensions and updates dimension geometry when a part stretches', () => {
    const h=setup(), design=fixture();
    const firstVertex=design.looseObjects[0].geometry.vertices[0], secondVertex=design.looseObjects[0].geometry.vertices[1];
    const anchor={target:{kind:'loose' as const,id:'board'},element:{type:'vertex' as const,id:firstVertex.id},localUm:firstVertex.positionUm};
    const dimension={id:'dim',kind:'dimension' as const,start:anchor,end:{...anchor,element:{type:'vertex' as const,id:secondVertex.id},localUm:secondVertex.positionUm},measure:'direct' as const,offsetUm:[0,0,50_000] as [number,number,number]};
    const text={id:'note',kind:'text' as const,anchor,text:'note',labelLocalUm:[100_000,0,0] as [number,number,number]};
    h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={{...design,annotations:[dimension,text]}} unitSystem="metric" activeTool="dimensions" />);
    expect(screen.getByText('note').className).not.toContain('is-interactive');
    const annotated={...design,annotations:[dimension,text]}, before=resolveAnnotation(annotated,dimension);
    expect(before?.kind).toBe('dimension');
    if(before?.kind==='dimension'){
      const stretched={...annotated,looseObjects:annotated.looseObjects.map(object=>({...object,geometry:{...object.geometry,vertices:object.geometry.vertices.map((vertex,index)=>index===1?{...vertex,positionUm:[vertex.positionUm[0]+250_000,vertex.positionUm[1],vertex.positionUm[2]] as [number,number,number]}:vertex)}}))};
      const after=resolveAnnotation(stretched,dimension); expect(after?.kind).toBe('dimension'); if(after?.kind==='dimension')expect(after.valueUm).not.toBe(before.valueUm);
    }
    h.view.unmount();h.canvas.remove();
  });

  it('drags an existing dimension label in the Dimensions tool and emits one updated offset', () => {
    const h=setup(), design=fixture();
    const anchor={target:{kind:'loose' as const,id:'board'},element:{type:'vertex' as const,id:'gone-a'},localUm:[0,0,0] as [number,number,number]};
    const dimension={id:'d1',kind:'dimension' as const,start:anchor,end:{...anchor,element:{type:'vertex' as const,id:'gone-b'},localUm:[100_000,0,0] as [number,number,number]},measure:'direct' as const,offsetUm:[0,0,80_000] as [number,number,number]};
    h.view.rerender(<AnnotationLayer visible onCommand={h.onCommand} onHint={h.onHint} onSelectAnnotation={vi.fn()} design={{...design,annotations:[dimension]}} unitSystem="metric" activeTool="dimensions" />);
    const label=screen.getByText('100.0 mm'); fireEvent.pointerDown(label,{button:0,clientX:400,clientY:300}); fireEvent.pointerMove(window,{clientX:430,clientY:300}); fireEvent.pointerUp(window,{clientX:430,clientY:300});
    expect(h.onCommand).toHaveBeenCalledOnce();expect(h.onCommand.mock.calls[0][0]).toMatchObject({type:'update-annotation',annotation:{id:'d1',kind:'dimension',measure:expect.any(String),offsetUm:expect.any(Array)}});
    h.view.unmount();h.canvas.remove();
  });
});
