import { describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { rectangleGeometry } from '@/lib/planner/design/geometry';
import type { DesignDocumentV1 } from '@/lib/planner/design/schema';
import { AnnotationLayer } from './AnnotationLayer';
import { annotationInteractive } from './AnnotationOverlay';

const htmlContent = vi.hoisted(() => ({ children: [] as unknown[] }));
const three = vi.hoisted(() => ({ canvas: null as unknown as HTMLCanvasElement }));
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined, useThree: () => ({ gl: { domElement: three.canvas }, camera: {} }) }));
vi.mock('@react-three/drei', async importOriginal => ({
  ...await importOriginal<typeof import('@react-three/drei')>(),
  Html: ({ children }: { children: ReactNode }) => { htmlContent.children.push(children); return null; },
  Line: () => null,
}));

three.canvas = document.createElement('canvas');

function textContent(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (isValidElement(node)) return textContent((node.props as { children?: unknown }).children);
  return '';
}

function createDesign(hidden = false): DesignDocumentV1 {
  return {
    schemaVersion: 1,
    definitions: [],
    instances: [],
    looseObjects: [{
      id: 'loose-1',
      name: 'Board',
      geometry: rectangleGeometry(400_000, 300_000, prefix => prefix),
      appearance: { color: '#bd8a56' },
      pose: { positionUm: [0, 0, 0], rotation: [0, 0, 0, 1] },
      scalePpm: [1_000_000, 1_000_000, 1_000_000],
      hidden,
      locked: false,
    }],
    partLinks: {},
    annotations: [
      { id: 'note-1', kind: 'text', anchor: { target: { kind: 'loose', id: 'loose-1' }, element: { type: 'vertex', id: 'missing' }, localUm: [0, 0, 0] }, text: 'Remember this edge', labelLocalUm: [100_000, 0, 0] },
      { id: 'dimension-1', kind: 'dimension', start: { target: { kind: 'loose', id: 'loose-1' }, element: { type: 'vertex', id: 'missing-a' }, localUm: [0, 0, 0] }, end: { target: { kind: 'loose', id: 'loose-1' }, element: { type: 'vertex', id: 'missing-b' }, localUm: [150_000, 0, 0] }, measure: 'direct', offsetUm: [0, 0, 100_000] },
    ],
  };
}

const callbacks = () => ({ visible: true, onSelectAnnotation: vi.fn(), onCommand: vi.fn(), onHint: vi.fn() });

