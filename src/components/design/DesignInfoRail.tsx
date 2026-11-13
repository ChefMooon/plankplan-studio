import type { KeyboardEvent, ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { DesignPanelIcon, type DesignPanelIconName } from './DesignPanelIcon';

import { designDrawers, type DesignDrawer } from './design-drawers';
const drawerIcons: Record<DesignDrawer, DesignPanelIconName> = { 'Entity Info': 'entity', Materials: 'materials', Components: 'components', Display: 'display', 'Model Info': 'model' };
const drawerTooltips: Record<DesignDrawer, string> = { 'Entity Info': 'Entity Info · inspect and edit the current selection', Materials: 'Materials · assign cutlist material and paint', Components: 'Components · find and add model items', Display: 'Display · change grid, axes, and snapping', 'Model Info': 'Model Info · review model counts, history, and cutlist links' };

interface DesignInfoRailProps {
  drawer: DesignDrawer;
  drawerOpen: boolean;
  onDrawerKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSelectDrawer: (name: DesignDrawer, element: HTMLButtonElement) => void;
  onClose: () => void;
  children: ReactNode;
}

export function DesignInfoRail({ drawer, drawerOpen, onDrawerKeyDown, onSelectDrawer, onClose, children }: DesignInfoRailProps) {
  return <aside className={`design-info-rail${drawerOpen ? ' is-open' : ''}`} aria-label="Design information" onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()}>
    <div className="design-drawer-tabs" role="tablist" aria-label="Workspace panels" aria-orientation="vertical" onKeyDown={onDrawerKeyDown}>
      {designDrawers.map(name => <Tooltip key={name} content={drawerTooltips[name]} side="left"><button id={`design-tab-${name.replaceAll(' ', '-')}`} role="tab" type="button" aria-label={name} aria-selected={drawer === name} aria-expanded={drawer === name && drawerOpen} aria-controls="design-panel" tabIndex={drawer === name ? 0 : -1} onClick={event => onSelectDrawer(name, event.currentTarget)}><DesignPanelIcon name={drawerIcons[name]} /></button></Tooltip>)}
    </div>
    {drawerOpen && <Tooltip content="Close panel" side="left"><button type="button" className="design-drawer-collapse" aria-label="Close panel" onClick={onClose}><svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m8 4 6 6-6 6M4 4l6 6-6 6" /></svg></button></Tooltip>}
    {children}
  </aside>;
}
