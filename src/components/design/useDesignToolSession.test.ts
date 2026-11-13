import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDesignToolSession } from './useDesignToolSession';

describe('useDesignToolSession', () => {
  it('cancels the current gesture and clears its values when switching tools', () => {
    const { result } = renderHook(() => useDesignToolSession());
    const cancel = vi.fn();
    const setter = result.current.setToolMeasurement;
    act(() => {
      result.current.measurementActionsRef.current = { commit: vi.fn(), cancel };
      result.current.setToolMeasurement({ id: 'move', tool: 'Move', fields: [], canPlace: true });
      result.current.setMoveConstraint('x');
      result.current.setMoveShiftHeld(true);
      result.current.setMeasurement(25);
      result.current.setNumeric('42');
    });
    act(() => result.current.activateTool('rectangle'));
    expect(cancel).toHaveBeenCalledOnce();
    expect(result.current.activeTool).toBe('rectangle');
    expect(result.current.toolMeasurement).toBeUndefined();
    expect(result.current.measurement).toBeUndefined();
    expect(result.current.numeric).toBe('');
    expect(result.current.moveConstraint).toBeUndefined();
    expect(result.current.moveShiftHeld).toBe(false);
    expect(result.current.setToolMeasurement).toBe(setter);
  });
});
