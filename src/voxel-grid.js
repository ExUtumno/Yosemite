import {BLOCK} from './blocks.js';

export const CHUNK_SIZE=32;
// Values 128–159 are explicit air, with baked daylight in the low five bits.
// Zero means inherit the compressed ground column, not an air override.
export const CARVED_AIR=128;
const S=CHUNK_SIZE,AREA=S*S,VOLUME=S**3;
const rank=type=>type===BLOCK.TRUNK?2:type?1:0;

// A single byte owns each cell. The solid ground is stored as compressed
// columns; sparse chunks hold additions and explicit carved air. Generators
// never own render meshes. Air overrides ground and includes baked daylight.
export class VoxelGrid{
  constructor(base=null){this.base=base;this.chunks=new Map();this.count=0;this.overlapWrites=0;this.buriedWrites=0;}
  key(x,y,z){return `${x},${y},${z}`;}
  chunkAt(x,y,z){return this.chunks.get(this.key(Math.floor(x/S),Math.floor(y/S),Math.floor(z/S)));}
  extra(x,y,z){const c=this.chunkAt(x,y,z);return c?c.cells[(z-c.z)*AREA+(y-c.y)*S+x-c.x]:0;}
  get(x,y,z){const extra=this.extra(x,y,z);return extra>=CARVED_AIR?0:this.base?.(x,y,z)||extra;}
  carve(x,y,z){this.write(x,y,z,CARVED_AIR);}
  restore(x,y,z){this.write(x,y,z,0);}
  write(x,y,z,type){
    if(![x,y,z,type].every(Number.isInteger)||type<0||type>255)throw new RangeError('Voxel coordinates and types must be integers');
    const cx=Math.floor(x/S),cy=Math.floor(y/S),cz=Math.floor(z/S),key=this.key(cx,cy,cz);
    let c=this.chunks.get(key);
    if(!c){if(!type)return;c={x:cx*S,y:cy*S,z:cz*S,cells:new Uint8Array(VOLUME),count:0};this.chunks.set(key,c);}
    const i=(z-c.z)*AREA+(y-c.y)*S+x-c.x,previous=c.cells[i];
    c.cells[i]=type;const delta=Number(type!==0)-Number(previous!==0);c.count+=delta;this.count+=delta;
  }
  set(x,y,z,type){
    if(![x,y,z,type].every(Number.isInteger)||type<0||type>255)throw new RangeError('Voxel coordinates and types must be integers');
    if(this.base?.(x,y,z)){this.buriedWrites++;return;}
    if(this.extra(x,y,z)>=CARVED_AIR)return; // Keep entrances clear of later trees.
    const cx=Math.floor(x/S),cy=Math.floor(y/S),cz=Math.floor(z/S),key=this.key(cx,cy,cz);
    let c=this.chunks.get(key);
    if(!c){if(!type)return;c={x:cx*S,y:cy*S,z:cz*S,cells:new Uint8Array(VOLUME),count:0};this.chunks.set(key,c);}
    const i=(z-c.z)*AREA+(y-c.y)*S+x-c.x,previous=c.cells[i];
    if(previous&&type)this.overlapWrites++;
    // Wood wins over needles, regardless of tree generation order. Clearing a
    // cell is explicit; even conflicting writes can never add another owner.
    if(type&&rank(previous)>rank(type))return;
    c.cells[i]=type;const delta=Number(type!==0)-Number(previous!==0);c.count+=delta;this.count+=delta;
  }
}
