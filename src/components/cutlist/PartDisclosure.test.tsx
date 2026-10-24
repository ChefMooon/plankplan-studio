import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { PartDisclosure } from './PartDisclosure';

it('discloses optional fields without discarding their draft values', async () => {
  const user = userEvent.setup();
  render(<PartDisclosure partId="rail" partName="Rail" sheetPart handle={<button>Reorder Rail</button>} main={<input aria-label="Part name" defaultValue="Rail" />} details={<label>Notes<input defaultValue="Keep grain" /></label>} actions={<button>Rail actions</button>} />);
  const toggle = screen.getByRole('button', { name: 'Expand details for Rail' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument();
  await user.click(toggle);
  const notes = screen.getByRole('textbox', { name: 'Notes' });
  await user.type(notes, ' aligned');
  await user.click(screen.getByRole('button', { name: 'Collapse details for Rail' }));
  expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Expand details for Rail' }));
  expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Keep grain aligned');
});
