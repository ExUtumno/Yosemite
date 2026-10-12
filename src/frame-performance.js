// Keep ray count bounded on large/high-DPI displays, then adapt gradually to
// sustained frame time. FPS measures real RAF intervals, not the physics clamp.
export class FramePerformance{
  constructor({adaptive=true,pixelBudget=3840*2160}={}){
    this.adaptive=adaptive;this.pixelBudget=pixelBudget;this.width=0;this.height=0;this.deviceRatio=1;this.pixelRatio=1;this.maxRatio=1;this.fps=null;this.resetTiming();
  }
  resetTiming(){this.sampleMs=0;this.sampleFrames=0;this.qualityMs=0;this.qualityFrames=0;this.goodWindows=0;this.settleMs=1500;}
  resize(width,height,deviceRatio=1){
    if(this.width===width&&this.height===height&&this.deviceRatio===deviceRatio)return false;
    this.width=Math.max(1,width);this.height=Math.max(1,height);this.deviceRatio=Math.max(.1,deviceRatio);
    this.maxRatio=this.adaptive?Math.min(this.deviceRatio,Math.sqrt(this.pixelBudget/(this.width*this.height))):this.deviceRatio;
    this.pixelRatio=this.maxRatio;this.resetTiming();return true;
  }
  sample(frameMs,gpuMs=null){
    const result={fpsUpdated:false,resized:false};
    if(!Number.isFinite(frameMs)||frameMs<=0)return result;
    // Focus/visibility transitions can leave a long gap between callbacks.
    if(frameMs>1000){this.resetTiming();return result;}
    this.sampleMs+=frameMs;this.sampleFrames++;
    if(this.sampleMs>=500){this.fps=this.sampleFrames*1000/this.sampleMs;this.sampleMs=0;this.sampleFrames=0;result.fpsUpdated=true;}
    // Initial shader/viewport warmup is not sustained gameplay load.
    if(this.settleMs>0){this.settleMs-=frameMs;return result;}
    this.qualityMs+=frameMs;this.qualityFrames++;
    if(!this.adaptive||this.qualityMs<1000)return result;
    const mean=this.qualityMs/this.qualityFrames;this.qualityMs=0;this.qualityFrames=0;
    const gpu=Number.isFinite(gpuMs)&&gpuMs>0?gpuMs:null;
    let next=this.pixelRatio;
    if(mean>19||gpu!==null&&gpu>16.5){
      const cost=Math.max(mean>19?mean:0,gpu||0);
      next=Math.max(this.maxRatio*.5,this.pixelRatio*Math.min(.9,Math.sqrt(14/cost)));this.goodWindows=0;
    }else if(mean<17.6&&(gpu!==null?gpu<11.5:mean<17.1)){
      if(++this.goodWindows>=3){next=Math.min(this.maxRatio,this.pixelRatio*1.06);this.goodWindows=0;}
    }else this.goodWindows=0;
    if(Math.abs(next-this.pixelRatio)>this.pixelRatio*.025){this.pixelRatio=next;result.resized=true;}
    return result;
  }
  state(){return {fps:this.fps,adaptiveResolution:this.adaptive,pixelRatio:this.pixelRatio,renderWidth:Math.floor(this.width*this.pixelRatio),renderHeight:Math.floor(this.height*this.pixelRatio)};}
}
