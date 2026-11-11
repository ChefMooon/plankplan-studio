import { inchesFromUm, millimetersFromUm, type UnitSystem } from '@/lib/planner/model';

export function formatDesignLength(unitSystem: UnitSystem, um: number): string {
  return unitSystem === 'imperial' ? `${inchesFromUm(um).toFixed(3)} in` : `${millimetersFromUm(um).toFixed(1)} mm`;
}
