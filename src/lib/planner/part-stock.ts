import type { Material, Part, Project } from './model';
import { umFromInches } from './model';

export const partKind = (part: Part, project: Project) => part.kind ?? project.materials.find(material => material.id === part.materialId)?.type ?? (part.width ? 'sheet' : 'linear');

// Ephemeral planning groups keep stock assignment and generic supply out of saved materials.
export function preparePlanningProject(project: Project) {
  const groups = new Map<string, Material>();
  const genericStockIds = new Set<string>();
  const unresolved: Part[] = [];
  const parts = project.parts.map(part => {
    const kind = partKind(part, project);
    if (!part.stockId && part.kind === undefined && part.materialId) return part;
    const assigned = project.materials.flatMap(material => material.stocks.map(stock => ({ material, stock }))).find(entry => entry.stock.id === part.stockId);
    if (part.stockId) {
      if (!assigned || assigned.material.type !== kind || kind === 'linear' && part.crossSection && (assigned.stock.widthUm !== part.crossSection.width.um || assigned.stock.thicknessUm !== part.crossSection.thickness.um)) {
        unresolved.push(part); return { ...part, materialId: '' };
      }
      const id = `stock:${assigned.stock.id}`;
      groups.set(id, { ...assigned.material, id, stocks: [assigned.stock] });
      return { ...part, materialId: id };
    }
    if (kind === 'sheet') { unresolved.push(part); return { ...part, materialId: '' }; }
    const section = part.crossSection;
    const key = section ? `${section.width.um}x${section.thickness.um}` : 'unspecified';
    const id = `generic:${key}`;
    const name = section ? `Generic ${part.lumberPreset && part.lumberPreset !== 'custom' ? part.lumberPreset : `${section.width.um / 1000} × ${section.thickness.um / 1000} mm`}` : 'Generic linear · unspecified size';
    groups.set(id, { id, name, type: 'linear', stocks: [{ id, name: `${name} · 96″ · price unspecified`, length: { um: umFromInches(96) }, ...(section ? { widthUm: section.width.um, thicknessUm: section.thickness.um } : {}), price: { cents: 1 }, ownedQuantity: 0 }] });
    genericStockIds.add(id);
    return { ...part, materialId: id };
  });
  const legacyIds = new Set(parts.filter(part => part.kind === undefined && !part.stockId).map(part => part.materialId));
  return { project: { ...project, parts, materials: [...project.materials.filter(material => legacyIds.has(material.id)), ...groups.values()] }, genericStockIds, unresolved };
}
