import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animateGeometry, canAnimateGeometry, classifyDiagramChange } from './cutPlanMotion';

type CutPart = { partId: string; length: number; name: string };
type PositionedPart = CutPart & { x: number; width: number; y: number; height: number };

export function LinearCutDiagram({
  stockId, stockLength, trim, kerf, parts, stockName,
}: {
  stockId: string; stockLength: number; trim: number; kerf: number; parts: CutPart[]; stockName: string;
}) {
  const scale = 700 / stockLength;
  const positioned = useMemo(() => {
    const positionedParts: PositionedPart[] = [];
    parts.reduce((cursor, part) => {
      const width = Math.max(2, part.length * scale);
      positionedParts.push({ ...part, x: 4 + cursor, width, y: 12, height: 34 });
      return cursor + width + kerf * scale;
    }, trim * scale);
    return positionedParts;
  }, [parts, trim, kerf, scale]);
  const signature = JSON.stringify({ stockId, stockLength, trim, kerf, parts: positioned.map(({ partId, x, width }) => [partId, x, width]) });
  const previous = useRef<{ signature: string; stockId: string; stockLength: number; parts: PositionedPart[] } | null>(null);
  const [exits, setExits] = useState<PositionedPart[]>([]);
  const [enters, setEnters] = useState<Set<string>>(new Set());
  const [crossfade, setCrossfade] = useState(false);
  const timeout = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const animations = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    // State records the previous visual snapshot for short-lived, aria-hidden exit shapes.
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    // This effect intentionally updates presentation layers after a geometry change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExits([]);
    setEnters(new Set());
    setCrossfade(false);
    const old = previous.current;
    previous.current = { signature, stockId, stockLength, parts: positioned };
    if (!old || old.signature === signature) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ambiguous = classifyDiagramChange(
      { stockId: old.stockId, stockLength: old.stockLength, parts: old.parts },
      { stockId, stockLength, parts: positioned },
    ) === 'crossfade';
    if (prefersReduced) return;
    if (canAnimateGeometry({ stockId: old.stockId, stockLength: old.stockLength, parts: old.parts }, { stockId, stockLength, parts: positioned })) {
      animations.current = animateGeometry(svgRef.current, old.parts, positioned);
      return;
    }
    if (ambiguous) {
      setCrossfade(true);
    }
    else {
      const nextKeys = new Set(positioned.map(geometryKey));
      setExits(old.parts.filter((part) => !nextKeys.has(geometryKey(part))));
      const oldKeys = new Set(old.parts.map(geometryKey));
      setEnters(new Set(positioned.filter((part) => !oldKeys.has(geometryKey(part))).map(geometryKey)));
    }
    timeout.current = window.setTimeout(() => { setExits([]); setEnters(new Set()); setCrossfade(false); }, 220);
    return () => { if (timeout.current !== null) window.clearTimeout(timeout.current); };
  // The parent can recreate `parts` while geometry is unchanged. Restarting
  // on array identity cancels an animation immediately after it starts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (media.matches) {
        animations.current.forEach((animation) => animation.cancel());
        animations.current = [];
        if (timeout.current !== null) window.clearTimeout(timeout.current);
        setExits([]);
        setEnters(new Set());
        setCrossfade(false);
      }
    };
    media.addEventListener('change', stop);
    const stopForPrint = () => { animations.current.forEach((animation) => animation.cancel()); animations.current = []; };
    window.addEventListener('beforeprint', stopForPrint);
    return () => { media.removeEventListener('change', stop); window.removeEventListener('beforeprint', stopForPrint); stopForPrint(); };
  }, []);

  return <svg ref={svgRef} className={`cut-diagram${crossfade ? ' cut-plan-diagram-crossfade' : ''}`} viewBox="0 0 720 68" role="img" aria-label={`Cut diagram for ${stockName}`}>
    <rect x="4" y="12" width="712" height="34" rx="4" className="stock-outline" fill="#e5f0f6" stroke="#9cb7c7" />
    {positioned.map((part) => <g data-cut-plan-piece="" key={geometryKey(part)} className={enters.has(geometryKey(part)) ? 'cut-plan-part-enter' : undefined}>
      <rect x={part.x} y={part.y} width={part.width} height={part.height} className="part-block" fill="#276a91" stroke="white" />
      <text x={part.x + part.width / 2} y="34" textAnchor="middle" fill="white" fontSize="10">{part.name}</text>
    </g>)}
    {exits.map((part, index) => <g key={`exit-${geometryKey(part)}-${index}`} className="cut-plan-part-exit" aria-hidden="true">
      <rect x={part.x} y={part.y} width={part.width} height={part.height} className="part-block" fill="#276a91" stroke="white" />
      <text x={part.x + part.width / 2} y="34" textAnchor="middle" fill="white" fontSize="10">{part.name}</text>
    </g>)}
  </svg>;
}

function geometryKey(part: PositionedPart) { return `${part.partId}:${part.x}:${part.y}:${part.width}:${part.height}`; }
