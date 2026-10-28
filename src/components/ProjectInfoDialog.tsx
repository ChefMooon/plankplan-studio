import { Dialog } from 'radix-ui';
import type { Project } from '@/lib/planner/model';
import { Select } from '@/components/ui/select';
import { ProjectCardPreview } from '@/components/ProjectCardPreview';

export type ProjectInfoDraft = Pick<Project, 'name' | 'unitSystem' | 'previewView'> & { notes: string };

export function ProjectInfoDialog({ open, onOpenChange, project, draft, onDraftChange, error, saving = false, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  draft: ProjectInfoDraft;
  onDraftChange: (draft: ProjectInfoDraft) => void;
  error: string;
  saving?: boolean;
  onSave: () => void;
}) {
  return <Dialog.Root open={open} onOpenChange={nextOpen => { if (!nextOpen && saving) return; onOpenChange(nextOpen); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="project-info-overlay" />
      <Dialog.Content className="project-info-dialog" onOpenAutoFocus={event => { event.preventDefault(); document.getElementById('project-info-name')?.focus(); }}>
        <Dialog.Title className="project-info-title">Project Info</Dialog.Title>
        <Dialog.Description className="project-info-description">Edit project details and the units used throughout Design and Cutlist. Existing dimensions keep their physical size.</Dialog.Description>
        <label htmlFor="project-info-name">Project name</label>
        <input id="project-info-name" maxLength={256} value={draft.name} onChange={event => onDraftChange({ ...draft, name: event.target.value })} />
        <label htmlFor="project-info-notes">Notes</label>
        <textarea id="project-info-notes" maxLength={16384} value={draft.notes} onChange={event => onDraftChange({ ...draft, notes: event.target.value })} />
        <label>Units<Select aria-label="Project units" value={draft.unitSystem} onValueChange={value => onDraftChange({ ...draft, unitSystem: value as Project['unitSystem'] })} options={[{ value: 'imperial', label: 'Imperial · inches' }, { value: 'metric', label: 'Metric · mm' }]} /></label>
        <label>Dashboard preview<Select aria-label="Dashboard preview" value={draft.previewView ?? 'auto'} onValueChange={value => onDraftChange({ ...draft, previewView: value as NonNullable<Project['previewView']> })} options={[{ value: 'auto', label: 'Automatic' }, ...(project.parts.length || draft.previewView === 'cutlist' ? [{ value: 'cutlist', label: 'Cutlist' }] : []), { value: 'iso', label: 'Isometric' }, { value: 'top', label: 'Top' }, { value: 'front', label: 'Front' }, { value: 'right', label: 'Right' }]} /></label>
        <div className="project-info-preview"><span>Preview</span><div className="project-thumb"><ProjectCardPreview project={{ ...project, previewView: draft.previewView ?? 'auto' }} /></div></div>
        {error && <p className="warning" role="alert">{error}</p>}
        <div className="project-info-actions">
          <button type="button" className="secondary compact" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</button>
          <button type="button" className="primary compact" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
