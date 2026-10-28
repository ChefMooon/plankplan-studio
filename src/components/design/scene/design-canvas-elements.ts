import { AmbientLight, AxesHelper, BoxGeometry, Color, DirectionalLight, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, TorusGeometry } from 'three';

// Keep this catalogue in step with the scene's JSX, including elements used by
// Drei's Grid. New helpers (for example vertex markers) can register more types.
// Avoid extend(THREE): it retains otherwise unused Three exports in the bundle.
export const designCanvasThreeElements = { AmbientLight, AxesHelper, BoxGeometry, Color, DirectionalLight, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, TorusGeometry };
