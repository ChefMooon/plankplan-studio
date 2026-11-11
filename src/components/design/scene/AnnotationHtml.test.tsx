import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import { AnnotationHtml } from './AnnotationHtml';

describe('AnnotationHtml', () => {
  it('uses real drei Html with a centered, pointer-transparent wrapper', async () => {
    const portal = document.createElement('div');
    document.body.appendChild(portal);
    const portalRef = createRef<HTMLElement>();
    Object.defineProperty(portalRef, 'current', { value: portal });
    const renderer = await ReactThreeTestRenderer.create(
      <group><AnnotationHtml position={[0, 0, 0]} interactive portal={portalRef}><span>note</span></AnnotationHtml></group>,
    );
    await new Promise(resolve => setTimeout(resolve, 0));
    const nodes = [...portal.querySelectorAll<HTMLElement>('*')];
    expect(nodes.some(node => node.style.pointerEvents === 'none')).toBe(true);
    expect(nodes.some(node => node.style.transform.includes('-50%'))).toBe(true);
    expect((portal.querySelector('span')?.parentElement as HTMLElement).style.pointerEvents).toBe('auto');
    await renderer.unmount();
    portal.remove();
  });

  it('portals into the canvas parent when Fiber events are connected to the canvas', async () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    const overlay = document.createElement('div');
    container.append(canvas, overlay);
    document.body.appendChild(container);
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 480 } as DOMRect);
    container.getBoundingClientRect = canvas.getBoundingClientRect;

    function ConnectEvents() {
      const { events, gl } = useThree();
      events.connect?.(gl.domElement);
      return null;
    }

    const renderer = await ReactThreeTestRenderer.create(
      <><ConnectEvents /><AnnotationHtml interactive><textarea aria-label="Annotation text" /></AnnotationHtml></>,
      { width: 640, height: 480, beforeReturn: node => { container.replaceChild(node, canvas); } },
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(textarea?.closest('canvas')).toBeNull();
    const htmlWrapper = container.querySelector<HTMLElement>(':scope > div[style*="position: absolute"]');
    expect(htmlWrapper?.parentElement).toBe(container);
    expect(htmlWrapper?.style.transform).toContain('translate3d(320px,240px');
    textarea?.focus();
    expect(document.activeElement).toBe(textarea);

    await renderer.unmount();
    container.remove();
  });
});
