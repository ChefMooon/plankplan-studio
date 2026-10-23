import { Component, useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { DesignDocumentV1 } from '@/lib/planner/design/schema';
import type { UnitSystem } from '@/lib/planner/model';
import type { DesignCommand } from '@/lib/planner/design/commands';
import type { AxisMode, PivotMode } from './transform-pivot';
import type { SubElement } from './sub-selection';
import { DesignScene } from './scene/DesignScene';
import type { ToolMeasurementSession } from './tool-measurements';

type Props = { design?: DesignDocumentV1; unitSystem: UnitSystem; selectedId?: string; selectedCount?:number; selectedElement?:{objectId:string}&SubElement; editingDefinitionId?: string; onSelect: (id?: string, additive?: boolean, subtractive?: boolean, shiftOnly?:boolean) => void; onSubSelect?:(objectId:string,element?:SubElement)=>void; onEnterDefinition:(id:string)=>void; activeTool: string; snap: boolean; exactUm?: number; pivotMode: PivotMode; axisMode: AxisMode; onCommand: (command: DesignCommand) => void; onMeasure: (value?: number) => void; onToolError:(message:string)=>void; preset: 'iso'|'top'|'front'|'right'; projection: 'perspective'|'orthographic'; grid: boolean; axes: boolean; frameRequest: number; toolMeasurement?: ToolMeasurementSession; onToolMeasurementChange:(session?:ToolMeasurementSession)=>void; onRegisterMeasurementActions:(actions?:{commit:()=>void;cancel:()=>void})=>void };

class RendererBoundary extends Component<{ children: ReactNode; projectId: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="design-renderer-fallback" role="alert"><strong>3D view unavailable</strong><span>This browser could not start the graphics view. The project and Cutlist remain available.</span><Link to="/projects/$projectId/cutlist" params={{ projectId: this.props.projectId }}>Open Cutlist</Link><button type="button" onClick={() => this.setState({ failed: false })}>Try again</button></div>;
    return this.props.children;
  }
}

export function DesignViewport(props: Props & { projectId: string }) {
  const [contextLost, setContextLost] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return <div className="design-viewport-canvas" role="region" aria-label="3D model viewport">
    {visible && <RendererBoundary key={props.projection} projectId={props.projectId}><DesignScene {...props} onContextLoss={() => setContextLost(true)} onContextRestore={() => setContextLost(false)} /></RendererBoundary>}
    {contextLost && <div className="design-canvas-alert" role="alert"><strong>3D view paused</strong><span>The graphics context was interrupted. Reload the view or continue in Cutlist.</span><button type="button" onClick={() => window.location.reload()}>Reload view</button></div>}
    {!visible && <p className="design-viewport-paused" role="status">3D rendering paused while this tab is hidden.</p>}
  </div>;
}
