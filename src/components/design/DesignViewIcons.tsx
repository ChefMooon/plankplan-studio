import type { ReactNode } from 'react';

const Svg = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true">{children}</svg>;

/** Box with converging edges, suggesting vanishing-point depth. */
export const PerspectiveIcon = () => <Svg><path d="M3 20 8 8h8l5 12z" /><path d="M8 8 3 4M16 8l5-4" /></Svg>;
/** Box with parallel edges, suggesting a flat orthographic projection. */
export const OrthographicIcon = () => <Svg><path d="M4 8h12v12H4z" /><path d="m4 8 4-4h12l-4 4M20 4v12l-4 4" /></Svg>;
/** Corner brackets around a solid frame, for fitting the whole model. */
export const FrameModelIcon = () => <Svg><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /><rect x="8.5" y="8.5" width="7" height="7" rx="1" /></Svg>;
/** Corner brackets around a point, for fitting the selection. */
export const FrameSelectionIcon = () => <Svg><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /><circle cx="12" cy="12" r="2.2" /></Svg>;
export const HelpIcon = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01" /></Svg>;
