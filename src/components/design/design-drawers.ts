export const designDrawers = ['Entity Info', 'Materials', 'Components', 'Display', 'Model Info'] as const;
export type DesignDrawer = (typeof designDrawers)[number];
