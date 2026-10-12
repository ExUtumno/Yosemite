// Small, original sound effects: no downloads, recordings or audio dependencies.
const TAU=Math.PI*2;
export const SOUND_RATE=24000;
export const SOUND_KINDS=['wind','bird','coin','launch','latch','release','reel','stone','earth','wood','leaves'];
const durations={wind:12,bird:1.8,coin:.62,launch:.28,latch:.34,release:.24,reel:1,stone:.32,earth:.28,wood:.3,leaves:.34};
const looped=new Set(['wind','reel']);
export function soundSamples(kind,seed=1,rate=SOUND_RATE){
  if(!durations[kind])throw new RangeError(`Unknown sound: ${kind}`);
  let rng=seed>>>0;const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const duration=durations[kind],data=new Float32Array(Math.round(duration*rate));
  const phase=random()*TAU,chirps=3+Math.floor(random()*3),birdPitch=2200+random()*900;
  let low=0,body=0,osc=0;
  for(let i=0;i<data.length;i++){
    const t=i/rate,n=random()*2-1;
    low+=(n-low)*.13;body+=(n-body)*.025;
    let v=0;
    if(kind==='wind'){
      // Soft, broad pine rustle, with slow independent gusts in each channel.
      v=(low*.65+body*2.4)*(.72+.16*Math.sin(TAU*t/12+phase)+.12*Math.sin(TAU*t/4+phase));
    }else if(kind==='bird'){
      const spacing=.22,local=t%.22,j=Math.floor(t/spacing),length=.095+.018*(j%3);
      if(j<chirps&&local<length){
        const u=local/length,f=birdPitch+900*Math.sin(u*Math.PI*.85)-600*u+130*Math.sin(TAU*local*37);
        osc+=TAU*f/rate;
        v=Math.sin(Math.PI*u)**2*(Math.sin(osc)+.09*Math.sin(osc*2))*(1-j*.085);
      }
    }else if(kind==='coin'){
      for(let j=0;j<2;j++){
        const u=t-j*.075;if(u<0)continue;
        const f=j?1568:1046.5,attack=Math.min(1,u/.003);
        v+=attack*(Math.sin(TAU*f*u)*Math.exp(-u*10)+.28*Math.sin(TAU*f*2.76*u)*Math.exp(-u*22)+.1*Math.sin(TAU*f*4.07*u)*Math.exp(-u*36));
      }
    }else if(kind==='launch'){
      osc+=TAU*(1700*Math.exp(-t*19)+180)/rate;
      v=1.5*low*Math.exp(-t*23)+.32*Math.sin(TAU*105*t)*Math.exp(-t*37)+.28*Math.sin(osc)*Math.exp(-t*19)+n*.18*Math.exp(-t*160);
    }else if(kind==='latch'){
      v=(Math.sin(TAU*740*t)+.45*Math.sin(TAU*1931*t))*Math.exp(-t*31)+low*1.8*Math.exp(-t*50);
    }else if(kind==='release'){
      osc+=TAU*(450+1900*Math.exp(-t*15))/rate;
      v=(Math.sin(osc)*.3+low*.9)*(1+Math.sin(TAU*65*t)*.45)*Math.exp(-t*21);
    }else if(kind==='reel'){
      v=.32*Math.sin(TAU*180*t)+.1*Math.sin(TAU*360*t)+low*.7;
      v*=.7+.3*Math.sin(TAU*32*t)**8;
    }else{
      const wood=kind==='wood',leaf=kind==='leaves',stone=kind==='stone';
      const thud=Math.sin(TAU*(wood?185:stone?115:85)*t)*Math.exp(-t*(wood?36:45));
      const grit=(stone?n*.45+low*.6:leaf?n*.13+low:low*1.9);
      const crunch=(.55+.45*Math.sin(TAU*(stone?73:41)*t+phase)**2)*Math.exp(-t*(leaf?13:19));
      v=grit*crunch+thud*(leaf?.07:wood?.85:.5)+n*.22*Math.exp(-t*170);
      if(wood)v+=.24*Math.sin(TAU*510*t)*Math.exp(-t*60);
    }
    data[i]=v;
  }
  if(looped.has(kind)){
    // Crossfade an overlap into the beginning, then use only the seamless cycle.
    const overlap=Math.round(rate*.08),end=data.length-overlap;
    for(let i=0;i<overlap;i++){const a=i/overlap;data[i]=data[end+i]*(1-a)+data[i]*a;}
    return finish(data.subarray(0,end),false,rate);
  }
  return finish(data,true,rate);
}
function finish(data,fade,rate){
  let mean=0,peak=0;for(const v of data)mean+=v;mean/=data.length;
  for(let i=0;i<data.length;i++){
    const edge=fade?Math.min(1,i/(rate*.002),(data.length-1-i)/(rate*.018)):1;
    data[i]=(data[i]-mean)*edge;peak=Math.max(peak,Math.abs(data[i]));
  }
  const gain=.9/Math.max(.01,peak);for(let i=0;i<data.length;i++)data[i]*=gain;
  return data;
}
