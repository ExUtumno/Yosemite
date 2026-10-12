import * as THREE from 'three';
import {WORLD} from './terrain.js';

function texture2(data,width,height,integer=false){
  const t=new THREE.DataTexture(data,width,height,integer?THREE.RedIntegerFormat:THREE.RedFormat,integer?THREE.UnsignedIntType:THREE.FloatType);
  t.internalFormat=integer?'R32UI':'R32F';t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;
}
function atlas(data){const width=4096,height=Math.max(1,Math.ceil(data.length/width)),padded=new Uint32Array(width*height);padded.set(data);return texture2(padded,width,height,true);}
function reduceMax(source,size){const n=size/4,out=new Float32Array(n*n);out.fill(-32768);for(let z=0;z<size;z++)for(let x=0;x<size;x++){const i=(z>>2)*n+(x>>2);out[i]=Math.max(out[i],source[z*size+x]);}return out;}

export function packDdaWorld(terrain,weather){
  const textures=[],keep=t=>(textures.push(t),t),packed=new Uint32Array(WORLD.size**2),max8=new Float32Array(256**2);max8.fill(-32768);
  for(let z=0;z<WORLD.size;z++)for(let x=0;x<WORLD.size;x++){
    const i=z*WORLD.size+x,h=terrain.heights[i];packed[i]=(h+32768)|(terrain.types[i]<<16);
    const k=(z>>3)*256+(x>>3);max8[k]=Math.max(max8[k],h);
  }
  const terrainMax8=max8.slice(),chunks=[...terrain.grid.chunks.values()],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],bricks=[];
  for(const c of chunks){
    const origin=[c.x,c.y,c.z];for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],origin[a]);hi[a]=Math.max(hi[a],origin[a]+32);}
    const occupied=new Uint8Array(64);
    for(let z=0;z<32;z++)for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(c.cells[z*1024+y*32+x])occupied[(z>>3)*16+(y>>3)*4+(x>>3)]=1;
    for(let z=0;z<4;z++)for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(occupied[z*16+y*4+x])bricks.push({c,x:x*8,y:y*8,z:z*8});
  }
  if(!chunks.length){lo.fill(0);hi.fill(8);}
  const dimensions=hi.map((v,a)=>(v-lo[a])/8),directory=new Uint32Array(dimensions.reduce((a,b)=>a*b,1)),voxels=new Uint32Array(bricks.length*128);
  bricks.forEach(({c,x:bx,y:by,z:bz},id)=>{
    const x=(c.x+bx-lo[0])/8,y=(c.y+by-lo[1])/8,z=(c.z+bz-lo[2])/8;directory[x+dimensions[0]*(y+dimensions[1]*z)]=id+1;
    let top=-32768,allAir=true;
    for(let dz=0;dz<8;dz++)for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){
      const type=c.cells[(bz+dz)*1024+(by+dy)*32+bx+dx],i=dz*64+dy*8+dx;
      voxels[id*128+(i>>2)]|=type<<((i&3)*8);
      if(type<128){allAir=false;if(type)top=Math.max(top,c.y+by+dy+1);}
      else{
        const wx=c.x+bx+dx-WORLD.minX,wz=c.z+bz+dz-WORLD.minZ;
        if(wx>=0&&wx<WORLD.size&&wz>=0&&wz<WORLD.size)packed[wz*WORLD.size+wx]|=1<<24;
      }
    }
    // The high bit lets traversal cross completely carved bricks in one step.
    // Their byte payload still holds per-cell daylight for surface shading.
    if(allAir)directory[x+dimensions[0]*(y+dimensions[1]*z)]|=0x80000000;
    const mx=(c.x+bx-WORLD.minX)/8,mz=(c.z+bz-WORLD.minZ)/8;
    if(mx>=0&&mx<256&&mz>=0&&mz<256)max8[mz*256+mx]=Math.max(max8[mz*256+mx],top);
  });
  const treeIndex=new THREE.Data3DTexture(directory,...dimensions);treeIndex.format=THREE.RedIntegerFormat;treeIndex.type=THREE.UnsignedIntType;treeIndex.internalFormat='R32UI';treeIndex.minFilter=treeIndex.magFilter=THREE.NearestFilter;treeIndex.generateMipmaps=false;treeIndex.needsUpdate=true;
  const max32=reduceMax(max8,256),max128=reduceMax(max32,64);
  // Cloud columns retain every separate vertical interval. No fixed layer cap.
  const cloudChunks=[...weather.grid.chunks.values()];let minX=Infinity,minZ=Infinity,endX=-Infinity,endZ=-Infinity,layers=1,minY=Infinity,maxY=-Infinity;
  for(const c of cloudChunks){minX=Math.min(minX,c.x);minZ=Math.min(minZ,c.z);endX=Math.max(endX,c.x+64);endZ=Math.max(endZ,c.z+64);for(const runs of c.multiple.values())layers=Math.max(layers,runs.length/2);}
  if(!cloudChunks.length){minX=minZ=0;endX=endZ=64;minY=600;maxY=601;}
  const cw=(endX-minX)/64,cd=(endZ-minZ)/64,cloudIndex=new Uint32Array(cw*cd),cloudColumns=new Uint32Array(cloudChunks.length*layers*4096);
  const bounds64=new Float32Array(cw*cd*2),bounds8=new Float32Array(cw*8*cd*8*2);
  for(let i=0;i<bounds64.length;i+=2){bounds64[i]=32767;bounds64[i+1]=-32768;}for(let i=0;i<bounds8.length;i+=2){bounds8[i]=32767;bounds8[i+1]=-32768;}
  cloudChunks.forEach((c,id)=>{
    const cx=(c.x-minX)/64,cz=(c.z-minZ)/64;cloudIndex[cz*cw+cx]=id+1;
    for(let z=0;z<64;z++)for(let x=0;x<64;x++){
      const i=z*64+x,runs=c.multiple.get(i)||c.bounds.subarray(i*2,i*2+2);
      for(let layer=0;layer<runs.length/2;layer++){
        const low=runs[layer*2],high=runs[layer*2+1];if(high<=low)continue;
        if(low<0||high>65535)throw new Error('Cloud interval outside GPU encoding range');
        cloudColumns[(id*layers+layer)*4096+i]=(high<<16)|low;minY=Math.min(minY,low);maxY=Math.max(maxY,high);
        const a=(cz*cw+cx)*2,b=((cz*8+(z>>3))*cw*8+cx*8+(x>>3))*2;
        bounds64[a]=Math.min(bounds64[a],low);bounds64[a+1]=Math.max(bounds64[a+1],high);bounds8[b]=Math.min(bounds8[b],low);bounds8[b+1]=Math.max(bounds8[b+1],high);
      }
    }
  });
  const boundTexture=(data,w,h)=>{const t=new THREE.DataTexture(data,w,h,THREE.RGFormat,THREE.FloatType);t.internalFormat='RG32F';t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return keep(t);};
  const uniforms={
    terrainData:{value:keep(texture2(packed,2048,2048,true))},height8:{value:keep(texture2(max8,256,256))},height32:{value:keep(texture2(max32,64,64))},height128:{value:keep(texture2(max128,16,16))},
    terrainHeight8:{value:keep(texture2(terrainMax8,256,256))},
    treeIndex:{value:keep(treeIndex)},treeData:{value:keep(atlas(voxels))},treeOrigin:{value:new THREE.Vector3(...lo)},treeDimensions:{value:new THREE.Vector3(...dimensions)},
    cloudIndex:{value:keep(texture2(cloudIndex,cw,cd,true))},cloudData:{value:keep(atlas(cloudColumns))},cloudLayers:{value:layers},cloudBounds64:{value:boundTexture(bounds64,cw,cd)},cloudBounds8:{value:boundTexture(bounds8,cw*8,cd*8)},
    cloudBoxMin:{value:new THREE.Vector3(minX,minY,minZ)},cloudBoxMax:{value:new THREE.Vector3(endX,maxY,endZ)}
  };
  return {uniforms,textures,bytes:textures.reduce((n,t)=>n+t.image.data.byteLength,0),bricks:bricks.length,cloudLayers:layers};
}
