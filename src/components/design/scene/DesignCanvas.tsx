import { Component, StrictMode, Suspense, useInsertionEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot, events, extend, type RenderProps } from '@react-three/fiber';
import { designCanvasThreeElements } from './design-canvas-elements';

extend(designCanvasThreeElements);

type Props = Omit<RenderProps<HTMLCanvasElement>, 'size' | 'events' | 'onCreated'> & {
  children: ReactNode;
  className?: string;
};

class SceneBoundary extends Component<{ children: ReactNode; onError: (error: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

// This scene receives application data through props. Its independent Fiber
// root supplies the usual useThree/useFrame context and pointer-event manager.
export function DesignCanvas({ children, className, ...options }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0, top: 0, left: 0 });
  const [error, setError] = useState<Error | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const { width, height, top, left } = container.getBoundingClientRect();
      setSize(previous => previous.width === width && previous.height === height && previous.top === top && previous.left === left ? previous : { width, height, top, left });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Insertion cleanup runs on final removal, not StrictMode's effect replay.
  // Projection changes and hidden-tab teardown also release the old root.
  useInsertionEffect(() => () => {
    rootRef.current?.unmount();
    rootRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;
    const root = rootRef.current ??= createRoot(canvas);
    let active = true;
    void root.configure({
      ...options,
      size,
      events,
      onCreated: state => { state.events.connect?.(canvas); },
    }).then(() => {
      if (active && rootRef.current === root) {
        root.render(<StrictMode><SceneBoundary onError={setError}><Suspense fallback={null}>{children}</Suspense></SceneBoundary></StrictMode>);
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause : new Error(String(cause)));
    });
    return () => { active = false; };
  });

  // Forward errors across the renderer boundary to DesignViewport's fallback.
  if (error) throw error;

  return <div ref={containerRef} className={className} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
    <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }} />
  </div>;
}
