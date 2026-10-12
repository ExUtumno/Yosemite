import * as THREE from 'three';
import {hash} from './math.js';

const COLORS=[0,0xc5c4ba,0xa18651,0x81714e,0x655044,0x4a5638];
export class BlockBreakEffects{
  constructor(terrain){
    this.terrain=terrain;this.particles=[];this.sequence=0;
    this.mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:1}),512);
    this.mesh.name='Breaking voxel fragments';this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.frustumCulled=false;this.mesh.count=0;
    this.mesh.setColorAt(0,new THREE.Color()); // Compile the colored variant during loading.
    this.object=new THREE.Object3D();this.color=new THREE.Color();
  }
  burst(hit){
    const [x,y,z]=hit.cell,n=new THREE.Vector3(...hit.normal),seed=++this.sequence;
    for(let i=0;i<36;i++){
      const r=a=>hash(i,a,seed*197),offset=new THREE.Vector3(r(1)-.5,r(2)-.5,r(3)-.5);
      const position=new THREE.Vector3(x+.5,y+.5,z+.5).addScaledVector(offset,.78);
      const velocity=offset.clone().multiplyScalar(3.4).addScaledVector(n,2.1);velocity.y+=1.9+r(4)*1.7;
      this.particles.push({position,velocity,age:0,life:.65+r(5)*.45,size:.07+r(6)*.13,rotation:new THREE.Euler(r(7)*6,r(8)*6,r(9)*6),spin:4+r(10)*8,color:new THREE.Color(COLORS[hit.type]||COLORS[1]).multiplyScalar((.72+r(11)*.45)*(.32+.68*hit.light))});
    }
    if(this.particles.length>512)this.particles.splice(0,this.particles.length-512);
    this.update(0);
  }
  update(dt){
    let count=0;
    for(let i=this.particles.length-1;i>=0;i--){
      const p=this.particles[i];p.age+=dt;if(p.age>=p.life){this.particles.splice(i,1);continue;}
      p.velocity.y-=12*dt;
      for(const axis of ['x','y','z']){
        const before=p.position[axis];p.position[axis]+=p.velocity[axis]*dt;
        if(this.terrain.solid(p.position.x,p.position.y,p.position.z)){p.position[axis]=before;p.velocity[axis]*=-.22;}
      }
      const shrink=Math.min(1,(p.life-p.age)/.25);
      this.object.position.copy(p.position);this.object.rotation.set(p.rotation.x+p.age*p.spin,p.rotation.y+p.age*p.spin*.7,p.rotation.z+p.age*p.spin*.4);this.object.scale.setScalar(p.size*shrink);this.object.updateMatrix();
      this.mesh.setMatrixAt(count,this.object.matrix);this.mesh.setColorAt(count,p.color);count++;
    }
    this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
  }
}
