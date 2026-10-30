import type { Project } from '@/lib/planner/model';
import type { Dispatch, SetStateAction } from 'react';
import { Select } from '@/components/ui/select';
import { NumberStepper } from '@/components/ui/number-stepper';
import { insertEditorCopy, withEditorOrder } from '@/lib/planner/editor-order';
import type { SharedEditorProps } from './editorTypes';
import { PartTypeField, PartLumberField, PartCustomSize } from './PartSizeSettings';
import { PartDisclosure } from './PartDisclosure';
import { partKind } from '@/lib/planner/part-stock';

interface PartsEditorProps extends SharedEditorProps {
  projectSettingsExpanded: boolean;
  toggleProjectSettings: () => void;
  newPartMaterialId: string;
  setNewPartMaterialId: Dispatch<SetStateAction<string>>;
  stockOptions: { value: string; label: string }[];
  addPart: () => void;
  settingsTab: 'cutting' | 'currency';
  setSettingsTab: Dispatch<SetStateAction<'cutting' | 'currency'>>;
  setDimensionDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  orderedParts: SharedEditorProps['project']['parts'];
  orderAnnouncement: string;
}

export function PartsEditor({
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
  projectSettingsExpanded,
  toggleProjectSettings,
  newPartMaterialId,
  setNewPartMaterialId,
  stockOptions,
  addPart,
  settingsTab,
  setSettingsTab,
  setDimensionDrafts,
  orderedParts,
  orderAnnouncement,
}: PartsEditorProps) {
  return (
    <section className="panel parts-editor-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">01 · PARTS</p>
          <h2>What are you making?</h2>
        </div>
        <div className="parts-panel-actions">
          <button
            className="secondary compact settings-toggle"
            type="button"
            aria-expanded={projectSettingsExpanded}
            aria-controls="project-settings"
            onClick={toggleProjectSettings}
          >
            <span className="stable-toggle-label" data-width-label="Show settings">
              {projectSettingsExpanded ? 'Hide settings' : 'Show settings'}
            </span>
          </button>
          <div className="parts-add-controls">
            <Select
              aria-label="Stock for new parts"
              value={
                project.materials.some((material) =>
                  material.stocks.some((stock) => stock.id === newPartMaterialId),
                )
                  ? newPartMaterialId
                  : ''
              }
              onValueChange={setNewPartMaterialId}
              options={stockOptions}
            />
            <button id="add-part" className="primary compact" onClick={addPart}>
              ＋ Add part
            </button>
          </div>
        </div>
      </div>
      <div
        className={`project-settings ${projectSettingsExpanded ? 'expanded' : 'collapsed'}`}
        id="project-settings"
        aria-hidden={!projectSettingsExpanded}
        inert={!projectSettingsExpanded}
      >
        <div className="project-settings-content">
          <div
            className="settings-tabs"
            role="tablist"
            aria-label="Project settings"
            onKeyDown={(event) => {
              if (
                event.key !== 'ArrowLeft' &&
                event.key !== 'ArrowRight' &&
                event.key !== 'Home' &&
                event.key !== 'End'
              )
                return;
              event.preventDefault();
              const nextTab =
                event.key === 'Home'
                  ? 'cutting'
                  : event.key === 'End'
                    ? 'currency'
                    : settingsTab === 'cutting'
                      ? 'currency'
                      : 'cutting';
              setSettingsTab(nextTab);
              event.currentTarget
                .querySelector<HTMLButtonElement>(`[data-settings-tab="${nextTab}"]`)
                ?.focus();
            }}
          >
            <button
              id="settings-tab-cutting"
              data-settings-tab="cutting"
              type="button"
              role="tab"
              tabIndex={settingsTab === 'cutting' ? 0 : -1}
              aria-selected={settingsTab === 'cutting'}
              aria-controls="project-settings-panel"
              className={settingsTab === 'cutting' ? 'settings-tab active' : 'settings-tab'}
              onClick={() => setSettingsTab('cutting')}
            >
              Cutting
            </button>
            <button
              id="settings-tab-currency"
              data-settings-tab="currency"
              type="button"
              role="tab"
              tabIndex={settingsTab === 'currency' ? 0 : -1}
              aria-selected={settingsTab === 'currency'}
              aria-controls="project-settings-panel"
              className={settingsTab === 'currency' ? 'settings-tab active' : 'settings-tab'}
              onClick={() => setSettingsTab('currency')}
            >
              Currency &amp; tax
            </button>
          </div>
          <div
            id="project-settings-panel"
            role="tabpanel"
            aria-labelledby={settingsTab === 'cutting' ? 'settings-tab-cutting' : 'settings-tab-currency'}
            tabIndex={0}
          >
            <div className="settings-panel-layout">
              <div
                className="units-row"
                aria-hidden={settingsTab !== 'cutting'}
                inert={settingsTab !== 'cutting'}
              >
                <label>
                  Units
                  <Select
                    aria-label="Units"
                    value={project.unitSystem}
                    onValueChange={(value) => {
                      setDimensionDrafts({});
                      update({ ...project, unitSystem: value as Project['unitSystem'] });
                    }}
                    options={[
                      { value: 'imperial', label: 'Imperial · inches' },
                      { value: 'metric', label: 'Metric · mm' },
                    ]}
                  />
                </label>
                <div className="number-field">
                  <label htmlFor="number-stepper-kerf">Kerf</label>
                  <NumberStepper
                    {...dimensionProps(
                      'kerf',
                      project.kerf.um,
                      (um) => update({ ...project, kerf: { um } }),
                      'Kerf',
                    )}
                  />
                </div>
                <div className="number-field">
                  <label htmlFor="number-stepper-trim">End trim</label>
                  <NumberStepper
                    {...dimensionProps(
                      'trim',
                      project.trim.um,
                      (um) => update({ ...project, trim: { um } }),
                      'End trim',
                    )}
                  />
                </div>
                <div className="number-field">
                  <label htmlFor="number-stepper-minOffcut">
                    Minimum usable offcut ({project.unitSystem === 'imperial' ? 'in' : 'mm'})
                  </label>
                  <NumberStepper
                    min="0"
                    {...dimensionProps(
                      'minOffcut',
                      project.minOffcutLinear.um,
                      (um) => update({ ...project, minOffcutLinear: { um } }),
                      'Minimum usable offcut',
                    )}
                  />
                </div>
              </div>
              <div
                className="units-row currency-row"
                aria-hidden={settingsTab !== 'currency'}
                inert={settingsTab !== 'currency'}
              >
                <label>
                  Currency
                  <Select
                    aria-label="Project currency"
                    value={project.currency}
                    onValueChange={(value) => update({ ...project, currency: value as Project['currency'] })}
                    options={[
                      { value: 'CAD', label: 'CAD · Canadian dollar' },
                      { value: 'USD', label: 'USD · US dollar' },
                      { value: 'EUR', label: 'EUR · Euro' },
                      { value: 'GBP', label: 'GBP · Pound sterling' },
                    ]}
                  />
                </label>
                <div className="number-field">
                  <label htmlFor="number-stepper-taxRate">Tax (%)</label>
                  <NumberStepper
                    id="number-stepper-taxRate"
                    aria-label="Tax rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={project.taxRate ?? ''}
                    placeholder="None"
                    onChange={(e) =>
                      update({
                        ...project,
                        taxRate:
                          e.target.value === ''
                            ? undefined
                            : Math.min(100, Math.max(0, Number(e.target.value))),
                      })
                    }
                    onStep={(steps) =>
                      update({
                        ...project,
                        taxRate: Math.min(
                          100,
                          Math.max(0, Math.round(((project.taxRate ?? 0) + steps * 0.01) * 100) / 100),
                        ),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {orderedParts.length ? (
        <div className="parts-list">
          {orderedParts.map((part, partIndex) => {
            const sheetPart = partKind(part, project) === 'sheet';
            return (
              <div className="part-row reorderable-row" key={part.id} {...dropProps('parts', part.id)}>
                <PartDisclosure
                  partId={part.id}
                  partName={part.name}
                  sheetPart={sheetPart}
                  handle={dragHandle('parts', part.id, part.name)}
                  identity={
                    <>
                      <label className="part-name-field">
                        Part name
                        <input
                          id={`part-name-${part.id}`}
                          aria-label="Part name"
                          value={part.name}
                          onChange={(e) =>
                            update({
                              ...project,
                              parts: project.parts.map((p) =>
                                p.id === part.id ? { ...p, name: e.target.value } : p,
                              ),
                            })
                          }
                        />
                      </label>
                      <PartTypeField
                        part={part}
                        project={project}
                        onChange={(next) =>
                          update({
                            ...project,
                            parts: project.parts.map((item) => (item.id === part.id ? next : item)),
                          })
                        }
                      />
                    </>
                  }
                  dimensions={
                    <>
                      <PartLumberField
                        part={part}
                        project={project}
                        onChange={(next) =>
                          update({
                            ...project,
                            parts: project.parts.map((item) => (item.id === part.id ? next : item)),
                          })
                        }
                      />
                      <div className="number-field part-length-field">
                        <label htmlFor={`number-stepper-part-${part.id}`}>
                          Length ({project.unitSystem === 'imperial' ? 'in' : 'mm'})
                        </label>
                        <NumberStepper
                          {...dimensionProps(
                            `part-${part.id}`,
                            part.length.um,
                            (um) =>
                              update({
                                ...project,
                                parts: project.parts.map((p) =>
                                  p.id === part.id ? { ...p, length: { um } } : p,
                                ),
                              }),
                            'Part length',
                          )}
                        />
                      </div>
                      <div
                        className={`part-optional-width ${sheetPart ? 'is-visible' : ''}`}
                        inert={!sheetPart}
                        aria-hidden={!sheetPart}
                      >
                        <div className="number-field">
                          <label htmlFor={`number-stepper-part-width-${part.id}`}>
                            Width ({project.unitSystem === 'imperial' ? 'in' : 'mm'})
                          </label>
                          <NumberStepper
                            {...dimensionProps(
                              `part-width-${part.id}`,
                              part.width?.um ?? 0,
                              (um) =>
                                update({
                                  ...project,
                                  parts: project.parts.map((p) =>
                                    p.id === part.id ? { ...p, width: { um } } : p,
                                  ),
                                }),
                              'Part width',
                            )}
                          />
                        </div>
                      </div>
                    </>
                  }
                  quantity={
                    <div className="number-field part-quantity-field">
                      <label htmlFor={`number-stepper-part-quantity-${part.id}`}>Qty</label>
                      <NumberStepper
                        id={`number-stepper-part-quantity-${part.id}`}
                        aria-label="Part quantity"
                        type="number"
                        min="1"
                        value={part.quantity}
                        onChange={(e) =>
                          update({
                            ...project,
                            parts: project.parts.map((p) =>
                              p.id === part.id
                                ? { ...p, quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) }
                                : p,
                            ),
                          })
                        }
                        onStep={(steps) =>
                          update({
                            ...project,
                            parts: project.parts.map((p) =>
                              p.id === part.id ? { ...p, quantity: Math.max(1, part.quantity + steps) } : p,
                            ),
                          })
                        }
                      />
                    </div>
                  }
                  details={
                    <>
                      {partKind(part, project) === 'linear' && part.lumberPreset === 'custom' && (
                        <PartCustomSize
                          part={part}
                          project={project}
                          onChange={(next) =>
                            update({
                              ...project,
                              parts: project.parts.map((item) => (item.id === part.id ? next : item)),
                            })
                          }
                        />
                      )}
                      <label>
                        Group
                        <input
                          aria-label="Part group"
                          value={part.group ?? ''}
                          onChange={(e) =>
                            update({
                              ...project,
                              parts: project.parts.map((p) =>
                                p.id === part.id ? { ...p, group: e.target.value || undefined } : p,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        Stock option
                        <Select
                          aria-label="Part stock option"
                          value={
                            part.stockId ??
                            (part.kind === undefined && part.materialId ? `legacy:${part.materialId}` : '')
                          }
                          onValueChange={(value) => {
                            if (value.startsWith('legacy:')) return;
                            const material = project.materials.find((item) =>
                              item.stocks.some((stock) => stock.id === value),
                            );
                            const stock = material?.stocks.find((item) => item.id === value);
                            update({
                              ...project,
                              parts: project.parts.map((item) =>
                                item.id === part.id
                                  ? {
                                      ...item,
                                      kind: partKind(part, project),
                                      materialId: material?.id ?? '',
                                      stockId: value || undefined,
                                      ...(!item.crossSection &&
                                      material?.type === 'linear' &&
                                      stock?.widthUm &&
                                      stock.thicknessUm
                                        ? {
                                            crossSection: {
                                              width: { um: stock.widthUm },
                                              thickness: { um: stock.thicknessUm },
                                            },
                                          }
                                        : {}),
                                    }
                                  : item,
                              ),
                            });
                          }}
                          options={[
                            ...(part.kind === undefined && part.materialId
                              ? [
                                  {
                                    value: `legacy:${part.materialId}`,
                                    label: `${project.materials.find((material) => material.id === part.materialId)?.name ?? 'Material'} · any stock (existing)`,
                                  },
                                ]
                              : []),
                            ...stockOptions.filter(
                              (option) =>
                                !option.value ||
                                project.materials.some(
                                  (material) =>
                                    material.type === partKind(part, project) &&
                                    material.stocks.some(
                                      (stock) =>
                                        stock.id === option.value &&
                                        (!part.crossSection ||
                                          material.type === 'sheet' ||
                                          (stock.widthUm === part.crossSection.width.um &&
                                            stock.thicknessUm === part.crossSection.thickness.um)),
                                    ),
                                ),
                            ),
                          ]}
                        />
                      </label>
                      <label
                        className={`grain-lock part-optional-grain ${sheetPart ? 'is-visible' : ''}`}
                        inert={!sheetPart}
                        aria-hidden={!sheetPart}
                      >
                        <input
                          aria-label={`Grain locked ${part.name}`}
                          type="checkbox"
                          checked={part.grainLocked ?? false}
                          onChange={(e) =>
                            update({
                              ...project,
                              parts: project.parts.map((p) =>
                                p.id === part.id ? { ...p, grainLocked: e.target.checked } : p,
                              ),
                            })
                          }
                        />{' '}
                        Grain locked
                      </label>
                      <label>
                        Notes
                        <input
                          aria-label="Part notes"
                          value={part.notes ?? ''}
                          onChange={(e) =>
                            update({
                              ...project,
                              parts: project.parts.map((p) =>
                                p.id === part.id ? { ...p, notes: e.target.value || undefined } : p,
                              ),
                            })
                          }
                        />
                      </label>
                    </>
                  }
                  actions={quickActions('part', part.name, part.id, partIndex, orderedParts.length, {
                    move: (direction) => {
                      moveItem('parts', part.id, direction);
                      announceMove(part.name, direction);
                    },
                    duplicate: () => {
                      const id = crypto.randomUUID();
                      const copy = { ...part, id, name: `${part.name} copy` };
                      const ids = insertEditorCopy(
                        orderedParts.map((item) => item.id),
                        part.id,
                        id,
                      );
                      update({
                        ...project,
                        parts: [...project.parts, copy],
                        editorOrder: withEditorOrder(project.editorOrder, { parts: ids }),
                      });
                      setOrderAnnouncement(`${copy.name} duplicated.`);
                      window.setTimeout(() => document.getElementById(`part-name-${id}`)?.focus(), 0);
                    },
                    remove: () => {
                      deletionTriggerId.current = `part-actions-${part.id}`;
                      setPendingDeletion({ kind: 'part', id: part.id });
                    },
                  })}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">Add parts to start planning your cuts.</p>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {orderAnnouncement}
      </div>
    </section>
  );
}
