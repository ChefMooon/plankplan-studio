import { useId, useState } from 'react';
import { Select } from '@/components/ui/select';
import type { PlanningSelection } from '@/lib/planner/planning-scope';
import type { Project } from '@/lib/planner/model';
import './planning-scope.css';

type Props = {
  project: Project;
  activeCutlistId: string;
  selection: PlanningSelection;
  onSelectionChange: (selection: PlanningSelection) => void;
  onSaveGroup: (name: string, cutlistIds: string[], groupId?: string) => void;
  onDeleteGroup: (groupId: string) => void;
};

export function PlanningScopeControls({ project, activeCutlistId, selection, onSelectionChange, onSaveGroup, onDeleteGroup }: Props) {
  const selectionIds = selection.kind === 'cutlist' ? [selection.cutlistId] : selection.kind === 'group' ? project.planningGroups.find(group => group.id === selection.groupId)?.cutlistIds ?? [] : selection.cutlistIds;
  const selectedGroup = selection.kind === 'group' ? project.planningGroups.find(group => group.id === selection.groupId) : undefined;
  const [groupName, setGroupName] = useState('');
  const storageKey = `plankplan-studio.planning-scope-expanded.v1.${project.id}`;
  const [expanded, setExpanded] = useState(() => {
    try { return window.localStorage.getItem(storageKey) !== 'false'; } catch { return true; }
  });
  const contentId = useId();
  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    try { window.localStorage.setItem(storageKey, String(next)); } catch { /* Keep the disclosure usable without storage. */ }
  };
  const scopeSummary = selection.kind === 'group' ? selectedGroup?.name ?? 'Saved group' : selection.kind === 'combined' ? `${selectionIds.length} cutlist${selectionIds.length === 1 ? '' : 's'} selected` : project.cutlists.find(list => list.id === selection.cutlistId)?.name ?? 'One cutlist';

  const changeKind = (kind: 'cutlist' | 'combined' | 'group') => {
    if (kind === 'cutlist') onSelectionChange({ kind, cutlistId: activeCutlistId || project.cutlists[0].id });
    else if (kind === 'combined') onSelectionChange({ kind, cutlistIds: selectionIds.length > 1 ? selectionIds : [activeCutlistId || project.cutlists[0].id] });
    else if (project.planningGroups[0]) onSelectionChange({ kind, groupId: project.planningGroups[0].id });
  };
  const toggleList = (id: string) => {
    const next = selectionIds.includes(id) ? selectionIds.filter(item => item !== id) : [...selectionIds, id];
    onSelectionChange({ kind: 'combined', cutlistIds: next });
  };
  const saveGroup = () => {
    const ids = selectionIds;
    if (!groupName.trim() || !ids.length) return;
    onSaveGroup(groupName, ids, selection.kind === 'group' ? selection.groupId : undefined);
  };

  return <section className="planning-scope" aria-labelledby="planning-scope-title">
    <div className="planning-scope-heading">
      <div><h2 id="planning-scope-title">Plan these cutlists</h2><p>{expanded ? 'Selected lists share the project’s stock and settings during optimization.' : scopeSummary}</p></div>
      <button type="button" className="secondary compact" aria-expanded={expanded} aria-controls={contentId} onClick={toggleExpanded}>{expanded ? 'Collapse' : 'Expand'}</button>
    </div>
    <div id={contentId} className={`collapsible-region planning-scope-content${expanded ? '' : ' is-collapsed'}`} aria-hidden={!expanded} inert={!expanded}>
      <div className="collapsible-region-inner planning-scope-inner">
    <div className="planning-scope-controls">
      <label className="planning-scope-mode">Planning scope
        <Select aria-label="Planning scope" value={selection.kind} onValueChange={value => changeKind(value as 'cutlist' | 'combined' | 'group')} options={[{ value: 'cutlist', label: 'One cutlist' }, { value: 'combined', label: 'Choose cutlists' }, ...(project.planningGroups.length ? [{ value: 'group', label: 'Saved group' }] : [])]} />
      </label>

    {selection.kind === 'cutlist' && <label className="planning-scope-single">Cutlist
      <Select aria-label="Cutlist" value={selection.cutlistId} onValueChange={value => onSelectionChange({ kind: 'cutlist', cutlistId: value })} options={project.cutlists.map(list => ({ value: list.id, label: list.name }))} />
    </label>}
    {selection.kind === 'combined' && <fieldset className="planning-scope-lists"><legend>Cutlists to optimize together</legend>
      {project.cutlists.map(list => <label key={list.id}><input type="checkbox" checked={selectionIds.includes(list.id)} onChange={() => toggleList(list.id)} />{list.name}</label>)}
      {!selectionIds.length && <span className="planning-scope-error" role="alert">Choose at least one cutlist.</span>}
    </fieldset>}
    {selection.kind === 'group' && <label className="planning-scope-single">Saved group
      <Select aria-label="Saved group" value={selection.groupId} onValueChange={value => onSelectionChange({ kind: 'group', groupId: value })} options={project.planningGroups.map(group => ({ value: group.id, label: group.name }))} />
    </label>}
    </div>
    {selection.kind === 'group' && selectedGroup && <SavedGroupEditor key={selectedGroup.id} group={selectedGroup} cutlists={project.cutlists} onSave={onSaveGroup} onDelete={onDeleteGroup} />}
    {selection.kind !== 'group' && <div className="planning-scope-save-row"><label>Save selection as a group<input value={groupName} maxLength={256} placeholder="e.g. Cabinet build" onChange={event => setGroupName(event.target.value)} /></label><button type="button" className="secondary compact" disabled={!groupName.trim() || !selectionIds.length} onClick={saveGroup}>Save group</button></div>}
      </div>
    </div>
  </section>;
}

function SavedGroupEditor({ group, cutlists, onSave, onDelete }: { group: Project['planningGroups'][number]; cutlists: Project['cutlists']; onSave: Props['onSaveGroup']; onDelete: Props['onDeleteGroup'] }) {
  const [groupName, setGroupName] = useState(group.name);
  const [groupCutlistIds, setGroupCutlistIds] = useState(group.cutlistIds);
  return <div className="planning-scope-saved">
      <fieldset className="planning-scope-lists"><legend>Cutlists in this group</legend>
        {cutlists.map(list => <label key={list.id}><input type="checkbox" checked={groupCutlistIds.includes(list.id)} onChange={() => setGroupCutlistIds(ids => ids.includes(list.id) ? ids.filter(id => id !== list.id) : [...ids, list.id])} />{list.name}</label>)}
        {!groupCutlistIds.length && <span className="planning-scope-error" role="alert">Choose at least one cutlist.</span>}
      </fieldset>
      <div className="planning-scope-save-row"><label>Group name<input value={groupName} maxLength={256} onChange={event => setGroupName(event.target.value)} /></label><button type="button" className="secondary compact" disabled={!groupName.trim() || !groupCutlistIds.length} onClick={() => onSave(groupName, groupCutlistIds, group.id)}>Save changes</button><button type="button" className="secondary compact" onClick={() => onDelete(group.id)}>Delete group</button></div>
    </div>;
}
