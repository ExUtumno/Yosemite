import * as THREE from 'three';
import {WORLD} from './terrain.js';

function integerTexture(data,width,height,depth){
  const t=depth===undefined?new THREE.DataTexture(data,width,height,THREE.RedIntegerFormat,THREE.UnsignedIntType):new THREE.Data3DTexture(data,width,height,depth);
  t.format=THREE.RedIntegerFormat;t.type=THREE.UnsignedIntType;t.internalFormat='R32UI';t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;
}

// Reuse the existing sparse brick address space. Excavations need no new
// landscape meshes, height rebuild, or repacking of the forest/cloud textures.
export class DdaEdits{
  constructor(data,terrain){this.data=data;this.terrain=terrain;this.pending=[];this.uploadBytes=0;this.fullUploads=new Set();}
  replace(name,next){
    const u=this.data.uniforms,old=u[name].value;
    this.data.textures[this.data.textures.indexOf(old)]=next;u[name].value=next;
    this.pending=this.pending.filter(p=>p.target!==old);this.fullUploads.delete(old);this.fullUploads.add(next);old.dispose();
    this.data.bytes=this.data.textures.reduce((sum,t)=>sum+t.image.data.byteLength,0);
  }
  ensureDirectory(bx,by,bz){
    const u=this.data.uniforms,origin=u.treeOrigin.value,dimensions=u.treeDimensions.value,point=new THREE.Vector3(bx,by,bz);
    const b=point.clone().sub(origin).divideScalar(8);
    if(b.x>=0&&b.y>=0&&b.z>=0&&b.x<dimensions.x&&b.y<dimensions.y&&b.z<dimensions.z)return;
    const old=u.treeIndex.value.image,lo=origin.clone().min(point.clone().divideScalar(32).floor().multiplyScalar(32));
    const hi=origin.clone().addScaledVector(dimensions,8).max(point.clone().addScalar(8).divideScalar(32).ceil().multiplyScalar(32));
    const size=hi.sub(lo).divideScalar(8),offset=origin.clone().sub(lo).divideScalar(8),array=new Uint32Array(size.x*size.y*size.z);
    for(let z=0;z<old.depth;z++)for(let y=0;y<old.height;y++){
      const start=(z*old.height+y)*old.width,dst=offset.x+size.x*(y+offset.y+size.y*(z+offset.z));
      array.set(old.data.subarray(start,start+old.width),dst);
    }
    origin.copy(lo);dimensions.copy(size);this.replace('treeIndex',integerTexture(array,size.x,size.y,size.z));
  }
  ensureAtlas(id){
    const old=this.data.uniforms.treeData.value.image;if(id*128<=old.data.length)return;
    const height=Math.ceil(Math.max(id*128,old.data.length+128*2048)/4096),array=new Uint32Array(4096*height);array.set(old.data);
    this.replace('treeData',integerTexture(array,4096,height));
  }
  patch(target,data,width,position){
    // Staging textures stay CPU-only. copyTextureToTexture uploads just this
    // region through Three's public API (R32UI updateRanges are unsupported).
    if(!this.fullUploads.has(target))this.pending.push({target,data,width,position});
  }
  update(cells){
    const u=this.data.uniforms,bricks=new Map(),columns=new Set();
    for(const [x,y,z]of cells){const b=[x,y,z].map(v=>Math.floor(v/8)*8);bricks.set(b.join(','),b);columns.add(this.terrain.index(x,z));}
    for(const [bx,by,bz]of bricks.values()){
      this.ensureDirectory(bx,by,bz);
      const origin=u.treeOrigin.value,dim=u.treeDimensions.value,b=new THREE.Vector3(bx,by,bz).sub(origin).divideScalar(8),directory=u.treeIndex.value.image.data;
      const address=b.x+dim.x*(b.y+dim.y*b.z);let id=directory[address]&0x7fffffff;
      if(!id)id=++this.data.bricks;
      this.ensureAtlas(id);
      const words=new Uint32Array(128);let allAir=true;
      for(let z=0;z<8;z++)for(let y=0;y<8;y++)for(let x=0;x<8;x++){
        const type=this.terrain.grid.extra(bx+x,by+y,bz+z),i=x+y*8+z*64;
        words[i>>2]|=type<<((i&3)*8);if(type<128)allAir=false;
      }
      const encoded=(id|(allAir?0x80000000:0))>>>0,start=(id-1)*128;
      u.treeData.value.image.data.set(words,start);this.patch(u.treeData.value,words,128,new THREE.Vector3(start%4096,Math.floor(start/4096),0));
      if(directory[address]!==encoded){directory[address]=encoded;this.patch(u.treeIndex.value,new Uint32Array([encoded]),1,b);}
    }
    for(const i of columns){
      const texture=u.terrainData.value;if(texture.image.data[i]&(1<<24))continue;
      texture.image.data[i]|=1<<24;this.patch(texture,new Uint32Array([texture.image.data[i]]),1,new THREE.Vector3(i%WORLD.size,Math.floor(i/WORLD.size),0));
    }
    // Removing cells cannot invalidate the conservative maximum-height bounds.
  }
  flush(renderer){
    for(const texture of this.fullUploads){renderer.initTexture(texture);this.uploadBytes+=texture.image.data.byteLength;}
    this.fullUploads.clear();
    for(const {target,data,width,position}of this.pending){
      const source=integerTexture(data,width,1);renderer.copyTextureToTexture(source,target,null,position);source.dispose();this.uploadBytes+=data.byteLength;
    }
    this.pending.length=0;
  }
}
