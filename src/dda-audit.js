import * as THREE from 'three';
import {WORLD} from './terrain.js';

export function worldFingerprint(terrain,weather){
  const hash=arrays=>{let h=2166136261;for(const a of arrays)for(const v of a)h=Math.imul(h^v,16777619);return (h>>>0).toString(16).padStart(8,'0');};
  return {terrain:hash([terrain.heights,terrain.types]),trees:hash([...terrain.grid.chunks.values()].flatMap(c=>[[c.x,c.y,c.z],c.cells])),clouds:hash([...weather.grid.chunks.values()].flatMap(c=>[[c.x,c.z],c.bounds,...[...c.multiple].flatMap(([i,a])=>[[i],a])]))};
}

// Independent reference: plain one-cell-at-a-time traversal, no GPU packing,
// empty-space hierarchy, or merged interval traversal.
export function referenceRay(o,d,lo,hi,lookup,limit=4600){
  let enter=0,leave=limit,normal=0;
  for(let a=0;a<3;a++){
    if(Math.abs(d[a])<1e-12){if(o[a]<lo[a]||o[a]>=hi[a])return {t:4600,type:0,normal:0};continue;}
    const p=(lo[a]-o[a])/d[a],q=(hi[a]-o[a])/d[a],near=Math.min(p,q),far=Math.max(p,q);
    if(near>enter){enter=near;normal=-Math.sign(d[a])*(a+1);}leave=Math.min(leave,far);
  }
  if(enter>=leave)return {t:4600,type:0,normal:0};
  const cell=o.map((x,a)=>Math.floor(x+d[a]*(enter+.0008))),step=d.map(Math.sign),delta=d.map(x=>Math.abs(1/x)),next=cell.map((x,a)=>Math.abs(d[a])<1e-12?Infinity:(x+(step[a]>0?1:0)-o[a])/d[a]);
  let t=enter;
  for(let i=0;i<16000&&t<leave;i++){
    let type=lookup(...cell);if(type){if(type===2&&normal!==2)type=3;return {t,type,normal};}
    const axis=next[0]<=next[1]&&next[0]<=next[2]?0:next[1]<=next[2]?1:2;t=next[axis];next[axis]+=delta[axis];cell[axis]+=step[axis];normal=-step[axis]*(axis+1);
  }
  return {t:4600,type:0,normal:0};
}

// A float can round a grazing ray across a corner and miss the whole nearby
// voxel, not just select its other face. Require a reference ray displaced by
// at most 0.1 mm to reproduce the GPU hit before calling that a precision tie.
export function grazingBoundaryTie(origin,d,hit,gpu,trace,wind={x:0,y:0}){
  const near=hit.t<=gpu.t?hit:gpu;if(!near.type)return false;
  const point=origin.map((v,a)=>v+d[a]*near.t-(near.type===6?(a===0?wind.x:a===2?wind.y:0):0));
  for(let axis=0;axis<3;axis++){
    if(axis===Math.abs(near.normal)-1||Math.abs(point[axis]-Math.round(point[axis]))>=.001)continue;
    for(const offset of [-.0001,.0001]){
      const shifted=[...origin];shifted[axis]+=offset;const alternate=trace(shifted);
      if(alternate.type===gpu.type&&alternate.normal===gpu.normal&&Math.abs(alternate.t-gpu.t)<.025)return true;
    }
  }
  return false;
}
export function auditDda(renderer,camera,dda,terrain,weather){
  const width=32,height=24,actual=dda.readHits(renderer,camera,width,height),origin=camera.position.toArray(),direction=new THREE.Vector3(),report={rays:width*height,mismatches:0,boundaryTies:0,maxDistanceError:0,examples:[],hitTypes:{}};
  const wind=dda.uniforms.wind.value,cloudMin=dda.data.uniforms.cloudBoxMin.value.toArray(),cloudMax=dda.data.uniforms.cloudBoxMax.value.toArray();
  const trace=(origin,d)=>{
    let water=4600;
    if(d[1]<0){const t=-origin[1]/d[1],px=origin[0]+d[0]*t,pz=origin[2]+d[2]*t;if(t>=0&&t<4600&&terrain.inside(px,pz)&&terrain.height(px,pz)<0)water=t;}
    let hit=referenceRay(origin,d,[WORLD.minX,-20,WORLD.minZ],[WORLD.minX+WORLD.size,512,WORLD.minZ+WORLD.size],(x,y,z)=>{const t=terrain.grid.get(x,y,z);return t===7?0:t;},water);
    if(water<hit.t)hit={t:water,type:7,normal:2};
    const cloud=referenceRay([origin[0]-wind.x,origin[1],origin[2]-wind.y],d,cloudMin,cloudMax,(x,y,z)=>weather.grid.get(x,y,z),hit.t);if(cloud.t<hit.t)hit=cloud;return hit;
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    direction.set((x+.5)/width*2-1,(y+.5)/height*2-1,1).unproject(camera).sub(camera.position).normalize();const d=direction.toArray(),hit=trace(origin,d);
    const index=(y*width+x)*4,gpu={t:actual[index],type:actual[index+1],normal:actual[index+2]},error=Math.abs(gpu.t-hit.t);report.maxDistanceError=Math.max(report.maxDistanceError,error);report.hitTypes[hit.type]=(report.hitTypes[hit.type]||0)+1;
    if(gpu.type!==hit.type||gpu.normal!==hit.normal&&hit.type!==0||error>.025){
      const point=origin.map((v,a)=>v+d[a]*hit.t-(hit.type===6?(a===0?wind.x:a===2?wind.y:0):0));
      const edge=point.some((v,a)=>a!==Math.abs(hit.normal)-1&&Math.abs(v-Math.round(v))<.001);
      // Float GPU and double CPU rays can pick either adjoining material when
      // a hit lies within 1 mm of a grid edge. Keep these separate and visible.
      const boundaryTie=edge&&error<.025||grazingBoundaryTie(origin,d,hit,gpu,o=>trace(o,d),wind);
      if(boundaryTie)report.boundaryTies++;else report.mismatches++;
      if(report.examples.length<12)report.examples.push({pixel:[x,y],expected:hit,actual:gpu,error,boundaryTie});
    }
  }
  return report;
}
