import {noise,fbm,hash} from './math.js';
import {CARVED_AIR} from './voxel-grid.js';
import {generateCaveMaze} from './cave-maze.js';

// Each path sweeps a rough, vaulted cross-section through actual metre cells.
// Floors stay level along the main routes; chambers, ribs and side branches
// vary independently, so a tunnel is not just an extruded circular bore.
export const CAVES=[
  {id:'apron',name:'Granite Hollow',entrance:[-115,4,143],yaw:Math.PI,
    paths:[
      {floor:4,width:9,height:13,points:[[-115,141],[-115,164],[-120,180],[-126,196],[-140,209]]},
      {floor:4,width:6,height:9,points:[[-126,196],[-155,203],[-183,196],[-210,190],[-242,184]]},
      {floor:4,width:5,height:8,points:[[-118,177],[-96,181],[-89,203],[-102,221],[-140,209]]}
    ],chambers:[[-126,191,4,17,22,18],[-171,199,4,11,12,12]],
    shafts:[[-137,194,6,5]],pillars:[[-132,186,2.7],[-163,194,1.8]],talus:[[-122,158,2.8,2],[-112,172,3,2],[-137,206,3,2],[-185,192,2.5,2]]},
  {id:'dome',name:'Dome Galleries',entrance:[-172,22,-248],yaw:.65,
    paths:[
      {floor:22,width:12,height:23,points:[[-172,-247],[-178,-258],[-205,-279],[-225,-296],[-242,-316],[-228,-334],[-199,-340],[-148,-331],[-141,-307],[-148,-280]]},
      {floor:22,width:6,height:11,points:[[-205,-279],[-199,-303],[-212,-319],[-242,-316]]}
    ],chambers:[[-236,-313,22,22,32,20]],
    shafts:[[-247,-311,7,8]],pillars:[[-248,-302,3.4],[-225,-322,2.3]],talus:[[-216,-281,4,3],[-234,-299,4,2],[-247,-327,3.5,3],[-195,-333,3,2]]}
];

export const CAVE_COUNT=150;

// Reserve the full excavation volume, including a rock shell between systems.
// Entrance spacing alone cannot stop a higher tunnel cutting another's roof or
// a skylight removing its floor. Segment bounds also allow vertically stacked
// caves where there is enough intact rock between them.
function excavationBounds(cave){
  const bounds=[];
  for(const path of cave.paths)for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],r=path.width*1.12+1;
    bounds.push([Math.min(a[0],b[0])-r,path.floor,Math.min(a[1],b[1])-r,Math.max(a[0],b[0])+r,path.floor+path.height+2,Math.max(a[1],b[1])+r]);
  }
  for(const [x,z,f,rx,h,rz]of cave.chambers)bounds.push([x-rx*1.05-1,f,z-rz*1.05-1,x+rx*1.05+1,f+h+2,z+rz*1.05+1]);
  for(const [x,z,rx,rz]of cave.shafts)bounds.push([x-rx*1.06-1,cave.entrance[1],z-rz*1.06-1,x+rx*1.06+1,Infinity,z+rz*1.06+1]);
  return bounds;
}
function overlaps(a,b){
  return a[0]<b[3]+2&&a[3]+2>b[0]&&a[1]<b[4]+2&&a[4]+2>b[1]&&a[2]<b[5]+2&&a[5]+2>b[2];
}

