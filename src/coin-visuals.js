import * as THREE from 'three';

export function coinGeometry(){
  const positions=[],normals=[],colors=[];
  function append(source,tint){
    const g=source.index?source.toNonIndexed():source,c=new THREE.Color(tint);
    positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);
    for(let i=0;i<g.attributes.position.count;i++)colors.push(c.r,c.g,c.b);
    if(g!==source)g.dispose();source.dispose();
  }
  // A bevelled disc, 0.88 m across and 0.17 m thick, including both raised faces.
  const profile=[[0,-.07],[.36,-.07],[.415,-.05],[.44,-.025],[.44,.025],[.415,.05],[.36,.07],[0,.07]].map(([r,z])=>new THREE.Vector2(r,z));
  append(new THREE.LatheGeometry(profile,32).rotateX(Math.PI/2),0xf9bc31);
  // One continuous dollar silhouette, including its stem and two counters.
  const dollar=new THREE.Shape();
  dollar.moveTo(.025,.23);dollar.lineTo(.025,.196);
  dollar.quadraticCurveTo(.13,.184,.15,.10);dollar.lineTo(.09,.085);
  dollar.quadraticCurveTo(.08,.128,.025,.14);dollar.lineTo(.025,.034);
  dollar.quadraticCurveTo(.16,0,.15,-.095);dollar.quadraticCurveTo(.14,-.17,.025,-.187);
  dollar.lineTo(.025,-.23);dollar.lineTo(-.025,-.23);dollar.lineTo(-.025,-.188);
  dollar.quadraticCurveTo(-.135,-.175,-.16,-.09);dollar.lineTo(-.096,-.069);
  dollar.quadraticCurveTo(-.079,-.129,-.025,-.139);dollar.lineTo(-.025,-.022);
  dollar.quadraticCurveTo(-.143,.011,-.15,.091);dollar.quadraticCurveTo(-.16,.176,-.025,.196);
  dollar.lineTo(-.025,.23);dollar.closePath();
  const upper=new THREE.Path();upper.moveTo(-.025,.142);upper.lineTo(-.025,.048);
  upper.quadraticCurveTo(-.095,.069,-.082,.106);upper.quadraticCurveTo(-.074,.132,-.025,.142);upper.closePath();
  const lower=new THREE.Path();lower.moveTo(.025,-.043);lower.lineTo(.025,-.137);
  lower.quadraticCurveTo(.09,-.122,.082,-.084);lower.quadraticCurveTo(.075,-.06,.025,-.043);lower.closePath();
  dollar.holes.push(upper,lower);
  const emblem=new THREE.ExtrudeGeometry(dollar,{depth:.012,steps:1,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:1,curveSegments:6}).translate(0,0,.07);
  for(const side of [-1,1]){
    append(new THREE.TorusGeometry(.35,.025,6,40).translate(0,0,side*.06),0xffe287);
    append(emblem.clone().rotateY(side===1?0:Math.PI),0xffeaa2);
  }
  emblem.dispose();
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}

export class PickupEffects{
  constructor(geometry,material){
    this.group=new THREE.Group();this.group.name='Gold pickup bursts';this.active=[];
    this.coinGeometry=geometry;this.coinMaterial=material;
    this.sparkGeometry=new THREE.OctahedronGeometry(.065);
    this.ringGeometry=new THREE.RingGeometry(.8,.86,40);
  }
  burst(position,angle=0){
    const group=new THREE.Group(),coin=new THREE.Mesh(this.coinGeometry,this.coinMaterial);
    coin.position.copy(position);coin.rotation.y=angle;coin.scale.setScalar(.5);group.add(coin);
    const material=new THREE.MeshBasicMaterial({color:0xffdf74,transparent:true,opacity:1,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    const ringMaterial=material.clone();ringMaterial.side=THREE.DoubleSide;
    const ring=new THREE.Mesh(this.ringGeometry,ringMaterial);ring.position.copy(position);ring.position.y-=.95;ring.rotation.x=-Math.PI/2;ring.scale.setScalar(.15);group.add(ring);
    const sparks=[];
    for(let i=0;i<18;i++){
      const a=i*2.399963,spread=.8+(i%4)*.22,mesh=new THREE.Mesh(this.sparkGeometry,material);
      mesh.position.copy(position);group.add(mesh);
      sparks.push({mesh,velocity:new THREE.Vector3(Math.cos(a)*spread,1.2+(i%5)*.28,Math.sin(a)*spread)});
    }
    this.active.push({group,coin,ring,sparks,material,ringMaterial,origin:position.clone(),age:0,angle});this.group.add(group);
  }
  update(dt,camera){
    for(let i=this.active.length-1;i>=0;i--){
      const e=this.active[i];e.age+=dt;const t=e.age/.85;
      if(t>=1){this.group.remove(e.group);e.material.dispose();e.ringMaterial.dispose();this.active.splice(i,1);continue;}
      e.coin.position.y=e.origin.y+Math.sin(Math.min(1,t)*Math.PI*.5)*1.45;
      e.coin.rotation.y=e.angle+e.age*15;e.coin.scale.setScalar(.5*Math.max(0,1-t*1.4));
      // A player can keep running through the pickup. Never let the celebratory
      // coin intersect the camera or fill the screen at the near plane.
      if(camera)e.coin.visible=e.coin.position.distanceTo(camera.position)>.75;
      e.ring.scale.setScalar(.15+t*1.7);e.ringMaterial.opacity=Math.max(0,1-t*2);
      e.material.opacity=(1-t)**1.4;
      for(const {mesh,velocity}of e.sparks){mesh.position.copy(e.origin).addScaledVector(velocity,e.age);mesh.position.y-=e.age*e.age*1.7;mesh.rotation.set(e.age*8,e.age*6,e.age*4);mesh.scale.setScalar((1-t)*1.8);}
    }
  }
}
