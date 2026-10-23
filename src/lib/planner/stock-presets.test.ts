import { describe, expect, it } from 'vitest';
import { copyStockPreset, presetsFor, STOCK_PRESETS } from './stock-presets';

describe('regional stock preset catalog', () => {
  it('records source links and region-accurate actual 2x sizes', () => {
    const ca4 = STOCK_PRESETS.find(preset => preset.id === 'ca-2x4-8ft')!;
    const us4 = STOCK_PRESETS.find(preset => preset.id === 'us-2x4-8ft')!;
    expect([ca4.widthUm, ca4.thicknessUm]).toEqual([89_000, 38_000]);
    expect([us4.widthUm, us4.thicknessUm]).toEqual([88_900, 38_100]);
    expect(ca4.source).toContain('natural-resources.canada.ca');
    expect(us4.source).toContain('homedepot.com');
  });
  it('uses source-backed product lengths for Canadian 8 ft and 12 ft stock', () => {
    const ca8 = STOCK_PRESETS.find(preset => preset.id === 'ca-2x4-8ft')!;
    const ca12 = STOCK_PRESETS.find(preset => preset.id === 'ca-2x4-12ft')!;
    expect(ca8.lengthUm).toBe(2_438_400);
    expect(ca12.lengthUm).toBe(3_657_600);
    expect(ca8.lengthSource).toContain('homedepot.ca/s/en/');
    expect(ca12.lengthSource).toContain('/1001802967');
    expect(ca12.lengthSource).toContain('homedepot.ca/s/en/');
    expect(presetsFor('CA', 'metric').find(preset => preset.id === ca8.id)?.label).toContain('2438.4 mm');
  });
  it('shows both unit formats without changing the selected region or dimensions', () => {
    const metric = presetsFor('US', 'metric').find(preset => preset.id === 'us-2x4-8ft')!;
    const imperial = presetsFor('US', 'imperial').find(preset => preset.id === 'us-2x4-8ft')!;
    expect(metric.widthUm).toBe(imperial.widthUm);
    expect(metric.label).toContain('mm');
    expect(imperial.label).toContain('in');
  });
  it('copies independent project-owned stocks with optional manual price', () => {
    const preset = STOCK_PRESETS[0];
    const stock = copyStockPreset(preset, 'project-stock', 1700);
    stock.length.um++;
    expect(preset.lengthUm).not.toBe(stock.length.um);
    expect(stock.price?.cents).toBe(1700);
    expect(stock.ownedQuantity).toBe(0);
  });
});
