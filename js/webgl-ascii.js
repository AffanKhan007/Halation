/* ================================================================
   HALATION — GPU ULTRA : WebGL shader ASCII plate
   ================================================================ */
(function(){
  const stage=document.querySelector('.stage-frame');
  if(!stage || !document.getElementById('stageMedia')) return;
  const cv=document.createElement('canvas');
  cv.id='gpuCanvas';
  cv.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none';
  stage.appendChild(cv);
  const RAMP=' .:-=+*#%@';
  let gl,prog,uImg,uAtlas,uCanvas,uCells,uGamma,uLevels,imgTex,atlasTex,ready=false,visible=false,STEP_WARNED=false;
  let cw=9.6, fontSize=16;

  function sh(t,src){const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);return s;}
  function texParams(){
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  }
  function init(){
    gl=cv.getContext('webgl',{preserveDrawingBuffer:true});
    if(!gl) return false;
    /* measure the monospace advance width — parity with the CPU plates */
    const m=document.createElement('canvas').getContext('2d');
    m.font='16px "Space Mono",monospace';
    cw=m.measureText('M').width;
    const vs=sh(gl.VERTEX_SHADER,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');
    const fs=sh(gl.FRAGMENT_SHADER,
      'precision mediump float;'+
      'uniform sampler2D uImg,uAtlas;'+
      'uniform vec2 uCanvas,uCells;uniform float uGamma;uniform vec2 uLevels;'+
      'void main(){'+
      ' vec2 px=gl_FragCoord.xy;'+
      ' vec2 cs=uCanvas/uCells;vec2 cell=floor(px/cs);'+
      ' vec3 c=texture2D(uImg,(cell+.5)/uCells).rgb;'+
      ' float l=dot(c,vec3(.299,.587,.114));'+
      ' l=clamp((l*255.0-uLevels.x)*255.0/uLevels.y,0.0,255.0)/255.0;'+
      ' l=pow(l,uGamma);'+
      ' float idx=floor(min(l*10.,9.99));'+
      ' vec2 lc=fract(px/cs);'+
      ' float a=texture2D(uAtlas,vec2((idx+lc.x)/10.,1.-lc.y)).a;'+
      ' float scan=0.88+0.12*step(1.,mod(gl_FragCoord.y,3.));'+
      ' vec3 col=mix(vec3(.024,.016,.008),(c*vec3(1.5,1.15,.7)+vec3(.08,.05,.02))*scan,a);'+
      ' gl_FragColor=vec4(col,1.);}');
    prog=gl.createProgram();
    gl.attachShader(prog,vs);gl.attachShader(prog,fs);gl.linkProgram(prog);gl.useProgram(prog);
    const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const p=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
    uImg=gl.getUniformLocation(prog,'uImg');uAtlas=gl.getUniformLocation(prog,'uAtlas');
    uCanvas=gl.getUniformLocation(prog,'uCanvas');uCells=gl.getUniformLocation(prog,'uCells');uGamma=gl.getUniformLocation(prog,'uGamma');uLevels=gl.getUniformLocation(prog,'uLevels');
    /* glyph atlas: 10 characters, cell width = advance width (no padding) */
    const cellW=Math.max(1,Math.round(cw*2));
    const ac=document.createElement('canvas');ac.width=cellW*10;ac.height=32;
    const am=ac.getContext('2d');am.fillStyle='#fff';am.font='32px "Space Mono",monospace';am.textBaseline='top';
    for(let i=0;i<10;i++) am.fillText(RAMP[i], i*cellW, 0);
    atlasTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,atlasTex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,ac);texParams();
    imgTex=gl.createTexture();
    gl.uniform1i(uAtlas,1);
    ready=true;return true;
  }
  function raster(cb){
    const s=document.querySelector('#stageMedia .subject');
    if(!s){ cb(null); return; }
    if(s.tagName==='IMG'){ cb(s); return; }
    const sym=document.getElementById('scene'); if(!sym){ cb(null); return; }
    const im=new Image();
    im.onload=()=>cb(im);
    im.onerror=()=>cb(null);
    im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="960" height="720">'+sym.innerHTML+'</svg>');
  }
  function draw(){
    raster(src=>{
      if(!src) return;
      if(!ready && !init()){
        if(!STEP_WARNED && window.toast){ STEP_WARNED=true; toast('WebGL unavailable on this device ✦'); }
        return;
      }
      const iw=src.naturalWidth||960, ih=src.naturalHeight||720;
      const cols=+(document.getElementById('colsSlider')?.value||110);
      const rows=Math.max(8,Math.round(cols*(ih/iw)*(cw/fontSize)));
      const dpr=Math.min(2,window.devicePixelRatio||1);
      cv.width=Math.round(cols*cw*dpr); cv.height=Math.round(rows*fontSize*dpr);
      /* letterbox the canvas inside the 4:3 frame — never stretch */
      const fw=stage.clientWidth||cv.width, fh=stage.clientHeight||cv.height;
      const W=cols*cw, H=rows*fontSize;
      const fit=Math.min(fw/W, fh/H);
      cv.style.width=(W*fit)+'px'; cv.style.height=(H*fit)+'px';
      const ic=document.createElement('canvas');
      ic.width=Math.min(iw,2048); ic.height=Math.round(ic.width*ih/iw);
      const icc=ic.getContext('2d',{willReadFrequently:true});
      icc.drawImage(src,0,0,ic.width,ic.height);
      /* percentile auto-levels — parity with the CPU plates */
      const idata=icc.getImageData(0,0,ic.width,ic.height).data;
      const N=ic.width*ic.height;
      const L=new Float32Array(N);
      for(let i=0;i<N;i++) L[i]=.299*idata[i*4]+.587*idata[i*4+1]+.114*idata[i*4+2];
      const sorted=Float32Array.from(L).sort();
      const lo=sorted[Math.floor(N*.02)];
      const hi=sorted[Math.min(N-1,Math.floor(N*.98))];
      const span=Math.max(24,hi-lo);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,imgTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,ic);texParams();
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,atlasTex);
      gl.uniform1i(uImg,0);
      gl.viewport(0,0,cv.width,cv.height);
      gl.uniform2f(uCanvas,cv.width,cv.height);
      gl.uniform2f(uCells,cols,rows);
      const t=document.getElementById('intensity')?.value||70;
      gl.uniform1f(uGamma,1.7-(t/100)*1.2);
      gl.uniform2f(uLevels,lo,span);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    });
  }
  function update(m){
    const on = m==='gpu' && !!document.querySelector('.chip[data-f="ascii"].active');
    if(on!==visible){ visible=on; cv.style.display=on?'block':'none'; }
    if(on) draw();
  }
  function hide(){ visible=false; cv.style.display='none'; }
  function doExport(){
    const t=document.createElement('canvas');t.width=cv.width;t.height=cv.height;
    t.getContext('2d').drawImage(cv,0,0);
    const a=document.createElement('a');
    a.download='halation-ascii-gpu.png';a.href=t.toDataURL('image/png');a.click();
    if(window.toast) toast('Exported ✦ halation-ascii-gpu.png');
    return true;
  }
  document.getElementById('colsSlider')?.addEventListener('input',()=>{ if(visible) draw(); });
  document.getElementById('intensity')?.addEventListener('input',()=>{ if(visible) draw(); });
  new MutationObserver(()=>{ if(visible) draw(); }).observe(document.getElementById('stageMedia'),{childList:true});
  window.GpuAscii={update,hide,export:doExport};
})();
