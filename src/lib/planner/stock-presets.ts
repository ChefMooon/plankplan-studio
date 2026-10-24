import { umFromInches, umFromMillimeters, type MaterialKind, type StockOption, type UnitSystem } from './model';

export type StockRegion = 'CA' | 'US';
export type StockPreset = {
  id: string;
  kind: MaterialKind;
  region: StockRegion;
  nominal: string;
  label: string;
  name: string;
  lengthUm: number;
  widthUm: number;
  thicknessUm?: number;
  source: string;
  lengthSource: string;
};

// Regional dressed dimensions for common dimensional lumber. Supplier listings
// demonstrate these size/length families; availability varies by store and grade.
const sizes = [
  { id: '1x2', nominal: '1×2', us: [1.5, 0.75], ca: [38, 19] },
  { id: '1x3', nominal: '1×3', us: [2.5, 0.75], ca: [64, 19] },
  { id: '1x4', nominal: '1×4', us: [3.5, 0.75], ca: [89, 19] },
  { id: '1x6', nominal: '1×6', us: [5.5, 0.75], ca: [140, 19] },
  { id: '1x8', nominal: '1×8', us: [7.25, 0.75], ca: [184, 19] },
  { id: '2x3', nominal: '2×3', us: [2.5, 1.5], ca: [64, 38] },
  { id: '2x4', nominal: '2×4', us: [3.5, 1.5], ca: [89, 38] },
  { id: '2x6', nominal: '2×6', us: [5.5, 1.5], ca: [140, 38] },
  { id: '2x8', nominal: '2×8', us: [7.25, 1.5], ca: [184, 38] },
  { id: '2x10', nominal: '2×10', us: [9.25, 1.5], ca: [235, 38] },
  { id: '2x12', nominal: '2×12', us: [11.25, 1.5], ca: [286, 38] },
  { id: '4x4', nominal: '4×4', us: [3.5, 3.5], ca: [89, 89] },
] as const;

// Preserve the original preset IDs and exact dimensions for existing projects.
const lengths = [
  { suffix: '8ft', imperial: 96, labelImperial: '8 ft' },
  { suffix: '10ft', imperial: 120, labelImperial: '10 ft' },
  { suffix: '12ft', imperial: 144, labelImperial: '12 ft' },
  { suffix: '16ft', imperial: 192, labelImperial: '16 ft' },
] as const;

const AWC = 'https://awc.org/faq/how-do-i-convert-to-metric-lumber-sizes/';
const AWC_EPD = 'https://web-media.awc.org/wp-content/uploads/2021/11/17210943/AWC_EPD_NorthAmericanSoftwoodLumber_20200605.pdf';
const NRCan = 'https://natural-resources.canada.ca/energy-efficiency/energy-star/tables-calculating-effective-thermal-resistance-opaque-assemblies';
const US_LUMBER = 'https://www.homedepot.com/b/Lumber-Composites-Dimensional-Lumber/N-5yc1vZc3tc';
const CA_LUMBER = 'https://www.homedepot.ca/s/en/home/categories/building-materials/lumber-and-composites/dimensional-lumber-and-studs';
const CA_12FT_LISTING = 'https://www.homedepot.ca/product/pro-direct-2-inch-x-4-inch-x-12-ft-spf-standard-dimensional-lumber/1001802967';
const CA_LENGTH_RANGE = 'https://www.homedepot.ca/s/en/home/categories/building-materials/lumber-and-composites/dimensional-lumber-and-studs/2x4x12';
const US_SHEETS = 'https://www.homedepot.com/b/Lumber-Composites-Plywood/N-5yc1vZbqm7';
const CA_SHEETS = 'https://www.homedepot.ca/en/home/categories/building-materials/lumber-and-composites/plywood.html';

const nominalOrder = ['1×6', '1×4', '1×2', '1×3', '1×8', '2×3', '2×4', '2×6', '2×8', '2×10', '2×12', '4×4'];

function formatApproximateInches(micrometers: number): string {
  const sixteenths = Math.round(micrometers / 25_400 * 16);
  const whole = Math.floor(sixteenths / 16);
  const numerator = sixteenths % 16;
  if (numerator === 0) return String(whole);
  let divisor = 16;
  while (numerator % divisor !== 0) divisor /= 2;
  const fraction = `${numerator / divisor}/${16 / divisor}`;
  return whole === 0 ? fraction : `${whole} ${fraction}`;
}

const linearPresets: StockPreset[] = sizes.flatMap(size =>
  (['CA', 'US'] as const).flatMap(region => lengths.map(length => {
    const [width, thickness] = region === 'CA' ? size.ca : size.us;
    const metric = region === 'CA';
    const widthUm = metric ? umFromMillimeters(width) : umFromInches(width);
    const thicknessUm = metric ? umFromMillimeters(thickness) : umFromInches(thickness);
    const lengthUm = umFromInches(length.imperial);
    const source = region === 'CA' ? `${AWC}; ${AWC_EPD}; ${NRCan}; ${CA_LUMBER}` : `${AWC}; ${AWC_EPD}; ${US_LUMBER}`;
    const lengthSource = region === 'CA' && length.suffix === '12ft'
      ? `${CA_12FT_LISTING}; ${CA_LENGTH_RANGE}`
      : region === 'CA' ? CA_LUMBER : US_LUMBER;
    return {
      id: `${region.toLowerCase()}-${size.id}-${length.suffix}`,
      kind: 'linear' as const,
      region,
      nominal: size.nominal,
      label: `${region} ${size.nominal} · ${metric ? `${thickness} × ${width} mm` : `${thickness} × ${width} in`} · ${metric ? `${lengthUm / 1_000} mm` : length.labelImperial}`,
      name: `${size.nominal} (${metric ? `${thickness} × ${width} mm` : `${thickness} × ${width} in`}) · ${metric ? `${lengthUm / 1_000} mm` : length.labelImperial}`,
      lengthUm,
      widthUm,
      thicknessUm,
      source,
      lengthSource,
    };
  })),
).sort((a, b) => a.region.localeCompare(b.region) || Number(!a.id.endsWith('8ft')) - Number(!b.id.endsWith('8ft')) || nominalOrder.indexOf(a.nominal) - nominalOrder.indexOf(b.nominal) || a.lengthUm - b.lengthUm);

