import { useId } from 'react';
import { LockSimple } from '@phosphor-icons/react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Tooltip } from '@/components/ui/tooltip';
import type { MaterialKind } from '@/lib/planner/model';
import { MaterialTypeIcon } from './MaterialTypeIcon';

type Props = {
  value: MaterialKind;
  onChange: (value: MaterialKind) => void;
  disabled?: boolean;
  groupLabel?: string;
  legend?: string;
  lockDescriptionId?: string;
};

const lockDescription = 'Material type is fixed after stock is added.';

export function MaterialTypeToggle({ value, onChange, disabled = false, groupLabel = 'Material type', legend = 'Material type', lockDescriptionId }: Props) {
  const generatedId = useId();
  const descriptionId = lockDescriptionId ?? generatedId;
  return <fieldset className="stock-type-fieldset material-type-fieldset" data-disabled={disabled || undefined}>
    <legend>{legend}{disabled && <Tooltip content={lockDescription} side="top"><span className="material-type-lock" tabIndex={0} role="note" aria-label="Material type locked" aria-describedby={descriptionId}><LockSimple aria-hidden="true"/></span></Tooltip>}</legend>
    <SegmentedControl<MaterialKind>
      aria-label={groupLabel}
      aria-describedby={disabled ? descriptionId : undefined}
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      iconOnly
      className="material-type-toggle"
      options={[
        { value: 'linear', label: 'Linear material', icon: <MaterialTypeIcon kind="linear"/> },
        { value: 'sheet', label: 'Sheet material', icon: <MaterialTypeIcon kind="sheet"/> },
      ]}
    />
    {disabled && <small id={descriptionId} className="sr-only">{lockDescription}</small>}
  </fieldset>;
}
