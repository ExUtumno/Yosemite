import * as THREE from 'three';

const UP=new THREE.Vector3(0,1,0),SEGMENTS=24;

export class GrappleVisuals{
  constructor(grapple,camera){
    this.grapple=grapple;this.camera=camera;this.group=new THREE.Group();this.group.name='Grappling hook, cable and anchor sparks';
    this.object=new THREE.Object3D();this.a=new THREE.Vector3();this.b=new THREE.Vector3();this.delta=new THREE.Vector3();this.muzzle=new THREE.Vector3();
    const steel=new THREE.MeshBasicMaterial({color:0xb8c5c8}),gold=new THREE.MeshBasicMaterial({color:0xe2b65e});
    this.cable=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,6),new THREE.MeshBasicMaterial({color:0xd9c797}),SEGMENTS);
    this.cable.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.cable.frustumCulled=false;this.cable.count=0;this.group.add(this.cable);
    this.hook=new THREE.Group();this.group.add(this.hook);
    const shaft=new THREE.Mesh(new THREE.BoxGeometry(.08,.45,.08),steel);this.hook.add(shaft);
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.12,.24,4),gold);tip.position.y=.31;this.hook.add(tip);
    for(let i=0;i<3;i++){
      const angle=i*Math.PI*2/3,claw=new THREE.Mesh(new THREE.BoxGeometry(.06,.23,.06),steel);
      claw.position.set(Math.cos(angle)*.13,.04,Math.sin(angle)*.13);claw.rotation.set(Math.sin(angle)*-.55,0,Math.cos(angle)*.55);this.hook.add(claw);
    }
    this.sparks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xffe6a2}),12);
    this.sparks.frustumCulled=false;this.sparks.count=0;this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(this.sparks);
    this.ring=new THREE.Mesh(new THREE.TorusGeometry(1,.055,4,24),new THREE.MeshBasicMaterial({color:0xffd786,transparent:true,opacity:0,depthWrite:false}));this.group.add(this.ring);

    // Compact block-built launcher, raised only while using the grapple.
    // Viewmodel materials render last; cable/hook retain normal world depth.
    this.weapon=new THREE.Group();this.weapon.name='Grappling gun';this.weapon.scale.setScalar(.72);camera.add(this.weapon);
    const dark=new THREE.MeshStandardMaterial({color:0x27353b,roughness:.8,metalness:.2,depthTest:false,depthWrite:false,fog:false});
    const metal=new THREE.MeshStandardMaterial({color:0x7c9298,roughness:.55,metalness:.4,depthTest:false,depthWrite:false,fog:false});
    const brass=new THREE.MeshStandardMaterial({color:0xb58a43,roughness:.6,metalness:.35,depthTest:false,depthWrite:false,fog:false});
    const box=(size,position,material)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...position);m.renderOrder=100;this.weapon.add(m);return m;};
    box([.17,.13,.28],[0,0,0],dark);box([.115,.075,.32],[0,.025,-.18],metal);
    box([.14,.12,.065],[0,.025,-.33],dark);box([.075,.055,.01],[0,.025,-.369],brass);
    const grip=box([.085,.18,.10],[0,-.12,.07],dark);grip.rotation.x=-.2;
    box([.055,.025,.23],[0,.082,-.03],brass);box([.022,.06,.025],[0,.10,-.26],dark);
    this.reel=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.07,12),brass);this.reel.rotation.z=Math.PI/2;this.reel.position.set(.12,-.02,.02);this.reel.renderOrder=100;this.weapon.add(this.reel);
    box([.015,.035,.11],[.16,-.02,.02],metal);
    this.group.visible=false;this.weapon.visible=false;
  }
  update(hidden=false){
    const g=this.grapple,visible=!hidden&&g.phase!=='idle';this.group.visible=visible;this.weapon.visible=!hidden&&(visible||g.shotAge<.4);
    if(!this.weapon.visible)return;
    const kick=Math.exp(-g.shotAge*20),retract=g.phase==='retracting'?Math.min(1,g.age/.18):0;
    this.weapon.position.set(.40,-.32-retract*.04,-.70+kick*.05);this.weapon.rotation.set(kick*.12,0,-.08);
    if(g.phase==='attached')this.reel.rotation.y=g.shotAge*28;
    this.camera.updateMatrixWorld();this.muzzle.set(0,.025,-.37).applyMatrix4(this.weapon.matrixWorld);
    if(!visible)return;
    this.hook.position.copy(g.hook);this.delta.subVectors(g.hook,this.muzzle).normalize();this.hook.quaternion.setFromUnitVectors(UP,this.delta);
    const length=this.muzzle.distanceTo(g.hook),sag=g.phase==='attached'?.025:Math.min(1.5,length*.02);
    this.a.copy(this.muzzle);
    for(let i=0;i<SEGMENTS;i++){
      const t=(i+1)/SEGMENTS;this.b.lerpVectors(this.muzzle,g.hook,t);this.b.y-=Math.sin(t*Math.PI)*sag;
      if(g.phase==='flying')this.b.x+=Math.sin(t*Math.PI*8-g.shotAge*25)*Math.sin(t*Math.PI)*Math.min(.28,length*.01);
      this.delta.subVectors(this.b,this.a);const segmentLength=this.delta.length();this.object.position.copy(this.a).add(this.b).multiplyScalar(.5);
      this.object.quaternion.setFromUnitVectors(UP,this.delta.normalize());const radius=.004+Math.min(180,this.object.position.distanceTo(this.camera.position))*.00035;
      this.object.scale.set(radius,segmentLength,radius);this.object.updateMatrix();this.cable.setMatrixAt(i,this.object.matrix);this.a.copy(this.b);
    }
    this.cable.count=SEGMENTS;this.cable.instanceMatrix.needsUpdate=true;
    this.ring.visible=g.impactAge<.4&&!!g.hit;this.sparks.count=0;
    if(this.ring.visible){
      const age=g.impactAge;this.ring.position.copy(g.anchor);this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...g.hit.normal));this.ring.scale.setScalar(.15+age*2);this.ring.material.opacity=1-age/.4;
      for(let i=0;i<12;i++){
        const angle=i*Math.PI*2/12;this.object.position.set(Math.cos(angle)*age*3,Math.sin(angle)*age*3,age*1.5).applyQuaternion(this.ring.quaternion).add(g.anchor);
        this.object.quaternion.identity();this.object.scale.setScalar(.045*(1-age/.4));this.object.updateMatrix();this.sparks.setMatrixAt(i,this.object.matrix);
      }
      this.sparks.count=12;this.sparks.instanceMatrix.needsUpdate=true;
    }
  }
}
