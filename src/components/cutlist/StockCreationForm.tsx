import { useMemo, useState, type FormEvent } from 'react';
import { Ruler, Stack } from '@phosphor-icons/react';
import { parseFractionalInches, umFromMillimeters, type MaterialKind, type StockOption, type UnitSystem } from '@/lib/planner/model';
import { copyStockPreset, presetsForUnit } from '@/lib/planner/stock-presets';
import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { MaterialTypeToggle } from './MaterialTypeToggle';

type Props = {
  mode: 'material' | 'stock';
  unitSystem: UnitSystem;
  fixedKind?: MaterialKind;
  defaultMaterialName?: string;
  onCancel: () => void;
  onCreate: (stock: StockOption, kind: MaterialKind, materialName?: string) => void;
};

export function StockCreationForm({ mode, unitSystem, fixedKind, defaultMaterialName = '', onCancel, onCreate }: Props) {
  const [kind, setKind] = useState<MaterialKind>(fixedKind ?? 'linear');
  const [source, setSource] = useState<'preset' | 'custom'>('preset');
  const presets = useMemo(() => presetsForUnit(unitSystem, kind), [unitSystem, kind]);
  const [presetId, setPresetId] = useState('');
  const preset = presets.find(item => item.id === presetId) ?? presets[0];
  const [materialName, setMaterialName] = useState(defaultMaterialName);
  const [customName, setCustomName] = useState('Custom stock');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [thickness, setThickness] = useState('');
  const [error, setError] = useState('');
  const unit = unitSystem === 'imperial' ? 'in' : 'mm';

  const parse = (value: string) => {
    const dimensionUm = unitSystem === 'imperial'
      ? parseFractionalInches(value)
      : umFromMillimeters(Number(value));
    if (!Number.isSafeInteger(dimensionUm) || dimensionUm <= 0) throw new Error('Enter a positive dimension.');
    return dimensionUm;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === 'material' && !materialName.trim()) { setError('Enter a material name.'); return; }
    if (source === 'preset') {
      if (!preset) { setError('Choose a stock preset.'); return; }
      onCreate(copyStockPreset(preset, crypto.randomUUID()), kind, mode === 'material' ? materialName.trim() : undefined);
      return;
    }
    try {
      const lengthUm = parse(length);
      const widthUm = parse(width);
      const stock: StockOption = {
        id: crypto.randomUUID(),
        name: customName.trim() || 'Custom stock',
        length: { um: lengthUm },
        widthUm,
        ...(kind === 'linear' ? { thicknessUm: parse(thickness), priceBasis: 'board-foot' as const } : { priceBasis: 'piece' as const }),
        ownedQuantity: 0,
      };
      onCreate(stock, kind, mode === 'material' ? materialName.trim() : undefined);
    } catch {
      setError('Enter a positive, valid dimension for each field. Fractions such as 3 1/2 are accepted for inches.');
    }
  };

  return <form className="stock-creation-form" onSubmit={submit} noValidate>
    <div className="stock-creation-heading"><strong>{mode === 'material' ? 'Add material and stock' : 'Add stock option'}</strong><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div>
    {mode === 'material' && <div className="stock-creation-material-row">
      <label>Material name<input aria-label="New material name" value={materialName} onChange={event => setMaterialName(event.target.value)} maxLength={256}/></label>
      {!fixedKind && <MaterialTypeToggle value={kind} groupLabel="New material type" onChange={value => { setKind(value); setPresetId(''); }}/ >}
    </div>}
    <div className={`stock-creation-controls ${source === 'preset' ? 'stock-creation-controls-preset' : ''}`}>
      <fieldset className="stock-type-fieldset stock-source-fieldset">
        <legend>Stock source</legend>
        <SegmentedControl<'preset' | 'custom'> aria-label="Stock source" value={source} onValueChange={value => { setSource(value); setError(''); }} options={[
          { value: 'preset', label: 'Preset', icon: <Stack/> },
          { value: 'custom', label: 'Custom', icon: <Ruler/> },
        ]}/>
      </fieldset>
      {source === 'preset' ? <label className="stock-creation-preset stock-source-detail" key="preset">Preset<Select aria-label="Stock preset" value={preset?.id ?? ''} onValueChange={setPresetId} options={presets.map(item => ({ value: item.id, label: item.label }))}/></label> : <div className="stock-source-custom-fields stock-source-detail" key="custom">
        <label>Stock name<input aria-label="Custom stock name" value={customName} onChange={event => setCustomName(event.target.value)} maxLength={256}/></label>
        <div className="stock-creation-dimensions">
          <label>{kind === 'sheet' ? 'Sheet length' : 'Length'} ({unit})<input aria-label={kind === 'sheet' ? 'Custom sheet length' : 'Custom stock length'} inputMode="decimal" value={length} onChange={event => setLength(event.target.value)} aria-invalid={Boolean(error)}/></label>
          <label>{kind === 'sheet' ? 'Sheet width' : 'Board width'} ({unit})<input aria-label={kind === 'sheet' ? 'Custom sheet width' : 'Custom board width'} inputMode="decimal" value={width} onChange={event => setWidth(event.target.value)} aria-invalid={Boolean(error)}/></label>
          {kind === 'linear' && <label>Thickness ({unit})<input aria-label="Custom stock thickness" inputMode="decimal" value={thickness} onChange={event => setThickness(event.target.value)} aria-invalid={Boolean(error)}/></label>}
        </div>
      </div>}
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <button className="secondary compact" type="submit">＋ {mode === 'material' ? 'Create material' : 'Add stock'}</button>
  </form>;
}
