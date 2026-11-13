export type AnnotationLabelKind = 'text' | 'dimension' | 'fixed';

/** Pixels per world meter at which a label is shown at full size. Closer than this never enlarges it. */
export const ANNOTATION_REFERENCE_PPM = 60;
/** Labels never shrink below this fraction; below it they fade out instead of becoming unreadable. */
export const ANNOTATION_MIN_SCALE = 0.75;
/** Below this raw (unclamped) ratio the dimension chip drops its padding. */
const COMPACT_BELOW = 0.8;
/** Raw ratio range over which each kind fades from fully visible to hidden. */
const FADE: Record<Exclude<AnnotationLabelKind, 'fixed'>, readonly [hidden: number, visible: number]> = {
  dimension: [0.3, 0.5],
  text: [0.2, 0.35],
};

export type AnnotationLabelDisplay = { scale: number; opacity: number; compact: boolean };

/** Maps the on-screen size of the world (pixels per meter at the label) to its scale, fade, and chip density. */
export function annotationLabelDisplay(pixelsPerMeter: number, kind: AnnotationLabelKind): AnnotationLabelDisplay {
  if (kind === 'fixed' || !Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) return { scale: 1, opacity: 1, compact: false };
  const raw = pixelsPerMeter / ANNOTATION_REFERENCE_PPM;
  const scale = Math.min(1, Math.max(ANNOTATION_MIN_SCALE, raw));
  const [hidden, visible] = FADE[kind];
  const opacity = Math.min(1, Math.max(0, (raw - hidden) / (visible - hidden)));
  return { scale, opacity, compact: kind === 'dimension' && raw < COMPACT_BELOW };
}
