import * as THREE from 'three';
import type { Project } from '@/lib/planner/model';
import type { CutSpec, Geometry, Pose, ScalePpm } from '@/lib/planner/design/schema';
import { IDENTITY_POSE, IDENTITY_SCALE } from '@/lib/planner/design/geometry';
import { buildModelGeometry } from './mesh-geometry';

type ModelObject = { geometry: Geometry; pose: Pose; scale: ScalePpm; color: string; offset: number; cutSpec?: CutSpec };

export function snapshotObjects(project: Project): ModelObject[] {
  const design = project.design;
  if (!design) return [];
  const definitions = new Map(design.definitions.map(definition => [definition.id, definition]));
  return [
    ...design.instances.filter(item => !item.hidden).flatMap(item => {
      const definition = definitions.get(item.definitionId);
      return definition ? [{ geometry: definition.geometry, cutSpec: definition.cutSpec, pose: item.pose, scale: item.scalePpm, color: item.appearance?.color ?? definition.appearance.color, offset: 0 }] : [];
    }),
    ...design.looseObjects.filter(item => !item.hidden).map(item => ({ geometry: item.geometry, pose: item.pose, scale: item.scalePpm, color: item.appearance.color, offset: 0 })),
    ...design.definitions.filter(definition => !design.instances.some(item => item.definitionId === definition.id)).map((definition, index) => ({ geometry: definition.geometry, cutSpec: definition.cutSpec, pose: IDENTITY_POSE, scale: IDENTITY_SCALE, color: definition.appearance.color, offset: index * 1.5 })),
  ].filter(item => item.geometry.faces.length > 0 || item.geometry.edges.length > 0);
}

export function renderModelSnapshot(project: Project, aspect = 600 / 264): string | undefined {
  const objects = snapshotObjects(project);
  if (!objects.length) return undefined;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  const scene = new THREE.Scene();
  const resources: { dispose: () => void }[] = [];
  try {
    const width = 600, height = Math.round(width / aspect);
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8890, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(5, 8, 7);
    scene.add(light);
    for (const object of objects) {
      const spec = object.cutSpec;
      const geometry = spec?.confirmation === 'confirmed' ? new THREE.BoxGeometry(spec.lengthUm / 1e6, spec.widthUm / 1e6, spec.thicknessUm / 1e6) : buildModelGeometry(object.geometry);
      const material = new THREE.MeshStandardMaterial({ color: object.color, roughness: 0.78, side: THREE.DoubleSide });
      const edges = new THREE.EdgesGeometry(geometry, 12);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x40372e, transparent: true, opacity: 0.55 });
      const vertices = new Map(object.geometry.vertices.map(vertex => [vertex.id, vertex.positionUm]));
      const lines: number[] = [];
      if (!object.geometry.faces.length) for (const edge of object.geometry.edges) {
        const a = vertices.get(edge.vertexIds[0]), b = vertices.get(edge.vertexIds[1]);
        if (a && b) lines.push(...a.map(n => n / 1e6), ...b.map(n => n / 1e6));
      }
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
      resources.push(geometry, material, edges, edgeMaterial, lineGeometry);
      const group = new THREE.Group();
      group.position.set(object.pose.positionUm[0] / 1e6 + object.offset, object.pose.positionUm[1] / 1e6, object.pose.positionUm[2] / 1e6);
      group.quaternion.set(...object.pose.rotation);
      group.scale.set(...object.scale.map(n => n / 1e6) as [number, number, number]);
      group.add(new THREE.Mesh(geometry, material), new THREE.LineSegments(edges, edgeMaterial), new THREE.LineSegments(lineGeometry, edgeMaterial));
      scene.add(group);
    }
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    if (box.isEmpty()) return undefined;
    const center = box.getCenter(new THREE.Vector3());
    // Match the editor's XZ ground plane without including it in model framing.
    const groundSize = Math.max(box.getSize(new THREE.Vector3()).length() * 8, 1);
    const grid = new THREE.GridHelper(groundSize, 48, '#687b84', '#9aa8ad');
    grid.position.set(center.x, 0, center.z);
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of gridMaterials) { material.transparent = true; material.opacity = 0.14; }
    resources.push(grid.geometry, ...gridMaterials);
    scene.add(grid);
    const direction = { iso: [6, 5, 7], top: [0, 9, 0.001], front: [0, 0.001, 9], right: [9, 0.001, 0] }[project.previewView === 'auto' || project.previewView === 'cutlist' || !project.previewView ? 'iso' : project.previewView];
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 1e7);
    const radius = Math.max(box.getSize(new THREE.Vector3()).length(), 0.001);
    camera.position.copy(center).add(new THREE.Vector3(...direction as [number, number, number]).normalize().multiplyScalar(radius * 2 + 1));
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    const inverse = camera.matrixWorldInverse;
    const corners: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z).applyMatrix4(inverse));
    const bounds = new THREE.Box3().setFromPoints(corners);
    const halfHeight = Math.max((bounds.max.y - bounds.min.y) / 2, (bounds.max.x - bounds.min.x) / (2 * aspect), 0.001) * 1.35;
    camera.left = -halfHeight * aspect; camera.right = -camera.left;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.far = radius * 5 + 10;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  } finally {
    resources.forEach(resource => resource.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
