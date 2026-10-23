export type DesignViewPreferences = {
  projection: 'perspective' | 'orthographic';
  preset: 'iso' | 'top' | 'front' | 'right';
  grid: boolean;
  axes: boolean;
  snap: boolean;
};

export const DEFAULT_DESIGN_VIEW_PREFERENCES: DesignViewPreferences = {
  projection: 'perspective', preset: 'iso', grid: true, axes: true, snap: true,
};

const keyFor = (projectId: string) => `plankplan-studio.design-view.v1.${projectId}`;

export function validateDesignViewPreferences(value: unknown): value is DesignViewPreferences {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<DesignViewPreferences>;
  return (v.projection === 'perspective' || v.projection === 'orthographic')
    && ['iso', 'top', 'front', 'right'].includes(String(v.preset))
    && typeof v.grid === 'boolean' && typeof v.axes === 'boolean' && typeof v.snap === 'boolean';
}

export function readDesignViewPreferences(projectId: string, storage: Pick<Storage, 'getItem'> = window.localStorage): DesignViewPreferences {
  try {
    const value: unknown = JSON.parse(storage.getItem(keyFor(projectId)) ?? 'null');
    return validateDesignViewPreferences(value) ? value : { ...DEFAULT_DESIGN_VIEW_PREFERENCES };
  } catch { return { ...DEFAULT_DESIGN_VIEW_PREFERENCES }; }
}

export function writeDesignViewPreferences(projectId: string, preferences: DesignViewPreferences, storage: Pick<Storage, 'setItem'> = window.localStorage): boolean {
  if (!validateDesignViewPreferences(preferences)) return false;
  try { storage.setItem(keyFor(projectId), JSON.stringify(preferences)); return true; }
  catch { return false; }
}
