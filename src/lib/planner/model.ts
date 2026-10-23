export type UnitSystem = 'imperial' | 'metric';
export type Dimension = { um: number };
export type Money = { cents: number };
export type Part = { id: string; name: string; materialId: string; length: Dimension; width?: Dimension; crossSection?: { width: Dimension; thickness: Dimension }; grainLocked?: boolean; quantity: number; group?: string; notes?: string };
export type StockOption = { id: string; name: string; length: Dimension; price?: Money; quantityLimit?: number; ownedQuantity: number; widthUm?: number; thicknessUm?: number; priceBasis?: 'piece' | 'board-foot' };
export type MaterialKind = 'linear' | 'sheet';
export type Material = { id: string; name: string; type: MaterialKind; stocks: StockOption[] };
export type EditorOrder = { parts?: string[]; materials?: string[]; stocks?: Record<string, string[]> };
import { validateDesignDocument, type DesignDocumentV1, type Issue } from './design/schema';
import { MAX_PROJECT_BYTES, readBoundedProjectInput, serializeProjectDocument, utf8ByteLength } from './serialization';
export type Project = { schemaVersion: 2; id: string; name: string; notes?: string; unitSystem: UnitSystem; kerf: Dimension; trim: Dimension; minOffcutLinear: Dimension; minOffcutSheet: { shortSideUm: number; longSideUm: number }; sheetLayout?: 'cheapest' | 'simplestCuts'; currency: 'CAD' | 'USD' | 'EUR' | 'GBP'; taxRate?: number; parts: Part[]; materials: Material[]; editorOrder?: EditorOrder; createdAt: string; updatedAt: string; design?: DesignDocumentV1 };
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

export function validateProjectDocument(value: unknown): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, path: string) => issues.push({ code, path, severity: 'error' });
  const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!rec(value)) return [{ code: 'invalid-record', path: '$', severity: 'error' }];
  const allowed = ['schemaVersion','id','name','notes','unitSystem','kerf','trim','minOffcutLinear','minOffcutSheet','sheetLayout','currency','taxRate','parts','materials','editorOrder','createdAt','updatedAt','design'];
  for (const k of Object.keys(value)) if (!allowed.includes(k)) add('unknown-field', `$.${k}`);
  if (value.schemaVersion !== 2) add('unsupported-version', '$.schemaVersion');
  const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
  const dim = (v: unknown, zero = false) => rec(v) && Object.keys(v).length === 1 && Number.isSafeInteger(v.um) && Number(v.um) >= (zero ? 0 : 1);
  const count = (v: unknown, zero = false) => Number.isSafeInteger(v) && Number(v) >= (zero ? 0 : 1) && Number(v) <= 10000;
  if (!str(value.id,128) || !value.id || !str(value.name,256) || !value.name.trim()) add('invalid-identity','$');
  if (value.notes !== undefined && !str(value.notes,16384)) add('invalid-text','$.notes');
  if (value.unitSystem !== 'imperial' && value.unitSystem !== 'metric') add('invalid-unit-system','$.unitSystem');
  if (!dim(value.kerf,true) || !dim(value.trim,true) || !dim(value.minOffcutLinear,true)) add('invalid-dimension','$.kerf');
  if (!rec(value.minOffcutSheet) || !Number.isSafeInteger(value.minOffcutSheet.shortSideUm) || !Number.isSafeInteger(value.minOffcutSheet.longSideUm) || Number(value.minOffcutSheet.shortSideUm)<0 || Number(value.minOffcutSheet.shortSideUm)>Number(value.minOffcutSheet.longSideUm)) add('invalid-offcut','$.minOffcutSheet');
  if (value.sheetLayout !== undefined && !['cheapest','simplestCuts'].includes(String(value.sheetLayout))) add('invalid-discriminant','$.sheetLayout');
  if (!['CAD','USD','EUR','GBP'].includes(String(value.currency))) add('invalid-currency','$.currency');
  if (value.taxRate !== undefined && (typeof value.taxRate !== 'number' || !Number.isFinite(value.taxRate) || value.taxRate<0 || value.taxRate>100)) add('invalid-tax-rate','$.taxRate');
  if (!Array.isArray(value.parts) || value.parts.length>10000 || !Array.isArray(value.materials) || value.materials.length>1000) return [...issues,{ code:'invalid-collections',path:'$',severity:'error' }];
  const materialIds=new Set<string>(), stockIds=new Set<string>(), partIds=new Set<string>(); let stocks=0;
  value.materials.forEach((m,i)=>{ const p=`$.materials[${i}]`; if(!rec(m)){add('invalid-record',p);return;} for(const k of Object.keys(m)) if(!['id','name','type','stocks'].includes(k)) add('unknown-field',`${p}.${k}`); if(!str(m.id,128)||!m.id||materialIds.has(m.id)||!str(m.name,256)||!m.name.trim()||!['linear','sheet'].includes(String(m.type))||!Array.isArray(m.stocks)){add('invalid-material',p);return;} materialIds.add(m.id); stocks+=m.stocks.length; m.stocks.forEach((s,j)=>{const q=`${p}.stocks[${j}]`; if(!rec(s)){add('invalid-record',q);return;} for(const k of Object.keys(s))if(!['id','name','length','widthUm','thicknessUm','price','priceBasis','quantityLimit','ownedQuantity'].includes(k))add('unknown-field',`${q}.${k}`); if(!str(s.id,128)||!s.id||stockIds.has(s.id)||!str(s.name,256)||!s.name.trim()||!dim(s.length)||!count(s.ownedQuantity,true)){add('invalid-stock',q);return;} stockIds.add(s.id); if(s.widthUm!==undefined&&!Number.isSafeInteger(s.widthUm)||s.thicknessUm!==undefined&&!Number.isSafeInteger(s.thicknessUm)||s.quantityLimit!==undefined&&!count(s.quantityLimit,true)||s.price!==undefined&&(!rec(s.price)||!Number.isSafeInteger(s.price.cents)||Number(s.price.cents)<0)||s.priceBasis!==undefined&&!['piece','board-foot'].includes(String(s.priceBasis))) add('invalid-stock-details',q); if(m.type==='sheet'&&(!Number.isSafeInteger(s.widthUm)||s.priceBasis==='board-foot'))add('invalid-sheet-stock',q); if(m.type==='linear'&&s.priceBasis==='board-foot'&&(!s.widthUm||!s.thicknessUm))add('invalid-board-foot-stock',q); }); });
  if(stocks>10000)add('count-limit','$.materials');
  value.parts.forEach((p,i)=>{const q=`$.parts[${i}]`; if(!rec(p)){add('invalid-record',q);return;} for(const k of Object.keys(p))if(!['id','name','materialId','length','width','crossSection','grainLocked','quantity','group','notes'].includes(k))add('unknown-field',`${q}.${k}`); if(!str(p.id,128)||!p.id||partIds.has(p.id)||!str(p.name,256)||!p.name.trim()||!materialIds.has(String(p.materialId))||!dim(p.length)||!count(p.quantity)||p.width!==undefined&&!dim(p.width)||p.grainLocked!==undefined&&typeof p.grainLocked!=='boolean'||p.group!==undefined&&!str(p.group,256)||p.notes!==undefined&&!str(p.notes,16384)){add('invalid-part',q);return;} partIds.add(p.id); if(p.crossSection!==undefined&&(!rec(p.crossSection)||!dim(p.crossSection.width)||!dim(p.crossSection.thickness)))add('invalid-cross-section',`${q}.crossSection`); });
  if(value.editorOrder!==undefined){const e=value.editorOrder; if(!rec(e)||Object.keys(e).some(k=>!['parts','materials','stocks'].includes(k)))add('invalid-editor-order','$.editorOrder'); else {for(const key of ['parts','materials'] as const)if(e[key]!==undefined&&(!Array.isArray(e[key])||!e[key].every(x=>typeof x==='string'&&x.length<=128)))add('invalid-editor-order',`$.editorOrder.${key}`);if(e.stocks!==undefined&&(!rec(e.stocks)||Object.values(e.stocks).some(v=>!Array.isArray(v)||!v.every(x=>typeof x==='string'&&x.length<=128))))add('invalid-editor-order','$.editorOrder.stocks');}}
  const iso=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString()===v;
  if(!iso(value.createdAt)||!iso(value.updatedAt))add('invalid-timestamp','$.createdAt');
  if(value.design!==undefined) issues.push(...validateDesignDocument(value.design,value.parts as Part[],materialIds));
  return issues;
}

