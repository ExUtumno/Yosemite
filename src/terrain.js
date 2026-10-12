import {BLOCK} from './blocks.js';
import {bell,fbm,noise,smooth,mix,hash,yieldTask} from './math.js';
import {VIEWS} from './views.js';
import {VoxelGrid} from './voxel-grid.js';
import {generateCaves} from './caves.js';

export const WORLD={minX:-1024,minZ:-1408,size:2048};
export const LAKE={x:-20,z:-35,rx:177,rz:120};
export function lakeDistance(x,z){const dx=(x-LAKE.x)/LAKE.rx,dz=(z-LAKE.z)/LAKE.rz,a=Math.atan2(dz,dx);return (Math.hypot(dx,dz)-1-.035*Math.sin(a*5)-.022*Math.sin(a*9+.4))*120;}
function summit(x,z,cx,cz,rx,rz,height){const r=(Math.abs((x-cx)/rx)**1.35+Math.abs((z-cz)/rz)**1.35)**(1/1.35);return height*Math.max(0,1-r)**.93;}
export function sculpt(x,z){
  const n=fbm(x*.011,z*.011,51),detail=fbm(x*.055,z*.055,13);
  let h=4+(n-.5)*5+(detail-.5)*1.6;
  const far=1-smooth(-240,-150,z);
  h+=far*(12+28*fbm(x*.006,z*.006,7));
  const massif=158*bell(x,z,-270,-700,250,225);
  const wx=x+(fbm(x*.022,z*.018,104)-.5)*22,wz=z+(noise(x*.026,z*.021,18)-.5)*18;
  const main=Math.max(summit(wx,wz,-234,-713,137,158,279),summit(wx,wz,-300,-716,65,110,258),summit(wx,wz,-328,-719,51,97,208));
  const fins=(noise(x*.095,z*.009,40)-.5)*18*smooth(130,270,massif+main);
  h=Math.max(h,massif+main+fins+(detail-.5)*13);
  const domeR=((x+285)/164)**2+((z+394)/149)**2;
  if(domeR<1)h=Math.max(h,24+137*(1-domeR)**.57+(detail-.5)*9);
  h=Math.max(h,(96+25*n)*bell(x,z,-450,-510,180,195));
  const wallLine=-490+.00078*(x-140)**2+(noise(x*.012,0,271)-.5)*60;
  const wallTop=124+Math.max(0,x+35)*.30+(fbm(x*.014,z*.009,93)-.5)*56;
  const wall=wallTop*Math.exp(-(((z-wallLine)/118)**2))*smooth(-110,90,x);
  const back=1-smooth(-880,-1120,z);
  h=Math.max(h,wall*back+24*fbm(x*.027,z*.044,42)*smooth(20,80,wall));
  if(wall>65){const ledge=Math.floor(h/19)*19;h=mix(h,ledge,smooth(.28,.8,noise(x*.015,z*.012,33))*.45);}
  h=Math.max(h,(215+15*n)*bell(x,z,30,-650,350,175));
  // A walkable granite apron rises from the south shore to the two overlooks.
  const overlook=76*Math.exp(-(((x+55)/50)**4))*smooth(172,205,z)*(1-smooth(335,420,z));
  const lowerLedge=44*Math.exp(-(((x+140)/75)**4))*smooth(140,190,z)*(1-smooth(228,265,z));
  h=Math.max(h,overlook+3*n,lowerLedge+2*n);
  const meadow=smooth(-40,-10,x)*(1-smooth(170,230,x))*smooth(75,110,z)*(1-smooth(245,280,z));
  h=mix(h,Math.min(h,1.4+smooth(70,230,z)*2+.5*noise(x*.04,z*.04,82)),meadow);
  if(h>45){const joints=noise(x*.17,z*.008,37);h-=smooth(65,160,h)*Math.max(0,.35-joints)*13;}
  const d=lakeDistance(x,z);
  if(d<10)h=mix(-7+Math.max(-1,d*.085),h,smooth(-3,10,d));
  return Math.floor(h);
}

