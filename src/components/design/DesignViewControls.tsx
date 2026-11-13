import type { MouseEvent, ReactNode } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Tooltip } from '@/components/ui/tooltip';
import type { DesignViewPreferences } from '@/lib/planner/design/view-preferences';
import { FrameModelIcon, FrameSelectionIcon, HelpIcon, OrthographicIcon, PerspectiveIcon } from './DesignViewIcons';

interface DesignViewControlsProps {
  preset: DesignViewPreferences['preset'];
  projection: DesignViewPreferences['projection'];
  frameSelectionDisabled: boolean;
  onPresetChange: (preset: DesignViewPreferences['preset']) => void;
  onProjectionChange: (projection: DesignViewPreferences['projection']) => void;
  onFrameModel: () => void;
  onFrameSelection: () => void;
  onOpenHelp: (event: MouseEvent<HTMLButtonElement>) => void;
}

interface IconButtonProps {
  label: string;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}

// The wrapper span owns the tooltip so a disabled button still explains itself on hover.
function IconButton({ label, disabled, onClick, children }: IconButtonProps) {
  return <Tooltip content={label} side="bottom">
    <span className="design-view-icon-wrap">
      <button type="button" className="design-view-icon-button" aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>
    </span>
  </Tooltip>;
}

export function DesignViewControls({ preset, projection, frameSelectionDisabled, onPresetChange, onProjectionChange, onFrameModel, onFrameSelection, onOpenHelp }: DesignViewControlsProps) {
  return <div className="design-view-controls" aria-label="Camera controls">
    <SegmentedControl<DesignViewPreferences['preset']> aria-label="Camera view" value={preset} onValueChange={onPresetChange} options={[
      { value: 'iso', label: 'Iso', ariaLabel: 'Isometric' },
      { value: 'top', label: 'Top' },
      { value: 'front', label: 'Front' },
      { value: 'right', label: 'Right' },
    ]} />
    <span className="design-control-separator" />
    <SegmentedControl<DesignViewPreferences['projection']> aria-label="Camera projection" iconOnly value={projection} onValueChange={onProjectionChange} options={[
      { value: 'perspective', label: 'Perspective', icon: <PerspectiveIcon /> },
      { value: 'orthographic', label: 'Orthographic', icon: <OrthographicIcon /> },
    ]} />
    <span className="design-control-separator" />
    <div className="design-view-icon-group" role="group" aria-label="Framing">
      <IconButton label="Frame model" onClick={onFrameModel}><FrameModelIcon /></IconButton>
      <IconButton label="Frame selection" disabled={frameSelectionDisabled} onClick={onFrameSelection}><FrameSelectionIcon /></IconButton>
    </div>
    <div className="design-view-controls-end">
      <IconButton label="Keyboard shortcuts" onClick={onOpenHelp}><HelpIcon /></IconButton>
    </div>
  </div>;
}
