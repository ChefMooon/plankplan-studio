import { Children, cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Project } from '@/lib/planner/model';
import type { SheetCutTree } from '@/lib/planner/sheet';
import { optimizeMixedProject } from '@/lib/planner/combined';
import { LinearCutDiagram } from './LinearCutDiagram';
import { SheetCutDiagram } from './SheetCutDiagram';
import { getPlanPresenceDiff, type PlanPresenceRecord } from './cutPlanMotion';

function sheetCutOrder(tree: SheetCutTree, format: (um: number) => string, out: string[] = []): string[] {
  if (tree.type !== 'cut') return out;
  out.push(
    `Cut ${tree.axis === 'x' ? 'across the sheet width' : 'along the sheet length'} at ${format(tree.at)} · ${format(tree.kerfUm)} kerf`,
  );
  sheetCutOrder(tree.before, format, out);
  sheetCutOrder(tree.after, format, out);
  return out;
}

interface CutPlanProps {
  project: Project;
  mixedResult: ReturnType<typeof optimizeMixedProject> | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

/** One set of sections serves every screen view and the complete printout. */
export function CutPlan({ project, mixedResult, expanded, onExpandedChange }: CutPlanProps) {
  const [planView, setPlanView] = useState('all');
  const result = mixedResult?.linear ?? null;
  const sheetResult = mixedResult?.sheets ?? null;
  const hasCurrentPlans = !!(result?.plans.length || sheetResult?.plans.length);
  const [priorPlanState, setPriorPlanState] = useState({ projectId: project.id, hasPlans: hasCurrentPlans });
  const firstPlanFromEmpty = priorPlanState.projectId === project.id && !priorPlanState.hasPlans && hasCurrentPlans;
  useLayoutEffect(() => {
    if (priorPlanState.projectId !== project.id || priorPlanState.hasPlans !== hasCurrentPlans) {
      // Capture the transition before paint so the first stock starts hidden.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPriorPlanState({ projectId: project.id, hasPlans: hasCurrentPlans });
    }
  }, [project.id, hasCurrentPlans, priorPlanState]);
  const [retainPlanSections, setRetainPlanSections] = useState(hasCurrentPlans);
  const retentionTimer = useRef<number | null>(null);
  useEffect(() => {
    if (hasCurrentPlans) {
      if (retentionTimer.current !== null) window.clearTimeout(retentionTimer.current);
      // Keep the presence layer mounted across the final plan removal.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRetainPlanSections(true);
      return;
    }
    if (!retainPlanSections) return;
    retentionTimer.current = window.setTimeout(() => setRetainPlanSections(false), 220);
    return () => { if (retentionTimer.current !== null) window.clearTimeout(retentionTimer.current); };
  }, [hasCurrentPlans, retainPlanSections]);
  const formatDim = (um: number) =>
    `${project.unitSystem === 'imperial' ? (um / 25400).toFixed(2) : (um / 1000).toFixed(1)} ${project.unitSystem === 'imperial' ? 'in' : 'mm'}`;
  const stockMap = new Map(
    (mixedResult?.planningProject.materials ?? project.materials).flatMap((m) =>
      m.stocks.map((s) => [s.id, { material: m, stock: s }] as const),
    ),
  );
  const combinedCost = (result?.totalCostCents ?? 0) + (sheetResult?.totalCostCents ?? 0);
  const hasLinkedPanelCut =
    !!project.design &&
    Object.entries(project.design.partLinks).some(([partId, link]) => {
      if (
        !project.parts.some(
          (part) =>
            part.id === partId &&
            project.materials.find((material) => material.id === part.materialId)?.type === 'sheet',
        )
      )
        return false;
      const definitionId = link.current?.definitionId ?? link.lastApplied.sources.definitionId;
      return (
        project.design?.definitions.some(
          (definition) => definition.id === definitionId && definition.cutSpec?.kind === 'panel',
        ) ?? false
      );
    });
  const shopping = new Map<string, { count: number; owned: number; cost: number }>();
  const materialTotals = new Map<
    string,
    { count: number; cost: number; waste: number; stockLength: number }
  >();
  result?.plans.forEach((p) => {
    const row = shopping.get(p.stockId) ?? { count: 0, owned: 0, cost: 0 };
    row.count += p.stockCount;
    row.owned += p.ownedUsed;
    row.cost += p.costCents;
    shopping.set(p.stockId, row);
    const entry = stockMap.get(p.stockId);
    if (!entry) return;
    const total = materialTotals.get(entry.material.id) ?? { count: 0, cost: 0, waste: 0, stockLength: 0 };
    total.count += p.stockCount;
    total.cost += p.costCents;
    total.waste += p.wasteUm;
    total.stockLength += entry.stock.length.um * p.stockCount;
    materialTotals.set(entry.material.id, total);
  });
  sheetResult?.plans.forEach((p) => {
    const row = shopping.get(p.stockId) ?? { count: 0, owned: 0, cost: 0 };
    row.count += p.stockCount;
    row.owned += p.ownedUsed;
    row.cost += p.costCents;
    shopping.set(p.stockId, row);
    const entry = stockMap.get(p.stockId);
    if (!entry) return;
    const total = materialTotals.get(entry.material.id) ?? { count: 0, cost: 0, waste: 0, stockLength: 0 };
    total.count += p.stockCount;
    total.cost += p.costCents;
    total.waste += p.wasteAreaUm2;
    total.stockLength += entry.stock.length.um * (entry.stock.widthUm ?? 0);
    materialTotals.set(entry.material.id, total);
  });
  const taxCents = Math.round((combinedCost * (project.taxRate ?? 0)) / 100);
  const money = (cents: number) => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: project.currency }).format(
        cents / 100,
      );
    } catch {
      return `$${(cents / 100).toFixed(2)}`;
    }
  };

  return (
    <aside className="results-column">
      <section className="panel result-panel">
        <p className="eyebrow">03 · CUT PLAN</p>
        <div className="cut-plan-heading">
          <h2 tabIndex={-1} id="cut-plan-heading">
            Plan overview
          </h2>
          <button
            type="button"
            id="plan-mode-action"
            className="secondary compact plan-mode-action"
            onClick={() => {
              const expanding = !expanded;
              onExpandedChange(expanding);
              window.setTimeout(
                () => document.getElementById(expanding ? 'cut-plan-heading' : 'plan-mode-action')?.focus(),
                0,
              );
            }}
          >
            {expanded ? 'Back to editing' : 'Expand plan'}
          </button>
        </div>
        {!!mixedResult?.genericStockIds.size && (
          <p className="muted">
            Generic stock uses 96″ boards grouped by size, or 48″ × 96″ panels with unspecified thickness.
            Prices are unspecified; totals below cover priced stock only.
          </p>
        )}
        {!!mixedResult?.unresolved.length && (
          <>
            <h3>Stock needed</h3>
            {mixedResult.unresolved.map((part) => (
              <p key={part.id} className="muted">
                {part.name} · {part.quantity} required · {formatDim(part.length.um)}
                {part.width ? ` × ${formatDim(part.width.um)}` : ''}
              </p>
            ))}
          </>
        )}
        {hasLinkedPanelCut && (
          <p className="warning" role="status">
            2D sheet placement checks length, width and grain only. Panel thickness compatibility is
            unverified.
          </p>
        )}
        {[...(result?.warnings ?? []), ...(sheetResult?.warnings ?? [])].map((w, i) => (
          <p className="warning" key={`${w.code}-${w.partId ?? i}`}>
            ⚠ {w.message}
          </p>
        ))}
        {!!(result?.plans.length || sheetResult?.plans.length) && (
          <p className="cut-plan-summary">
            <strong>Estimated total: {money(combinedCost + taxCents)}</strong>
            <span>
              {mixedResult?.genericStockIds.size ? ' · excludes unspecified prices' : ''}
              {!(result?.valid && sheetResult?.valid) ? ' · partial plan' : ''}
            </span>
          </p>
        )}
        <div
          className="cut-plan-tabs"
          role="tablist"
          aria-label="Cut plan views"
          onKeyDown={(event) => {
            const views = ['all', 'shopping', 'cuts', 'cost', 'materials'];
            const index = views.indexOf(planView);
            let next: number;
            if (event.key === 'ArrowRight') next = (index + 1) % views.length;
            else if (event.key === 'ArrowLeft') next = (index + views.length - 1) % views.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = views.length - 1;
            else return;
            event.preventDefault();
            setPlanView(views[next]);
            document.getElementById(`plan-tab-${views[next]}`)?.focus();
          }}
        >
          {[
            ['all', 'All'],
            ['shopping', 'Shopping'],
            ['cuts', 'Cuts & diagrams'],
            ['cost', 'Cost'],
            ['materials', 'Materials & offcuts'],
          ].map(([value, label]) => (
            <button
              type="button"
              role="tab"
              id={`plan-tab-${value}`}
              aria-controls="cut-plan-content"
              aria-selected={planView === value}
              tabIndex={planView === value ? 0 : -1}
              className={planView === value ? 'active' : ''}
              key={value}
              onClick={() => setPlanView(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          id="cut-plan-content"
          role="tabpanel"
          aria-labelledby={`plan-tab-${planView}`}
          className={`cut-plan-content view-${planView}`}
        >
          {hasCurrentPlans || retainPlanSections ? (
            <>
              {!(result?.valid && sheetResult?.valid) && (
                <p className="warning" role="status">
                  Partial plan only. The warnings above identify parts that still need available stock.
                </p>
              )}
              <section className="plan-section plan-cost">
                <h3>Cost breakdown</h3>
                <div className="cost-total">
                  <span>
                    {mixedResult?.genericStockIds.size
                      ? 'Priced stock subtotal · generic prices excluded'
                      : result?.valid && sheetResult?.valid
                        ? 'Estimated purchase subtotal'
                        : 'Partial purchase subtotal'}
                  </span>
                  <strong>{money(combinedCost)}</strong>
                </div>
                <div className="shopping-row">
                  <span>Tax ({project.taxRate ?? 0}%)</span>
                  <strong>{money(taxCents)}</strong>
                </div>
                <div className="shopping-row">
                  <b>Estimated total</b>
                  <strong>{money(combinedCost + taxCents)}</strong>
                </div>
                <p className="muted">
                  Manual prices · tax is an estimate and does not affect stock selection.
                </p>
                <h3>Cost by material</h3>
                {[...materialTotals].map(([materialId, total]) => {
                  const material = (mixedResult?.planningProject.materials ?? project.materials).find(
                    (m) => m.id === materialId,
                  );
                  const unspecified = material?.stocks.some((stock) =>
                    mixedResult?.genericStockIds.has(stock.id),
                  );
                  return (
                    <div className="shopping-row" key={materialId}>
                      <span>{material?.name}</span>
                      <strong>{unspecified ? 'Price unspecified' : money(total.cost)}</strong>
                    </div>
                  );
                })}
              </section>
              <section className="plan-section plan-materials">
                <h3>Material subtotals · waste</h3>
                {[...materialTotals].map(([materialId, total]) => (
                  <div className="shopping-row" key={materialId}>
                    <b>
                      {
                        (mixedResult?.planningProject.materials ?? project.materials).find(
                          (m) => m.id === materialId,
                        )?.name
                      }
                    </b>
                    <span>
                      {total.count}{' '}
                      {(mixedResult?.planningProject.materials ?? project.materials).find(
                        (m) => m.id === materialId,
                      )?.type === 'sheet'
                        ? 'sheets'
                        : 'boards'}{' '}
                      · {total.stockLength ? ((total.waste / total.stockLength) * 100).toFixed(1) : '0.0'}%
                      waste
                    </span>
                    <strong>
                      {(mixedResult?.planningProject.materials ?? project.materials)
                        .find((m) => m.id === materialId)
                        ?.stocks.some((stock) => mixedResult?.genericStockIds.has(stock.id))
                        ? 'Price unspecified'
                        : money(total.cost)}
                    </strong>
                  </div>
                ))}
              </section>
              <section className="plan-section plan-shopping">
                <h3>Shopping list</h3>
                {[...shopping].map(([stockId, row]) => {
                  const entry = stockMap.get(stockId);
                  if (!entry) return null;
                  return (
                    <div className="shopping-row" key={stockId}>
                      <b>
                        {entry.material.name} · {entry.stock.name}
                      </b>
                      <span>
                        {row.count} {entry.material.type === 'sheet' ? 'sheets' : 'boards'} · {row.owned}{' '}
                        owned · {row.count - row.owned} to buy
                      </span>
                      <strong>
                        {mixedResult?.genericStockIds.has(stockId) ? 'Price unspecified' : money(row.cost)}
                      </strong>
                    </div>
                  );
                })}
              </section>
              <section className="plan-section plan-cuts">
                <h3>Cut list and diagrams</h3>
                {!hasCurrentPlans && <p className="muted">No stock plans remain.</p>}
                <PlanPresence
                  key={project.id}
                  animateInitial={firstPlanFromEmpty}
                  keys={(result?.plans ?? []).map((plan, index) => `${plan.stockId}-${index}`)}
                  records={(result?.plans ?? []).map((plan) => ({ stockId: plan.stockId, geometry: JSON.stringify(plan.cuts.map((cut) => [cut.partId, cut.lengthUm])) }))}
                >
                {result?.plans.map((p, i) => {
                  const entry = stockMap.get(p.stockId);
                  if (!entry) return null;
                  const parts = p.cuts.map((cut) => {
                    const part = project.parts.find((item) => item.id === cut.partId);
                    return { partId: cut.partId, length: cut.lengthUm, name: part?.name ?? 'Part' };
                  });
                  return (
                    <article className="plan-card" key={`${p.stockId}-${i}`}>
                      <div className="plan-row">
                        <b>
                          {entry.material.name} · {entry.stock.name}
                        </b>
                        <span>
                          {mixedResult?.genericStockIds.has(p.stockId)
                            ? 'Price unspecified'
                            : `Buy cost ${money(p.costCents)}`}
                        </span>
                      </div>
                      <LinearCutDiagram key={`${project.id}-${p.stockId}-${i}`} stockId={p.stockId} stockLength={entry.stock.length.um} trim={project.trim.um} kerf={project.kerf.um} parts={parts} stockName={entry.stock.name} />
                      <div className="diagram-legend">
                        {p.cuts.map((c, cutIndex) => (
                          <span key={`${c.partId}-label-${cutIndex}`}>
                            {project.parts.find((q) => q.id === c.partId)?.name}: {formatDim(c.lengthUm)}
                          </span>
                        ))}
                        <span className="offcut">Offcut: {formatDim(p.wasteUm)}</span>
                      </div>
                    </article>
                  );
                })}
                </PlanPresence>
                <h3>Sheet layouts · cut order</h3>
                <PlanPresence
                  key={`${project.id}-sheets`}
                  animateInitial={firstPlanFromEmpty}
                  keys={(sheetResult?.plans ?? []).map((plan, index) => `${plan.stockId}-${index}`)}
                  records={(sheetResult?.plans ?? []).map((plan) => ({ stockId: plan.stockId, geometry: JSON.stringify(plan.placements.map((placement) => [placement.partId, placement.rect.x, placement.rect.y, placement.rect.width, placement.rect.height, placement.rotated])) }))}
                >
                {sheetResult?.plans.map((plan, index) => {
                  const entry = stockMap.get(plan.stockId);
                  if (!entry) return null;
                  const stockWidth = entry.stock.widthUm ?? 1;
                  const stockHeight = entry.stock.length.um;
                  const scale = 320 / Math.max(stockWidth, stockHeight);
                  return (
                    <article className="plan-card sheet-plan" key={`sheet-${index}`}>
                      <div className="plan-row">
                        <b>
                          {entry.material.name} · {entry.stock.name}
                        </b>
                        <span>
                          {plan.layout === 'strips' ? 'Full-length strips' : 'Guillotine layout'} ·{' '}
                          {mixedResult?.genericStockIds.has(plan.stockId)
                            ? 'Price unspecified'
                            : plan.ownedUsed
                              ? 'Owned sheet'
                              : `Buy cost ${money(plan.costCents)}`}
                        </span>
                      </div>
                      <SheetCutDiagram key={`${project.id}-${plan.stockId}-${index}`} plan={plan} stockId={plan.stockId} stockName={entry.stock.name} stockWidth={stockWidth} stockHeight={stockHeight} scale={scale} partNames={new Map(project.parts.map((part) => [part.id, part.name]))} />
                      <ol className="sheet-cut-order" aria-label="Sheet cut order">
                        {sheetCutOrder(plan.cutTree, formatDim).map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                      <p className="muted">
                        {plan.placements.length} parts · {plan.offcuts.length} usable offcuts.
                      </p>
                      {plan.offcuts.map((offcut, i) => (
                        <span className="offcut" key={i}>
                          {formatDim(offcut.width)} × {formatDim(offcut.height)}{' '}
                        </span>
                      ))}
                    </article>
                  );
                })}
                </PlanPresence>
              </section>
              <section className="plan-section plan-materials">
                <h3>Usable offcuts · at least {formatDim(project.minOffcutLinear.um)}</h3>
                {result?.plans.flatMap((p) => {
                  const entry = stockMap.get(p.stockId);
                  return entry && p.wasteUm >= project.minOffcutLinear.um
                    ? [
                        <div className="shopping-row" key={`offcut-${p.stockId}-${p.wasteUm}`}>
                          <span>
                            {entry.material.name} · {entry.stock.name}
                          </span>
                          <strong>{formatDim(p.wasteUm)}</strong>
                        </div>,
                      ]
                    : [];
                })}
                {!result?.plans.some((p) => p.wasteUm >= project.minOffcutLinear.um) && (
                  <p className="muted">No linear offcuts meet the minimum usable length.</p>
                )}
                {sheetResult?.plans.flatMap((plan, index) =>
                  plan.offcuts.map((offcut, i) => (
                    <div className="shopping-row" key={`sheet-offcut-${index}-${i}`}>
                      <span>
                        {stockMap.get(plan.stockId)?.material.name} · {stockMap.get(plan.stockId)?.stock.name}{' '}
                        · sheet offcut
                      </span>
                      <strong>
                        {formatDim(offcut.width)} × {formatDim(offcut.height)}
                      </strong>
                    </div>
                  )),
                )}
              </section>
            </>
          ) : (
            <p className="muted">Add parts for a generic board or panel plan, or assign a stock option.</p>
          )}
        </div>
      </section>
    </aside>
  );
}

function PlanPresence({ children, keys, records, animateInitial = false }: { children: ReactNode; keys: string[]; records: PlanPresenceRecord[]; animateInitial?: boolean }) {
  const currentNodes = Children.toArray(children);
  const signature = JSON.stringify(records);
  const previous = useRef<{ signature: string; keys: string[]; records: PlanPresenceRecord[]; nodes: ReactNode[] } | null>(null);
  const [entering, setEntering] = useState<Set<string>>(new Set());
  const [exiting, setExiting] = useState<ReactNode[]>([]);
  const timeout = useRef<number | null>(null);

  useEffect(() => {
    const prior = previous.current;
    if (prior?.signature === signature) previous.current = { signature, keys, records, nodes: currentNodes };
  }, [signature, keys, records, currentNodes]);

  useLayoutEffect(() => {
    const prior = previous.current;
    if (!prior || prior.signature === signature) {
      previous.current = { signature, keys, records, nodes: currentNodes };
      if (!prior && animateInitial && keys.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setEntering(new Set(keys));
        timeout.current = window.setTimeout(() => setEntering(new Set()), 400);
        return () => { if (timeout.current !== null) window.clearTimeout(timeout.current); };
      }
      return;
    }
    previous.current = { signature, keys, records, nodes: currentNodes };
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const diff = getPlanPresenceDiff(prior.records, records);
    const removed = diff.exiting.map((index) => prior.nodes[index]).filter((node) => node !== undefined);
    const added = diff.entering.map((index) => keys[index]).filter((key): key is string => key !== undefined);
    if (!removed.length && !added.length) return;
    setExiting(removed);
    setEntering(new Set(added));
    timeout.current = window.setTimeout(() => { setExiting([]); setEntering(new Set()); }, 400);
    return () => { if (timeout.current !== null) window.clearTimeout(timeout.current); };
    // The snapshot refresh effect above keeps current child nodes up to date without
    // restarting this transition timer on ordinary renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (!media.matches) return;
      if (timeout.current !== null) window.clearTimeout(timeout.current);
      setExiting([]); setEntering(new Set());
    };
    media.addEventListener('change', stop);
    return () => media.removeEventListener('change', stop);
  }, []);

  const visible = currentNodes.map((node, index) => {
    const key = keys[index];
    if (!entering.has(key) || !isValidElement<{ className?: string }>(node)) return node;
    return cloneElement(node, { className: `${node.props.className ?? ''} cut-plan-stock-enter`.trim() });
  });
  return <>
    {visible}
    {exiting.length > 0 && <div className="cut-plan-exit-layer" aria-hidden="true">
      {exiting.map((node, index) => isValidElement<{ className?: string }>(node)
        ? cloneElement(node, { key: `stock-exit-${index}`, className: `${node.props.className ?? ''} cut-plan-stock-exit`.trim() })
        : node)}
    </div>}
  </>;
}
