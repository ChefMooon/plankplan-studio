import type { Project } from '@/lib/planner/model';
import type { Dispatch, SetStateAction } from 'react';
import { Select } from '@/components/ui/select';
import { NumberStepper } from '@/components/ui/number-stepper';
import { insertEditorCopy, withEditorOrder } from '@/lib/planner/editor-order';
import type { SharedEditorProps } from './editorTypes';
import { CaretDown } from '@phosphor-icons/react';
import type { Material, StockOption } from '@/lib/planner/model';
import { StockCreationForm } from './StockCreationForm';
import { MaterialTypeToggle } from './MaterialTypeToggle';

interface MaterialsStockEditorProps extends SharedEditorProps {
  materialFormOpen: boolean;
  setMaterialFormOpen: Dispatch<SetStateAction<boolean>>;
  closeMaterialForm: () => void;
  orderedMaterials: Material[];
  orderedStocks: (material: Material) => StockOption[];
  collapsedMaterialIds: Set<string>;
  setCollapsedMaterialIds: Dispatch<SetStateAction<Set<string>>>;
  collapsedStockIds: Set<string>;
  setCollapsedStockIds: Dispatch<SetStateAction<Set<string>>>;
  stockFormMaterialId: string | null;
  setStockFormMaterialId: Dispatch<SetStateAction<string | null>>;
  updateMaterial: (id: string, updateFn: (material: Material) => Material) => void;
  updateStock: (materialId: string, stockId: string, updateFn: (stock: StockOption) => StockOption) => void;
}