describe('AnnotationOverlay rendering', () => {
  const labelNode = (id: string) => {
    const find = (node: unknown): React.ReactElement<{className?:string;onClick?:(event:unknown)=>void;onPointerDown?:(event:unknown)=>void}> | undefined => {
      if (Array.isArray(node)) return node.map(find).find(Boolean);
      if (!isValidElement(node)) return undefined;
      const element = node as React.ReactElement<{className?:string;children?:unknown;onClick?:(event:unknown)=>void;onPointerDown?:(event:unknown)=>void}>;
      if (element.props.className?.includes('design-annotation-label') && textContent(element.props.children).includes(id === 'note-1' ? 'Remember this edge' : '150.0 mm')) return element;
      return find(element.props.children);
    };
    return htmlContent.children.map(find).find(Boolean)!;
  };
  it('enables labels only for the matching annotation tools', () => {
    for (const tool of ['select', 'erase']) {
      expect(annotationInteractive(tool, 'text')).toBe(true);
      expect(annotationInteractive(tool, 'dimension')).toBe(true);
    }
    expect(annotationInteractive('text', 'text')).toBe(true);
    expect(annotationInteractive('text', 'dimension')).toBe(false);
    expect(annotationInteractive('dimensions', 'text')).toBe(false);
    expect(annotationInteractive('dimensions', 'dimension')).toBe(true);
    for (const tool of ['move', 'rotate', 'scale', 'line', 'paint', 'push-pull', 'orbit', 'pan', 'measure', 'rectangle']) {
      expect(annotationInteractive(tool, 'text')).toBe(false);
      expect(annotationInteractive(tool, 'dimension')).toBe(false);
    }
  });
  it('renders note text and dimensions formatted in project units', async () => {
    const props = callbacks();
    htmlContent.children.length = 0;
    const renderer = await ReactThreeTestRenderer.create(<AnnotationLayer {...props} design={createDesign()} unitSystem="metric" activeTool="select" />);
    expect(htmlContent.children.map(textContent).join(' ')).toContain('Remember this edge');
    expect(htmlContent.children.map(textContent).join(' ')).toContain('150.0 mm');
    htmlContent.children.length = 0;
    await renderer.update(<AnnotationLayer {...props} design={createDesign()} unitSystem="imperial" activeTool="select" />);
    expect(htmlContent.children.map(textContent).join(' ')).toContain('5.906 in');
    await renderer.unmount();
  });

  it('hides annotations when disabled, hidden with their part, and during component editing', async () => {
    const props = callbacks();
    htmlContent.children.length = 0;
    const renderer = await ReactThreeTestRenderer.create(<AnnotationLayer {...props} design={createDesign()} unitSystem="metric" activeTool="select" />);
    expect(htmlContent.children.map(textContent).join(' ')).toContain('Remember this edge');
    htmlContent.children.length = 0;
    await renderer.update(<AnnotationLayer {...props} visible={false} design={createDesign()} unitSystem="metric" activeTool="select" />);
    expect(htmlContent.children.map(textContent).join(' ')).not.toContain('Remember this edge');
    htmlContent.children.length = 0;
    await renderer.update(<AnnotationLayer {...props} design={createDesign(true)} unitSystem="metric" activeTool="select" />);
    expect(htmlContent.children.map(textContent).join(' ')).not.toContain('Remember this edge');
    expect(htmlContent.children.map(textContent).join(' ')).not.toContain('150.0 mm');
    htmlContent.children.length = 0;
    await renderer.update(<AnnotationLayer {...props} design={createDesign()} unitSystem="metric" activeTool="select" editingDefinitionId="definition-1" />);
    expect(htmlContent.children.map(textContent).join(' ')).not.toContain('Remember this edge');
    await renderer.unmount();
  });

  it('select and erase label clicks call their actions, while move and rotate labels pass through', async () => {
    const props = callbacks();
    htmlContent.children.length = 0;
    const renderer = await ReactThreeTestRenderer.create(<AnnotationLayer {...props} design={createDesign()} unitSystem="metric" activeTool="select" />);
    const note = labelNode('note-1');
    (note.props.onClick as (event:unknown)=>void)({ stopPropagation: vi.fn() });
    expect(props.onSelectAnnotation).toHaveBeenCalledWith('note-1');
    htmlContent.children.length = 0;
    await renderer.update(<AnnotationLayer {...props} design={createDesign()} unitSystem="metric" activeTool="erase" />);
    const eraseNote = labelNode('note-1');
    (eraseNote.props.onClick as (event:unknown)=>void)({ stopPropagation: vi.fn() });
    expect(props.onCommand).toHaveBeenCalledWith({ type: 'delete-annotation', annotationId: 'note-1' });
    for (const activeTool of ['move', 'rotate']) {
      htmlContent.children.length = 0;
      await renderer.update(<AnnotationLayer {...props} design={createDesign()} unitSystem="metric" activeTool={activeTool} />);
      expect(labelNode('note-1').props.className).not.toContain('is-interactive');
    }
    await renderer.unmount();
  });
  it('cleans up text drag listeners on pointer cancellation and tool changes', async () => {
    const props = callbacks();
    htmlContent.children.length = 0;
    const renderer = await ReactThreeTestRenderer.create(<AnnotationLayer {...props} design={createDesign()} unitSystem="metric" activeTool="text" />);
    const note = labelNode('note-1');
    (note.props.onPointerDown as (event: unknown) => void)({ button: 0, pointerId: 12, clientX: 10, clientY: 20, stopPropagation: vi.fn() });
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 12 }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 12, clientX: 100, clientY: 100 }));
    expect(props.onCommand).not.toHaveBeenCalled();
    (note.props.onPointerDown as (event: unknown) => void)({ button: 0, pointerId: 13, clientX: 10, clientY: 20, stopPropagation: vi.fn() });
    await renderer.update(<AnnotationLayer {...props} design={createDesign()} unitSystem="metric" activeTool="select" />);
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 13, clientX: 100, clientY: 100 }));
    expect(props.onCommand).not.toHaveBeenCalled();
    await renderer.unmount();
  });

  it('marks the selected annotation and clears selection on a canvas pointer press', async () => {
    const props = callbacks();
    htmlContent.children.length = 0;
    const renderer = await ReactThreeTestRenderer.create(<AnnotationLayer {...props} selectedAnnotationId="note-1" design={createDesign()} unitSystem="metric" activeTool="select" />);
    expect(labelNode('note-1').props.className).toContain('is-selected');
    three.canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(props.onSelectAnnotation).toHaveBeenCalledWith(undefined);
    await renderer.unmount();
  });
});
