import { describe, expect, it } from 'vitest';
import { ANNOTATION_MIN_SCALE, ANNOTATION_REFERENCE_PPM, annotationLabelDisplay } from './annotation-scale';

describe('annotationLabelDisplay', () => {
  it('keeps full size when zoomed in and never enlarges', () => {
    expect(annotationLabelDisplay(ANNOTATION_REFERENCE_PPM * 5, 'dimension')).toEqual({ scale: 1, opacity: 1, compact: false });
  });
  it('shrinks with zoom but clamps at the minimum scale', () => {
    expect(annotationLabelDisplay(ANNOTATION_REFERENCE_PPM * 0.9, 'text').scale).toBeCloseTo(0.9);
    expect(annotationLabelDisplay(ANNOTATION_REFERENCE_PPM * 0.4, 'text').scale).toBe(ANNOTATION_MIN_SCALE);
  });
  it('fades dimensions before text and hides both when far out', () => {
    const ppm = ANNOTATION_REFERENCE_PPM * 0.4;
    expect(annotationLabelDisplay(ppm, 'dimension').opacity).toBeGreaterThan(0);
    expect(annotationLabelDisplay(ppm, 'dimension').opacity).toBeLessThan(1);
    expect(annotationLabelDisplay(ppm, 'text').opacity).toBe(1);
    expect(annotationLabelDisplay(ANNOTATION_REFERENCE_PPM * 0.1, 'dimension').opacity).toBe(0);
    expect(annotationLabelDisplay(ANNOTATION_REFERENCE_PPM * 0.1, 'text').opacity).toBe(0);
  });
  it('compacts only the dimension chip when zoomed out', () => {
    expect(annotationLabelDisplay(ANNOTATION_REFERENCE_PPM * 0.6, 'dimension').compact).toBe(true);
    expect(annotationLabelDisplay(ANNOTATION_REFERENCE_PPM * 0.6, 'text').compact).toBe(false);
  });
  it('leaves fixed labels and invalid input untouched', () => {
    expect(annotationLabelDisplay(1, 'fixed')).toEqual({ scale: 1, opacity: 1, compact: false });
    expect(annotationLabelDisplay(Number.NaN, 'dimension')).toEqual({ scale: 1, opacity: 1, compact: false });
  });
});
