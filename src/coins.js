import * as THREE from 'three';
import {WORLD} from './terrain.js';
import {coinGeometry,PickupEffects} from './coin-visuals.js';
import {hash} from './math.js';

export const COIN_SPACING=52;
export const MOUNTAIN_COIN_SPACING=16;

// Cave rewards bypass outdoor spacing, but share one occupied-cell registry.
// Use the cave floor, not the heightfield surface far above the chamber.
export function caveCoinSites(terrain,existing=[]){
  const rewards=[],cellKey=(x,y,z)=>`${Math.floor(x)}:${y}:${Math.floor(z)}`;
  const occupied=new Set(existing.map(c=>cellKey(c.x,c.y,c.z)));
  function cluster(cave,cx,cz,floor,radius){
    for(let z=Math.floor(cz-radius);z<=Math.ceil(cz+radius);z++)for(let x=Math.floor(cx-radius);x<=Math.ceil(cx+radius);x++){
      const distance=Math.hypot(x+.5-cx,z+.5-cz);
      if(distance>radius||hash(x,z,floor+1801)>.88)continue;
      const key=cellKey(x,floor,z);if(occupied.has(key))continue;
      if(!terrain.solid(x,floor-1,z)||terrain.solid(x,floor,z)||terrain.solid(x,floor+1,z))continue;
      // Exclude skylight shafts and exposed mouths: rewards belong inside.
      let roof=false;for(let y=floor+2;y<terrain.height(x,z);y++)if(terrain.solid(x,y,z)){roof=true;break;}
      if(!roof)continue;
      occupied.add(key);rewards.push({id:`cave:${key}`,x:x+.5,y:floor,z:z+.5,caveId:cave.id,index:existing.length+rewards.length});
    }
  }
  for(const cave of terrain.caves||[]){
    const before=rewards.length;
    for(const [x,z,floor,rx,,rz]of cave.chambers)cluster(cave,x,z,floor,Math.min(4,rx*.5,rz*.5));
    // A shaft or support can consume a chamber's centre. In that case, tuck
    // another cache in the inner passage, with the same cell ownership checks.
    if(rewards.length-before<20){const path=cave.paths?.[0],point=path?.points[2];if(point)cluster(cave,...point,path.floor,3);}
  }
  for(const chamber of terrain.maze?.chambers||[]){
    const [x,z,floor]=chamber.bounds;cluster({id:`maze-${chamber.component}`},x,z,floor,2);
  }
  return rewards;
}

// Keep the woodland distribution, with a denser pass over mountain ledges.
export function coinSites(terrain,forest,views=[]){
  const sites=[],buckets=new Map(),cell=COIN_SPACING;
  const bucket=(x,z)=>`${Math.floor(x/cell)},${Math.floor(z/cell)}`;
  function add(px,pz,mountain=false){
    const x=Math.round(px),z=Math.floor(pz),h=terrain.height(x,z);
    if(h<0||x<WORLD.minX+8||z<WORLD.minZ+8||x>WORLD.minX+WORLD.size-8||z>WORLD.minZ+WORLD.size-8)return false;
    if(forest.collides(x+.5,z+.5,mountain?1:3)||!terrain.solid(x,h-1,z)||terrain.solid(x,h,z)||terrain.solid(x,h+1,z))return false;
    let low=h,high=h;
    for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){const y=terrain.height(x+dx,z+dz);low=Math.min(low,y);high=Math.max(high,y);}
    if(low<0)return false;
    if(mountain){
      if(h<18||h<55&&high-low<2)return false;
      // A centred coin fits wholly inside its supporting voxel. Require an
      // adjoining foothold within one jump, rather than a flat 5x5 plateau.
      if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>{
        const y=terrain.height(x+dx,z+dz);
        return Math.abs(y-h)<=1&&terrain.solid(x+dx,y-1,z+dz)&&!terrain.solid(x+dx,y,z+dz)&&!terrain.solid(x+dx,y+1,z+dz);
      }))return false;
    }else if(high-low>1)return false;
    const spacing=mountain?MOUNTAIN_COIN_SPACING:COIN_SPACING;
    const bx=Math.floor(x/cell),bz=Math.floor(z/cell);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const s of buckets.get(`${bx+dx},${bz+dz}`)||[])if(Math.hypot(x+.5-s.x,z+.5-s.z)<spacing)return false;
    const site={id:`${x}:${z}`,x:x+.5,y:h,z:z+.5,index:sites.length};sites.push(site);
    const key=bucket(x,z);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(site);return true;
  }
  // Offer a first discovery a short walk from each starting viewpoint.
  for(const view of [...views].reverse()){
    for(let attempt=0;attempt<24;attempt++){
      const a=view.yaw+(hash(attempt,view.position[0],41)-.5)*.7,r=16+hash(attempt,view.position[1],43)*10;
      if(add(view.position[0]-Math.sin(a)*r,view.position[1]-Math.cos(a)*r))break;
    }
  }
  for(let z=WORLD.minZ+32;z<WORLD.minZ+WORLD.size-32;z+=64)for(let x=WORLD.minX+32;x<WORLD.minX+WORLD.size-32;x+=64){
    for(let attempt=0;attempt<12;attempt++)if(add(x+(hash(x,z,207+attempt*2)-.5)*54,z+(hash(x,z,208+attempt*2)-.5)*54))break;
  }
  for(let z=WORLD.minZ+24;z<WORLD.minZ+WORLD.size-24;z+=20)for(let x=WORLD.minX+24;x<WORLD.minX+WORLD.size-24;x+=20){
    for(let attempt=0;attempt<8;attempt++)if(add(x+(hash(x,z,901+attempt*2)-.5)*18,z+(hash(x,z,902+attempt*2)-.5)*18,true))break;
  }
  sites.push(...caveCoinSites(terrain,sites));return sites;
}