export function normalizeProjectDocument(input: unknown): Project {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid project record');
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2) throw new Error(`Unsupported project schema version: ${String(raw.schemaVersion)}`);
  const legacy = raw.schemaVersion === 1;
  const value: Record<string, unknown> = { ...raw, schemaVersion: 2 };
  // Historical v1 defaults are applied only after confirming the outer container exists.
  if (legacy) {
    if (value.createdAt === undefined) value.createdAt = value.updatedAt;
    value.currency ??= 'CAD';
    value.minOffcutLinear ??= { um: umFromInches(12) };
    value.minOffcutSheet ??= { shortSideUm: umFromMillimeters(150), longSideUm: umFromMillimeters(300) };
    if (Array.isArray(value.materials)) value.materials = value.materials.map(m => m && typeof m === 'object' && !Array.isArray(m) ? { type: 'linear', ...(m as object) } : m);
    // v1 did not have cross-section requirements or embedded design.
  }
  if (Array.isArray(value.parts)) value.parts = value.parts.map(p => p && typeof p === 'object' && !Array.isArray(p) ? { ...p as object, ...(Object.prototype.hasOwnProperty.call(p, 'crossSection') ? {} : {}) } : p);
  const issues = validateProjectDocument(value);
  if (issues.length) throw new Error(`${issues[0].code} at ${issues[0].path}`);
  if (utf8ByteLength(serializeProjectDocument(value)) > MAX_PROJECT_BYTES) throw new Error('Project document exceeds byte limit');
  return value as Project;
}
export function validateProject(input: unknown): Project { return normalizeProjectDocument(input); }
export function exportProject(project: Project): string { return serializeProjectDocument(normalizeProjectDocument(project)); }
export function importProject(json: string): Project { return normalizeProjectDocument(readBoundedProjectInput(json)); }
export function copyProjectDocument(source: Project, name = `${source.name} copy`, now = new Date().toISOString()): Project {
  return normalizeProjectDocument({ ...source, id: crypto.randomUUID(), name, createdAt: now, updatedAt: now });
}
export function restoreProjectDocument(destination: Project, backup: Project): Project {
  return normalizeProjectDocument({ ...backup, id: destination.id, createdAt: destination.createdAt, updatedAt: new Date().toISOString() });
}
