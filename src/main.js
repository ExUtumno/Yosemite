import * as THREE from 'three';
import {SUN} from './blocks.js';
import {VoxelTerrain} from './terrain.js';
import {VoxelForest} from './forest.js';
import {VoxelWeather} from './weather.js';
import {DdaRenderer} from './dda-renderer.js';
import {Walker} from './player.js';
import {VIEWS} from './views.js';
import {LookInput,lockMouse} from './look-input.js';
import {GoldCoins} from './coins.js';
import {GpuTimer} from './gpu-timer.js';
import {FramePerformance} from './frame-performance.js';
import {VoxelMining,DIG_INTERVAL} from './mining.js';
import {BlockBreakEffects} from './break-effects.js';
import {teleportPlayer} from './teleport.js';
import {Grapple} from './grapple.js';
import {GrappleVisuals} from './grapple-visuals.js';
import {GameAudio} from './audio.js';

const $=s=>document.querySelector(s),canvas=$('#world'),crosshair=$('#crosshair'),keys=new Set(),params=new URLSearchParams(location.search);
const shadowSize=Math.max(512,Math.min(4096,Number(params.get('shadow'))||2048));
const framePerformance=new FramePerformance({adaptive:params.get('resolution')!=='native'});
const audio=new GameAudio();
const loadingTimes=[];let loadStart=performance.now(),loadMark=loadStart;
function markLoaded(stage){const now=performance.now();loadingTimes.push({stage,ms:now-loadMark});loadMark=now;}
let dda,gpuTimer,loadMs=0;
let mining,breakEffects,digHeld=false,digDelay=0;
let grapple,grappleVisuals;
const digDirection=new THREE.Vector3();
let renderer,scene,camera,terrain,forest,weather,walker,coins,time=0,frames=0,view=2,photo=false,paused=false,environmentTime=null,last=performance.now(),zoom=1,ready=false,pickupTimer;
const look=new LookInput((dx,dy)=>walker.look(dx,dy));
const progress=p=>{$('#progress').style.transform=`scaleX(${p})`;$('#percent').textContent=`${Math.round(p*100)}%`;};
function applyResolution(){renderer.setDrawingBufferSize(innerWidth,innerHeight,framePerformance.pixelRatio);if(gpuTimer)gpuTimer.recentMs=null;}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.fov=VIEWS[view-1].fov/zoom;camera.updateProjectionMatrix();if(framePerformance.resize(innerWidth,innerHeight,devicePixelRatio))applyResolution();}
function setView(id){
  digHeld=false;
  if(!Number.isInteger(id)||id<1||id>4)throw new RangeError('View must be 1–4');view=id;walker.reset(VIEWS[id-1]);zoom=1;keys.clear();look.reset();resize();walker.apply(camera);
  const url=new URL(location.href);url.searchParams.set('view',id);url.searchParams.delete('cave');history.replaceState({},'',url);
}
function setPhoto(on){photo=on;digHeld=false;if(on){grapple?.cancel();audio.setActive(false);}look.reset();document.body.classList.toggle('photo',on);if(on&&document.pointerLockElement)document.exitPointerLock();}
function setCave(id){
  digHeld=false;
  const cave=terrain.caves.find(c=>c.id===id);if(!cave)throw new RangeError('Unknown cave');
  const [x,y,z]=cave.entrance;walker.reset({position:[x,z],elevation:y,yaw:cave.yaw,pitch:.08});keys.clear();look.reset();walker.apply(camera);
  const url=new URL(location.href);url.searchParams.set('cave',id);history.replaceState({},'',url);
}
function pause(){paused=true;audio.setActive(false);digHeld=false;grapple?.cancel();keys.clear();look.reset();if(document.pointerLockElement)document.exitPointerLock();}
function unlockAudio(){if(ready&&!photo&&!document.hidden)audio.unlock();}
function fireGrapple(){
  if(!ready||photo||document.hidden)return;
  paused=false;unlockAudio();canvas.focus({preventScroll:true});
  walker.apply(camera);camera.updateMatrixWorld();camera.getWorldDirection(digDirection);grapple.fire(camera.position,digDirection);
  if(!document.pointerLockElement){look.reset();void lockMouse(canvas);}
}
function inspectDigging(){
  camera.updateMatrixWorld();camera.getWorldDirection(digDirection);
  return {...mining.state(),target:photo?null:mining.target(camera.position,digDirection),fragments:breakEffects.mesh.count};
}
function dig(){
  if(!ready||photo||paused)return;
  walker.apply(camera);camera.updateMatrixWorld();camera.getWorldDirection(digDirection);
  const hit=mining.dig(camera.position,digDirection);if(!hit)return;
  dda.edit(hit.changed,hit.cell);breakEffects.burst(hit);audio.dig(hit);
}
function teleport(){
  if(!ready||photo||document.hidden)return;
  walker.apply(camera);camera.updateMatrixWorld();camera.getWorldDirection(digDirection);
  if(!teleportPlayer(walker,camera.position,digDirection))return;
  digHeld=false;const crouchHeld=keys.has('KeyC');keys.clear();if(crouchHeld)keys.add('KeyC');look.reset();paused=false;walker.apply(camera);
}
function updateGold(picked=0){
  $('#gold-count').textContent=coins.ledger.gold;
  if(picked){
    audio.coin(picked,coins.lastPickup.toArray());
    const hud=$('#gold-hud');$('#gold-pickup').textContent=`+${picked} gold`;hud.classList.add('collected');clearTimeout(pickupTimer);pickupTimer=setTimeout(()=>hud.classList.remove('collected'),1500);
    if(!photo){
      hud.animate([{transform:'scale(1)'},{transform:'scale(1.16)',boxShadow:'0 0 32px #ffd46988',offset:.3},{transform:'scale(1)'}],{duration:500,easing:'ease-out'});
      const projected=coins.lastPickup.clone().project(camera),target=hud.querySelector('.gold-icon').getBoundingClientRect();
      const sx=Math.max(40,Math.min(innerWidth-40,(projected.x*.5+.5)*innerWidth)),sy=Math.max(40,Math.min(innerHeight-40,(-projected.y*.5+.5)*innerHeight));
      const flight=document.createElement('i');flight.className='gold-flight';flight.setAttribute('aria-hidden','true');flight.style.left=`${sx}px`;flight.style.top=`${sy}px`;document.body.append(flight);
      const dx=target.x+target.width/2-sx,dy=target.y+target.height/2-sy;
      flight.animate([{transform:'translate(-50%,-50%) scale(.5)',opacity:0},{transform:'translate(-50%,-50%) scale(1.15)',opacity:1,offset:.15},{transform:`translate(calc(-50% + ${dx*.4}px),calc(-50% + ${dy*.5-80}px)) scale(.9)`,opacity:1,offset:.55},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.45)`,opacity:0}],{duration:650,easing:'cubic-bezier(.25,.6,.35,1)'}).onfinish=()=>flight.remove();
      const popup=document.createElement('span');popup.className='gold-popup';popup.textContent=`+${picked}`;popup.style.left=`${sx}px`;popup.style.top=`${sy-35}px`;document.body.append(popup);
      popup.animate([{transform:'translate(-50%,0) scale(.65)',opacity:0},{transform:'translate(-50%,-15px) scale(1.12)',opacity:1,offset:.18},{transform:'translate(-50%,-70px) scale(1)',opacity:0}],{duration:850,easing:'ease-out'}).onfinish=()=>popup.remove();
    }
  }
}
function controls(){
  let moveTouch=null,lookTouch=null,lastTap=null;
  const moveKeys=['KeyW','KeyA','KeyS','KeyD','ShiftLeft'];
  const clearInput=()=>{keys.clear();digHeld=false;grapple.cancel();audio.setActive(false);look.reset();moveTouch=null;lookTouch=null;lastTap=null;};
  addEventListener('resize',resize);addEventListener('blur',()=>{clearInput();paused=true;});addEventListener('focus',()=>{look.reset();framePerformance.resetTiming();last=performance.now();});document.addEventListener('visibilitychange',()=>{clearInput();if(document.hidden)paused=true;framePerformance.resetTiming();last=performance.now();});
  addEventListener('keydown',e=>{
    if(!ready||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.code==='KeyM'){if(!e.repeat){unlockAudio();audio.toggleMute();}return;}
    if(e.code!=='Escape')unlockAudio();
    if(/^(Digit|Numpad)[1-4]$/.test(e.code)){setView(Number(e.code.at(-1)));return;}
    if(e.code==='Escape'){setPhoto(false);pause();return;}
    if(!e.repeat&&e.code==='KeyR'){setView(view);return;}
    if(e.code==='KeyT'){e.preventDefault();if(!e.repeat)teleport();return;}
    if(e.code==='Space'){e.preventDefault();paused=false;if(!e.repeat)walker.jump();return;}
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyC'].includes(e.code)){e.preventDefault();paused=false;keys.add(e.code);}
  });
  addEventListener('keyup',e=>keys.delete(e.code));
  document.addEventListener('pointerlockchange',()=>{look.reset();if(!document.pointerLockElement){keys.clear();digHeld=false;grapple.cancel();paused=true;audio.setActive(false);}});
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&!paused&&!document.hidden)look.relative(e.movementX,e.movementY);});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  // Mouse events also fire when right is pressed while left is already held.
  canvas.addEventListener('mousedown',e=>{if(e.button===2){e.preventDefault();fireGrapple();}});
  addEventListener('mouseup',e=>{if(e.button===2)grapple.release();});
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;paused=false;unlockAudio();canvas.focus({preventScroll:true});
    if(e.pointerType==='touch'){
      e.preventDefault();canvas.setPointerCapture(e.pointerId);
      if(e.clientX<innerWidth*.4&&!moveTouch)moveTouch={id:e.pointerId,x:e.clientX,y:e.clientY};
      else if(!lookTouch){lookTouch={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),moved:0};look.start(e.pointerId,e.clientX,e.clientY);}
    }else{
      if(!document.pointerLockElement){look.reset();void lockMouse(canvas);}
      digHeld=true;digDelay=DIG_INTERVAL;dig();
    }
  });
  addEventListener('pointerup',e=>{if(e.button===0)digHeld=false;if(e.pointerType==='touch'&&!paused)unlockAudio();});
  addEventListener('pointercancel',()=>{digHeld=false;grapple.cancel();});
  canvas.addEventListener('pointermove',e=>{
    if(paused||document.pointerLockElement)return;
    if(e.pointerType==='touch'){
      if(moveTouch?.id===e.pointerId){
        const dx=e.clientX-moveTouch.x,dy=e.clientY-moveTouch.y;
        for(const key of moveKeys)keys.delete(key);
        if(dx>18)keys.add('KeyD');if(dx< -18)keys.add('KeyA');if(dy>18)keys.add('KeyS');if(dy< -18)keys.add('KeyW');if(Math.hypot(dx,dy)>85)keys.add('ShiftLeft');
      }else if(lookTouch?.id===e.pointerId){lookTouch.moved=Math.max(lookTouch.moved,Math.hypot(e.clientX-lookTouch.x,e.clientY-lookTouch.y));look.absolute(e.pointerId,e.clientX,e.clientY);}
    }else{
      // Immediate mouse look before the first click. Capture needs a browser
      // user gesture, so clicking the world enables unlimited pointer motion.
      if(!look.drag)look.start(e.pointerId,e.clientX,e.clientY);else look.absolute(e.pointerId,e.clientX,e.clientY);
    }
  });
  canvas.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch'&&!document.pointerLockElement){look.reset();digHeld=false;grapple.release();}});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{
    if(moveTouch?.id===e.pointerId){moveTouch=null;for(const key of moveKeys)keys.delete(key);}
    if(lookTouch?.id===e.pointerId){
      const now=performance.now();
      if(event==='pointerup'&&lookTouch.moved<12&&now-lookTouch.time<250){
        if(lastTap&&now-lastTap.time<320&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<32){walker.jump();lastTap=null;}
        else lastTap={time:now,x:e.clientX,y:e.clientY};
      }
      lookTouch=null;
    }
    look.stop(e.pointerId);
  });
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(1,Math.min(2.1,zoom-e.deltaY*.001));resize();},{passive:false});
}
function frame(now){
  const frameMs=now-last,dt=Math.max(0,Math.min(.07,frameMs/1000));last=now;time+=dt;frames++;
  if(!document.hidden){const stats=framePerformance.sample(frameMs,gpuTimer.recentMs);if(stats.fpsUpdated)$('#fps-value').textContent=Math.round(framePerformance.fps);if(stats.resized)applyResolution();}
  audio.setActive(!paused&&!photo&&!document.hidden);
  if(!paused)walker.update(dt,keys);walker.apply(camera);
  grappleVisuals.update(photo);
  audio.update(walker,grapple,terrain,dt);
  if(digHeld&&!paused&&!photo&&!document.hidden){digDelay-=dt;if(digDelay<=0){dig();digDelay=DIG_INTERVAL;}}
  breakEffects.update(dt);
  const picked=coins.update(walker.position,!paused,dt,camera);if(picked)updateGold(picked);
  const t=environmentTime??time;gpuTimer?.begin();
  dda.update(renderer,camera,t);
  renderer.render(scene,camera);
  gpuTimer?.end();
  requestAnimationFrame(frame);
}
async function init(){
  try{
    // Paint the existing loading screenshot before world generation begins.
    await $('#loading-image').decode().catch(()=>{});
    await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    // Preserve one-metre depth separation out to the distant cloud field.
    renderer=new THREE.WebGLRenderer({canvas,antialias:false,logarithmicDepthBuffer:true,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;
    gpuTimer=new GpuTimer(renderer.getContext());
    scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x9db6c9,.00023);camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,4600);
    scene.add(new THREE.HemisphereLight(0xc5d8eb,0x85806a,1.4));
    const sun=new THREE.DirectionalLight(0xfff1d8,2.65);sun.position.copy(SUN).multiplyScalar(1500).add(new THREE.Vector3(0,0,-300));sun.target.position.set(0,0,-300);scene.add(sun,sun.target);
    markLoaded('Renderer setup');
    weather=new VoxelWeather();
    terrain=new VoxelTerrain();await terrain.generate(progress);markLoaded('Terrain cells');
    forest=new VoxelForest(terrain);await forest.generate(VIEWS,progress);markLoaded('Forest cells');
    await weather.generate(progress);markLoaded('Cloud cells');
    dda=new DdaRenderer(terrain,weather,{shadowSize});scene.add(dda.mesh);markLoaded('DDA texture packing');
    walker=new Walker(terrain,forest);
    grapple=new Grapple(walker);grappleVisuals=new GrappleVisuals(grapple,camera);scene.add(camera,grappleVisuals.group);
    grapple.onEvent=(event,hit)=>audio.grapple(event,hit);
    mining=new VoxelMining(terrain);breakEffects=new BlockBreakEffects(terrain);scene.add(breakEffects.mesh);
    coins=new GoldCoins(terrain,forest,VIEWS);scene.add(coins.group);updateGold();
    audio.prepare();
    controls();setView(Math.max(1,Math.min(4,Number(params.get('view'))||2)));if(params.has('cave'))setCave(params.get('cave'));coins.update(walker.position,false);ready=true;
    markLoaded('Coins and controls');
    // Include the hidden launcher/cable materials so the first shot is smooth.
    await renderer.compileAsync(scene,camera);
    dda.update(renderer,camera,0);
    renderer.render(scene,camera);renderer.getContext().finish();markLoaded('First complete frame');loadMs=performance.now()-loadStart;
    progress(1);$('#loading').remove();$('#gold-hud').hidden=false;$('#fps-hud').hidden=false;$('#controls-hint').hidden=false;crosshair.hidden=false;paused=false;canvas.focus({preventScroll:true});if(params.get('photo')==='1')setPhoto(true);
    window.voxelSimulator={ready:true,goToView:setView,goToCave:setCave,inspectCaves:()=>terrain.caves,setPhoto,setTime:seconds=>{if(seconds!==null&&(!Number.isFinite(seconds)||seconds<0))throw new RangeError('Invalid time');environmentTime=seconds;},
      resetMetrics:()=>gpuTimer?.reset(),
      inspectWorldIdentity:async()=>{const {worldFingerprint}=await import('./dda-audit.js');return worldFingerprint(terrain,weather);},
      auditDda:async()=>{const {auditDda}=await import('./dda-audit.js');return auditDda(renderer,camera,dda,terrain,weather);},
      getRenderStats:()=>({loadMs,loadingTimes,renderDataBytes:dda.data.bytes,gpu:gpuTimer.state(),...dda.getState(),...framePerformance.state()}),
      reset:()=>setView(view),groundAt:(x,z)=>terrain.height(x,z),
      inspectCoins:()=>coins.sites.map(c=>({...c,collected:coins.ledger.collected.has(c.id)})),
      inspectDigging,
      inspectGrapple:()=>grapple.state(),
      inspectAudio:()=>audio.state(),
      getState:()=>({view,worldId:scene.uuid,position:walker.position.toArray(),cameraPosition:camera.position.toArray(),yaw:walker.yaw,pitch:walker.pitch,grounded:walker.grounded,crouched:walker.crouched,bodyHeight:walker.bodyHeight,distance:walker.distance,frames,coins:coins.getState(walker.position),voxelSize:1,terrainColumns:terrain.heights.length,treeCount:forest.count,treeVoxels:forest.voxelCount,cloudVoxels:weather.voxels,cloudTime:weather.lastTime,triangles:renderer.info.render.triangles,calls:renderer.info.render.calls})};
    last=performance.now();requestAnimationFrame(frame);
  }catch(error){console.error(error);$('#loading-label').textContent='Unable to build the landscape';$('#loading-detail').textContent=error.message;window.voxelSimulator={ready:false,error:error.message};}
}
init();
