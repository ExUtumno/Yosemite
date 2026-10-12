import {BLOCK} from './blocks.js';
import {CARVED_AIR} from './voxel-grid.js';

export const DIG_REACH=5,MIN_DIG_Y=-19,DIG_INTERVAL=.22;
const neighbours=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

// Exact, short CPU voxel traversal through the same cells that DDA renders.
// Water is traversable; the first solid cell occludes every block behind it.
export function digTarget(grid,origin,direction,reach=DIG_REACH){
  const o=origin.toArray(),d=direction.toArray(),length=Math.hypot(...d);if(!length)return null;
  for(let a=0;a<3;a++)d[a]/=length;
  const cell=o.map(Math.floor),step=d.map(Math.sign),delta=d.map(v=>v?Math.abs(1/v):Infinity);
  const next=cell.map((v,a)=>d[a]?(v+(step[a]>0?1:0)-o[a])/d[a]:Infinity);
  let distance=0,normal=[0,0,0];
  while(distance<=reach){
    const type=grid.get(...cell);
    if(type&&type!==BLOCK.WATER&&type!==BLOCK.CLOUD)return {cell:[...cell],normal,type,distance:distance+0};
    const a=next[0]<=next[1]&&next[0]<=next[2]?0:next[1]<=next[2]?1:2;
    distance=next[a];cell[a]+=step[a];next[a]+=delta[a];normal=[0,0,0];normal[a]=-step[a];
  }
  return null;
}

function brightenOpening(terrain,cell){
  const grid=terrain.grid,changed=[cell],queue=[];
  const brighten=(x,y,z,level)=>{
    const old=grid.extra(x,y,z);
    if(old<CARVED_AIR||old>=CARVED_AIR+level)return;
    grid.write(x,y,z,CARVED_AIR+level);changed.push([x,y,z]);queue.push([x,y,z,level]);
  };
  const [x,y,z]=cell;let sky=true;
  // The ground surface is an upper bound, even after previous excavations.
  for(let cy=y+1;cy<terrain.height(x,z);cy++)if(terrain.solid(x,cy,z)){sky=false;break;}
  if(sky){
    brighten(x,y,z,31);
    // A roof opening admits sky down the entire newly uncovered air column.
    for(let cy=y-1;cy>=MIN_DIG_Y&&grid.extra(x,cy,z)>=CARVED_AIR;cy--)brighten(x,cy,z,31);
  }else{
    let light=0;
    for(const [dx,dy,dz]of neighbours){
      const a=grid.extra(x+dx,y+dy,z+dz);
      if(a>=CARVED_AIR)light=Math.max(light,a-CARVED_AIR-1);
      else if(!grid.get(x+dx,y+dy,z+dz))light=30;
    }
    brighten(x,y,z,light);
  }
  // Light only grows when removing blocks. Existing carved air supplies the
  // frontier; never allocate cells or flood the empty space outside the world.
  for(let head=0;head<queue.length;head++){
    const [cx,cy,cz,level]=queue[head];if(level<=1)continue;
    for(const [dx,dy,dz]of neighbours)brighten(cx+dx,cy+dy,cz+dz,level-1);
  }
  return changed;
}

export class VoxelMining{
  constructor(terrain){this.terrain=terrain;this.broken=0;this.lastHit=null;}
  target(origin,direction){
    const hit=digTarget(this.terrain.grid,origin,direction);if(!hit)return null;
    const [x,y,z]=hit.cell;
    // Retain a solid bottom below the renderer's finite vertical world bounds.
    if(y<MIN_DIG_Y||y>=512||!this.terrain.inside(x,z))return null;
    return hit;
  }
  dig(origin,direction){
    const hit=this.target(origin,direction);if(!hit)return null;
    const [x,y,z]=hit.cell;
    this.terrain.grid.carve(x,y,z);
    const changed=brightenOpening(this.terrain,hit.cell);
    this.broken++;this.lastHit=hit;
    return {...hit,changed,light:(this.terrain.grid.extra(x,y,z)-CARVED_AIR)/31};
  }
  state(){return {broken:this.broken,lastHit:this.lastHit,reach:DIG_REACH};}
}