// Put entrances on the actual mountainside, then turn into rising ground.
// Every centreline keeps a solid floor and enough rock above its inner vault.
// This avoids buried entrances, floating passages and long surface trenches.
export function mountainCaves(terrain,world){
  const candidates=[],spacing=32;
  const protectedPoints=CAVES.flatMap(c=>c.paths.flatMap(p=>p.points));
  for(let tz=world.minZ+48;tz<world.minZ+world.size-80;tz+=spacing)for(let tx=world.minX+48;tx<world.minX+world.size-80;tx+=spacing){
    for(let attempt=0;attempt<48;attempt++){
      const x=Math.floor(tx+hash(tx,tz,1401+attempt*2)*spacing),z=Math.floor(tz+hash(tx,tz,1402+attempt*2)*spacing),floor=terrain.height(x,z);
      if(floor<16||floor>360||protectedPoints.some(p=>Math.hypot(x-p[0],z-p[1])<75))continue;
      const gx=terrain.height(x+6,z)-terrain.height(x-6,z),gz=terrain.height(x,z+6)-terrain.height(x,z-6),gradient=Math.hypot(gx,gz);
      if(gradient<5)continue;
      const dx=gx/gradient,dz=gz/gradient,depth=40+Math.floor(hash(x,z,1450)*20),width=3.5+hash(x,z,1451)*2,height=8+Math.floor(hash(x,z,1452)*5);
      const point=(d,s=0)=>[Math.round(x+dx*d-dz*s),Math.round(z+dz*d+dx*s)];
      const bend=(hash(x,z,1453)-.5)*8;
      const main=[point(0),point(12),point(25,bend),point(depth,bend*.5)];
      const side=[main[2],point(31,bend+14),point(depth-6,bend+12),main[3]];
      const covered=(points)=>points.slice(1).every(([px,pz],i)=>terrain.inside(px-10,pz-10)&&terrain.inside(px+10,pz+10)&&terrain.height(px,pz)>=floor+height+(i?10:2));
      if(!covered(main)||!covered(side))continue;
      // At the mouth the original surface is the landing; farther in the
      // entire walkable centreline must remain supported by original rock.
      const supported=points=>points.slice(1).every((b,i)=>{
        const a=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        for(let d=0;d<=length;d++){const px=Math.round(a[0]+(b[0]-a[0])*d/length),pz=Math.round(a[1]+(b[1]-a[1])*d/length);if(terrain.height(px,pz)<floor)return false;}
        return true;
      });
      if(!supported(main)||!supported(side))continue;
      const chamber=point(31,bend+6),shaft=point(depth-6,bend+12),skylight=hash(x,z,1454)<.32;
      if(terrain.height(...chamber)<floor+height+9)continue;
      const region=z>100?'South apron':x< -370?'Western ridge':x< -100&&z> -550?'Granite dome':x< -100?'Cathedral massif':x>180?'Eastern wall':'High saddle';
      candidates.push({id:`mountain-${x}-${z}`,name:`${region} cavern`,generated:true,entrance:[x,floor,z],yaw:Math.atan2(-dx,-dz),
        paths:[{floor,width,height,points:main},{floor,width:3,height:7,points:side}],
        chambers:[[...chamber,floor,7+hash(x,z,1455)*3,height+5,8]],
        shafts:skylight?[[...shaft,2.5,3]]:[],pillars:[],talus:[],priority:hash(x,z,1456)});
      break;
    }
  }
  const caves=[],reserved=CAVES.flatMap(excavationBounds);
  for(const candidate of candidates.sort((a,b)=>a.priority-b.priority)){
    if(caves.some(c=>Math.hypot(c.entrance[0]-candidate.entrance[0],c.entrance[2]-candidate.entrance[2])<32))continue;
    const bounds=excavationBounds(candidate);
    if(bounds.some(a=>reserved.some(b=>overlaps(a,b))))continue;
    caves.push(candidate);reserved.push(...bounds);if(caves.length===CAVE_COUNT-CAVES.length)break;
  }
  return caves;
}

