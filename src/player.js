import * as THREE from 'three';
import {WORLD} from './terrain.js';
import {clamp} from './math.js';

// Temporary exploration aid: treat lake water at y=0 as solid ground.
const WALK_ON_WATER=true;
const RADIUS=.27,STANDING_HEIGHT=1.8,CROUCH_HEIGHT=.9,EPS=.00001;

export class Walker{
  constructor(terrain,forest){this.terrain=terrain;this.forest=forest;this.position=new THREE.Vector3();this.velocityX=0;this.velocityY=0;this.velocityZ=0;this.yaw=0;this.pitch=0;this.grounded=true;this.distance=0;this.crouched=false;this.bodyHeight=STANDING_HEIGHT;this.eye=1.7;this.cameraY=0;}
  reset(view){const [x,z]=view.position;this.grapple?.cancel();this.crouched=false;this.bodyHeight=STANDING_HEIGHT;this.eye=1.7;this.position.set(x+.5,view.elevation??this.floor(x+.5,z+.5),z+.5);this.yaw=view.yaw;this.pitch=view.pitch;this.velocityX=0;this.velocityY=0;this.velocityZ=0;this.grounded=this.collides(this.position.x,this.position.y-.002,this.position.z);this.cameraY=this.position.y+this.eye;}
  floor(x,z){return Math.max(WALK_ON_WATER?0:-Infinity,...[-.27,.27].flatMap(dx=>[-.27,.27].map(dz=>this.terrain.height(x+dx,z+dz))));}
  look(dx,dy){this.yaw-=dx*.002;this.pitch=clamp(this.pitch-dy*.002,-1.55,1.55);}
  jump(){if(this.grounded){this.velocityY=6.6;this.grounded=false;}}
  collides(x,y,z,height=this.bodyHeight){
    for(let cz=Math.floor(z-RADIUS+EPS);cz<=Math.floor(z+RADIUS-EPS);cz++)for(let cx=Math.floor(x-RADIUS+EPS);cx<=Math.floor(x+RADIUS-EPS);cx++)for(let cy=Math.floor(y+EPS);cy<=Math.floor(y+height-EPS);cy++){
      if(this.terrain.solid(cx,cy,cz)||WALK_ON_WATER&&cy<0&&this.terrain.height(cx,cz)<0)return true;
    }
    return false;
  }
  setCrouch(held){
    const crouched=held||this.crouched&&this.collides(this.position.x,this.position.y,this.position.z,STANDING_HEIGHT);
    if(crouched===this.crouched)return;
    this.crouched=crouched;this.bodyHeight=crouched?CROUCH_HEIGHT:STANDING_HEIGHT;this.eye=crouched?.8:1.7;
    // Lower the camera with the collider, before moving beneath a low roof.
    if(crouched)this.cameraY=Math.min(this.cameraY,this.position.y+this.eye);
  }
  moveAxis(axis,delta){
    if(!delta)return true;const next=this.position.clone();next[axis]+=delta;
    if(next.x<WORLD.minX+3||next.x>WORLD.minX+WORLD.size-3||next.z<WORLD.minZ+3||next.z>WORLD.minZ+WORLD.size-3)return false;
    // Horizontal motion never raises the player's feet. A jump must clear ledges.
    if(this.collides(next.x,next.y,next.z))return false;
    const before=this.position[axis];this.position[axis]=next[axis];this.distance+=Math.abs(next[axis]-before);return true;
  }
  update(dt,keys){
    this.setCrouch(keys.has('KeyC'));
    let forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
    let side=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    const length=Math.hypot(forward,side),speed=this.crouched?2.65:keys.has('ShiftLeft')||keys.has('ShiftRight')?10.6:5.3;if(length){forward/=length;side/=length;}
    const vx=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side)*speed,vz=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*side)*speed;
    // Keep fast grapple/coasting movement below one voxel per collision step.
    const fast=this.grapple?.active||Math.hypot(this.velocityX,this.velocityZ)>.1||this.velocityY>8;
    const steps=Math.ceil(dt/(fast?.004:.016)),step=dt/Math.max(1,steps);
    for(let i=0;i<steps;i++){
      this.grapple?.step(step);
      const drag=Math.exp(-(this.grapple?.phase==='attached'?.08:this.grounded?12:.3)*step);
      this.velocityX*=drag;this.velocityZ*=drag;
      if(!this.moveAxis('x',(vx+this.velocityX)*step))this.velocityX=0;
      if(!this.moveAxis('z',(vz+this.velocityZ)*step))this.velocityZ=0;
      this.grounded=this.velocityY<=0&&this.collides(this.position.x,this.position.y-.002,this.position.z);
      if(this.grounded){this.position.y=Math.round(this.position.y)+0;this.velocityY=0;continue;}
      this.velocityY=Math.max(-45,this.velocityY-18*step);
      const next=this.position.y+this.velocityY*step;
      if(this.collides(this.position.x,next,this.position.z)){
        if(this.velocityY<0){this.position.y=Math.ceil(next-EPS)+0;this.grounded=true;}
        else this.position.y=Math.floor(next+this.bodyHeight+EPS)-this.bodyHeight;
        this.velocityY=0;
      }else this.position.y=next;
    }
    if(fast)this.cameraY=this.position.y+this.eye;
    else this.cameraY+=(this.position.y+this.eye-this.cameraY)*(1-Math.exp(-dt*15));
    if(this.crouched)this.cameraY=Math.min(this.cameraY,this.position.y+this.eye);
  }
  apply(camera){camera.position.set(this.position.x,this.cameraY,this.position.z);camera.rotation.order='YXZ';camera.rotation.set(this.pitch,this.yaw,0);}
}
