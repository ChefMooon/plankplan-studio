import type { ComponentProps, Dispatch, DragEvent, ReactNode, RefObject, SetStateAction } from 'react';
import type { Project } from '@/lib/planner/model';
import type { NumberStepper } from '@/components/ui/number-stepper';
import type { QuickActionCallbacks } from './QuickActions';

export type EditorKind = 'parts' | 'materials' | 'stocks';
export interface SharedEditorProps {
  project: Project;
  update: (project: Project) => void;
  dimensionProps: (
    key: string,
    um: number,
    setter: (um: number) => void,
    label: string,
  ) => ComponentProps<typeof NumberStepper>;
  dropProps: (
    kind: EditorKind,
    id: string,
    materialId?: string,
  ) => {
    onDragOver: (event: DragEvent<HTMLDivElement>) => void;
    onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
    onDrop: (event: DragEvent<HTMLDivElement>) => void;
  };
  dragHandle: (kind: EditorKind, id: string, label: string, materialId?: string) => ReactNode;
  quickActions: (
    kind: 'part' | 'material' | 'stock',
    label: string,
    id: string,
    position: number,
    count: number,
    actions: QuickActionCallbacks,
  ) => ReactNode;
  moveItem: (kind: EditorKind, id: string, direction: -1 | 1, materialId?: string) => void;
  announceMove: (name: string, direction: -1 | 1) => void;
  setOrderAnnouncement: Dispatch<SetStateAction<string>>;
  deletionTriggerId: RefObject<string | null>;
  setPendingDeletion: Dispatch<SetStateAction<{ kind: 'part' | 'material' | 'stock'; id: string } | null>>;
}
