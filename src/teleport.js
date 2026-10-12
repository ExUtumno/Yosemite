import {digTarget} from './mining.js';
import {BLOCK} from './blocks.js';

export const TELEPORT_REACH=4600;

// A single long CPU DDA on key press, through the same edited cells as the
// renderer. Water uses the visible lake plane; sky has no destination.
export function teleportTarget(terrain,origin,direction){
  const d=direction.clone().normalize();let limit=TELEPORT_REACH,water=null;
  if(d.y<0){
    const distance=-origin.y/d.y,x=origin.x+d.x*distance,z=origin.z+d.z*distance;
    if(distance>=0&&distance<limit&&terrain.inside(x,z)&&terrain.height(x,z)<0){
      limit=distance;water={cell:[Math.floor(x),-1,Math.floor(z)],normal:[0,1,0],distance,type:BLOCK.WATER};
    }
  }
  return digTarget(terrain.grid,origin,d,limit)||water;
}

export function teleportPlayer(walker,origin,direction){
  const terrain=walker.terrain,hit=teleportTarget(terrain,origin,direction);if(!hit)return null;
  const [cx,cy,cz]=hit.cell,[nx,ny,nz]=hit.normal,ax=cx+nx,az=cz+nz,x=ax+.5,z=az+.5;
  if(!terrain.inside(ax,az))return null;
  let destination=null;
  // Stay in the air column touching the visible face. Prefer a nearby floor;
  // never search through a solid floor into a different cave or up through a
  // ceiling onto a mountain roof. A sheer wall can leave you falling beside it.
  for(let y=cy+ny;y>=cy+ny-12;y--){
    if(terrain.solid(ax,y,az))break;
    if(walker.collides(x,y,z))continue;
    const grounded=walker.collides(x,y-.002,z),candidate={x,y,z,grounded};
    destination??=candidate;
    if(grounded){destination=candidate;break;}
  }
  if(!destination)return null;
  walker.grapple?.cancel();walker.position.set(destination.x,destination.y,destination.z);walker.velocityX=0;walker.velocityY=0;walker.velocityZ=0;
  walker.grounded=destination.grounded;walker.cameraY=destination.y+walker.eye;
  return {hit,position:walker.position.toArray()};
}
