// Pointer lock can deliver a cursor-recentering delta on entry or focus changes.
// Keep mouse input separate from camera state and discard those discontinuities.
export class LookInput {
  constructor(apply){this.apply=apply;this.reset();}
  reset(){this.primed=false;this.drag=null;this.rejected=0;}
  relative(dx,dy){
    if(!this.primed){this.primed=true;return;}
    if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)>160){this.rejected++;return;}
    this.apply(dx,dy);
  }
  start(id,x,y){this.drag={id,x,y};}
  absolute(id,x,y){
    if(!this.drag||this.drag.id!==id)return;
    const dx=x-this.drag.x,dy=y-this.drag.y;this.drag={id,x,y};
    if(Number.isFinite(dx)&&Number.isFinite(dy))this.apply(dx,dy);
  }
  stop(id){if(this.drag?.id===id)this.drag=null;}
}

export async function lockMouse(canvas){
  try{await canvas.requestPointerLock({unadjustedMovement:true});}
  catch(error){
    // Older browsers may support pointer lock but not raw movement.
    if(error.name==='NotSupportedError'||error.name==='TypeError'){
      try{await canvas.requestPointerLock();}catch{/* Drag controls remain available. */}
    }
  }
}