export class VoxelTerrain{
  constructor(){this.heights=new Int16Array(WORLD.size**2);this.types=new Uint8Array(WORLD.size**2);this.grid=new VoxelGrid((x,y,z)=>this.voxel(x,y,z));}
  index(x,z){return (z-WORLD.minZ)*WORLD.size+x-WORLD.minX;}
  inside(x,z){return x>=WORLD.minX&&x<WORLD.minX+WORLD.size&&z>=WORLD.minZ&&z<WORLD.minZ+WORLD.size;}
  height(x,z){x=Math.floor(x);z=Math.floor(z);return this.inside(x,z)?this.heights[this.index(x,z)]:500;}
  type(x,z){x=Math.floor(x);z=Math.floor(z);return this.inside(x,z)?this.types[this.index(x,z)]:BLOCK.STONE;}
  slope(x,z){return Math.max(Math.abs(this.height(x+3,z)-this.height(x-3,z)),Math.abs(this.height(x,z+3)-this.height(x,z-3)))/6;}
  voxel(x,y,z){
    if(!this.inside(x,z))return 0;
    const i=this.index(x,z),h=this.heights[i];
    return y<h?(y===h-1?this.types[i]:BLOCK.STONE):y<0?BLOCK.WATER:0;
  }
  async generate(progress){
    const {minX,minZ,size}=WORLD;
    for(let z=minZ;z<minZ+size;z++){
      for(let x=minX;x<minX+size;x++)this.heights[this.index(x,z)]=sculpt(x+.5,z+.5);
      if((z-minZ)%64===0){progress(.05+.25*(z-minZ)/size);await yieldTask();}
    }
    for(let z=minZ;z<minZ+size;z++)for(let x=minX;x<minX+size;x++){
      const h=this.height(x,z),s=this.slope(x,z),d=lakeDistance(x,z);
      const rock=s>.62||h>210||h>90&&noise(x*.026,z*.023,17)>.37||h>18&&z>180||h>45&&((x+285)/170)**2+((z+394)/155)**2<1||d<7&&noise(x*.07,z*.07,43)>.40;
      this.types[this.index(x,z)]=rock?BLOCK.STONE:BLOCK.MEADOW;
    }
    // Dry meadow hummocks are full one-metre grass blocks. Their surfaces and
    // collisions belong to the same grid as the rest of the landscape.
    for(let z=90;z<340;z++)for(let x=-350;x<260;x++){
      const i=this.index(x,z);
      if(this.types[i]===BLOCK.MEADOW&&this.heights[i]>1&&noise(x*.28,z*.28,483)>.74&&!VIEWS.some(v=>Math.hypot(x-v.position[0],z-v.position[1])<3))this.heights[i]++;
    }
    // Low voxel erratics along the glacial shores and forest floor.
    for(let i=0;i<1800;i++){
      const x=Math.floor(-620+hash(i,1,9)*1220),z=Math.floor(-650+hash(i,2,9)*960),d=lakeDistance(x,z),h=this.height(x,z);
      if(h<1||d<-1||this.slope(x,z)>.75||z>110&&x>-90&&x<175||VIEWS.some(v=>Math.hypot(x-v.position[0],z-v.position[1])<28))continue;
      const r=2+Math.floor(hash(i,3,9)*4);
      for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
        const f=1-(dx*dx+dz*dz)/(r*r);if(f<=0)continue;
        const idx=this.index(x+dx,z+dz),cap=h+Math.ceil(Math.sqrt(f)*r*.65);
        if(cap>this.heights[idx]){this.heights[idx]=cap;this.types[idx]=BLOCK.STONE;}
      }
    }
    generateCaves(this,WORLD);
  }
  solid(x,y,z){const type=this.grid.get(Math.floor(x),Math.floor(y),Math.floor(z));return type!==0&&type!==BLOCK.WATER;}
}
