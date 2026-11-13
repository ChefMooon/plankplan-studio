import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TruncatedText } from './truncated-text';

const setWidths = (element: HTMLElement, scrollWidth: number, clientWidth: number) => {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth });
};

describe('TruncatedText', () => {
  it('shows the full text in the shared tooltip when clipped', async () => {
    render(<TruncatedText>A very long status message</TruncatedText>);
    const text = screen.getByText('A very long status message');
    setWidths(text, 300, 100);
    fireEvent.pointerEnter(text);
    fireEvent.pointerMove(text);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('A very long status message');
  });

  it('does not show a tooltip when the text fits', async () => {
    render(<TruncatedText>Short</TruncatedText>);
    const text = screen.getByText('Short');
    setWidths(text, 40, 100);
    fireEvent.pointerEnter(text);
    fireEvent.pointerMove(text);
    await new Promise(resolve => setTimeout(resolve, 450));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
