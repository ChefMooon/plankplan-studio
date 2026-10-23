export type UnitSystem = 'imperial' | 'metric';
export type Dimension = { um: number };
export type Money = { cents: number };
export type Part = { id: string; name: string; materialId: string; length: Dimension; width?: Dimension; grainLocked?: boolean; quantity: number; group?: string; notes?: string };
export type StockOption = { id: string; name: string; length: Dimension; price?: Money; quantityLimit?: number; ownedQuantity: number; widthUm?: number; thicknessUm?: number; priceBasis?: 'piece' | 'board-foot' };
export type MaterialKind = 'linear' | 'sheet';
export type Material = { id: string; name: string; type: MaterialKind; stocks: StockOption[] };
export type EditorOrder = { parts?: string[]; materials?: string[]; stocks?: Record<string, string[]> };
export type Project = { schemaVersion: 1; id: string; name: string; notes?: string; unitSystem: UnitSystem; kerf: Dimension; trim: Dimension; minOffcutLinear: Dimension; minOffcutSheet: { shortSideUm: number; longSideUm: number }; sheetLayout?: 'cheapest' | 'simplestCuts'; currency: string; taxRate?: number; parts: Part[]; materials: Material[]; editorOrder?: EditorOrder; createdAt: string; updatedAt: string };
export type LinearPlan = { cuts: { partId: string; lengthUm: number }[]; stockId: string; stockCount: number; usedUm: number; wasteUm: number; costCents: number; ownedUsed: number };
export type PlanWarning = { code: string; message: string; partId?: string };
export type LinearResult = { plans: LinearPlan[]; warnings: PlanWarning[]; totalCostCents: number; valid: boolean };

export const umFromInches = (inches: number) => Math.round(inches * 25_400);
export const umFromMillimeters = (mm: number) => Math.round(mm * 1_000);
export const inchesFromUm = (um: number) => um / 25_400;
export const millimetersFromUm = (um: number) => um / 1_000;
export const centsFromDollars = (dollars: number) => Math.round(dollars * 100);
export const dollarsFromCents = (cents: number) => cents / 100;

export function parseFractionalInches(input: string): number {
  const text = input.trim().replace(/-/g, ' ');
  const values = text.split(/\s+/);
  let total = 0;
  for (const value of values) {
    if (/^\d+(\.\d+)?$/.test(value)) total += Number(value);
    else if (/^\d+\/\d+$/.test(value)) {
      const [n, d] = value.split('/').map(Number);
      if (!d) throw new Error('Fraction denominator cannot be zero');
      total += n / d;
    } else throw new Error(`Invalid inch measurement: ${input}`);
  }
  if (!Number.isFinite(total)) throw new Error(`Invalid inch measurement: ${input}`);
  return umFromInches(total);
}

export function boardFootCents(stock: Pick<StockOption, 'widthUm' | 'thicknessUm' | 'length' | 'price'>): number {
  if (!stock.widthUm || !stock.thicknessUm || stock.widthUm <= 0 || stock.thicknessUm <= 0 || stock.length.um <= 0) throw new Error('Board-foot pricing requires positive stock width, thickness, and length');
  if (!stock.price) throw new Error('Board-foot rate is required');
  const boardFeet = (inchesFromUm(stock.widthUm) * inchesFromUm(stock.thicknessUm) * inchesFromUm(stock.length.um)) / 144;
  return Math.round(stock.price.cents * boardFeet);
}

