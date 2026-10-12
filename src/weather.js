import {noise,random,yieldTask} from './math.js';
import {CloudGrid} from './cloud-grid.js';

function writeCloud(grid,seed,radius,origin){
  const rng=random(seed),r=radius,puffs=[[-.33,-.12,.72,.58], [.28,.04,.66,.82],[0,.28,.54,.64],[-.04,-.40,.52,.52]].map(p=>[p[0]+(rng()-.5)*.2,p[1]+(rng()-.5)*.2,p[2]*(.85+rng()*.3),p[3]*(.8+rng()*.6)]);
  const min=-Math.ceil(r*1.2),size=-min*2;
  for(let z=min;z<min+size;z++)for(let x=min;x<min+size;x++){
    let lo=32000,hi=-32000;
    for(const [px,pz,pr,ph]of puffs){
      const f=1-((x/r-px)/pr)**2-((z/r-pz)/pr)**2+(noise(x*.026,z*.026,seed)-.5)*.17;if(f<=0)continue;
      const thickness=Math.sqrt(f)*r*ph*.62,n=(noise(x*.025,z*.025,seed)-.5)*2;
      lo=Math.min(lo,Math.floor(-r*.025+n));hi=Math.max(hi,Math.floor(thickness+n+(noise(x*.017,z*.021,seed+1)-.5)*r*.075));
    }
    if(hi<=lo)continue;
    grid.add(x+origin[0],z+origin[2],lo+origin[1],hi+origin[1]);
  }
}

export class VoxelWeather{
  constructor(){this.grid=new CloudGrid();this.voxels=0;this.lastTime=-Infinity;}
  async generate(progress){
    const layout=[[-510,730,-1530,240],[80,1100,-1390,380],[650,850,-1610,330],[-1050,680,-1340,240],[1200,750,-1050,250],[-170,630,-980,90],[315,650,-1060,105],[-600,690,-980,90],[-320,800,-180,210],[-800,780,-50,220],[-670,710,1140,235],[600,850,1120,255],[-1500,760,250,210],[1550,900,270,270]];
    for(let i=0;i<layout.length;i++){
      writeCloud(this.grid,901+i*19,layout[i][3],layout[i]);
      progress(.75+.08*i/layout.length);await yieldTask();
    }
    this.voxels=this.grid.voxels;
  }
}
