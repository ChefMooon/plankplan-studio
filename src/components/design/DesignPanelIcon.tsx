import type { ReactNode } from 'react';

export type DesignPanelIconName = 'entity' | 'materials' | 'components' | 'display' | 'model';

export function DesignPanelIcon({ name }: { name: DesignPanelIconName }) {
  const paths: Record<DesignPanelIconName, ReactNode> = {
    entity: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h5M8 17h8"/></>,
    materials: <><path d="M4 7h16v13H4zM4 7l3-4h10l3 4"/><path d="M8 11h8M8 15h5"/></>,
    components: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21"/></>,
    display: <><path d="M3 5h18v12H3zM8 21h8M12 17v4"/><path d="M7 9h10M7 13h6"/></>,
    model: <><path d="M4 20V4M4 20h16"/><path d="m7 16 4-5 3 2 5-7"/><circle cx="7" cy="16" r="1"/><circle cx="11" cy="11" r="1"/><circle cx="14" cy="13" r="1"/><circle cx="19" cy="6" r="1"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
