import type { Project } from './model';
import { optimizeLinear } from './linear';
import { optimizeSheets } from './sheet';

export function optimizeMixedProject(project: Project) {
  const linear = optimizeLinear(project, project.materials);
  const sheets = optimizeSheets(project, project.materials);
  const subtotalCents = linear.totalCostCents + sheets.totalCostCents;
  const taxCents = Math.round(subtotalCents * (project.taxRate ?? 0) / 100);
  return {
    linear,
    sheets,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    warnings: [...linear.warnings, ...sheets.warnings],
    valid: linear.valid && sheets.valid,
  };
}
