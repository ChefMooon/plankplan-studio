import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { optimizeMixedProject } from '@/lib/planner/combined';
import { createProject } from '@/lib/planner/storage';
import { CutPlan } from './CutPlan';

it('keeps linear and sheet summaries informative without duplicating prices', () => {
  const project = createProject();
  project.materials = [
    {
      id: 'pine',
      name: 'Pine',
      type: 'linear',
      stocks: [
        {
          id: 'pine-board',
          name: '8 ft board',
          length: { um: 96 * 25_400 },
          price: { cents: 1_000 },
          ownedQuantity: 0,
        },
      ],
    },
    {
      id: 'plywood',
      name: 'Plywood',
      type: 'sheet',
      stocks: [
        {
          id: 'plywood-sheet',
          name: '4 × 8 sheet',
          length: { um: 96 * 25_400 },
          widthUm: 48 * 25_400,
          price: { cents: 2_500 },
          ownedQuantity: 0,
        },
      ],
    },
  ];
  project.parts = [
    {
      id: 'rail',
      name: 'Rail',
      materialId: 'pine',
      stockId: 'pine-board',
      length: { um: 20 * 25_400 },
      quantity: 1,
    },
    {
      id: 'panel',
      name: 'Panel',
      kind: 'sheet',
      materialId: 'plywood',
      stockId: 'plywood-sheet',
      length: { um: 24 * 25_400 },
      width: { um: 18 * 25_400 },
      quantity: 1,
    },
  ];

  const { container } = render(
    <CutPlan
      project={project}
      mixedResult={optimizeMixedProject(project)}
      expanded={false}
      onExpandedChange={() => {}}
    />,
  );
  const summaries = [...container.querySelectorAll('.plan-card .plan-row')];

  expect(summaries).toHaveLength(2);
  expect(summaries[0]).toHaveTextContent('Pine · 8 ft board');
  expect(summaries[0]).toHaveTextContent('1 board required');
  expect(summaries[0]).not.toHaveTextContent(/\d+ parts?|\bWaste:/);
  expect(summaries[1]).toHaveTextContent('Plywood · 4 × 8 sheet');
  expect(summaries[1]).toHaveTextContent('1 sheet required');
  expect(summaries[1]).toHaveTextContent(/Full-length strips|Guillotine layout/);
  expect(summaries[1]).not.toHaveTextContent(/\d+ parts?|\d+ offcuts?/);
  summaries.forEach((summary) => {
    expect(summary).not.toHaveTextContent(/Price unspecified|Buy cost|\$\d/);
  });
  expect(container.querySelector('.cut-plan-summary')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Cost' }));
  const costSection = container.querySelector('.plan-cost');
  expect(costSection).toHaveTextContent('Estimated total');
  expect(costSection).toHaveTextContent(/\$\d/);

  fireEvent.click(screen.getByRole('tab', { name: 'Shopping' }));
  const shoppingSection = container.querySelector('.plan-shopping');
  expect(shoppingSection).toHaveTextContent('1 to buy');
  expect(shoppingSection).toHaveTextContent(/\$\d/);

  fireEvent.click(screen.getByRole('tab', { name: 'Materials & offcuts' }));
  const materialsSection = container.querySelector('.plan-materials:not(.offcuts-inventory)');
  expect(materialsSection).toHaveTextContent('Material subtotals · waste');
  expect(materialsSection).not.toHaveTextContent(/\$\d|Price unspecified/);
});

it('keeps plural quantities and partial, unspecified-price qualifiers in their proper sections', () => {
  const project = createProject();
  project.materials = [
    {
      id: 'pine',
      name: 'Pine',
      type: 'linear',
      stocks: [
        {
          id: 'pine-board',
          name: '8 ft board',
          length: { um: 96 * 25_400 },
          price: { cents: 1_000 },
          ownedQuantity: 0,
        },
      ],
    },
  ];
  project.parts = [
    {
      id: 'rail',
      name: 'Rail',
      materialId: 'pine',
      stockId: 'pine-board',
      length: { um: 40 * 25_400 },
      quantity: 4,
    },
    {
      id: 'panel',
      name: 'Panel',
      kind: 'sheet',
      materialId: '',
      length: { um: 48 * 25_400 },
      width: { um: 48 * 25_400 },
      quantity: 3,
    },
    {
      id: 'unassigned',
      name: 'Unassigned rail',
      materialId: 'pine',
      stockId: 'missing-stock',
      length: { um: 20 * 25_400 },
      quantity: 1,
    },
  ];
  const result = optimizeMixedProject(project);
  const { container } = render(
    <CutPlan
      project={project}
      mixedResult={result}
      expanded={false}
      onExpandedChange={() => {}}
    />,
  );
  const summaries = [...container.querySelectorAll('.plan-card .plan-row')];

  expect(summaries).toHaveLength(2);
  expect(summaries[0]).toHaveTextContent('2 boards required');
  expect(summaries[1]).toHaveTextContent('3 sheets required');
  summaries.forEach((summary) => {
    expect(summary).not.toHaveTextContent(/Price unspecified|\$\d/);
  });

  const costSection = container.querySelector('.plan-cost');
  expect(costSection).toHaveTextContent('Partial priced stock subtotal · generic prices excluded');
  expect(costSection).toHaveTextContent('Estimated total · partial plan · priced stock only');
  expect(costSection).toHaveTextContent('Parts without a stock plan are not included.');

  fireEvent.click(screen.getByRole('tab', { name: 'Shopping' }));
  const shoppingRows = [...container.querySelectorAll('.plan-shopping .shopping-row')];
  const genericPanelRow = shoppingRows.find((row) => row.textContent?.includes('Generic panel'));
  expect(genericPanelRow?.querySelector('b')).toHaveTextContent(
    'Generic panel · unspecified thickness · 48″ × 96″',
  );
  expect(genericPanelRow?.querySelector('b')).not.toHaveTextContent(/Generic panel.*Generic panel|price unspecified/i);
  expect(genericPanelRow?.querySelector('strong')).toHaveTextContent('Price unspecified');

  fireEvent.click(screen.getByRole('tab', { name: 'Materials & offcuts' }));
  const materialsSection = container.querySelector('.plan-materials:not(.offcuts-inventory)');
  expect(materialsSection).not.toHaveTextContent('Price unspecified');
});

it('avoids repeating generic stock names and price labels across linear and panel layouts', () => {
  const project = createProject();
  project.parts = [
    {
      id: 'rail',
      name: 'Rail',
      kind: 'linear',
      materialId: '',
      length: { um: 24 * 25_400 },
      quantity: 1,
    },
    {
      id: 'panel',
      name: 'Panel',
      kind: 'sheet',
      materialId: '',
      length: { um: 24 * 25_400 },
      width: { um: 18 * 25_400 },
      quantity: 1,
    },
  ];
  const { container } = render(
    <CutPlan
      project={project}
      mixedResult={optimizeMixedProject(project)}
      expanded={false}
      onExpandedChange={() => {}}
    />,
  );
  const summaries = [...container.querySelectorAll('.plan-card .plan-row')];
  const linearSummary = summaries.find((summary) => summary.textContent?.includes('Generic linear'));
  const panelSummary = summaries.find((summary) => summary.textContent?.includes('Generic panel'));

  expect(linearSummary).toHaveTextContent('Generic linear · unspecified size · 96″');
  expect(panelSummary).toHaveTextContent('Generic panel · unspecified thickness · 48″ × 96″');
  summaries.forEach((summary) => {
    expect(summary).not.toHaveTextContent(/Generic (linear|panel).*Generic (linear|panel)|price unspecified/i);
  });

  fireEvent.click(screen.getByRole('tab', { name: 'Shopping' }));
  const shoppingRows = [...container.querySelectorAll('.plan-shopping .shopping-row')];
  for (const [prefix, label] of [
    ['Generic linear', 'Generic linear · unspecified size · 96″'],
    ['Generic panel', 'Generic panel · unspecified thickness · 48″ × 96″'],
  ]) {
    const row = shoppingRows.find((candidate) => candidate.textContent?.includes(prefix));
    expect(row?.querySelector('b')).toHaveTextContent(label);
    expect(row?.querySelector('b')).not.toHaveTextContent(/price unspecified/i);
    expect(row?.querySelector('strong')).toHaveTextContent('Price unspecified');
  }
});
