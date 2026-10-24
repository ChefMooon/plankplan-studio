import type { MaterialKind } from '@/lib/planner/model';

/** Matching 24px glyphs: long dimensional lumber and a broad, thin sheet. */
export function MaterialTypeIcon({ kind }: { kind: MaterialKind }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'linear' ? <>
      <path className="material-type-icon-face" d="m3 15 13-11 5 3-13 11-5-3Z"/>
      <path d="M3 15v4l5 3L21 11V7M8 18v4"/>
      <path d="m7 13 9-7M9 14l5-4"/>
    </> : <>
      <path className="material-type-icon-face" d="m2 9 12-6 8 10-12 6L2 9Z"/>
      <path d="M2 9v3l8 10 12-6v-3M10 19v3"/>
    </>}
  </svg>;
}
