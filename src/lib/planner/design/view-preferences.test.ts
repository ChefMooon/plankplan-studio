import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN_VIEW_PREFERENCES, readDesignViewPreferences, validateDesignViewPreferences, writeDesignViewPreferences } from './view-preferences';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
}

describe('design view preferences', () => {
  it('persists a validated view per project without entering project data', () => {
    const storage = memoryStorage();
    const view = { ...DEFAULT_DESIGN_VIEW_PREFERENCES, projection: 'orthographic' as const, preset: 'top' as const, grid: false };
    expect(writeDesignViewPreferences('one', view, storage)).toBe(true);
    expect(readDesignViewPreferences('one', storage)).toEqual(view);
    expect(readDesignViewPreferences('two', storage)).toEqual(DEFAULT_DESIGN_VIEW_PREFERENCES);
  });

  it('rejects malformed records and uses defaults when stored JSON is invalid', () => {
    const storage = memoryStorage();
    storage.setItem('plankplan-studio.design-view.v1.p', '{');
    expect(readDesignViewPreferences('p', storage)).toEqual(DEFAULT_DESIGN_VIEW_PREFERENCES);
    expect(validateDesignViewPreferences({ ...DEFAULT_DESIGN_VIEW_PREFERENCES, snap: 'yes' })).toBe(false);
  });
});
