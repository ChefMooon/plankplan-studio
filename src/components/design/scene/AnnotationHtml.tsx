import { useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { annotationLabelDisplay, type AnnotationLabelKind } from '../annotation-scale';
import { worldPerPixel } from './transform-screen';

type Props = {
  children: ReactNode;
  position?: [number, number, number];
  transform?: boolean;
  interactive?: boolean;
  portal?: RefObject<HTMLElement | null>;
  /** 'text' and 'dimension' labels scale and fade with zoom; 'fixed' (dots, editors) never change. */
  kind?: AnnotationLabelKind;
};

/** Centers annotation content while allowing canvas events through its Html wrapper. */
export function AnnotationHtml({ children, interactive = false, kind = 'fixed', ...props }: Props) {
  const canvasParent = useThree(state => state.gl.domElement.parentElement);
  const defaultPortal = useMemo(() => ({ current: canvasParent }), [canvasParent]);
  const content = useRef<HTMLDivElement>(null);
  const point = useMemo(() => new THREE.Vector3(...(props.position ?? [0, 0, 0])), [props.position]);
  // Written straight to the DOM so zooming never re-renders the annotation tree.
  useFrame(({ camera, size }) => {
    const element = content.current;
    if (!element || kind === 'fixed') return;
    const { scale, opacity, compact } = annotationLabelDisplay(1 / worldPerPixel(camera, point, size.height), kind);
    element.style.transform = scale === 1 ? '' : `scale(${scale.toFixed(3)})`;
    element.style.opacity = opacity === 1 ? '' : opacity.toFixed(3);
    // Fully faded labels must not intercept clicks meant for the scene.
    element.style.visibility = opacity === 0 ? 'hidden' : '';
    element.dataset.compact = compact ? 'true' : 'false';
  });
  return <Html center style={{ pointerEvents: 'none' }} {...props} portal={(props.portal ?? defaultPortal) as RefObject<HTMLElement>}>
    <div ref={content} className="design-annotation-scale" style={{ pointerEvents: interactive ? 'auto' : 'none' }}>{children}</div>
  </Html>;
}
