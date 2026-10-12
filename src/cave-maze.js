import {hash} from './math.js';
import {CARVED_AIR} from './voxel-grid.js';

const STEP=24,RISE=12,BASE=4,LEVELS=44;
const directions=[[1,0],[-1,0],[0,1],[0,-1]];
const box=(x,y,z,w,h,d)=>[x,y,z,x+w-1,y+h-1,z+d-1];
function passage(a,b,height=2,width=1){
  const [x,y,z]=a,[tx,,tz]=b;
  return [box(Math.min(x,tx),y,z,Math.abs(tx-x)+width,height,width),box(tx,y,Math.min(z,tz),width,height,Math.abs(tz-z)+width)];
}

// Plan against the original caverns before carving anything. Horizontal routes
// have exact one/two-cell headroom; only shaft landings and caches are taller.
// A randomized spanning forest guarantees connectivity, then extra edges add
// loops. All geometry is excavated into the same authoritative voxel array.
export function generateCaveMaze(terrain,world,carve){
  const grid=terrain.grid,nodes=[],lookup=new Map(),candidates=[];
  const across=Math.floor((world.size-32)/STEP),key=(ix,iz,l)=>(iz*across+ix)*LEVELS+l;
  function safe(bounds,covered=true){
    const [x0,y0,z0,x1,y1,z1]=bounds;
    if(y0<BASE||!terrain.inside(x0,z0)||!terrain.inside(x1,z1))return false;
    for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
      if(terrain.height(x,z)<(covered?y1+4:y0))return false;
      if(!grid.get(x,y0-1,z))return false;
      // Keep the supporting floor of an existing gallery or coin chamber.
      for(let y=y0;y<=y1;y++)if(grid.extra(x,y,z)<CARVED_AIR&&grid.extra(x,y+1,z)>=CARVED_AIR)return false;
    }
    return true;
  }
  const safeAll=boxes=>boxes.every(b=>safe(b));
  for(let iz=0;iz<across;iz++)for(let ix=0;ix<across;ix++){
    const x=world.minX+16+ix*STEP+Math.floor(hash(ix,iz,2101)*5)-2;
    const z=world.minZ+16+iz*STEP+Math.floor(hash(ix,iz,2102)*5)-2;
    const ceiling=Math.min(500,terrain.height(x,z)-7);
    for(let y=BASE,l=0;y<=ceiling;y+=RISE,l++){
      if(!safe(box(x,y,z,2,2,2)))continue;
      const node={id:nodes.length,x,y,z,ix,iz,l};nodes.push(node);lookup.set(key(ix,iz,l),node.id);
    }
  }
  for(const a of nodes)for(const [dx,dz,dl]of [[1,0,0],[0,1,0],[0,0,1]]){
    if(a.ix+dx>=across||a.iz+dz>=across)continue;
    const id=lookup.get(key(a.ix+dx,a.iz+dz,a.l+dl));if(id===undefined)continue;
    const b=nodes[id],seed=a.id*17+b.id,height=hash(a.x,a.z,seed)<.46?1:2,width=hash(a.z,a.y,seed+1)<.28?2:1;
    let boxes,shaft;
    if(dl){
      // Offset beyond the four-cell jitter range so shafts cannot remove the
      // floor of a neighbouring horizontal route; landings remain beside it.
      const sx=a.x+8,sz=a.z+8,w=hash(a.x,a.z,a.y+2151)<.3?3:2;
      shaft={x:sx,z:sz,bottom:a.y,top:b.y,width:w,lower:[sx-2,a.y,sz],upper:[sx-2,b.y,sz]};
      boxes=[...passage([a.x,a.y,a.z],shaft.lower),...passage([b.x,b.y,b.z],shaft.upper),
        box(sx,a.y,sz,w,RISE+4,w),box(sx-2,a.y,sz-1,w+2,3,w+2),box(sx-2,b.y,sz-1,w+2,4,w+2)];
    }else boxes=passage([a.x,a.y,a.z],[b.x,b.y,b.z],height,width);
    if(safeAll(boxes))candidates.push({a:a.id,b:b.id,height:dl?null:height,width:dl?shaft.width:width,shaft,boxes,priority:hash(a.id,b.id,2117)+(dl?.12:0)});
  }
  const parent=Int32Array.from(nodes,n=>n.id),size=new Uint32Array(nodes.length).fill(1);
  function find(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
  const chosen=[];
  for(const e of candidates.sort((a,b)=>a.priority-b.priority)){
    const a=find(e.a),b=find(e.b);
    if(a!==b){parent[b]=a;size[a]+=size[b];chosen.push(e);}
    else if(hash(e.a,e.b,2141)<.32)chosen.push(e);
  }
  const groups=new Map();
  for(const n of nodes){const root=find(n.id);if(size[root]<24)continue;n.component=root;if(!groups.has(root))groups.set(root,{nodes:[],entrances:[]});groups.get(root).nodes.push(n);}

  // Tiny horizontal mouths break through a cliff at the tunnel's own level.
  // Never drill open vertical skylights or cut long trenches across the surface.
  const mouths=[];
  for(const n of nodes){
    if(n.component===undefined||terrain.height(n.x,n.z)-n.y>24)continue;
    for(const [dx,dz]of directions){
      const cells=[];let found=false;
      for(let d=0;d<=28;d++){
        const x=n.x+dx*d,z=n.z+dz*d;
        if(!terrain.inside(x,z))break;
        if(terrain.height(x,z)<=n.y){found=cells.length>=3;break;}
        const bounds=box(x,n.y,z,1,1,1);if(!safe(bounds,false))break;cells.push(bounds);
      }
      if(!found)continue;
      const end=cells.at(-1),entry=[end[0],n.y,end[2]];
      mouths.push({node:n.id,component:n.component,position:entry,yaw:Math.atan2(dx,dz),height:1,width:1,boxes:cells,priority:hash(n.id,dx+dz*3,2179)});
    }
  }
  const entrances=[];
  for(const e of mouths.sort((a,b)=>a.priority-b.priority)){
    const group=groups.get(e.component),limit=Math.max(2,Math.ceil(group.nodes.length/65));
    if(group.entrances.length>=limit)continue;
    if(entrances.some(p=>Math.hypot(p.position[0]-e.position[0],p.position[2]-e.position[2])<24&&Math.abs(p.position[1]-e.position[1])<18))continue;
    e.id=`burrow-${entrances.length+1}`;group.entrances.push(e);entrances.push(e);
  }
  // Components without a surface route are omitted instead of leaving sealed
  // mazes that can only be reached using diagnostics or arbitrary digging.
  const accessible=new Set([...groups].filter(([,g])=>g.entrances.length).map(([id])=>id));
  const activeNodes=nodes.filter(n=>accessible.has(n.component));
  const edges=chosen.filter(e=>accessible.has(nodes[e.a].component));
  const caches=[];
  for(const n of [...activeNodes].sort((a,b)=>hash(a.id,a.y,2203)-hash(b.id,b.y,2203))){
    if(caches.length>=140)break;
    if(caches.some(c=>Math.hypot(c.x-n.x,c.z-n.z)<32&&Math.abs(c.y-n.y)<20))continue;
    const bounds=box(n.x-2,n.y,n.z-2,5,3,5);if(!safe(bounds))continue;
    caches.push({node:n.id,x:n.x,y:n.y,z:n.z,component:n.component,boxes:[bounds]});
  }
  function excavate(boxes){for(const [x0,y0,z0,x1,y1,z1]of boxes)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)carve(x,y,z);}
  for(const n of activeNodes)excavate([box(n.x,n.y,n.z,1,2,1)]);
  for(const e of edges)excavate(e.boxes);
  for(const e of entrances)excavate(e.boxes);
  for(const c of caches)excavate(c.boxes);
  // Keep compact topology for diagnostics and reward placement, not duplicates
  // of every excavation box or a second occupancy map.
  const remap=new Map(activeNodes.map((n,i)=>[n.id,i]));
  const maze={nodes:activeNodes.map(({x,y,z,component})=>({x,y,z,component})),
    edges:edges.map(({a,b,height,width,shaft})=>({a:remap.get(a),b:remap.get(b),height,width,...(shaft?{shaft}:{})})),
    entrances:entrances.map(({id,node,position,yaw,height,width,component})=>({id,node:remap.get(node),position,yaw,height,width,component})),
    chambers:caches.map(c=>({node:remap.get(c.node),component:c.component,bounds:[c.x,c.z,c.y,2.5,3,2.5]}))};
  const horizontal=maze.edges.filter(e=>!e.shaft);
  maze.stats={nodes:maze.nodes.length,connections:maze.edges.length,components:accessible.size,loops:maze.edges.length-maze.nodes.length+accessible.size,
    crawlways:horizontal.filter(e=>e.height===1).length,walkways:horizontal.filter(e=>e.height===2).length,shafts:maze.edges.length-horizontal.length,entrances:maze.entrances.length,rewardChambers:maze.chambers.length};
  terrain.maze=maze;return maze;
}