type SheetSize = { id: string; label: string; us: [number, number]; ca: [number, number] };
// Exact footprint families are kept distinct: 48 × 96 in is not 1220 × 2440 mm.
const sheetSizes: SheetSize[] = [
  { id: '4x8', label: '4 × 8 ft', us: [48, 96], ca: [1220, 2440] },
  { id: '4x10', label: '4 × 10 ft', us: [48, 120], ca: [1220, 3050] },
  { id: '5x5', label: '5 × 5 ft', us: [60, 60], ca: [1525, 1525] },
  { id: '4x4', label: '4 × 4 ft', us: [48, 48], ca: [1220, 1220] },
];
const sheetPresets: StockPreset[] = sheetSizes.flatMap(size => (['CA', 'US'] as const).map(region => {
  const metric = region === 'CA';
  const [width, length] = region === 'CA' ? size.ca : size.us;
  const widthUm = metric ? umFromMillimeters(width) : umFromInches(width);
  const lengthUm = metric ? umFromMillimeters(length) : umFromInches(length);
  const nominal = metric ? `${width} × ${length} mm` : size.label;
  const source = region === 'CA' ? `${CA_SHEETS}` : `${US_SHEETS}`;
  return {
    id: `${region.toLowerCase()}-sheet-${size.id}`,
    kind: 'sheet' as const,
    region,
    nominal,
    label: `${region} ${nominal}`,
    name: nominal,
    lengthUm,
    widthUm,
    source,
    lengthSource: source,
  };
}));

export const STOCK_PRESETS: readonly StockPreset[] = [...linearPresets, ...sheetPresets];

export function presetsFor(region: StockRegion, unitSystem: UnitSystem, kind: MaterialKind = 'linear'): StockPreset[] {
  return STOCK_PRESETS.filter(preset => preset.region === region && preset.kind === kind).map(preset => {
    if (preset.kind === 'sheet') {
      const width = region === 'CA' ? `${preset.widthUm / 1_000} mm` : `${preset.widthUm / 25_400} in`;
      const length = region === 'CA' ? `${preset.lengthUm / 1_000} mm` : `${preset.lengthUm / 25_400} in`;
      const metricWidth = region === 'CA' ? width : `${Math.round(preset.widthUm / 1_000)} mm`;
      const metricLength = region === 'CA' ? length : `${Math.round(preset.lengthUm / 1_000)} mm`;
      const imperialWidth = region === 'US' ? width : `~${formatApproximateInches(preset.widthUm)} in`;
      const imperialLength = region === 'US' ? length : `~${formatApproximateInches(preset.lengthUm)} in`;
      return { ...preset, label: unitSystem === 'imperial' ? `${region} ${imperialWidth} × ${imperialLength}` : `${region} ${metricWidth} × ${metricLength}` };
    }
    const imperialDimensions = region === 'CA'
      ? `${formatApproximateInches(preset.thicknessUm!)} × ~${formatApproximateInches(preset.widthUm)} in`
      : `${preset.thicknessUm! / 25_400} × ${preset.widthUm / 25_400} in`;
    return {
      ...preset,
      label: unitSystem === 'imperial'
        ? `${preset.region} ${preset.nominal} · ${imperialDimensions} · ${preset.lengthUm / 304_800} ft`
        : `${preset.region} ${preset.nominal} · ${preset.thicknessUm! / 1_000} × ${preset.widthUm / 1_000} mm · ${preset.lengthUm / 1_000} mm`,
    };
  });
}

/** Presets for the unit-neutral picker: one shared lumber catalog and distinct sheet footprints. */
export function presetsForUnit(unitSystem: UnitSystem, kind: MaterialKind = 'linear'): StockPreset[] {
  const catalog = kind === 'linear'
    ? STOCK_PRESETS.filter(preset => preset.kind === kind && preset.region === 'US')
    : STOCK_PRESETS.filter(preset => preset.kind === kind);
  return catalog.map(preset => {
    const display = presetsFor(preset.region, unitSystem, kind).find(item => item.id === preset.id)!;
    if (kind === 'linear') {
      const label = display.label.replace(/^US /, '');
      return { ...display, label, name: label };
    }
    return { ...display, name: display.label };
  });
}

/** Returns a fresh project-owned value; editing it cannot mutate the catalog. */
export function copyStockPreset(preset: StockPreset, id: string, priceCents?: number): StockOption {
  return {
    id,
    name: preset.name,
    length: { um: preset.lengthUm },
    widthUm: preset.widthUm,
    ...(preset.thicknessUm === undefined ? {} : { thicknessUm: preset.thicknessUm }),
    ...(priceCents === undefined ? {} : { price: { cents: priceCents } }),
    ownedQuantity: 0,
    ...(preset.kind === 'linear' ? { priceBasis: 'board-foot' as const } : {}),
  };
}
