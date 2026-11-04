import { useState } from 'react';
import { Select } from '@/components/ui/select';
import { inchesFromUm, millimetersFromUm, type Project } from '@/lib/planner/model';
import { createApplyIntent, createProjectionPreview, type ProjectionPreview, type ProjectionRow, type RowDecision } from '@/lib/planner/design/projection';

type PreviewOrigin = { project: Project; cutlistId: string; editSequence: number; localGeneration: number };
const formatLength = (project: Project, um: number) => project.unitSystem === 'imperial' ? `${inchesFromUm(um).toFixed(3)} in` : `${millimetersFromUm(um).toFixed(1)} mm`;

function previewStockFit(project: Project, row: ProjectionRow): { message: string; unverified: boolean } {
  const material = project.materials.find(item => item.id === row.fields.materialId);
  if (!material) return { message: 'Missing material; this row cannot be optimized.', unverified: false };
  if (!material.stocks.length) return { message: `No stock options for ${material.name}.`, unverified: false };
  if (material.type === 'linear') {
    const matchingLength = material.stocks.filter(stock => stock.length.um >= row.fields.length.um + project.trim.um);
    const verified = matchingLength.some(stock => stock.widthUm !== undefined && stock.thicknessUm !== undefined && row.fields.crossSection !== undefined && ((row.fields.crossSection.width.um <= stock.widthUm && row.fields.crossSection.thickness.um <= stock.thicknessUm) || (row.fields.crossSection.thickness.um <= stock.widthUm && row.fields.crossSection.width.um <= stock.thicknessUm)));
    if (verified) return { message: `Cross-section fits at least one actual-size option in ${material.name}; 90° turn is allowed.`, unverified: false };
    if (matchingLength.some(stock => stock.widthUm === undefined || stock.thicknessUm === undefined)) return { message: 'Stock length is sufficient, but actual cross-section dimensions are missing; fit is unverified.', unverified: true };
    return { message: `No ${material.name} stock option has a verified length and cross-section fit.`, unverified: false };
  }
  const lengthFits = material.stocks.some(stock => {
    if (stock.widthUm === undefined || row.fields.width === undefined) return false;
    const direct = stock.length.um >= row.fields.length.um + project.trim.um && stock.widthUm >= row.fields.width.um;
    const turned = !row.fields.grainLocked && stock.length.um >= row.fields.width.um + project.trim.um && stock.widthUm >= row.fields.length.um;
    return direct || turned;
  });
  const missingWidth = material.stocks.some(stock => stock.widthUm === undefined);
  const thicknessText = `Panel thickness (${formatLength(project, row.designThicknessUm)}) compatibility is unverified by 2D sheet planning.`;
  if (!lengthFits && missingWidth) return { message: `Sheet fit dimensions are incomplete. ${thicknessText}`, unverified: true };
  if (!lengthFits) return { message: `No ${material.name} stock option has a verified 2D length/width fit. ${thicknessText}`, unverified: true };
  return { message: `2D length/width fit is possible. ${thicknessText}`, unverified: true };
}

