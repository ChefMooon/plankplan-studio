import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { MoveAxis } from './move-gesture';
import type { ToolMeasurementSession } from './tool-measurements';

export function useDesignToolSession() {
  const [activeTool, setActiveTool] = useState('select');
  const [numeric, setNumeric] = useState('');
  const [measurement, setMeasurement] = useState<number>();
  const [toolMeasurement, setToolMeasurementState] = useState<ToolMeasurementSession>();
  const [moveConstraint, setMoveConstraint] = useState<MoveAxis | null>();
  const [moveShiftHeld, setMoveShiftHeld] = useState(false);
  const measurementActionsRef = useRef<{ commit: () => void; cancel: () => void } | undefined>(undefined);

  // Stable identity: the 3D scene uses this callback in effect and memo dependencies.
  const setToolMeasurement = useCallback<Dispatch<SetStateAction<ToolMeasurementSession | undefined>>>(value => {
    if (value === undefined) { setMoveConstraint(undefined); setMoveShiftHeld(false); }
    setToolMeasurementState(value);
  }, []);

  const cancelMeasurement = useCallback(() => {
    measurementActionsRef.current?.cancel();
    setToolMeasurement(undefined);
    setMeasurement(undefined);
    setNumeric('');
  }, [setToolMeasurement]);

  const activateTool = useCallback((tool: string) => {
    cancelMeasurement();
    setActiveTool(tool);
  }, [cancelMeasurement]);

  return { activeTool, setActiveTool, numeric, setNumeric, measurement, setMeasurement, toolMeasurement, setToolMeasurement, moveConstraint, setMoveConstraint, moveShiftHeld, setMoveShiftHeld, measurementActionsRef, cancelMeasurement, activateTool };
}
