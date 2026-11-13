import { Fragment, type PointerEvent, type MouseEvent } from 'react';
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
  onCreateBoard: () => void;
  onOpenHelp: (event: MouseEvent<HTMLButtonElement>) => void;
}

const keyLabel = (key: string) => key === 'Space' ? 'Space' : key.toUpperCase();

export function DesignToolRail({ tools, activeTool, onSelect, onCreateBoard, onOpenHelp }: DesignToolRailProps) {
  const stopPointerDown = (event: PointerEvent<HTMLButtonElement>) => event.stopPropagation();

  return <aside className="design-tool-rail pp-scrollbar" aria-label="Design tools">
    {tools.map(tool => <Fragment key={tool.id}>
      {tool.id === 'text' && <div className="design-tool-rail-divider" role="separator" aria-orientation="horizontal" />}
      <Tooltip content={`${tool.label} · ${keyLabel(tool.key)}`}><button type="button" className={`design-tool ${activeTool === tool.id ? 'is-active' : ''}`} aria-label={`${tool.label} (${keyLabel(tool.key)})`} aria-pressed={activeTool === tool.id} onPointerDown={stopPointerDown} onClick={() => onSelect(tool)}><DesignToolIcon name={tool.icon} /></button></Tooltip>
    </Fragment>)}
    <Tooltip content="Create board"><button type="button" className="design-tool" aria-label="Create board" onPointerDown={stopPointerDown} onClick={onCreateBoard}>＋</button></Tooltip>
    <Tooltip content="Keyboard shortcuts"><button type="button" className="design-tool" aria-label="Keyboard shortcuts" onPointerDown={stopPointerDown} onClick={onOpenHelp}>?</button></Tooltip>
  </aside>;
}
