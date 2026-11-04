import { useState } from 'react';
import type { Project } from '@/lib/planner/model';
import type { DesignCommand } from '@/lib/planner/design/commands';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';

export function DesignCutlistAssignment({ project, selectedInstanceIds, targetCutlistId, onTargetChange, onAssign, onCreateCutlist, onSaveGroup }: {
  project: Project;
  selectedInstanceIds: string[];
  targetCutlistId: string;
  onTargetChange: (id: string) => void;
  onAssign: (command: Extract<DesignCommand, { type: 'assign-instances-to-cutlist' }>) => void;
  onCreateCutlist: (name: string, scope: 'selection' | 'all' | 'group', mode: 'copy' | 'move' | 'skip', instanceIds?: string[], modeByInstance?: Record<string, 'copy' | 'move' | 'skip'>) => void;
  onSaveGroup: (name: string, instanceIds: string[]) => string | undefined;
}) {
  const [mode, setMode] = useState<'copy' | 'move' | 'skip'>('copy');
  const [modeByInstance, setModeByInstance] = useState<Record<string, 'copy' | 'move' | 'skip'>>({});
  const [name, setName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const instances = project.design?.instances ?? [];
  const selection = instances.filter(instance => selectedInstanceIds.includes(instance.id)).map(instance => instance.id);
  const sourceRowsToReview = (ids: string[]) => Object.entries(project.design?.partLinks ?? {}).filter(([partId, link]) => {
    const listId = link.cutlistId ?? project.parts.find(part => part.id === partId)?.cutlistId ?? project.cutlists[0]?.id;
    return listId !== targetCutlistId && [...(link.current?.instanceIds ?? []), ...link.lastApplied.sources.instanceIds].some(id => ids.includes(id));
  }).length;
  const moving = (id: string) => (modeByInstance[id] ?? mode) === 'move';
  const selectedSourceRows = sourceRowsToReview(selection.filter(moving));
  const allSourceRows = sourceRowsToReview(instances.map(instance => instance.id).filter(moving));
  const groups = project.design?.groups ?? [];
  const selectedGroup = groups.find(group => group.id === selectedGroupId);
  const run = (all: boolean) => { const ids = all ? instances.map(instance => instance.id) : selection; onAssign({ type: 'assign-instances-to-cutlist', ...(all ? { all: true } : { instanceIds: ids }), cutlistId: targetCutlistId, mode, modeByInstance: Object.fromEntries(ids.map(id => [id, modeByInstance[id] ?? mode])) }); };
  return <section className="design-cutlist-assignment" aria-label="Assign components to a cutlist">
    <label htmlFor="design-target-cutlist">Target cutlist</label>
    <Select id="design-target-cutlist" aria-label="Target cutlist" value={targetCutlistId} onValueChange={onTargetChange} options={project.cutlists.map(list => ({ value: list.id, label: list.name }))} />
    <span className="design-assignment-label">How components are included</span>
    <SegmentedControl<'copy' | 'move' | 'skip'> aria-label="Cutlist assignment mode" value={mode} onValueChange={setMode} options={[
      { value: 'copy', label: 'Copy' }, { value: 'move', label: 'Move' }, { value: 'skip', label: 'Skip assigned' },
    ]} />
    <p className="design-empty-hint">Copy includes a component in another list. Move changes its list membership, with existing linked rows left for review in their source lists. Skip leaves components already assigned to any list unchanged and includes only unassigned components.</p>
    <details className="design-assignment-review">
      <summary>Review each component’s list assignment ({instances.length})</summary>
      <ul aria-label="Component list assignments">{instances.map(instance => {
        const memberships = instance.projectionCutlistIds ?? (instance.projectionExcluded ? [] : [project.cutlists[0]?.id].filter((id): id is string => !!id));
        const labels = memberships.map(id => project.cutlists.find(list => list.id === id)?.name ?? id);
        const label = instance.name ?? project.design?.definitions.find(definition => definition.id === instance.definitionId)?.name ?? 'Component';
        return <li key={instance.id}><span>{label} <small>{labels.length ? `In: ${labels.join(', ')}` : 'Unassigned'}</small></span>
          <label htmlFor={`assignment-mode-${instance.id}`}>Assignment for {label}</label>
          <Select id={`assignment-mode-${instance.id}`} aria-label={`Assignment for ${label}`} value={modeByInstance[instance.id] ?? mode} onValueChange={value => setModeByInstance(current => ({...current,[instance.id]:value as 'copy'|'move'|'skip'}))} options={[{value:'copy',label:'Copy'},{value:'move',label:'Move'},{value:'skip',label:'Skip if assigned; include if unassigned'}]} />
        </li>;
      })}</ul>
    </details>
    {(selectedSourceRows > 0 || allSourceRows > 0) && <p className="warning" role="status">Per-component Move choices affect {selectedSourceRows} linked source row(s) in the selection and {allSourceRows} when applied to all components. Source rows stay in their lists until reviewed separately.</p>}
    <button type="button" className="secondary compact" onClick={() => run(false)} disabled={!selection.length || !targetCutlistId}>Apply choices to selected ({selection.length})</button>
    <button type="button" className="secondary compact" onClick={() => run(true)} disabled={!instances.length || !targetCutlistId}>Apply choices to all components ({instances.length})</button>
    <form className="design-create-cutlist-from-model" onSubmit={event => { event.preventDefault(); if (name.trim() && selection.length) { onCreateCutlist(name.trim(), 'selection', mode, undefined, Object.fromEntries(selection.map(id => [id, modeByInstance[id] ?? mode]))); setName(''); } }}>
      <label htmlFor="design-new-cutlist-name">Create cutlist from modeled components</label>
      <input id="design-new-cutlist-name" value={name} maxLength={256} onChange={event => setName(event.target.value)} placeholder="e.g. Cabinet doors" />
      <button type="submit" className="secondary compact" disabled={!name.trim() || !selection.length}>Create from selected ({selection.length})</button>
      <button type="button" className="secondary compact" onClick={() => { if (name.trim()) { onCreateCutlist(name.trim(), 'all', mode, undefined, Object.fromEntries(instances.map(item => [item.id, modeByInstance[item.id] ?? mode]))); setName(''); } }} disabled={!name.trim() || !instances.length}>Create from all ({instances.length})</button>
      <label htmlFor="design-group-name">Save current selection as a group snapshot</label>
      <input id="design-group-name" value={groupName} maxLength={256} onChange={event => setGroupName(event.target.value)} placeholder="e.g. Door fronts" />
      <button type="button" className="secondary compact" onClick={() => { const id = onSaveGroup(groupName.trim(), selection); if (id) { setSelectedGroupId(id); setGroupName(''); } }} disabled={!groupName.trim() || !selection.length}>Save selected group ({selection.length})</button>
      <label htmlFor="design-group-select">Design group snapshot</label>
      <Select id="design-group-select" aria-label="Design group snapshot" value={selectedGroupId} onValueChange={setSelectedGroupId} options={[{value:'',label:'Choose a saved group'},...groups.map(group => ({value:group.id,label:`${group.name} (${group.instanceIds.length})`}))]} />
      <button type="button" className="secondary compact" onClick={() => { if (name.trim() && selectedGroup?.instanceIds.length) { onCreateCutlist(name.trim(), 'group', mode, selectedGroup.instanceIds, Object.fromEntries(selectedGroup.instanceIds.map(id => [id, modeByInstance[id] ?? mode]))); setName(''); } }} disabled={!name.trim() || !selectedGroup?.instanceIds.length}>Create from group snapshot ({selectedGroup?.instanceIds.length ?? 0})</button>
    </form>
  </section>;
}
