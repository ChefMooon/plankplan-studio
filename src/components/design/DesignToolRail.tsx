import { Fragment, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { DesignToolIcon, type DesignToolIconName } from './DesignToolIcon';

export interface DesignToolRailItem {
  id: string;
  label: string;
  icon: DesignToolIconName;
  key: string;
}

interface DesignToolRailProps {
  tools: DesignToolRailItem[];
  activeTool: string;
  onSelect: (tool: DesignToolRailItem) => void;
}

const keyLabel = (key: string) => key === 'Space' ? 'Space' : key.toUpperCase();

const SCROLL_STEP = 68;

function ScrollMore({ direction, onClick }: { direction: 'up' | 'down'; onClick: () => void }) {
  return <button type="button" className={`design-tool-rail-more is-${direction}`} tabIndex={-1} aria-hidden="true" onPointerDown={event => event.stopPropagation()} onClick={onClick}>
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={direction === 'up' ? 'M3.5 10.5 8 6l4.5 4.5' : 'M3.5 5.5 8 10l4.5-4.5'} /></svg>
  </button>;
}

const GROUP_START = new Set(['move', 'orbit', 'text']);

export function DesignToolRail({ tools, activeTool, onSelect }: DesignToolRailProps) {
  const stopPointerDown = (event: PointerEvent<HTMLButtonElement>) => event.stopPropagation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });

  const updateFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop > 1;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setFade(prev => prev.top === top && prev.bottom === bottom ? prev : { top, bottom });
  }, []);

  useEffect(() => {
    updateFade();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateFade);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateFade, tools]);

  return <aside className="design-tool-rail" aria-label="Design tools" onWheel={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    <div ref={scrollRef} className="design-tool-rail-scroll" data-fade-top={fade.top} data-fade-bottom={fade.bottom} onScroll={updateFade}>
      {tools.map(tool => <Fragment key={tool.id}>
        {GROUP_START.has(tool.id) && <div className="design-tool-rail-divider" role="separator" aria-orientation="horizontal" />}
        <Tooltip content={`${tool.label} · ${keyLabel(tool.key)}`}><button type="button" className={`design-tool ${activeTool === tool.id ? 'is-active' : ''}`} aria-label={`${tool.label} (${keyLabel(tool.key)})`} aria-pressed={activeTool === tool.id} onPointerDown={stopPointerDown} onClick={() => onSelect(tool)}><DesignToolIcon name={tool.icon} /></button></Tooltip>
      </Fragment>)}
    </div>
    {fade.top && <ScrollMore direction="up" onClick={() => scrollRef.current?.scrollBy({ top: -SCROLL_STEP, behavior: 'smooth' })} />}
    {fade.bottom && <ScrollMore direction="down" onClick={() => scrollRef.current?.scrollBy({ top: SCROLL_STEP, behavior: 'smooth' })} />}
  </aside>;
}