export function generateCaves(terrain,world){
  const columns=new Set(),grid=terrain.grid,caves=[...CAVES,...mountainCaves(terrain,world)];
  const carve=(x,y,z)=>{grid.carve(x,y,z);columns.add(terrain.index(x,z));};
  const vault=(cx,cz,floor,rx,height,rz,seed)=>{
    for(let z=Math.floor(cz-rz-2);z<=Math.ceil(cz+rz+2);z++)for(let x=Math.floor(cx-rx-2);x<=Math.ceil(cx+rx+2);x++){
      const rough=(noise(x*.21,z*.21,seed)-.5)*.18;
      const r=((x+.5-cx)/rx)**2+((z+.5-cz)/rz)**2;if(r>=1+rough)continue;
      const roof=floor+Math.max(2,Math.ceil(height*Math.sqrt(Math.max(0,1-r/(1+rough)))+(fbm(x*.18,z*.18,seed+1)-.5)*3));
      for(let y=floor;y<roof;y++)carve(x,y,z);
    }
  };
  for(const [id,cave]of caves.entries()){
    for(const [pathId,path]of cave.paths.entries())for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      for(let d=0;d<=length;d+=1.5){const t=d/length,cx=a[0]+(b[0]-a[0])*t,cz=a[1]+(b[1]-a[1])*t,w=path.width*(.91+.15*noise(cx*.07,cz*.07,913));vault(cx,cz,path.floor,w,path.height,w,313+id*17+pathId);}
    }
    for(const [x,z,f,rx,h,rz]of cave.chambers)vault(x,z,f,rx,h,rz,713+id);
    for(const [cx,cz,rx,rz]of cave.shafts)for(let z=Math.floor(cz-rz-1);z<=cz+rz+1;z++)for(let x=Math.floor(cx-rx-1);x<=cx+rx+1;x++){
      if(((x+.5-cx)/rx)**2+((z+.5-cz)/rz)**2>1+(noise(x*.3,z*.3,843)-.5)*.22)continue;
      for(let y=cave.entrance[1];y<=terrain.height(x,z);y++)carve(x,y,z);
    }
    // Leave irregular granite supports through the vaults, widening at their
    // feet. These are restored ground cells, never overlapping geometry.
    for(const [cx,cz,r]of cave.pillars)for(let z=Math.floor(cz-r-2);z<=cz+r+2;z++)for(let x=Math.floor(cx-r-2);x<=cx+r+2;x++)for(let y=cave.entrance[1];y<terrain.height(x,z);y++){
      const radius=r+Math.max(0,3-(y-cave.entrance[1]))*.45+(noise(y*.17,cx,61)-.5)*.8;
      if((x+.5-cx)**2+(z+.5-cz)**2<radius*radius)grid.restore(x,y,z);
    }
    for(const [cx,cz,r,h]of cave.talus)for(let z=Math.floor(cz-r);z<=cz+r;z++)for(let x=Math.floor(cx-r);x<=cx+r;x++){
      const f=1-((x+.5-cx)**2+(z+.5-cz)**2)/(r*r);if(f<=0)continue;
      const top=cave.entrance[1]+Math.ceil(h*Math.sqrt(f));
      for(let y=cave.entrance[1];y<Math.min(top,terrain.height(x,z));y++)grid.restore(x,y,z);
    }
  }
  generateCaveMaze(terrain,world,carve);
  bakeCaveDaylight(terrain,columns,world);
  terrain.carvedVoxels=grid.count;
  terrain.caves=caves;
}

function bakeCaveDaylight(terrain,columns,{size,minX,minZ}){
  const grid=terrain.grid,skyBottom=new Map();
  for(const i of columns){
    const x=i%size+minX,z=Math.floor(i/size)+minZ;let y=terrain.height(x,z)-1;
    while(grid.extra(x,y,z)>=CARVED_AIR)y--;
    skyBottom.set(i,y+1);
  }
  const queue=new Int32Array(grid.count*3);let head=0,tail=0;
  for(const c of grid.chunks.values())for(let z=0;z<32;z++)for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const i=z*1024+y*32+x;if(c.cells[i]<CARVED_AIR)continue;
    const wx=c.x+x,wy=c.y+y,wz=c.z+z;
    if(wy>=skyBottom.get(terrain.index(wx,wz))){c.cells[i]=CARVED_AIR+31;queue[tail++]=wx;queue[tail++]=wy;queue[tail++]=wz;}
  }
  const neighbours=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  while(head<tail){
    const x=queue[head++],y=queue[head++],z=queue[head++],light=grid.extra(x,y,z)-CARVED_AIR-1;if(light<=0)continue;
    for(const [dx,dy,dz]of neighbours){
      const nx=x+dx,ny=y+dy,nz=z+dz,c=grid.chunkAt(nx,ny,nz);if(!c)continue;
      const i=(nz-c.z)*1024+(ny-c.y)*32+nx-c.x;
      if(c.cells[i]!==CARVED_AIR)continue;
      c.cells[i]=CARVED_AIR+light;queue[tail++]=nx;queue[tail++]=ny;queue[tail++]=nz;
    }
  }
}
