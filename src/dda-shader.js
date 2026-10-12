export const ddaFragment=`
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp usampler3D;
uniform usampler2D terrainData,treeData,cloudIndex,cloudData;
uniform usampler3D treeIndex;
uniform sampler2D height8,height32,height128,terrainHeight8,cloudBounds64,cloudBounds8,groundShadow,cloudMask;
uniform vec3 treeOrigin,treeDimensions,cloudBoxMin,cloudBoxMax,sunDirection,palette[8];
uniform vec2 resolution,wind;
uniform mat4 invProjection,cameraWorld,shadowInverse,shadowMatrix;
uniform float farPlane,time;
uniform int pass,cloudLayers;
out vec4 outColor;
#define gl_FragColor outColor
#include <common>
const float FAR=4600.,EPS=.002;
const vec3 WORLD_MIN=vec3(-1024.,-20.,-1408.),WORLD_MAX=vec3(1024.,512.,640.);
struct Hit{float t;vec3 n;int type;};
Hit miss(){return Hit(FAR,vec3(0),0);}
vec3 safeDirection(vec3 d){return vec3(abs(d.x)<1e-7?(d.x<0.?-1e-7:1e-7):d.x,abs(d.y)<1e-7?(d.y<0.?-1e-7:1e-7):d.y,abs(d.z)<1e-7?(d.z<0.?-1e-7:1e-7):d.z);}
vec2 intersectBox(vec3 o,vec3 d,vec3 lo,vec3 hi,out vec3 n){
  vec3 a=(lo-o)/d,b=(hi-o)/d,mn=min(a,b),mx=max(a,b);
  float enter=max(mn.x,max(mn.y,mn.z));n=vec3(0);if(mn.x>=mn.y&&mn.x>=mn.z)n.x=-sign(d.x);else if(mn.y>=mn.z)n.y=-sign(d.y);else n.z=-sign(d.z);
  return vec2(enter,min(mx.x,min(mx.y,mx.z)));
}
float exitBox(vec3 o,vec3 d,vec3 lo,vec3 hi,out vec3 n){
  vec3 q=(mix(lo,hi,step(vec3(0),d))-o)/d;n=vec3(0);
  if(q.x<=q.y&&q.x<=q.z){n.x=-sign(d.x);return q.x;}
  if(q.y<=q.z){n.y=-sign(d.y);return q.y;}n.z=-sign(d.z);return q.z;
}
// Corner ties can round the next boundary back to the current distance. Only
// those stalled steps get a tiny forward nudge; ordinary face hits stay exact.
float advanceRay(float next,float current){return next>current?next:current+max(.0001,abs(current)*.000001);}
vec3 enteredPoint(vec3 o,vec3 d,float t,vec3 n){
  vec3 p=o+d*t;
  // Only snap the boundary actually crossed. Nudging all three axes moves
  // grazing rays into unrelated neighbours; advancing t can stall when a ray
  // is nearly parallel to a face because the GPU rounds back to that face.
  if(n.x!=0.)p.x=round(p.x)-n.x*EPS;
  if(n.y!=0.)p.y=round(p.y)-n.y*EPS;
  if(n.z!=0.)p.z=round(p.z)-n.z*EPS;
  return p;
}
uvec2 columnAt(ivec2 c){uint q=texelFetch(terrainData,c-ivec2(-1024,-1408),0).r;return uvec2(q&65535u,q>>16u);}
int groundHeight(ivec2 c){return int(columnAt(c).x)-32768;}
uint treeBrick(ivec3 c){ivec3 b=ivec3(floor((vec3(c)-treeOrigin)/8.));if(any(lessThan(b,ivec3(0)))||any(greaterThanEqual(b,ivec3(treeDimensions))))return 0u;return texelFetch(treeIndex,b,0).r;}
int treeType(ivec3 c,uint brick){if(brick==0u)return 0;ivec3 p=c-ivec3(floor(vec3(c)/8.))*8;int i=p.x+p.y*8+p.z*64;uint a=((brick&0x7fffffffu)-1u)*128u+uint(i/4);uint q=texelFetch(treeData,ivec2(int(a%4096u),int(a/4096u)),0).r;return int((q>>uint((i%4)*8))&255u);}
Hit groundRay(vec3 origin,vec3 direction,float limit,bool water){
  vec3 d=safeDirection(direction),n;vec2 range=intersectBox(origin,d,WORLD_MIN,WORLD_MAX,n);float t=max(0.,range.x),end=min(limit,range.y);Hit result=miss();
  if(water&&d.y<0.){float w=-origin.y/d.y;vec3 p=origin+d*w;if(w>=0.&&w<end&&all(greaterThanEqual(p.xz,WORLD_MIN.xz))&&all(lessThan(p.xz,WORLD_MAX.xz))&&groundHeight(ivec2(floor(p.xz)))<0){end=w;result=Hit(w,vec3(0,1,0),7);}}
  if(t>end||range.y<0.)return result;if(range.x<0.)n=vec3(0);
  // A ray visits many cells within the same tile/brick. Fetch its bounds and
  // brick address only on a boundary crossing; occupancy is still per voxel.
  ivec2 cached128=ivec2(-1),cached32=ivec2(-1),cached8=ivec2(-1);
  float top128=0.,top32=0.,top8=0.,terrainTop8=0.;
  ivec3 cachedBrick=ivec3(-100000);uint brickId=0u;
  for(int iteration=0;iteration<2048;iteration++){
    if(t>=end)break;
    vec3 p=enteredPoint(origin,d,t,n);if(any(lessThan(p,WORLD_MIN))||any(greaterThanEqual(p,WORLD_MAX)))break;
    ivec2 tile=ivec2(floor((p.xz-WORLD_MIN.xz)/128.));if(any(notEqual(tile,cached128))){cached128=tile;top128=texelFetch(height128,tile,0).r;}float top=top128;
    if(p.y>=top){vec2 lo=WORLD_MIN.xz+vec2(tile)*128.;t=advanceRay(exitBox(origin,d,vec3(lo.x,top,lo.y),vec3(lo.x+128.,512.,lo.y+128.),n),t);continue;}
    tile=ivec2(floor((p.xz-WORLD_MIN.xz)/32.));if(any(notEqual(tile,cached32))){cached32=tile;top32=texelFetch(height32,tile,0).r;}top=top32;
    if(p.y>=top){vec2 lo=WORLD_MIN.xz+vec2(tile)*32.;t=advanceRay(exitBox(origin,d,vec3(lo.x,top,lo.y),vec3(lo.x+32.,512.,lo.y+32.),n),t);continue;}
    tile=ivec2(floor((p.xz-WORLD_MIN.xz)/8.));if(any(notEqual(tile,cached8))){cached8=tile;top8=texelFetch(height8,tile,0).r;terrainTop8=texelFetch(terrainHeight8,tile,0).r;}top=top8;
    if(p.y>=top){vec2 lo=WORLD_MIN.xz+vec2(tile)*8.;t=advanceRay(exitBox(origin,d,vec3(lo.x,top,lo.y),vec3(lo.x+8.,512.,lo.y+8.),n),t);continue;}
    ivec3 c=ivec3(floor(p));uvec2 col=columnAt(c.xz);int height=int(col.x)-32768;
    // Ordinary ground keeps its fast column hit. Columns with carved cells
    // consult the same sparse occupancy used by collision before hitting rock.
    if(c.y<height&&(col.y&256u)==0u){int type=c.y==height-1?int(col.y&255u):1;if(type==2&&n.y<.5)type=3;return Hit(t,n,type);}
    ivec3 b=ivec3(floor(vec3(c)/8.));if(any(notEqual(b,cachedBrick))){cachedBrick=b;brickId=treeBrick(c);}uint brick=brickId;
    if((brick&0x80000000u)!=0u){vec3 lo=vec3(b)*8.;t=advanceRay(exitBox(origin,d,lo,lo+8.,n),t);continue;}
    int type=treeType(c,brick);
    if(type<128){
      if(c.y<height){type=c.y==height-1?int(col.y&255u):1;if(type==2&&n.y<.5)type=3;return Hit(t,n,type);}
      if(type!=0)return Hit(t,n,type);
    }
    if(brick==0u){
      // Skip the empty part of this brick above the current terrain column.
      vec3 lo=floor(p/8.)*8.,hi=lo+8.;lo.y=max(lo.y,float(height));
      float terrainTop=terrainTop8;
      if(p.y>=terrainTop){lo.y=max(lo.y,terrainTop);t=advanceRay(exitBox(origin,d,lo,hi,n),t);continue;}
    }
    t=advanceRay(exitBox(origin,d,vec3(c),vec3(c)+1.,n),t);
  }
  return result;
}
Hit cloudRay(vec3 worldOrigin,vec3 direction,float limit){
  vec3 origin=worldOrigin-vec3(wind.x,0,wind.y),d=safeDirection(direction),n;
  vec2 range=intersectBox(origin,d,cloudBoxMin,cloudBoxMax,n);float t=max(0.,range.x),end=min(limit,range.y);if(t>end||range.y<0.)return miss();if(range.x<0.)n=vec3(0);
  // Reuse tile bounds while stepping through individual cloud columns.
  ivec2 cached64=ivec2(-1),cached8=ivec2(-1);vec2 bound64=vec2(0),bound8=vec2(0);uint cloudId=0u;
  for(int iteration=0;iteration<1024;iteration++){
    if(t>=end)break;vec3 p=enteredPoint(origin,d,t,n);if(any(lessThan(p,cloudBoxMin))||any(greaterThanEqual(p,cloudBoxMax)))break;
    ivec2 tile=ivec2(floor((p.xz-cloudBoxMin.xz)/64.));if(any(notEqual(tile,cached64))){cached64=tile;bound64=texelFetch(cloudBounds64,tile,0).rg;cloudId=texelFetch(cloudIndex,tile,0).r;}vec2 bounds=bound64,lo=cloudBoxMin.xz+vec2(tile)*64.;
    if(bounds.y<=bounds.x){t=advanceRay(exitBox(origin,d,vec3(lo.x,cloudBoxMin.y,lo.y),vec3(lo.x+64.,cloudBoxMax.y,lo.y+64.),n),t);continue;}
    if(p.y<bounds.x){t=advanceRay(exitBox(origin,d,vec3(lo.x,cloudBoxMin.y,lo.y),vec3(lo.x+64.,bounds.x,lo.y+64.),n),t);continue;}
    if(p.y>=bounds.y){t=advanceRay(exitBox(origin,d,vec3(lo.x,bounds.y,lo.y),vec3(lo.x+64.,cloudBoxMax.y,lo.y+64.),n),t);continue;}
    ivec2 small=ivec2(floor((p.xz-cloudBoxMin.xz)/8.));if(any(notEqual(small,cached8))){cached8=small;bound8=texelFetch(cloudBounds8,small,0).rg;}bounds=bound8;lo=cloudBoxMin.xz+vec2(small)*8.;
    if(bounds.y<=bounds.x){t=advanceRay(exitBox(origin,d,vec3(lo.x,cloudBoxMin.y,lo.y),vec3(lo.x+8.,cloudBoxMax.y,lo.y+8.),n),t);continue;}
    if(p.y<bounds.x){t=advanceRay(exitBox(origin,d,vec3(lo.x,cloudBoxMin.y,lo.y),vec3(lo.x+8.,bounds.x,lo.y+8.),n),t);continue;}
    if(p.y>=bounds.y){t=advanceRay(exitBox(origin,d,vec3(lo.x,bounds.y,lo.y),vec3(lo.x+8.,cloudBoxMax.y,lo.y+8.),n),t);continue;}
    ivec2 cell=ivec2(floor(p.xz));vec3 exitNormal;float next=advanceRay(exitBox(origin,d,vec3(vec2(cell).x,cloudBoxMin.y,vec2(cell).y),vec3(vec2(cell).x+1.,cloudBoxMax.y,vec2(cell).y+1.),exitNormal),t);
    uint id=cloudId;
    if(id!=0u){
      ivec2 local=cell-ivec2(cloudBoxMin.xz)-tile*64;Hit closest=miss();
      for(int layer=0;layer<cloudLayers;layer++){
        uint address=((id-1u)*uint(cloudLayers)+uint(layer))*4096u+uint(local.y*64+local.x),q=texelFetch(cloudData,ivec2(int(address%4096u),int(address/4096u)),0).r;
        float bottom=float(q&65535u),top=float(q>>16u);if(top<=bottom)continue;
        float a=(bottom-origin.y)/d.y,b=(top-origin.y)/d.y,entry=min(a,b),leave=max(a,b),hit=max(t,entry);
        if(hit<min(next,leave)&&hit<closest.t&&hit<end)closest=Hit(hit,entry>t+.00001?vec3(0,-sign(d.y),0):n,6);
      }
      if(closest.type!=0)return closest;
    }
    t=advanceRay(next,t);n=exitNormal;
  }
  return miss();
}
Hit worldRay(vec3 o,vec3 d,bool water){Hit a=groundRay(o,d,FAR,water),b=cloudRay(o,d,a.t);if(b.t<a.t)return b;return a;}
float bh(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float bn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(bh(vec3(i,0)),bh(vec3(i+vec2(1,0),0)),f.x),mix(bh(vec3(i+vec2(0,1),0)),bh(vec3(i+vec2(1,1),0)),f.x),f.y);}
vec3 skyColor(vec3 d){return mix(vec3(.12,.245,.44),vec3(.018,.082,.27),pow(max(d.y,0.),.32));}
float cloudLight(vec3 p){
  vec2 uv=(p.xz-p.y*sunDirection.xz/sunDirection.y-vec2(-800,-1420))/vec2(2050,1970);if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))return 1.;
  vec2 e=vec2(1./512.);float c=texture(cloudMask,uv).r*.4;
  c+=(texture(cloudMask,uv+vec2(e.x,0)).r+texture(cloudMask,uv-vec2(e.x,0)).r+texture(cloudMask,uv+vec2(0,e.y)).r+texture(cloudMask,uv-vec2(0,e.y)).r)*.15;
  return mix(.15,1.,c);
}
float shadowAt(vec3 p,vec3 n){
  vec4 q=shadowMatrix*vec4(p+n*.18,1);vec3 uv=q.xyz/q.w*.5+.5;if(any(lessThan(uv,vec3(0)))||any(greaterThan(uv,vec3(1))))return 1.;
  vec2 size=vec2(textureSize(groundShadow,0)),f=fract(uv.xy*size-.5),base=(floor(uv.xy*size-.5)+.5)/size;
  float denominator=dot(-sunDirection,n)*2890.;vec2 gradient=-vec2(dot(shadowInverse[0].xyz*2.,n),dot(shadowInverse[1].xyz*2.,n))/denominator;
  float z=uv.z-.00002+dot(gradient,base-uv.xy);
  float a=step(z,texture(groundShadow,base).r),b=step(z+gradient.x/size.x,texture(groundShadow,base+vec2(1./size.x,0)).r),c=step(z+gradient.y/size.y,texture(groundShadow,base+vec2(0,1./size.y)).r),d=step(z+dot(gradient,1./size),texture(groundShadow,base+1./size).r);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
vec3 blockColor(Hit hit,vec3 p,vec3 eye){
  vec3 n=hit.n,cell=floor(p-n*.01),pixel=floor((p-n*.01)*16.),color=palette[hit.type];float grain=bh(pixel),variation=bh(cell),factor=.90+variation*.16+grain*.12,shade=1.;
  if(hit.type==1){float mineral=bh(floor(pixel*.25));factor=(.90+variation*.16+grain*.14)*mix(.82,1.04,mineral);float seam=step(.90,bh(vec3(floor(cell.x*.19),0,floor(cell.z*.17))));float bedding=step(.91,fract((cell.y+sin(cell.x*.06)*3.+sin(cell.z*.08)*2.)*.067));factor*=1.-seam*.28-bedding*.13;color*=mix(vec3(.96,.97,1.02),vec3(1.07,1.03,.92),bh(floor(cell*.2)));shade=n.y>.5?1.:.94;}
  else if(hit.type==2){factor=.80+variation*.23+grain*.28;float straw=step(.76,bh(vec3(pixel.x,floor(pixel.y*.25),floor(pixel.z*.3))));factor=(factor+straw*.17)*(.76+bn(cell.xz*.035)*.38);}
  else if(hit.type==3)shade=.88;
  else if(hit.type==4){factor=.75+bh(vec3(pixel.x,floor(pixel.y*.12),pixel.z))*.45;shade=.98;}
  else if(hit.type==5){factor=.82+variation*.25+grain*.13;shade=.94;}
  else if(hit.type==6){factor=.975+variation*.05;shade=n.y<-.5?.91:1.;}
  if(hit.type==4||hit.type==5)shade*=n.y<-.5?.86:1.;
  vec3 hemisphere=mix(vec3(.23455,.21586,.14413),vec3(.55834,.68669,.83077),n.y*.5+.5)*1.4;
  float distance=length(p-eye),caveDarkness=0.;
  if(hit.type!=6){
    ivec3 air=ivec3(floor(p+n*.01));
    if(all(greaterThanEqual(air.xz,ivec2(-1024,-1408)))&&all(lessThan(air.xz,ivec2(1024,640)))&&(columnAt(air.xz).y&256u)!=0u){
      int daylight=treeType(air,treeBrick(air));
      if(daylight>=128){float sky=pow(float(daylight-128)/31.,1.3);hemisphere*=.12+.88*sky;caveDarkness=1.-sky;}
    }
  }
  // A faint, short-range fill keeps nearby crawlway walls and grapple anchors
  // readable while the unlit maze still disappears into darkness ahead.
  hemisphere+=vec3(.42,.37,.29)*caveDarkness*max(0.,dot(n,(eye-p)/max(.01,distance)))/(1.+distance*.24+distance*distance*.07);
  float sun=max(0.,dot(n,sunDirection))*2.65;
  if(hit.type!=6&&sun>0.)sun*=shadowAt(p,n)*cloudLight(p);
  vec3 lit=color*factor*shade*(hemisphere+vec3(1.,.8796,.6867)*sun)/PI;
  if(hit.type==6)lit+=vec3(.53948,.56471,.59720)*.75;
  float fog=1.-exp(-.00023*.00023*distance*distance);
  return mix(lit,vec3(.33716,.46778,.58408),fog);
}
vec3 shadeRay(Hit h,vec3 o,vec3 d){return h.type==0?skyColor(d):blockColor(h,o+d*h.t,o);}
void main(){
  vec2 uv=gl_FragCoord.xy/resolution;
  #ifdef SHADOW_PASS
    vec4 a=shadowInverse*vec4(uv*2.-1.,-1.,1.);vec3 o=a.xyz/a.w;Hit h=groundRay(o,-sunDirection,2890.,false);gl_FragColor=vec4(h.type==0?1.:h.t/2890.,0,0,1);
  #elif defined(CLOUD_PASS)
    vec3 o=vec3(-800.+uv.x*2050.,0.,-1420.+uv.y*1970.);Hit h=cloudRay(o,sunDirection,FAR);gl_FragColor=vec4(vec3(h.type==0?1.:0.),1);
  #else
  vec4 v=invProjection*vec4(uv*2.-1.,1.,1.);vec3 direction=normalize(mat3(cameraWorld)*(v.xyz/v.w)),origin=cameraWorld[3].xyz;
  Hit h=worldRay(origin,direction,true);vec3 color;
  if(pass==3){gl_FragColor=vec4(h.t,float(h.type),h.n.x+h.n.y*2.+h.n.z*3.,1);return;}
  if(h.type==7){
    vec3 p=origin+direction*h.t,reflectedDirection=reflect(direction,vec3(0,1,0));Hit reflection=worldRay(p+vec3(0,.002,0),reflectedDirection,false);
    float fresnel=.03+.97*pow(1.-max(-direction.y,0.),5.);color=vec3(.027,.063,.078)*(.94+bh(vec3(floor(p.xz),0))*.12)*mix(.7,1.,cloudLight(p));
    color=mix(color,shadeRay(reflection,p,reflectedDirection),.09+fresnel*.20);
  }else color=shadeRay(h,origin,direction);
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  float viewDepth=dot(direction*h.t,-cameraWorld[2].xyz);
  gl_FragDepth=h.type==0?1.:log2(1.+max(0.,viewDepth))/log2(farPlane+1.);
  #endif
}
`;
