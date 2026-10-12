import {BLOCK} from './blocks.js';

const S=64;
// Run-length storage of a single cloud voxel field. Intervals are half-open,
// sorted, disjoint and non-adjacent: every integer Y has exactly one value.
// A second interval is only needed when separate cloud layers share X/Z.
export class CloudGrid{
  constructor(){this.chunks=new Map();this.voxels=0;this.overlapVoxels=0;}
  chunkAt(x,z){return this.chunks.get(`${Math.floor(x/S)},${Math.floor(z/S)}`);}
  spans(x,z){const c=this.chunkAt(x,z);if(!c)return [];const i=(z-c.z)*S+x-c.x;return c.multiple.get(i)||(c.bounds[i*2]<c.bounds[i*2+1]?c.bounds.subarray(i*2,i*2+2):[]);}
  get(x,y,z){const spans=this.spans(x,z);for(let i=0;i<spans.length;i+=2)if(y>=spans[i]&&y<spans[i+1])return BLOCK.CLOUD;return 0;}
  add(x,z,lo,hi){
    if(![x,z,lo,hi].every(Number.isInteger)||lo< -32768||hi>32767||hi<=lo)throw new RangeError('Invalid cloud voxel interval');
    const cx=Math.floor(x/S)*S,cz=Math.floor(z/S)*S,key=`${cx/S},${cz/S}`;
    let c=this.chunks.get(key);if(!c){c={x:cx,z:cz,bounds:new Int16Array(S*S*2),multiple:new Map()};this.chunks.set(key,c);}
    const i=(z-cz)*S+x-cx,old=c.multiple.get(i)||(c.bounds[i*2]<c.bounds[i*2+1]?c.bounds.subarray(i*2,i*2+2):[]);
    const runs=[];let start=lo,end=hi,before=0;
    for(let j=0;j<old.length;j+=2){
      const a=old[j],b=old[j+1];before+=b-a;
      if(b<start)runs.push(a,b);
      else if(a>end){runs.push(start,end);start=a;end=b;}
      else{start=Math.min(start,a);end=Math.max(end,b);}
    }
    runs.push(start,end);let after=0;for(let j=0;j<runs.length;j+=2)after+=runs[j+1]-runs[j];
    this.voxels+=after-before;this.overlapVoxels+=hi-lo-(after-before);
    c.bounds[i*2]=runs[0];c.bounds[i*2+1]=runs[1];
    if(runs.length>2)c.multiple.set(i,Int16Array.from(runs));else c.multiple.delete(i);
  }
}
