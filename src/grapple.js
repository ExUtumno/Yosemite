import * as THREE from 'three';
import {digTarget} from './mining.js';

export const GRAPPLE_REACH=180,GRAPPLE_SPEED=48,HOOK_SPEED=240;

// The hook queries the edited voxel grid, including trunks and needles. The
// motor changes velocity; only the Walker's collision controller moves you.
export class Grapple{
  constructor(walker){
    this.walker=walker;walker.grapple=this;this.phase='idle';this.hit=null;
    this.start=new THREE.Vector3();this.anchor=new THREE.Vector3();this.hook=new THREE.Vector3();
    this.direction=new THREE.Vector3();this.radial=new THREE.Vector3();this.origin=new THREE.Vector3();
    this.age=0;this.shotAge=100;this.impactAge=100;this.flight=0;this.checkTime=0;this.shots=0;
  }
  get active(){return this.phase==='flying'||this.phase==='attached';}
  fire(origin,direction){
    this.direction.copy(direction).normalize();if(!this.direction.lengthSq())return false;
    this.hit=digTarget(this.walker.terrain.grid,origin,this.direction,GRAPPLE_REACH);
    if(this.hit?.distance<1)this.hit=null;
    this.start.copy(origin);this.hook.copy(origin);
    this.anchor.copy(origin).addScaledVector(this.direction,this.hit?.distance??60);
    if(this.hit)this.anchor.addScaledVector(new THREE.Vector3(...this.hit.normal),.025);
    this.phase='flying';this.age=0;this.shotAge=0;this.impactAge=100;this.flight=0;this.checkTime=0;this.shots++;
    this.onEvent?.('launch',this.hit);
    return !!this.hit;
  }
  release(){if(this.active){this.phase='retracting';this.age=0;this.start.copy(this.hook);this.onEvent?.('release',this.hit);}}
  cancel(){this.phase='idle';this.hit=null;this.age=0;this.shotAge=100;this.impactAge=100;}
  step(dt){
    const p=this.walker;this.age+=dt;this.shotAge+=dt;this.impactAge+=dt;
    if(this.phase==='retracting'){
      this.origin.copy(p.position);this.origin.y+=p.eye;
      this.hook.lerpVectors(this.start,this.origin,Math.min(1,this.age/.18));
      if(this.age>=.18){this.phase='idle';this.hit=null;}return;
    }
    if(!this.active)return;
    if(this.hit&&!p.terrain.solid(...this.hit.cell)){this.release();return;}
    if(this.phase==='flying'){
      this.flight+=HOOK_SPEED*dt;const distance=this.start.distanceTo(this.anchor);
      this.hook.lerpVectors(this.start,this.anchor,Math.min(1,this.flight/distance));
      if(this.flight<distance)return;
      if(!this.hit){this.release();return;}
      this.phase='attached';this.impactAge=0;
      this.onEvent?.('latch',this.hit);
      // A short launch lifts you off the ground before the cable reels in.
      if(p.grounded){p.velocityY=Math.max(p.velocityY,8);p.grounded=false;}
    }
    this.origin.copy(p.position);this.origin.y+=p.eye;
    this.radial.subVectors(this.anchor,this.origin);const distance=this.radial.length();
    if(distance>GRAPPLE_REACH*1.25){this.release();return;}
    this.checkTime-=dt;
    if(this.checkTime<=0){
      this.checkTime=.05;
      const obstruction=digTarget(p.terrain.grid,this.origin,this.radial,Math.max(0,distance-.08));
      if(obstruction&&obstruction.cell.some((v,i)=>v!==this.hit.cell[i])){this.release();return;}
    }
    if(distance<.001)return;this.radial.divideScalar(distance);
    const along=p.velocityX*this.radial.x+p.velocityY*this.radial.y+p.velocityZ*this.radial.z;
    // Reel quickly at range, brake near the anchor, and keep sideways momentum
    // for arcing around trees/cliffs and launching onward when released.
    const desired=Math.min(GRAPPLE_SPEED,Math.max(0,distance-1.6)*5);
    const impulse=THREE.MathUtils.clamp((desired-along)*7,-120,120)*dt;
    p.velocityX+=this.radial.x*impulse;p.velocityY+=this.radial.y*impulse;p.velocityZ+=this.radial.z*impulse;
    const speed=Math.hypot(p.velocityX,p.velocityY,p.velocityZ);
    if(speed>65){const scale=65/speed;p.velocityX*=scale;p.velocityY*=scale;p.velocityZ*=scale;}
  }
  state(){return {phase:this.phase,active:this.active,reach:GRAPPLE_REACH,shots:this.shots,anchor:this.hit?this.anchor.toArray():null,cell:this.hit?.cell??null,type:this.hit?.type??null,hook:this.hook.toArray(),speed:Math.hypot(this.walker.velocityX,this.walker.velocityY,this.walker.velocityZ)};}
}