export function MaterialsStockEditor({
  project,
  update,
  dimensionProps,
  dropProps,
  dragHandle,
  quickActions,
  moveItem,
  announceMove,
  setOrderAnnouncement,
  deletionTriggerId,
  setPendingDeletion,
  materialFormOpen,
  setMaterialFormOpen,
  closeMaterialForm,
  orderedMaterials,
  orderedStocks,
  collapsedMaterialIds,
  setCollapsedMaterialIds,
  collapsedStockIds,
  setCollapsedStockIds,
  stockFormMaterialId,
  setStockFormMaterialId,
  updateMaterial,
  updateStock,
}: MaterialsStockEditorProps) {
  return (
    <section className="panel materials-stock-editor">
      <div className="panel-title materials-panel-title">
        <div>
          <p className="eyebrow">02 · MATERIALS & STOCK</p>
          <h2>Set your stock and price</h2>
        </div>
        <button
          id="add-material"
          className="secondary compact material-form-toggle"
          aria-expanded={materialFormOpen}
          aria-controls="material-creation-form"
          onClick={() => setMaterialFormOpen((open) => !open)}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className={materialFormOpen ? 'is-expanded' : ''}>
            <path d="m3.5 6 4.5 4 4.5-4" />
          </svg>
          <span className="stable-toggle-label" data-width-label="Show material form">
            {materialFormOpen ? 'Hide material form' : 'Show material form'}
          </span>
        </button>
      </div>
      <div
        id="material-creation-form"
        className={`collapsible-region ${materialFormOpen ? '' : 'is-collapsed'}`}
        aria-hidden={!materialFormOpen}
        inert={!materialFormOpen}
      >
        <div className="collapsible-region-inner">
          <StockCreationForm
            key={project.materials.length}
            mode="material"
            unitSystem={project.unitSystem}
            defaultMaterialName={`Material ${project.materials.length + 1}`}
            onCancel={closeMaterialForm}
            onCreate={(stock, kind, materialName) => {
              update({
                ...project,
                materials: [
                  ...project.materials,
                  {
                    id: crypto.randomUUID(),
                    name: materialName ?? `Material ${project.materials.length + 1}`,
                    type: kind,
                    stocks: [stock],
                  },
                ],
              });
              closeMaterialForm();
            }}
          />
        </div>
      </div>
      {orderedMaterials.map((m, materialIndex) => (
        <div className="material-card reorderable-row" key={m.id} {...dropProps('materials', m.id)}>
          {dragHandle('materials', m.id, m.name)}
          <div className="material-card-content">
            <div className="material-heading">
              <button
                type="button"
                className="collapse-toggle material-collapse-toggle"
                aria-label={`${collapsedMaterialIds.has(m.id) ? 'Expand' : 'Collapse'} material ${m.name}`}
                aria-expanded={!collapsedMaterialIds.has(m.id)}
                aria-controls={`material-content-${m.id}`}
                onClick={() =>
                  setCollapsedMaterialIds((current) => {
                    const next = new Set(current);
                    if (next.has(m.id)) next.delete(m.id);
                    else next.add(m.id);
                    return next;
                  })
                }
              >
                <CaretDown aria-hidden="true" />
              </button>
              <label>
                Material
                <input
                  id={`material-name-${m.id}`}
                  aria-label="Material name"
                  value={m.name}
                  onChange={(e) => updateMaterial(m.id, (x) => ({ ...x, name: e.target.value }))}
                />
              </label>
              <MaterialTypeToggle
                value={m.type}
                disabled={m.stocks.length > 0}
                groupLabel={`Material type for ${m.name}`}
                lockDescriptionId={`material-type-lock-${m.id}`}
                onChange={(value) => updateMaterial(m.id, (x) => ({ ...x, type: value }))}
              />
              {quickActions('material', m.name, m.id, materialIndex, orderedMaterials.length, {
                move: (direction) => {
                  moveItem('materials', m.id, direction);
                  announceMove(m.name, direction);
                },
                duplicate: () => {
                  const id = crypto.randomUUID();
                  const copiedById = new Map(
                    m.stocks.map((stock) => [stock.id, { ...stock, id: crypto.randomUUID() }]),
                  );
                  const copy = {
                    ...m,
                    id,
                    name: `${m.name} copy`,
                    stocks: m.stocks.map((stock) => copiedById.get(stock.id)!),
                  };
                  const stockOrder = orderedStocks(m).map((stock) => copiedById.get(stock.id)!.id);
                  const ids = insertEditorCopy(
                    orderedMaterials.map((item) => item.id),
                    m.id,
                    id,
                  );
                  update({
                    ...project,
                    materials: [...project.materials, copy],
                    editorOrder: withEditorOrder(project.editorOrder, {
                      materials: ids,
                      stocks: { ...project.editorOrder?.stocks, [id]: stockOrder },
                    }),
                  });
                  setOrderAnnouncement(`${copy.name} duplicated.`);
                  window.setTimeout(() => document.getElementById(`material-name-${id}`)?.focus(), 0);
                },
                remove: () => {
                  deletionTriggerId.current = `material-actions-${m.id}`;
                  setPendingDeletion({ kind: 'material', id: m.id });
                },
              })}
            </div>
            <div
              id={`material-content-${m.id}`}
              className={`collapsible-region ${collapsedMaterialIds.has(m.id) ? 'is-collapsed' : ''}`}
              aria-hidden={collapsedMaterialIds.has(m.id)}
              inert={collapsedMaterialIds.has(m.id)}
            >
              <div className="collapsible-region-inner material-content-stack">
                {m.type === 'sheet' && (
                  <>
                    <p className="muted sheet-material-help">
                      Choose a preset size or enter custom dimensions.
                    </p>
                    <label>
                      Sheet layout
                      <Select
                        aria-label="Sheet layout"
                        value={project.sheetLayout ?? 'cheapest'}
                        onValueChange={(value) =>
                          update({ ...project, sheetLayout: value as Project['sheetLayout'] })
                        }
                        options={[
                          { value: 'cheapest', label: 'Cheapest layout · simpler cuts break ties' },
                          { value: 'simplestCuts', label: 'Simplest cuts · strip-only' },
                        ]}
                      />
                    </label>
                  </>
                )}
                {orderedStocks(m).map((s, stockIndex) => (
                  <div
                    className="stock-editor reorderable-row"
                    key={s.id}
                    {...dropProps('stocks', s.id, m.id)}
                  >
                    {dragHandle('stocks', s.id, s.name, m.id)}
                    <div className="stock-editor-content">
                      <div className="stock-editor-head">
                        <button
                          type="button"
                          className="collapse-toggle stock-collapse-toggle"
                          aria-label={`${collapsedStockIds.has(s.id) ? 'Expand' : 'Collapse'} stock option ${s.name}`}
                          aria-expanded={!collapsedStockIds.has(s.id)}
                          aria-controls={`stock-content-${s.id}`}
                          onClick={() =>
                            setCollapsedStockIds((current) => {
                              const next = new Set(current);
                              if (next.has(s.id)) next.delete(s.id);
                              else next.add(s.id);
                              return next;
                            })
                          }
                        >
                          <CaretDown aria-hidden="true" />
                          <span>Stock option</span>
                          {collapsedStockIds.has(s.id) && (
                            <span className="stock-collapsed-name">· {s.name}</span>
                          )}
                        </button>
                        {quickActions('stock', s.name, s.id, stockIndex, orderedStocks(m).length, {
                          move: (direction) => {
                            moveItem('stocks', s.id, direction, m.id);
                            announceMove(s.name, direction);
                          },
                          duplicate: () => {
                            const id = crypto.randomUUID();
                            const copy = { ...s, id, name: `${s.name} copy` };
                            const ids = insertEditorCopy(
                              orderedStocks(m).map((item) => item.id),
                              s.id,
                              id,
                            );
                            update({
                              ...project,
                              materials: project.materials.map((x) =>
                                x.id === m.id ? { ...x, stocks: [...x.stocks, copy] } : x,
                              ),
                              editorOrder: withEditorOrder(project.editorOrder, {
                                stocks: { ...project.editorOrder?.stocks, [m.id]: ids },
                              }),
                            });
                            setOrderAnnouncement(`${copy.name} duplicated.`);
                            window.setTimeout(() => document.getElementById(`stock-name-${id}`)?.focus(), 0);
                          },
                          remove: () => {
                            deletionTriggerId.current = `stock-actions-${s.id}`;
                            setPendingDeletion({ kind: 'stock', id: s.id });
                          },
                        })}
                      </div>
                      <div
                        id={`stock-content-${s.id}`}
                        className={`collapsible-region ${collapsedStockIds.has(s.id) ? 'is-collapsed' : ''}`}
                        aria-hidden={collapsedStockIds.has(s.id)}
                        inert={collapsedStockIds.has(s.id)}
                      >
                        <div className="collapsible-region-inner">
                          <div className="stock-fields">
                            <label>
                              Stock name
                              <input
                                id={`stock-name-${s.id}`}
                                aria-label="Stock name"
                                value={s.name}
                                onChange={(e) =>
                                  updateStock(m.id, s.id, (x) => ({ ...x, name: e.target.value }))
                                }
                              />
                            </label>
                            <div className="number-field">
                              <label htmlFor={`number-stepper-stock-length-${s.id}`}>
                                {m.type === 'sheet' ? 'Sheet length' : 'Length'} (
                                {project.unitSystem === 'imperial' ? 'in' : 'mm'})
                              </label>
                              <NumberStepper
                                {...dimensionProps(
                                  `stock-length-${s.id}`,
                                  s.length.um,
                                  (um) => updateStock(m.id, s.id, (x) => ({ ...x, length: { um } })),
                                  'Stock length',
                                )}
                              />
                            </div>
                            {m.type === 'sheet' && (
                              <div className="number-field">
                                <label htmlFor={`number-stepper-stock-width-${s.id}`}>
                                  Sheet width ({project.unitSystem === 'imperial' ? 'in' : 'mm'})
                                </label>
                                <NumberStepper
                                  {...dimensionProps(
                                    `stock-width-${s.id}`,
                                    s.widthUm ?? 0,
                                    (um) => updateStock(m.id, s.id, (x) => ({ ...x, widthUm: um })),
                                    'Stock width',
                                  )}
                                />
                              </div>
                            )}
                            {m.type === 'linear' && (
                              <>
                                <div className="number-field">
                                  <label htmlFor={`number-stepper-stock-width-${s.id}`}>
                                    Board width ({project.unitSystem === 'imperial' ? 'in' : 'mm'})
                                  </label>
                                  <NumberStepper
                                    {...dimensionProps(
                                      `stock-width-${s.id}`,
                                      s.widthUm ?? 0,
                                      (um) => updateStock(m.id, s.id, (x) => ({ ...x, widthUm: um })),
                                      'Stock width',
                                    )}
                                  />
                                </div>
                                <div className="number-field">
                                  <label htmlFor={`number-stepper-stock-thickness-${s.id}`}>
                                    Thickness ({project.unitSystem === 'imperial' ? 'in' : 'mm'})
                                  </label>
                                  <NumberStepper
                                    {...dimensionProps(
                                      `stock-thickness-${s.id}`,
                                      s.thicknessUm ?? 0,
                                      (um) => updateStock(m.id, s.id, (x) => ({ ...x, thicknessUm: um })),
                                      'Stock thickness',
                                    )}
                                  />
                                </div>
                              </>
                            )}
                            <label>
                              Price basis
                              <Select
                                aria-label="Stock price basis"
                                value={s.priceBasis ?? 'piece'}
                                onValueChange={(value) =>
                                  updateStock(m.id, s.id, (x) => ({
                                    ...x,
                                    priceBasis: value as StockOption['priceBasis'],
                                  }))
                                }
                                disabled={m.type === 'sheet'}
                                options={[
                                  { value: 'board-foot', label: 'Per board foot' },
                                  { value: 'piece', label: 'Per stock piece' },
                                ]}
                              />
                            </label>
                            <div className="number-field">
                              <label htmlFor={`number-stepper-stock-price-${s.id}`}>
                                Manual price ($) · enter unless owned
                              </label>
                              <NumberStepper
                                id={`number-stepper-stock-price-${s.id}`}
                                aria-label="Stock price"
                                aria-required="true"
                                placeholder="Required for purchase"
                                type="number"
                                min="0"
                                step="0.01"
                                value={s.price ? (s.price.cents / 100).toFixed(2) : ''}
                                onChange={(e) =>
                                  updateStock(m.id, s.id, (x) => ({
                                    ...x,
                                    price:
                                      e.target.value === ''
                                        ? undefined
                                        : { cents: Math.max(0, Math.round(Number(e.target.value) * 100)) },
                                  }))
                                }
                                onStep={(steps) =>
                                  updateStock(m.id, s.id, (x) => ({
                                    ...x,
                                    price: { cents: Math.max(0, (x.price?.cents ?? 0) + steps) },
                                  }))
                                }
                              />
                            </div>
                            <div className="number-field">
                              <label htmlFor={`number-stepper-owned-${s.id}`}>Owned quantity</label>
                              <NumberStepper
                                id={`number-stepper-owned-${s.id}`}
                                aria-label="Owned stock quantity"
                                type="number"
                                min="0"
                                value={s.ownedQuantity}
                                onChange={(e) =>
                                  updateStock(m.id, s.id, (x) => ({
                                    ...x,
                                    ownedQuantity: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                  }))
                                }
                                onStep={(steps) =>
                                  updateStock(m.id, s.id, (x) => ({
                                    ...x,
                                    ownedQuantity: Math.max(0, x.ownedQuantity + steps),
                                  }))
                                }
                              />
                            </div>
                            <div className="number-field">
                              <label htmlFor={`number-stepper-limit-${s.id}`}>Purchase limit</label>
                              <NumberStepper
                                id={`number-stepper-limit-${s.id}`}
                                aria-label="Stock purchase limit"
                                type="number"
                                min="0"
                                value={s.quantityLimit ?? ''}
                                placeholder="No limit"
                                onChange={(e) =>
                                  updateStock(m.id, s.id, (x) => ({
                                    ...x,
                                    quantityLimit:
                                      e.target.value === ''
                                        ? undefined
                                        : Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                  }))
                                }
                                onStep={(steps) =>
                                  updateStock(m.id, s.id, (x) => ({
                                    ...x,
                                    quantityLimit: Math.max(0, (x.quantityLimit ?? 0) + steps),
                                  }))
                                }
                              />
                            </div>
                          </div>
                          {(!s.price || s.price.cents === 0) && (
                            <small className="field-help">
                              No purchase price entered. This stock can be planned only from owned quantity
                              until a positive manual price is entered.
                            </small>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  id={`add-stock-${m.id}`}
                  className="secondary compact add-stock-option"
                  onClick={() => setStockFormMaterialId((current) => (current === m.id ? null : m.id))}
                >
                  ＋ Add stock option
                </button>
                {stockFormMaterialId === m.id && (
                  <StockCreationForm
                    mode="stock"
                    unitSystem={project.unitSystem}
                    fixedKind={m.type}
                    onCancel={() => setStockFormMaterialId(null)}
                    onCreate={(stock) => {
                      updateMaterial(m.id, (x) => ({ ...x, stocks: [...x.stocks, stock] }));
                      setStockFormMaterialId(null);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
      {!project.materials.length && (
        <p className="muted">Prices are entered and maintained by you. No store lookup is used.</p>
      )}
    </section>
  );
}
