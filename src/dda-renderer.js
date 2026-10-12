import * as THREE from 'three';
import {SUN} from './blocks.js';
import {packDdaWorld} from './dda-data.js';
import {ddaFragment} from './dda-shader.js';
import {DdaEdits} from './dda-edits.js';

export class DdaRenderer{
  constructor(terrain,weather,{shadowSize=2048}={}){
    this.data=packDdaWorld(terrain,weather);this.weather=weather;this.lastCloudTime=-Infinity;this.shadowReady=false;
    this.edits=new DdaEdits(this.data,terrain);this.shadowDirty=null;
    this.cloudTarget=new THREE.WebGLRenderTarget(512,512,{depthBuffer:false});this.cloudTarget.texture.name='Voxel cloud sunlight mask';
    this.white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);this.white.needsUpdate=true;
    this.shadowTarget=new THREE.WebGLRenderTarget(shadowSize,shadowSize,{format:THREE.RedFormat,type:THREE.FloatType,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
    const shadowCamera=new THREE.OrthographicCamera(-850,850,850,-850,10,2900);shadowCamera.position.copy(SUN).multiplyScalar(1500).add(new THREE.Vector3(0,0,-300));shadowCamera.lookAt(0,0,-300);shadowCamera.updateMatrixWorld();
    const shadowMatrix=new THREE.Matrix4().multiplyMatrices(shadowCamera.projectionMatrix,shadowCamera.matrixWorldInverse);
    this.uniforms={...this.data.uniforms,groundShadow:{value:this.shadowTarget.texture},cloudMask:{value:this.cloudTarget.texture},
      resolution:{value:new THREE.Vector2()},wind:{value:new THREE.Vector2()},invProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},
      shadowMatrix:{value:shadowMatrix},shadowInverse:{value:shadowMatrix.clone().invert()},sunDirection:{value:SUN},farPlane:{value:4600},time:{value:0},pass:{value:0},
      palette:{value:[0,0xc5c4ba,0xa18651,0x81714e,0x655044,0x4a5638,0xf8f8f4,0x315363].map(c=>new THREE.Color(c))}};
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms:this.uniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:ddaFragment,depthTest:true,depthWrite:true});
    this.mesh=new THREE.Mesh(geometry,this.material);this.mesh.name='DDA landscape: one full-screen triangle';this.mesh.frustumCulled=false;this.mesh.renderOrder=-100;
    this.passMaterial=this.material.clone();this.passMaterial.uniforms=this.uniforms;this.passMaterial.depthTest=false;this.passMaterial.depthWrite=false;this.passMaterial.toneMapped=false;
    this.shadowMaterial=this.passMaterial.clone();this.shadowMaterial.uniforms=this.uniforms;this.shadowMaterial.defines={SHADOW_PASS:1};
    this.cloudMaterial=this.passMaterial.clone();this.cloudMaterial.uniforms=this.uniforms;this.cloudMaterial.defines={CLOUD_PASS:1};
    this.passScene=new THREE.Scene();this.passMesh=new THREE.Mesh(geometry,this.passMaterial);this.passMesh.frustumCulled=false;this.passScene.add(this.passMesh);this.passCamera=new THREE.Camera();
  }
  edit(cells,removed){
    this.edits.update(cells);
    const bounds=new THREE.Box2(),size=this.shadowTarget.width;
    for(let z=0;z<=1;z++)for(let y=0;y<=1;y++)for(let x=0;x<=1;x++){
      const p=new THREE.Vector3(removed[0]+x,removed[1]+y,removed[2]+z).applyMatrix4(this.uniforms.shadowMatrix.value);
      bounds.expandByPoint(new THREE.Vector2((p.x*.5+.5)*size,(p.y*.5+.5)*size));
    }
    bounds.min.addScalar(-4).floor().max(new THREE.Vector2(0,0));bounds.max.addScalar(4).ceil().min(new THREE.Vector2(size,size));
    if(!bounds.isEmpty())this.shadowDirty?this.shadowDirty.union(bounds):this.shadowDirty=bounds;
  }
  update(renderer,camera,time){
    this.edits.flush(renderer);
    const u=this.uniforms,target=renderer.getRenderTarget();u.wind.value.set(time*2,time*.3);u.time.value=time;
    if(!this.shadowReady||this.shadowDirty){
      // A removed voxel changes only its projection in the sun's depth map.
      // Recast that small rectangle, including the filter margin, on each dig.
      if(this.shadowReady&&this.shadowDirty){const b=this.shadowDirty;this.shadowTarget.scissor.set(b.min.x,b.min.y,b.max.x-b.min.x,b.max.y-b.min.y);this.shadowTarget.scissorTest=true;}
      this.passMesh.material=this.shadowMaterial;u.groundShadow.value=this.white;u.pass.value=1;u.resolution.value.set(this.shadowTarget.width,this.shadowTarget.height);renderer.setRenderTarget(this.shadowTarget);renderer.render(this.passScene,this.passCamera);u.groundShadow.value=this.shadowTarget.texture;this.shadowReady=true;this.shadowDirty=null;this.shadowTarget.scissorTest=false;
    }
    if(time<this.lastCloudTime||time-this.lastCloudTime>=.25){this.passMesh.material=this.cloudMaterial;u.cloudMask.value=this.white;u.pass.value=2;u.resolution.value.set(512,512);renderer.setRenderTarget(this.cloudTarget);renderer.render(this.passScene,this.passCamera);u.cloudMask.value=this.cloudTarget.texture;this.lastCloudTime=time;}
    renderer.setRenderTarget(target);u.pass.value=0;renderer.getDrawingBufferSize(u.resolution.value);camera.updateMatrixWorld();u.invProjection.value.copy(camera.projectionMatrixInverse);u.cameraWorld.value.copy(camera.matrixWorld);u.farPlane.value=camera.far;this.weather.lastTime=time;
  }
  getState(){return {backend:'dda',antialias:false,voxelTextureBytes:this.data.bytes,treeBricks:this.data.bricks,cloudLayers:this.data.cloudLayers,shadowSize:this.shadowTarget.width,landscapeTriangles:1,editUploadBytes:this.edits.uploadBytes};}
  readHits(renderer,camera,width=32,height=24){
    this.update(renderer,camera,this.uniforms.time.value);
    const target=new THREE.WebGLRenderTarget(width,height,{type:THREE.FloatType,depthBuffer:false}),previous=renderer.getRenderTarget(),values=new Float32Array(width*height*4);
    this.passMesh.material=this.passMaterial;this.uniforms.pass.value=3;this.uniforms.resolution.value.set(width,height);renderer.setRenderTarget(target);renderer.render(this.passScene,this.passCamera);renderer.readRenderTargetPixels(target,0,0,width,height,values);
    renderer.setRenderTarget(previous);target.dispose();this.uniforms.pass.value=0;renderer.getDrawingBufferSize(this.uniforms.resolution.value);return values;
  }
}
