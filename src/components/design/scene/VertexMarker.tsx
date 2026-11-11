import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

/** A camera-facing, screen-sized marker that never participates in picking. */
export function VertexMarker({ point, state }: { point: [number, number, number]; state: 'hover' | 'selected' }) {
  const { camera, size, invalidate } = useThree();
  const marker = useRef<import('three').Mesh>(null);
  const pointX = point[0], pointY = point[1], pointZ = point[2];
  useEffect(() => { invalidate(); }, [invalidate, pointX, pointY, pointZ, state]);
  useFrame(() => {
    if (!marker.current) return;
    const position = new Vector3(...point);
    const projected = position.clone().project(camera);
    const adjacent = new Vector3(projected.x + 14 / size.width, projected.y, projected.z).unproject(camera);
    marker.current.scale.setScalar(position.distanceTo(adjacent));
    marker.current.quaternion.copy(camera.quaternion);
  });
  return <mesh ref={marker} position={point} renderOrder={10} raycast={() => null}>
    <planeGeometry args={[1, 1]} />
    <meshBasicMaterial color={state === 'hover' ? '#173b56' : '#e6a94e'} depthTest={false} depthWrite={false} />
  </mesh>;
}
