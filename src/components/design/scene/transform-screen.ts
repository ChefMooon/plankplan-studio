import * as THREE from 'three';

export function worldPerPixel(camera:THREE.Camera,point:THREE.Vector3,height:number) {
  const value=camera instanceof THREE.PerspectiveCamera?2*camera.position.distanceTo(point)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/(camera.zoom*height):camera instanceof THREE.OrthographicCamera?(camera.top-camera.bottom)/(camera.zoom*height):0.01;
  return Number.isFinite(value)&&value>0?value:0.01;
}
