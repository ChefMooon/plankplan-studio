import { describe, expect, it } from 'vitest';
import { isEditableTarget } from './is-editable-target';

describe('isEditableTarget', () => {
  it('recognizes editable controls and dialog descendants while allowing ordinary workspace targets', () => {
    const input = document.createElement('input');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const child = document.createElement('button');
    dialog.append(child);
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(child)).toBe(true);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
