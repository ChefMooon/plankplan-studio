import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import type { DesignCommand } from '@/lib/planner/design/commands';
import type { DesignDocumentV1 } from '@/lib/planner/design/schema';
import type { UnitSystem } from '@/lib/planner/model';
import { AnnotationOverlay } from './AnnotationOverlay';
import { AnnotationPlacement, type TextToolState } from './AnnotationPlacement';

export type AnnotationSceneProps = {
  visible: boolean;
  selectedAnnotationId?: string;
  onSelectAnnotation: (id?: string) => void;
  onCommand: (command: DesignCommand) => void;
  onHint: (message: string) => void;
};

type LayerProps = AnnotationSceneProps & { design?: DesignDocumentV1; unitSystem: UnitSystem; activeTool: string; editingDefinitionId?: string };

export function AnnotationLayer(props: LayerProps) {
  return <AnnotationLayerContent key={props.activeTool} {...props} />;
}

function AnnotationLayerContent(props: LayerProps) {
  const { gl } = useThree();
  const { onHint, onSelectAnnotation } = props;
  const [textState, setTextState] = useState<TextToolState>({ step: 'idle' });
  useEffect(() => {
    if (props.activeTool !== 'select' || !props.selectedAnnotationId) return;
    const clearSelection = () => onSelectAnnotation(undefined);
    gl.domElement.addEventListener('pointerdown', clearSelection);
    return () => gl.domElement.removeEventListener('pointerdown', clearSelection);
  }, [gl, props.activeTool, props.selectedAnnotationId, onSelectAnnotation]);
  useEffect(() => {
    if (props.editingDefinitionId && (props.activeTool === 'text' || props.activeTool === 'dimensions')) onHint('Exit component editing to annotate');
  }, [props.activeTool, props.editingDefinitionId, onHint]);
  if (!props.visible || props.editingDefinitionId) return null;
  return <>
    {(props.activeTool === 'text' || props.activeTool === 'dimensions') && <AnnotationPlacement {...props} design={props.design} activeTool={props.activeTool} textState={textState} setTextState={setTextState} />}
    <AnnotationOverlay {...props} design={props.design} unitSystem={props.unitSystem} activeTool={props.activeTool} selectedAnnotationId={props.selectedAnnotationId} textState={textState} setTextState={setTextState} />
  </>;
}
