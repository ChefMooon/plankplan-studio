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
  expect(screen.getByRole('heading', { name: 'Linear layouts · cut order' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Sheet layouts · cut order' })).toBeInTheDocument();
  expect(summaries[1]).not.toHaveTextContent(/\d+ parts?|\d+ offcuts?/);
  summaries.forEach((summary) => {
    expect(summary).not.toHaveTextContent(/Price unspecified|Buy cost|\$\d/);
  });
  expect(container.querySelector('.cut-plan-summary')).not.toBeInTheDocument();

  const tabs = screen.getAllByRole('tab');
  expect(tabs.map((tab) => tab.textContent)).toEqual([
    'All',
    'Cuts & diagrams',
    'Materials & offcuts',
    'Shopping',
    'Cost',
  ]);
  expect(
    [...container.querySelectorAll('.cut-plan-content > .plan-section')].map((section) =>
      section.classList.contains('offcuts-inventory')
        ? 'offcuts-inventory'
        : [...section.classList].find(
            (className) => className.startsWith('plan-') && className !== 'plan-section',
          ),
    ),
  ).toEqual(['plan-cuts', 'plan-materials', 'offcuts-inventory', 'plan-shopping', 'plan-cost']);
  const offcutsInventory = container.querySelector('.offcuts-inventory');
  expect(offcutsInventory).toHaveTextContent('Pine · 8 ft board');
  expect(offcutsInventory).toHaveTextContent('sheet offcut');
  expect(offcutsInventory).toHaveTextContent('Plywood · 4 × 8 sheet · sheet offcut');

  const tablist = screen.getByRole('tablist');
  fireEvent.keyDown(tablist, { key: 'ArrowRight' });
  expect(tabs[1]).toHaveFocus();
  expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  expect(tabs[1]).toHaveAttribute('tabindex', '0');
  expect(tabs[0]).toHaveAttribute('tabindex', '-1');
  fireEvent.keyDown(tablist, { key: 'ArrowRight' });
  expect(tabs[2]).toHaveFocus();
  fireEvent.keyDown(tablist, { key: 'Home' });
  expect(tabs[0]).toHaveFocus();
  fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
  expect(tabs[4]).toHaveFocus();
  fireEvent.keyDown(tablist, { key: 'ArrowRight' });
  expect(tabs[0]).toHaveFocus();
  fireEvent.keyDown(tablist, { key: 'End' });
  expect(tabs[4]).toHaveFocus();
  fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
  expect(tabs[3]).toHaveFocus();

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
  expect(container.querySelector('.offcuts-inventory')).toHaveTextContent('Pine · 8 ft board');
  expect(container.querySelector('.offcuts-inventory')).toHaveTextContent('sheet offcut');
});

it('omits the sheet-layout heading when the plan only has linear boards', () => {
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
  ];

  render(
    <CutPlan
      project={project}
      mixedResult={optimizeMixedProject(project)}
      expanded={false}
      onExpandedChange={() => {}}
    />,
  );

  expect(screen.getByRole('heading', { name: 'Cut list and diagrams' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Linear layouts · cut order' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Sheet layouts · cut order' })).not.toBeInTheDocument();
});

it('shows only the sheet-layout heading when the plan only has panels', () => {
  const project = createProject();
  project.parts = [
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

  render(
    <CutPlan
      project={project}
      mixedResult={optimizeMixedProject(project)}
      expanded={false}
      onExpandedChange={() => {}}
    />,
  );

  expect(screen.getByRole('heading', { name: 'Sheet layouts · cut order' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Linear layouts · cut order' })).not.toBeInTheDocument();
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
