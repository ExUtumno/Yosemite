export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function hash(x,z,seed=0){let n=Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(seed,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
export function noise(x,z,seed=0){const a=Math.floor(x),b=Math.floor(z),u=smooth(0,1,x-a),v=smooth(0,1,z-b);return mix(mix(hash(a,b,seed),hash(a+1,b,seed),u),mix(hash(a,b+1,seed),hash(a+1,b+1,seed),u),v);}
export function fbm(x,z,seed=0){return noise(x,z,seed)*.55+noise(x*2.07,z*2.07,seed+1)*.27+noise(x*4.1,z*4.1,seed+2)*.13+noise(x*8.2,z*8.2,seed+3)*.05;}
export function random(seed){return ()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export const bell=(x,z,cx,cz,rx,rz)=>Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2));
export const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
