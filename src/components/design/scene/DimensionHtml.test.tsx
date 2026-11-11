import { useThree } from '@react-three/fiber';
import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { fireEvent } from '@testing-library/react';
import { PerspectiveCamera, Vector3 } from 'three';
import { AnnotationLayer } from './AnnotationLayer';
import { rectangleGeometry } from '@/lib/planner/design/geometry';
import type { DesignDocumentV1 } from '@/lib/planner/design/schema';
import { formatDesignLength } from '@/lib/planner/design/format-length';

function fixture(): DesignDocumentV1 {
  let sequence=0;
  return { schemaVersion:1,definitions:[],instances:[],partLinks:{},annotations:[],looseObjects:[{id:'board',name:'Board',geometry:rectangleGeometry(400_000,300_000,prefix=>`${prefix}-${sequence++}`),appearance:{color:'#fff'},pose:{positionUm:[0,0,0],rotation:[0,0,0,1]},scalePpm:[1_000_000,1_000_000,1_000_000],hidden:false,locked:false}] };
}

describe('dimension labels through real drei Html', () => {
  it.each(['metric', 'imperial'] as const)('renders formatted values in the portal for %s across started, ended, and committed graphics', async unitSystem => {
    let camera:PerspectiveCamera|undefined, fiberCanvas:HTMLCanvasElement|undefined;
    function Capture(){const three=useThree();camera=three.camera as PerspectiveCamera;camera.updateProjectionMatrix();camera.updateMatrixWorld();fiberCanvas=three.gl.domElement;fiberCanvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600} as DOMRect);return null;}
    const design=fixture(), onCommand=vi.fn(), onHint=vi.fn();
    const portal=document.createElement('div');document.body.appendChild(portal);
    const renderer = await ReactThreeTestRenderer.create(<><Capture/><AnnotationLayer visible onCommand={onCommand} onHint={onHint} onSelectAnnotation={vi.fn()} design={design} unitSystem={unitSystem} activeTool="dimensions" /></>, {
      width:800,height:600,camera:{position:[0,0,2],fov:45}, beforeReturn:node=>{node.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600} as DOMRect);portal.appendChild(node);},
    });
    const expected = formatDesignLength(unitSystem, 400_000);
    const corners=[[0,0,0],[0.4,0,0],[0,0.3,0],[0.4,0.3,0]] as [number,number,number][];
    const at=(point:[number,number,number])=>{const projected=new Vector3(...point).project(camera!);return {clientX:(projected.x+1)*400,clientY:(1-projected.y)*300};};
    const click=(point:{clientX:number;clientY:number})=>act(()=>{fireEvent.click(fiberCanvas!,{button:0,...point});});
    const move=(point:{clientX:number;clientY:number})=>act(()=>{fireEvent.pointerMove(fiberCanvas!,point);});
    const queryLabel=()=>portal.querySelector('.design-annotation-dimension-label');
    await new Promise(resolve=>setTimeout(resolve,0));

    click(at(corners[0]));
    expect(onHint).not.toHaveBeenCalledWith('Dimensions · pick a corner of a part');
    move(at(corners[1]));
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(queryLabel()?.textContent).toBe(expected); // actual started preview state

    click(at(corners[1]));
    move({clientX:400,clientY:200});
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(queryLabel()?.textContent).toBe(expected); // actual ended placement state

    click({clientX:400,clientY:200});
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand.mock.calls[0][0]).toMatchObject({type:'add-annotation',annotation:{kind:'dimension'}});
    const command=onCommand.mock.calls[0][0];
    if(command.type==='add-annotation') await renderer.update(<><Capture/><AnnotationLayer visible onCommand={onCommand} onHint={onHint} onSelectAnnotation={vi.fn()} design={{...design,annotations:[...(design.annotations??[]),command.annotation]}} unitSystem={unitSystem} activeTool="select" /></>);
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(queryLabel()?.textContent).toBe(expected); // actual committed overlay state
    await renderer.unmount();
    portal.remove();
  });
});
