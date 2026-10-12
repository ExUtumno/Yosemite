import {SOUND_KINDS,SOUND_RATE,soundSamples} from './sound-synthesis.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const digSounds={1:'stone',2:'earth',3:'earth',4:'wood',5:'leaves'};
const MAX_VOICES=16;

export class GameAudio{
  constructor(){
    this.context=null;this.active=false;this.muted=false;this.unavailable=false;
    this.samples=new Map();this.buffers=new Map();this.voices=new Set();this.events={};
    this.outdoors=1;this.birdAt=0;this.lastCoin=-100;this.coinStep=0;this.reeling=false;
    this.listener={x:0,y:0,z:0,yaw:0};this.environmentAt=0;
  }
  prepare(){
    for(const kind of SOUND_KINDS)this.samples.set(kind,soundSamples(kind,kind.length*79));
    this.samples.set('wind-right',soundSamples('wind',913));
    for(let i=1;i<=3;i++)this.samples.set(`bird-${i}`,soundSamples('bird',i*491));
  }
  unlock(){
    if(this.unavailable)return;
    if(!this.context){
      const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!Context){this.unavailable=true;return;}
      try{
        this.context=new Context({latencyHint:'interactive'});
        if(!this.samples.size)this.prepare();
        const c=this.context;
        this.master=c.createGain();this.master.gain.value=0;
        const limiter=c.createDynamicsCompressor();limiter.threshold.value=-6;limiter.knee.value=6;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.12;
        this.master.connect(limiter);limiter.connect(c.destination);
        this.ambient=c.createGain();this.ambient.gain.value=0;this.ambient.connect(this.master);
        this.wind=this.loop('wind',this.ambient,true);this.wind.gain.gain.value=.028;
        this.reel=this.loop('reel',this.master);this.reel.gain.gain.value=0;
        this.birdAt=c.currentTime+2+Math.random()*3;
      }catch{
        // Audio support must never prevent walking or interacting with the world.
        void this.context?.close().catch(()=>{});this.context=null;this.unavailable=true;return;
      }
    }
    this.setActive(true);
    this.resume(); // Also retries a browser interruption without recreating the graph.
  }
  get enabled(){return this.active&&!this.muted;}
  resume(){
    if(!this.context||!this.enabled||this.context.state==='running'||this.resuming)return;
    this.resuming=this.context.resume().catch(()=>{}).finally(()=>{this.resuming=null;});
  }
  setActive(on){
    if(this.active===on||!this.context)return;
    this.active=on;this.sync();
  }
  toggleMute(){this.muted=!this.muted;this.sync();return this.muted;}
  sync(){
    const c=this.context;if(!c)return;
    clearTimeout(this.suspendTimer);
    this.ramp(this.master.gain,this.enabled?.7:0,.012);
    this.ramp(this.reel.gain.gain,0,.025);this.reeling=false;
    if(this.enabled){this.resume();return;}
    // Discard old effects instead of replaying them when returning to the tab.
    for(const v of this.voices)v.source.stop(c.currentTime+.06);
    this.suspendTimer=setTimeout(()=>{if(!this.enabled&&c.state!=='closed')void c.suspend().catch(()=>{});},90);
  }
  ramp(param,value,seconds){
    const t=this.context.currentTime;param.cancelScheduledValues(t);param.setTargetAtTime(value,t,seconds);
  }
  buffer(kind,stereo=false){
    const key=kind+(stereo?'-stereo':'');if(this.buffers.has(key))return this.buffers.get(key);
    const pcm=this.samples.get(kind),b=this.context.createBuffer(stereo?2:1,pcm.length,SOUND_RATE);
    b.copyToChannel(pcm,0);if(stereo)b.copyToChannel(this.samples.get('wind-right'),1);
    this.buffers.set(key,b);return b;
  }
  loop(kind,destination,stereo=false){
    const source=this.context.createBufferSource(),gain=this.context.createGain();
    source.buffer=this.buffer(kind,stereo);source.loop=true;source.connect(gain);gain.connect(destination);source.start();
    return {source,gain};
  }
  panAt(point){
    if(!point)return 0;
    const dx=point[0]-this.listener.x,dz=point[2]-this.listener.z;
    return clamp((dx*Math.cos(this.listener.yaw)-dz*Math.sin(this.listener.yaw))/Math.max(2,Math.hypot(dx,dz)),-.85,.85);
  }
  play(kind,{volume=.2,rate=1,pan=0,ambient=false}={}){
    if(!this.context||!this.enabled||this.context.state==='closed'||this.voices.size>=MAX_VOICES)return false;
    const c=this.context,source=c.createBufferSource(),gain=c.createGain(),panner=c.createStereoPanner();
    source.buffer=this.buffer(kind);source.playbackRate.value=rate;gain.gain.value=volume;panner.pan.value=pan;
    source.connect(gain);gain.connect(panner);panner.connect(ambient?this.ambient:this.master);
    const voice={source,gain,panner};this.voices.add(voice);
    source.onended=()=>{source.disconnect();gain.disconnect();panner.disconnect();this.voices.delete(voice);};
    source.start();this.events[kind]=(this.events[kind]||0)+1;return true;
  }
  dig(hit){
    const kind=digSounds[hit.type];if(!kind)return;
    this.play(kind,{volume:kind==='leaves'?.14:.27,rate:.9+Math.random()*.2,pan:this.panAt(hit.cell)});
  }
  coin(count,point){
    if(!this.context||!this.enabled)return;
    const now=this.context.currentTime;
    // Dense cave caches remain one musical pickup, not dozens of stacked bells.
    if(now-this.lastCoin<.075)return;
    this.coinStep=now-this.lastCoin<.8?(this.coinStep+1)%5:0;this.lastCoin=now;
    this.play('coin',{volume:.18+Math.min(3,count-1)*.012,rate:2**(this.coinStep*2/12),pan:this.panAt(point)*.45});
  }
  grapple(event,hit){
    if(event==='launch')this.play('launch',{volume:.26,pan:.15});
    if(event==='latch')this.play('latch',{volume:.23,rate:hit?.type===4?.78:1,pan:this.panAt(hit?.cell)*.5});
    if(event==='release')this.play('release',{volume:.15,pan:.12});
  }
  update(walker,grapple,terrain,dt){
    if(!this.context||!this.enabled)return;
    const c=this.context,t=c.currentTime,p=walker.position;
    Object.assign(this.listener,{x:p.x,y:p.y+walker.eye,z:p.z,yaw:walker.yaw});
    this.environmentAt-=dt;
    if(this.environmentAt<=0){
      this.environmentAt=.25;
      // Only a mineral roof counts as a cave: pine canopies still have birds.
      const x=Math.floor(p.x),z=Math.floor(p.z),eye=Math.floor(p.y+walker.eye);
      let roof=false;
      for(let y=eye+1;y<=eye+28;y++){const type=terrain.grid.get(x,y,z);if(type>=1&&type<=3){roof=true;break;}}
      const air=terrain.grid.extra(x,eye,z),daylight=air>=128?clamp((air-128)/31,0,1):0;
      this.outdoors=roof?Math.max(.04,daylight*.6):1;
      this.ramp(this.ambient.gain,this.outdoors,.7);
    }
    if(t>=this.birdAt){
      if(this.outdoors>.45)this.play(`bird${Math.random()<.25?'':`-${1+Math.floor(Math.random()*3)}`}`,{volume:.027+Math.random()*.016,rate:.92+Math.random()*.16,pan:Math.random()*1.6-.8,ambient:true});
      this.birdAt=t+9+Math.random()*15;
    }
    const speed=Math.hypot(walker.velocityX,walker.velocityY,walker.velocityZ);
    this.reeling=grapple.phase==='attached';
    this.reel.source.playbackRate.setTargetAtTime(.85+Math.min(65,speed)*.012,t,.09);
    this.reel.gain.gain.setTargetAtTime(this.reeling?.017+Math.min(speed,48)*.00045:0,t,.045);
  }
  state(){return {state:this.context?.state??(this.unavailable?'unavailable':'locked'),active:this.active,muted:this.muted,voices:this.voices.size,maxVoices:MAX_VOICES,outdoors:this.outdoors,reeling:this.reeling,events:{...this.events}};}
}
