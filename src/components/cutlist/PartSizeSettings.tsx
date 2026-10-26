import { MaterialTypeToggle } from '@/components/cutlist/MaterialTypeToggle';
import { flushSync } from 'react-dom';
import { Select } from '@/components/ui/select';
import { NumberStepper } from '@/components/ui/number-stepper';
import { presetsFor } from '@/lib/planner/stock-presets';
import { partKind } from '@/lib/planner/part-stock';
import { umFromInches, umFromMillimeters, type Part, type Project } from '@/lib/planner/model';

type PartFieldProps = { part: Part; project: Project; onChange: (part: Part) => void };

function changePart(onChange: PartFieldProps['onChange'], next: Part) {
  if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(() => flushSync(() => onChange(next)));
  else onChange(next);
}

export function PartTypeField({ part, project, onChange }: PartFieldProps) {
  const kind = partKind(part, project);
  return <div className="part-type-field"><MaterialTypeToggle legend="Type" value={kind} groupLabel={`Part type for ${part.name}`} onChange={value => changePart(onChange, { ...part, kind: value, materialId: '', stockId: undefined, ...(value === 'sheet' && !part.width ? { width: { um: project.unitSystem === 'imperial' ? umFromInches(12) : umFromMillimeters(300) } } : {}) })}/></div>;
}

export function PartLumberField({ part, project, onChange }: PartFieldProps) {
  const kind = partKind(part, project);
  if (kind !== 'linear') return null;
  const presets = [...new Map(presetsFor(project.unitSystem === 'imperial' ? 'US' : 'CA', project.unitSystem).map(preset => [preset.nominal, preset])).values()];
  const factor = project.unitSystem === 'imperial' ? 25400 : 1000;
  return <label className="part-lumber-field">Lumber size<Select aria-label={`Lumber size for ${part.name}`} value={part.lumberPreset ?? (part.crossSection ? 'custom' : '')} options={[{ value: '', label: 'Unspecified' }, ...presets.map(preset => ({ value: preset.nominal, label: `${preset.nominal} · ${preset.widthUm / factor} × ${(preset.thicknessUm ?? 0) / factor} ${project.unitSystem === 'imperial' ? 'in' : 'mm'}` })), { value: 'custom', label: 'Custom size' }]} onValueChange={value => {
    const preset = presets.find(item => item.nominal === value);
    changePart(onChange, { ...part, kind, materialId: '', stockId: undefined, lumberPreset: value || undefined, crossSection: preset ? { width: { um: preset.widthUm }, thickness: { um: preset.thicknessUm! } } : value === 'custom' ? part.crossSection ?? { width: { um: Math.round(3.5 * 25400) }, thickness: { um: Math.round(1.5 * 25400) } } : undefined });
  }}/></label>;
}

export function PartSizeSettings({ part, project, onChange }: PartFieldProps) {
  return <><PartTypeField part={part} project={project} onChange={onChange}/><PartLumberField part={part} project={project} onChange={onChange}/></>;
}

export function PartCustomSize({ part, project, onChange }: PartFieldProps) {
  const factor = project.unitSystem === 'imperial' ? 25400 : 1000;
  return <>{(['width', 'thickness'] as const).map(axis => <label key={axis}>Custom {axis} ({project.unitSystem === 'imperial' ? 'in' : 'mm'})<NumberStepper aria-label={`Part cross-section ${axis}`} type="number" min="0.001" step="0.125" value={(part.crossSection?.[axis].um ?? 0) / factor} onChange={event => onChange({ ...part, stockId: undefined, crossSection: { ...part.crossSection!, [axis]: { um: Math.max(1, Math.round(Number(event.target.value) * factor)) } } })} onStep={steps => onChange({ ...part, stockId: undefined, crossSection: { ...part.crossSection!, [axis]: { um: Math.max(1, (part.crossSection?.[axis].um ?? 0) + Math.round(steps * factor / 8)) } } })}/></label>)}</>;
}
