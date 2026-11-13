import { useRef, useState } from 'react';
import { Tooltip } from '@/components/ui/tooltip';

interface TruncatedTextProps {
  children: string;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Single-line text that shows its full content in the shared tooltip, but only
 * while it is actually clipped. The container must apply `overflow: hidden`
 * and `text-overflow: ellipsis` (see `.design-status-message`).
 */
export function TruncatedText({ children, className, side = 'top' }: TruncatedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  const measure = () => {
    const element = ref.current;
    if (element) setTruncated(element.scrollWidth > element.clientWidth);
  };

  return <Tooltip content={children} side={side} disabled={!truncated}>
    <span ref={ref} className={className} onPointerEnter={measure} onFocus={measure}>{children}</span>
  </Tooltip>;
}
