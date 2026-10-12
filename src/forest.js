import {BLOCK} from './blocks.js';
import {random,hash,noise,smooth,yieldTask} from './math.js';
import {lakeDistance} from './terrain.js';

export function pine(seed,height,radius){
  const rng=random(seed),cells=new Map(),key=(x,y,z)=>`${x},${y},${z}`;
  const put=(x,y,z,t)=>{const k=key(x,y,z);if(t===BLOCK.TRUNK||cells.get(k)!==BLOCK.TRUNK)cells.set(k,t);};
  for(let y=0;y<height-4;y++)put(0,y,0,BLOCK.TRUNK);
  const bottom=Math.floor(height*.20);
  for(let y=bottom;y<height+1;y++){
    const f=(y-bottom)/(height-bottom),tier=(y-bottom)%3===0?.76:1;
    const r=radius*(1-f)**.82*tier+.45;
    for(let z=-Math.ceil(r);z<=Math.ceil(r);z++)for(let x=-Math.ceil(r);x<=Math.ceil(r);x++){
      const d=Math.hypot(x,z);if(d>r+(rng()-.5)*.85||d>1&&rng()<.08)continue;
      put(x,y,z,BLOCK.NEEDLES);
    }
    if((y-bottom)%4===1&&f<.84){const length=Math.max(1,Math.floor(r-.5));for(let j=0;j<4;j++)for(let i=1;i<=length;i++)put(j<2?(j?i:-i):0,y,j>=2?(j===2?i:-i):0,BLOCK.TRUNK);}
  }
  return {cells:[...cells].map(([k,type])=>[...k.split(',').map(Number),type]),height};
}

export class VoxelForest{
  constructor(terrain){this.terrain=terrain;this.trunks=new Set();this.count=0;this.voxelCount=0;}
  async generate(views,progress){
    this.variants=Array.from({length:12},(_,i)=>pine(1603+i*781,i<3?8+i*2:18+(i%6)*2,i<3?2:3+Number(i%3===0)));
    const terrain=this.terrain,grid=terrain.grid;
    const add=(x,z,variant)=>{
      x=Math.floor(x);z=Math.floor(z);const y=terrain.height(x,z);if(y<1||!terrain.solid(x,y-1,z))return;
      if(views.some(v=>Math.hypot(v.position[0]-x,v.position[1]-z)<24))return;
      for(const [dx,dy,dz,type]of this.variants[variant].cells)grid.set(x+dx,y+dy,z+dz,type);
      this.trunks.add(`${x},${z}`);this.count++;
    };
    for(let z=-970;z<345;z+=6){
      for(let x=-710;x<710;x+=6){
        const px=x+Math.floor(hash(x,z,31)*5),pz=z+Math.floor(hash(x,z,38)*5),h=terrain.height(px,pz),d=lakeDistance(px,pz),s=terrain.slope(px,pz);
        if(h<1||h>330||s>1.6||d<1)continue;
        let density=.34*(1-smooth(80,300,h)*.85);
        if(d>0&&d<100&&pz<100)density=.79;
        if(pz>35&&px>-240&&px<250)density=.025;
        if(pz>104&&px>-110&&px<175)density=0;
        if(pz>190&&h>20)density=0;
        if(terrain.type(px,pz)===BLOCK.STONE)density*=.22;
        if(noise(px*.015,pz*.015,321)<.3)density*=.28;
        if(hash(px,pz,14)>density)continue;
        const small=h>180||hash(px,pz,27)>.92;add(px,pz,small?Math.floor(hash(px,pz,71)*3):3+Math.floor(hash(px,pz,74)*9));
      }
      if(z%30===-10){progress(.30+.13*(z+970)/1315);await yieldTask();}
    }
    // Foreground and shoreline pines are in-world trees, visible from every view.
    for(const [x,z,v]of [[-171,171,9],[-158,148,8],[-128,132,7],[-110,173,6],[18,92,9],[-49,94,6],[-38,104,7],[4,125,10],[145,121,11],[175,133,9],[101,80,7],[143,53,10],[188,103,10],[-205,-16,8],[-145,-117,6],[75,-140,9],[-42,115,1],[-82,130,1],[120,220,1]])add(x,z,v);
    this.voxelCount=grid.count-(terrain.carvedVoxels||0);
  }
  collides(x,z,radius=.28){
    for(let dz=Math.floor(z-radius);dz<=Math.floor(z+radius);dz++)for(let dx=Math.floor(x-radius);dx<=Math.floor(x+radius);dx++)if(this.trunks.has(`${dx},${dz}`))return true;
    return false;
  }
}