export function exportProject(project: Project): string { return JSON.stringify(project, null, 2); }
export function importProject(json: string): Project {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || (parsed as Project).schemaVersion !== 1) throw new Error('Unsupported project schema version');
  const project = parsed as Project;
  const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const isDimension = (value: unknown, allowZero = false) => isRecord(value) && Number.isSafeInteger(value.um) && (allowZero ? Number(value.um) >= 0 : Number(value.um) > 0);
  const isCount = (value: unknown, allowZero = false) => Number.isSafeInteger(value) && (allowZero ? Number(value) >= 0 : Number(value) > 0);
  if (typeof project.id !== 'string' || !project.id || typeof project.name !== 'string' || !project.name.trim()) throw new Error('Invalid project identity');
  if (project.unitSystem !== 'imperial' && project.unitSystem !== 'metric') throw new Error('Invalid project unit system');
  if (project.sheetLayout !== undefined && project.sheetLayout !== 'cheapest' && project.sheetLayout !== 'simplestCuts') throw new Error('Invalid sheet layout mode');
  if (!isDimension(project.kerf, true) || !isDimension(project.trim, true) || !Array.isArray(project.parts) || !Array.isArray(project.materials)) throw new Error('Invalid project settings');
  if (typeof project.updatedAt !== 'string') throw new Error('Invalid project timestamp');
  // Fill defaults introduced during schema-v1 implementation so early v1 local backups remain readable.
  project.createdAt ??= project.updatedAt;
  project.currency ??= 'CAD';
  project.minOffcutLinear ??= { um: umFromInches(12) };
  project.minOffcutSheet ??= { shortSideUm: umFromMillimeters(150), longSideUm: umFromMillimeters(300) };
  project.materials.forEach(material => { material.type ??= 'linear'; });
  if (project.editorOrder !== undefined) {
    const rawOrder: unknown = project.editorOrder;
    const stringIds = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : undefined;
    const rawStocks = isRecord(rawOrder) && isRecord(rawOrder.stocks) ? rawOrder.stocks : {};
    const stocks = Object.fromEntries(Object.entries(rawStocks).flatMap(([materialId, ids]) => {
      const validIds = stringIds(ids);
      return validIds ? [[materialId, validIds]] : [];
    }));
    project.editorOrder = isRecord(rawOrder) ? { parts: stringIds(rawOrder.parts), materials: stringIds(rawOrder.materials), stocks } : {};
  }
  if (typeof project.createdAt !== 'string' || typeof project.currency !== 'string' || !project.currency.trim()) throw new Error('Invalid project currency or creation date');
  if (project.taxRate !== undefined && (typeof project.taxRate !== 'number' || !Number.isFinite(project.taxRate) || project.taxRate < 0 || project.taxRate > 100)) throw new Error('Tax rate must be between 0 and 100 percent');
  if (!isDimension(project.minOffcutLinear, true) || !isRecord(project.minOffcutSheet) || !isCount(project.minOffcutSheet.shortSideUm, true) || !isCount(project.minOffcutSheet.longSideUm, true)) throw new Error('Invalid minimum offcut settings');
  const materialIds = new Set<string>(); const stockIds = new Set<string>(); const partIds = new Set<string>();
  for (const material of project.materials) {
    if (!isRecord(material) || typeof material.id !== 'string' || !material.id || materialIds.has(material.id) || typeof material.name !== 'string' || !material.name.trim() || (material.type !== 'linear' && material.type !== 'sheet') || !Array.isArray(material.stocks)) throw new Error('Invalid material record');
    materialIds.add(material.id);
    for (const stock of material.stocks) {
      if (!isRecord(stock) || typeof stock.id !== 'string' || !stock.id || stockIds.has(stock.id) || typeof stock.name !== 'string' || !stock.name.trim() || !isDimension(stock.length) || !isCount(stock.ownedQuantity, true)) throw new Error('Invalid stock record');
      if (stock.price !== undefined && (!isRecord(stock.price) || !isCount(stock.price.cents, true))) throw new Error('Invalid stock price');
      if (stock.quantityLimit !== undefined && !isCount(stock.quantityLimit, true)) throw new Error('Invalid stock purchase limit');
      if (stock.widthUm !== undefined && !isCount(stock.widthUm) || stock.thicknessUm !== undefined && !isCount(stock.thicknessUm)) throw new Error('Invalid stock dimensions');
      if (stock.priceBasis !== undefined && stock.priceBasis !== 'piece' && stock.priceBasis !== 'board-foot') throw new Error('Invalid stock price basis');
      if (material.type === 'linear' && stock.priceBasis === 'board-foot' && (!stock.widthUm || !stock.thicknessUm)) throw new Error('Board-foot stock requires width and thickness');
      stockIds.add(stock.id);
    }
  }
  for (const part of project.parts) {
    if (!isRecord(part) || typeof part.id !== 'string' || !part.id || partIds.has(part.id) || typeof part.name !== 'string' || !part.name.trim() || typeof part.materialId !== 'string' || !materialIds.has(part.materialId) || !isDimension(part.length) || (part.width !== undefined && !isDimension(part.width)) || (part.grainLocked !== undefined && typeof part.grainLocked !== 'boolean') || !isCount(part.quantity) || (part.group !== undefined && typeof part.group !== 'string') || (part.notes !== undefined && typeof part.notes !== 'string')) throw new Error('Invalid part record');
    partIds.add(part.id);
  }
  return project;
}
