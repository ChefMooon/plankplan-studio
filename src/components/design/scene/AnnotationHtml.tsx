import { useMemo, type ReactNode, type RefObject } from 'react';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';

type Props = {
  children: ReactNode;
  position?: [number, number, number];
  transform?: boolean;
  interactive?: boolean;
  portal?: RefObject<HTMLElement | null>;
};

/** Centers annotation content while allowing canvas events through its Html wrapper. */
export function AnnotationHtml({ children, interactive = false, ...props }: Props) {
  const canvasParent = useThree(state => state.gl.domElement.parentElement);
  const defaultPortal = useMemo(() => ({ current: canvasParent }), [canvasParent]);
  return <Html center style={{ pointerEvents: 'none' }} {...props} portal={(props.portal ?? defaultPortal) as RefObject<HTMLElement>}>
    <div style={{ pointerEvents: interactive ? 'auto' : 'none' }}>{children}</div>
  </Html>;
}
