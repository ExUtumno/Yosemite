export class GpuTimer{
  constructor(gl){this.gl=gl;this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');this.pending=[];this.samples=[];this.active=null;this.recentMs=null;}
  begin(){
    if(!this.ext)return;const gl=this.gl;
    while(this.pending.length&&gl.getQueryParameter(this.pending[0],gl.QUERY_RESULT_AVAILABLE)){
      const q=this.pending.shift(),ns=gl.getQueryParameter(q,gl.QUERY_RESULT);if(!gl.getParameter(this.ext.GPU_DISJOINT_EXT)){const ms=ns/1e6;this.samples.push(ms);this.recentMs=this.recentMs===null?ms:this.recentMs*.9+ms*.1;if(this.samples.length>600)this.samples.shift();}gl.deleteQuery(q);
    }
    if(this.pending.length<8){this.active=gl.createQuery();gl.beginQuery(this.ext.TIME_ELAPSED_EXT,this.active);}
  }
  end(){if(this.active){this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.pending.push(this.active);this.active=null;}}
  reset(){this.samples=[];}
  state(){const a=[...this.samples].sort((a,b)=>a-b);return {supported:!!this.ext,samples:a.length,meanMs:a.length?a.reduce((a,b)=>a+b,0)/a.length:null,p95Ms:a.length?a[Math.floor((a.length-1)*.95)]:null};}
}