export class CoinLedger{
  constructor(sites){this.sites=sites;this.collected=new Set();}
  get gold(){return this.collected.size;}
  collect(position){
    const picked=[];
    for(const coin of this.sites){
      if(this.collected.has(coin.id)||Math.abs(position.y-coin.y)>1.25||Math.hypot(position.x-coin.x,position.z-coin.z)>1.05)continue;
      this.collected.add(coin.id);picked.push(coin);
    }
    return picked;
  }
}

export class GoldCoins{
  constructor(terrain,forest,views){
    this.sites=coinSites(terrain,forest,views);this.ledger=new CoinLedger(this.sites);this.elapsed=0;this.lastPickup=null;
    this.group=new THREE.Group();this.group.name='Spinning gold coins and pickup effects';
    const material=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.45,roughness:.25,emissive:0xb66708,emissiveIntensity:.35});
    this.mesh=new THREE.InstancedMesh(coinGeometry(),material,this.sites.length);this.mesh.name='Round gold coins, 0.88 metres in diameter';
    this.matrix=new THREE.Matrix4();this.translation=new THREE.Vector3();this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.frustum=new THREE.Frustum();this.cameraMatrix=new THREE.Matrix4();this.bounds=new THREE.Sphere(new THREE.Vector3(),.5);
    // No distance/forest visibility rules, dithering, or alpha fading. Coins use
    // normal opaque rendering and depth testing against the world.
    this.mesh.frustumCulled=false;
    this.effects=new PickupEffects(this.mesh.geometry,material);this.group.add(this.mesh,this.effects.group);
    for(const site of this.sites)this.writeInstance(site);
  }
  angle(site){return this.elapsed*2.6+hash(site.x,site.z,631)*Math.PI*2;}
  center(site,target=new THREE.Vector3()){return target.set(site.x,site.y+1.05+Math.sin(this.elapsed*2.8+site.index)*.045,site.z);}
  writeInstance(site,index=site.index){
    if(this.ledger.collected.has(site.id))this.matrix.makeScale(0,0,0);
    else this.matrix.makeRotationY(this.angle(site)).setPosition(this.center(site,this.translation));
    this.mesh.setMatrixAt(index,this.matrix);
  }
  update(position,canCollect=true,dt=0,camera=null){
    // Coin rotation and pickup feedback advance on the gameplay clock.
    this.elapsed+=dt;
    this.effects.update(dt,camera);
    const picked=canCollect?this.ledger.collect(position):[];
    for(const site of picked){this.lastPickup=this.center(site);this.effects.burst(this.lastPickup,this.angle(site));}
    if(camera){camera.updateMatrixWorld();this.cameraMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.cameraMatrix);}
    let count=0;
    for(const site of this.sites){
      if(this.ledger.collected.has(site.id))continue;
      // Only skip coins completely outside the camera, never by distance or
      // forest density. The sphere includes the full spinning disc.
      if(camera&&!this.frustum.intersectsSphere(this.bounds.set(this.center(site,this.bounds.center),.5)))continue;
      this.writeInstance(site,count++);
    }
    this.mesh.count=count;
    this.mesh.instanceMatrix.needsUpdate=true;
    return picked.length;
  }
  getState(){return {gold:this.ledger.gold,total:this.sites.length,remaining:this.sites.length-this.ledger.gold,rendered:this.mesh.count,pickupEffects:this.effects.active.length,animationTime:this.elapsed};}
}

