import { describe, expect, it } from 'vitest';
import { rectangleGeometry } from '@/lib/planner/design/geometry';
import { resolveSubElement } from './sub-selection';

describe('Alt selection target resolution', () => {
  it('chooses an edge within tolerance and the planar face away from edges', () => {
    let next=0;const geometry=rectangleGeometry(100_000,100_000,p=>`${p}-${next++}`);
    expect(resolveSubElement(geometry,[0.002,0.05,0])).toEqual({type:'edge',id:geometry.edges[3].id});
    expect(resolveSubElement(geometry,[0.05,0.05,0.001])).toEqual({type:'face',id:geometry.faces[0].id});
  });
});