export function DesignProjectionReview({ project, cutlistId, editSequence, localGeneration, saveStatus, onApply, onBusyChange, label = 'Update cutlist from design' }: {
  project: Project;
  cutlistId: string;
  editSequence: number;
  localGeneration: number;
  saveStatus: string;
  onApply: (next: Project) => boolean | void | Promise<boolean | void>;
  onBusyChange?: (busy: boolean) => void;
  label?: string;
}) {
  const [preview, setPreview] = useState<ProjectionPreview>();
  const [origin, setOrigin] = useState<PreviewOrigin>();
  const [decisions, setDecisions] = useState<Record<string, RowDecision>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const stale = !!preview && (!origin || origin.project !== project || origin.cutlistId !== cutlistId || origin.editSequence !== editSequence || origin.localGeneration !== localGeneration);
  const startReview = () => {
    if (saveStatus.startsWith('Conflict')) { setMessage('Reload this project before creating a current review.'); return; }
    if (saveStatus.startsWith('Saving')) { setMessage('Wait for the current project save before creating a review.'); return; }
    if (!project.design) { setMessage('There is no model to review.'); return; }
    try {
      const next = createProjectionPreview(project, editSequence, localGeneration, () => crypto.randomUUID(), cutlistId);
      setPreview(next); setOrigin({ project, cutlistId, editSequence, localGeneration }); setDecisions({});
      setMessage(next.changes.length ? `${next.changes.length} change${next.changes.length === 1 ? '' : 's'} ready for review.` : 'No changes are needed.');
    } catch (error) { setMessage(error instanceof Error ? `Could not create review: ${error.message}` : 'Could not create review.'); }
  };
  const updateDecision = (rowKey: string, patch: Partial<RowDecision>) => setDecisions(current => ({ ...current, [rowKey]: { ...current[rowKey], ...patch, fieldChoices: { ...current[rowKey]?.fieldChoices, ...patch.fieldChoices } } }));
  const apply = async () => {
    if (!preview || !origin) return;
    if (saveStatus.startsWith('Conflict')) { setMessage('Reload this project before applying a review.'); return; }
    if (saveStatus.startsWith('Saving')) { setMessage('Wait for the current project save before applying this review.'); return; }
    if (stale) { setMessage('This review is out of date. Create a new review before applying it.'); return; }
    try {
      const intent = createApplyIntent(project, preview, decisions, { editSequence, localGeneration });
      setBusy(true); onBusyChange?.(true);
      const result = await onApply({ ...project, parts: intent.parts, design: intent.design, updatedAt: new Date().toISOString() });
      if (result === false) { setMessage('The cutlist update was not saved. Resolve the save issue and try again.'); return; }
      setPreview(undefined); setOrigin(undefined); setDecisions({}); setMessage('Reviewed cutlist changes saved.');
    } catch (error) { setMessage(error instanceof Error ? `Could not apply review: ${error.message}` : 'Could not apply review.'); }
    finally { setBusy(false); onBusyChange?.(false); }
  };
  const eligibleIds = new Set(preview?.rows.flatMap(row => row.sources.instanceIds) ?? []);
  const assigned = project.design?.instances.filter(instance => (instance.projectionCutlistIds ?? [project.cutlists[0]?.id ?? 'default-cutlist']).includes(cutlistId) && !instance.projectionExcludedCutlistIds?.includes(cutlistId) && !(instance.projectionExcluded && cutlistId === (project.cutlists[0]?.id ?? 'default-cutlist'))) ?? [];

  return <>
    <button type="button" className="secondary compact" onClick={startReview} disabled={busy || saveStatus.startsWith('Conflict') || saveStatus.startsWith('Saving') || !project.design}>{label}</button>
    {message && <p className="design-projection-message" role="status">{message}</p>}
    {preview && <section className="projection-review" aria-label={`${project.cutlists.find(list => list.id === cutlistId)?.name ?? 'Cutlist'} design review`}>
      <h4>{label} · {project.cutlists.find(list => list.id === cutlistId)?.name ?? 'Cutlist'}</h4>
      {assigned.some(instance => !eligibleIds.has(instance.id)) && <p className="design-empty-hint">{assigned.filter(instance => !eligibleIds.has(instance.id)).length} assigned component(s) are not included because dimensions need confirmation or the material is missing or incompatible.</p>}
      {stale && <p className="warning" role="alert">This preview is stale because the model or saved project changed. Create a new review.</p>}
      {preview.changes.map(change => {
        const row = preview.rows.find(candidate => candidate.key === change.rowKey);
        const title = row?.fields.name ?? change.partId ?? 'Cutlist row';
        const decision = decisions[change.rowKey];
        return <article className="projection-review-row" key={change.rowKey}>
          <strong>{change.kind}: {title}</strong>
          <p>{row ? `${row.fields.quantity} part(s) · ${formatLength(project, row.fields.length.um)} long` : 'This linked cutlist row no longer has a matching modeled component.'}</p>
          {row && (() => { const fit = previewStockFit(project, row); return <p className={fit.unverified ? 'warning' : 'design-empty-hint'}>{fit.message}</p>; })()}
          <label>Decision<Select aria-label={`Decision for ${title}`} value={decision?.disposition ?? ''} onValueChange={value => updateDecision(change.rowKey, { disposition: value as NonNullable<RowDecision['disposition']> })} options={change.kind === 'remove' ? [{value:'',label:'Choose…'},{value:'keep',label:'Keep manual row'},{value:'detach',label:'Detach from model'},{value:'remove',label:'Remove cutlist row'}] : [{value:'',label:'Choose…'},{value:'apply',label:'Apply design values'},{value:'keep',label:'Keep manual values'},{value:'detach',label:'Detach and keep independent'},{value:'remove',label:'Remove cutlist row'}]} /></label>
          {change.conflicts.map(field => <label key={field}>Conflict · {field}<Select aria-label={`${field} choice for ${title}`} value={decision?.fieldChoices?.[field] ?? ''} onValueChange={value => updateDecision(change.rowKey, { fieldChoices: { [field]: value as 'manual' | 'design' } })} options={[{value:'',label:'Choose…'},{value:'manual',label:'Keep manual'},{value:'design',label:'Use design'}]} /></label>)}
        </article>;
      })}
      {!preview.changes.length && <p>No changes are needed.</p>}
      <button type="button" className="primary compact" onClick={() => void apply()} disabled={busy || stale || !preview.changes.length || saveStatus.startsWith('Conflict') || saveStatus.startsWith('Saving')}>{busy ? 'Saving…' : 'Apply reviewed changes'}</button>
      <button type="button" className="secondary compact" onClick={() => { setPreview(undefined); setOrigin(undefined); setDecisions({}); }} disabled={busy}>Close review</button>
    </section>}
  </>;
}
