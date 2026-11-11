import { describe, expect, it } from 'vitest';
import { formatDesignLength } from './format-length';

describe('formatDesignLength', () => {
  it('formats metric and imperial project lengths', () => {
    expect(formatDesignLength('metric', 1_500_000)).toBe('1500.0 mm');
    expect(formatDesignLength('imperial', 25_400)).toBe('1.000 in');
  });
});
