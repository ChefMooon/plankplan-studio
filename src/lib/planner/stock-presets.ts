import { umFromInches, umFromMillimeters, type StockOption, type UnitSystem } from './model';

export type StockRegion = 'CA' | 'US';
export type StockPreset = {
  id: string;
  region: StockRegion;
  nominal: string;
  label: string;
  name: string;
  lengthUm: number;
  widthUm: number;
  thicknessUm: number;
  source: string;
  lengthSource: string;
};

// Actual dressed sizes. Canadian values are the metric counterparts published by
// AWC; US values use the listed inch dimensions converted to integer micrometers.
const sizes = [
  { id: '1x4', nominal: '1×4', us: [3.5, 0.75], ca: [89, 19] },
  { id: '1x6', nominal: '1×6', us: [5.5, 0.75], ca: [140, 19] },
  { id: '2x4', nominal: '2×4', us: [3.5, 1.5], ca: [89, 38] },
  { id: '2x6', nominal: '2×6', us: [5.5, 1.5], ca: [140, 38] },
  { id: '2x8', nominal: '2×8', us: [7.25, 1.5], ca: [184, 38] },
  { id: '2x10', nominal: '2×10', us: [9.25, 1.5], ca: [235, 38] },
  { id: '2x12', nominal: '2×12', us: [11.25, 1.5], ca: [286, 38] },
] as const;

const lengths = [
  { suffix: '8ft', imperial: 96, labelImperial: '8 ft' },
  { suffix: '12ft', imperial: 144, labelImperial: '12 ft' },
] as const;

const AWC = 'https://awc.org/faq/how-do-i-convert-to-metric-lumber-sizes/';
const AWC_EPD = 'https://web-media.awc.org/wp-content/uploads/2021/11/17210943/AWC_EPD_NorthAmericanSoftwoodLumber_20200605.pdf';
const NRCan = 'https://natural-resources.canada.ca/energy-efficiency/energy-star/tables-calculating-effective-thermal-resistance-opaque-assemblies';
const US_LISTING = 'https://www.homedepot.com/p/330097223';
const US_12FT_LISTING = 'https://www.homedepot.com/p/312528815';
const CA_12FT_LISTING = 'https://www.homedepot.ca/product/pro-direct-2-inch-x-4-inch-x-12-ft-spf-standard-dimensional-lumber/1001802967';
const CA_LENGTH_RANGE = 'https://www.homedepot.ca/s/en/home/categories/building-materials/lumber-and-composites/dimensional-lumber-and-studs/2x4x12';

const nominalOrder = ['1×6', '1×4', '2×4', '2×6', '2×8', '2×10', '2×12'];
export const STOCK_PRESETS: readonly StockPreset[] = sizes.flatMap(size =>
  (['CA', 'US'] as const).flatMap(region => lengths.map(length => {
    const [width, thickness] = region === 'CA' ? size.ca : size.us;
    const metric = region === 'CA';
    const widthUm = metric ? umFromMillimeters(width) : umFromInches(width);
    const thicknessUm = metric ? umFromMillimeters(thickness) : umFromInches(thickness);
    // CA product listings specify these lengths as 8 ft / 12 ft (96 / 144 in).
    // Metric display converts those exact product dimensions; it does not round
    // them to separate 2400 / 3600 mm SKUs.
    const lengthUm = umFromInches(length.imperial);
    const source = region === 'CA'
      ? `${AWC}; ${AWC_EPD}; ${NRCan}`
      : `${AWC}; ${AWC_EPD}; ${US_LISTING}; ${US_12FT_LISTING}`;
    const lengthSource = region === 'CA'
      ? `${length.suffix === '12ft' ? `${CA_12FT_LISTING}; ` : ''}${CA_LENGTH_RANGE}`
      : length.suffix === '8ft' ? US_LISTING : US_12FT_LISTING;
    const metricLength = lengthUm / 1_000;
    return {
      id: `${region.toLowerCase()}-${size.id}-${length.suffix}`,
      region,
      nominal: size.nominal,
      label: `${region} ${size.nominal} · ${metric ? `${width} × ${thickness} mm` : `${width} × ${thickness} in`} · ${metric ? `${metricLength} mm` : length.labelImperial}`,
      name: `${size.nominal} (${metric ? `${width} × ${thickness} mm` : `${width} × ${thickness} in`}) · ${metric ? `${metricLength} mm` : length.labelImperial}`,
      lengthUm, widthUm, thicknessUm, source, lengthSource,
    };
  })),
).sort((a, b) => a.region.localeCompare(b.region) || Number(!a.id.endsWith('8ft')) - Number(!b.id.endsWith('8ft')) || nominalOrder.indexOf(a.nominal) - nominalOrder.indexOf(b.nominal));

export function presetsFor(region: StockRegion, unitSystem: UnitSystem): StockPreset[] {
  return STOCK_PRESETS.filter(preset => preset.region === region).map(preset => ({
    ...preset,
    label: unitSystem === 'imperial'
      ? `${preset.region} ${preset.nominal} · ${preset.widthUm / 25_400} × ${preset.thicknessUm / 25_400} in · ${preset.lengthUm / 25_400} in`
      : `${preset.region} ${preset.nominal} · ${preset.widthUm / 1_000} × ${preset.thicknessUm / 1_000} mm · ${preset.lengthUm / 1_000} mm`,
  }));
}

/** Returns a fresh project-owned value; editing it cannot mutate the catalog. */
export function copyStockPreset(preset: StockPreset, id: string, priceCents?: number): StockOption {
  return {
    id,
    name: preset.name,
    length: { um: preset.lengthUm },
    widthUm: preset.widthUm,
    thicknessUm: preset.thicknessUm,
    ...(priceCents === undefined ? {} : { price: { cents: priceCents } }),
    ownedQuantity: 0,
  };
}
