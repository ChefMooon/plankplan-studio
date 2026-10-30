import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SheetPlan } from '@/lib/planner/sheet';
import { animateGeometry, canAnimateGeometry, classifyDiagramChange } from './cutPlanMotion';

export function SheetCutDiagram({ plan, stockId, stockName, stockWidth, stockHeight, scale, partNames }: {
  plan: SheetPlan; stockId: string; stockName: string; stockWidth: number; stockHeight: number; scale: number;
  partNames: Map<string, string>;
}) {
  const parts = plan.placements.map((placement) => ({
    partId: placement.partId, x: placement.rect.x, y: placement.rect.y,
    width: placement.rect.width, height: placement.rect.height,
    name: partNames.get(placement.partId) ?? 'Part', orientation: placement.rotated,
  }));
  const previous = useRef<{ stockId: string; stockWidth: number; stockHeight: number; parts: typeof parts } | null>(null);
  const [exits, setExits] = useState<typeof parts>([]);
  const [enters, setEnters] = useState<Set<string>>(new Set());
  const [crossfade, setCrossfade] = useState(false);
  const timeout = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const animations = useRef<Animation[]>([]);
  const signature = JSON.stringify({ stockId, stockWidth, stockHeight, parts: parts.map(key) });

  useLayoutEffect(() => {
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    // These state updates maintain temporary, aria-hidden visual layers only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExits([]);
    setEnters(new Set());
    setCrossfade(false);
    const old = previous.current;
    previous.current = { stockId, stockWidth, stockHeight, parts };
    if (!old || JSON.stringify({ stockId: old.stockId, stockWidth: old.stockWidth, stockHeight: old.stockHeight, parts: old.parts.map(key) }) === signature) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (canAnimateGeometry(
      { stockId: old.stockId, stockLength: old.stockHeight, stockWidth: old.stockWidth, parts: old.parts },
      { stockId, stockLength: stockHeight, stockWidth, parts },
    )) {
      animations.current = animateGeometry(svgRef.current, old.parts, parts, scale);
      return;
    }
    const ambiguous = classifyDiagramChange(
      { stockId: old.stockId, stockLength: old.stockHeight, stockWidth: old.stockWidth, parts: old.parts },
      { stockId, stockLength: stockHeight, stockWidth, parts },
    ) === 'crossfade';
    if (ambiguous) setCrossfade(true);
    else {
      const oldKeys = new Set(old.parts.map(key)); const nextKeys = new Set(parts.map(key));
      setExits(old.parts.filter((part) => !nextKeys.has(key(part))));
      setEnters(new Set(parts.filter((part) => !oldKeys.has(key(part))).map(key)));
    }
    timeout.current = window.setTimeout(() => { setExits([]); setEnters(new Set()); setCrossfade(false); }, 220);
    return () => { if (timeout.current !== null) window.clearTimeout(timeout.current); };
  // `signature` captures part geometry; labels are read from the current props.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, stockId, stockWidth, stockHeight]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (!media.matches) return;
      animations.current.forEach((animation) => animation.cancel()); animations.current = [];
      if (timeout.current !== null) window.clearTimeout(timeout.current);
      setExits([]); setEnters(new Set()); setCrossfade(false);
    };
    media.addEventListener('change', stop);
    const stopForPrint = () => { animations.current.forEach((animation) => animation.cancel()); animations.current = []; };
    window.addEventListener('beforeprint', stopForPrint);
    return () => { media.removeEventListener('change', stop); window.removeEventListener('beforeprint', stopForPrint); stopForPrint(); };
  }, []);

  return <svg ref={svgRef} className={`sheet-diagram${crossfade ? ' cut-plan-diagram-crossfade' : ''}`} viewBox={`0 0 ${stockWidth * scale + 12} ${stockHeight * scale + 12}`} role="img" aria-label={`Sheet layout for ${stockName}`}>
    <rect x="4" y="4" width={stockWidth * scale} height={stockHeight * scale} className="stock-outline" fill="#e5f0f6" stroke="#9cb7c7" />
    {parts.map((part) => <g data-cut-plan-piece="" key={key(part)} className={enters.has(key(part)) ? 'cut-plan-part-enter' : undefined}>
      <rect x={4 + part.x * scale} y={4 + part.y * scale} width={part.width * scale} height={part.height * scale} className="part-block" fill="#276a91" stroke="white" />
      <text x={4 + (part.x + part.width / 2) * scale} y={4 + (part.y + part.height / 2) * scale} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10">{part.name}{part.orientation ? ' ↻' : ''}</text>
    </g>)}
    {exits.map((part, index) => <g key={`exit-${key(part)}-${index}`} className="cut-plan-part-exit" aria-hidden="true">
      <rect x={4 + part.x * scale} y={4 + part.y * scale} width={part.width * scale} height={part.height * scale} className="part-block" fill="#276a91" stroke="white" />
      <text x={4 + (part.x + part.width / 2) * scale} y={4 + (part.y + part.height / 2) * scale} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10">{part.name}{part.orientation ? ' ↻' : ''}</text>
    </g>)}
  </svg>;
}

function key(part: { partId: string; x: number; y: number; width: number; height: number; orientation?: boolean }) {
  return `${part.partId}:${part.x}:${part.y}:${part.width}:${part.height}:${part.orientation ?? ''}`;
}
