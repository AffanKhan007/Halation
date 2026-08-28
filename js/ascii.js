/* ================================================================
   HALATION — THE ASCII PRESS
   10 artistic plates. Canvas-based so PNG export works.
   Requires playground.html + app.js loaded first.
   ================================================================ */
(function(){
  const frame = document.querySelector('.stage-frame');
  if(!frame || !document.getElementById('stageMedia')) return;

  /* canvas layer inside the stage */
  const canvas = document.createElement('canvas');
  canvas.id = 'asciiCanvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:none';
  frame.insertBefore(canvas, document.getElementById('stageMedia').nextSibling);

  const MODES = {
    terminal:{ramp:' .:-=+*#%@', fg:'#7dd87a', bg:'#060402', crt:true},
    amber   :{ramp:' .:-=+*#%@', fg:'#ffc86b', bg:'#0a0703', crt:true},
    blocks  :{ramp:' ░▒▓█',      fg:'#f0a63c', bg:'#060402'},
    color   :{ramp:' .:-=+*#%@', color:true,   bg:'#060402'},
    braille :{braille:true,      fg:'#7dd87a', bg:'#060402', crt:true, cols:140},
    binary  :{bayer:true,        fg:'#9fe8a0', bg:'#060402', crt:true},
    sketch  :{edge:true,         fg:'#241a10', bg:'#efe4cd', cols:120},
    paper   :{ramp:' .:-=+*#%@', fg:'#241a10', bg:'#efe4cd', flip:true},
    halftone:{ramp:' .·:oO●',    fg:'#efe4cd', bg:'#060402'},
    dither  :{ramp:' .·:oO0@',   fg:'#efe4cd', bg:'#060402', dither:true},
    custom  :{ramp:null,         fg:'#ffc86b', bg:'#060402'},
    matrix  :{anim:true,                       bg:'#020602', cols:120},
    ember   :{anim:true,                       bg:'#050201'},
    manuscript:{text:true,       fg:'#3a2a18', bg:'#efe4cd', cols:100},
    silk    :{half:true,                      bg:'#060402', cols:140},
    gpu     :{external:true},
  };
  let mode='terminal', cols=110, glyphs='HALATION✦';
  let aside=false, busy=false, customRamp=null;
  let animId=null, lastGrid=null, cwG=9.6, fsG=16;
  let loL=0, spanL=255, exportScale=1;
  const STEP={};
  const intSlider = document.getElementById('intensity');

  /* --- turn the current subject (img or sample svg) into an Image --- */
  function getSource(cb){
    const s = document.querySelector('#stageMedia .subject');
    if(!s) return;
    if(s.tagName === 'IMG'){ cb(s); return; }
    const sym = document.getElementById('scene');
    if(!sym) return;
    try{
      const str = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="960" height="720">' + sym.innerHTML + '</svg>';
      const im = new Image();
      im.onload = ()=> cb(im);
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
    }catch(e){ console.warn(e); }
  }

  /* progressive-halving downsample = moiré-free area averaging */
  function sampleSmooth(src, w, h){
    const nw=src.naturalWidth||src.width||960, nh=src.naturalHeight||src.height||720;
    let sw=Math.min(nw,1600), sh=Math.max(1,Math.round(sw*nh/nw));
    let c=document.createElement('canvas'); c.width=sw; c.height=sh;
    c.getContext('2d').drawImage(src,0,0,sw,sh);
    while(sw/2>=w){
      const n=document.createElement('canvas');
      n.width=Math.max(w,sw>>1); n.height=Math.max(h,sh>>1);
      n.getContext('2d').drawImage(c,0,0,n.width,n.height);
      c=n; sw=c.width; sh=c.height;
    }
    const f=document.createElement('canvas'); f.width=w; f.height=h;
    f.getContext('2d').drawImage(c,0,0,w,h);
    return f;
  }

  /* --- measure each custom glyph's visual weight, sort light→dark --- */
  function buildCustomRamp(){
    const chars = [...new Set(glyphs.split(''))].filter(c=>c.trim());
    if(!chars.length){ customRamp='@'; return; }
    const mc = document.createElement('canvas'); mc.width=mc.height=28;
    const m = mc.getContext('2d', {willReadFrequently:true});
    const scored = chars.map(ch=>{
      m.clearRect(0,0,28,28);
      m.fillStyle='#fff'; m.font='22px "Space Mono",monospace'; m.textBaseline='middle';
      m.fillText(ch,3,15);
      const d=m.getImageData(0,0,28,28).data; let n=0;
      for(let i=3;i<d.length;i+=4) n+=d[i];
      return {ch,n};
    }).sort((a,b)=>a.n-b.n);
    customRamp = scored.map(s=>s.ch).join('') + '█';
  }

  /* --- MANUSCRIPT : photo written from the user's text --- */
  let proseText='In the darkroom every photograph waits for its second life, and light remembers what the eye forgets.';
  let proseMap=null, proseBuckets=null, proseCursor=0;
  function buildProse(){
    const uniq=[...new Set(proseText.replace(/\s+/g,'').split(''))];
    if(!uniq.length){ proseMap=null; proseBuckets=null; return; }
    const mc=document.createElement('canvas'); mc.width=mc.height=28;
    const m=mc.getContext('2d',{willReadFrequently:true});
    const scored=uniq.map(ch=>{
      m.clearRect(0,0,28,28); m.fillStyle='#fff';
      m.font='22px "Space Mono",monospace'; m.textBaseline='middle';
      m.fillText(ch,3,15);
      const d=m.getImageData(0,0,28,28).data; let n=0;
      for(let i=3;i<d.length;i+=4) n+=d[i];
      return {ch,n};
    }).sort((a,b)=>a.n-b.n);
    const B=7;
    proseMap=new Map(); proseBuckets=[];
    for(let b=0;b<B;b++) proseBuckets.push([]);
    scored.forEach((s,i)=>{
      const b=Math.min(B-1, Math.floor(i/scored.length*B));
      proseMap.set(s.ch,b); proseBuckets[b].push(s.ch);
    });
    proseCursor=0;
  }
  function proseChar(level){
    if(!proseMap) return '@';
    for(let k=0;k<proseText.length;k++){
      const idx=(proseCursor+k)%proseText.length;
      const ch=proseText[idx];
      if(/\s/.test(ch)) continue;
      const b=proseMap.get(ch);
      const slack=k>120?2:k>60?1:0;
      if(b!==undefined && Math.abs(b-level)<=slack){ proseCursor=(idx+1)%proseText.length; return ch; }
    }
    return proseBuckets[level].length?proseBuckets[level][0]:'@';
  }

  /* --- the engine --- */
  function render(){
    if(busy || aside) return;
    if(MODES[mode] && MODES[mode].external) return;
    busy = true;
    getSource(src=>{ try{ paint(src); }catch(e){ console.warn(e); } busy=false; });
  }

  function paint(src){
    const M = MODES[mode];
    const iw = src.naturalWidth || 960, ih = src.naturalHeight || 720;

    const fontSize = 16*exportScale;
    const ctx = canvas.getContext('2d');
    ctx.font = fontSize + 'px "Space Mono",monospace';
    const cw = ctx.measureText('M').width;
    cwG=cw; fsG=fontSize;
    const rows = Math.max(8, Math.round(cols * (ih/iw) * (cw/fontSize)));

    /* sample the image down to text resolution */
    const sc = sampleSmooth(src, cols, rows);
    const data = sc.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, cols, rows).data;

    const N = cols*rows;
    const L = new Float32Array(N), R = new Uint8ClampedArray(N), G = new Uint8ClampedArray(N), B = new Uint8ClampedArray(N);
    let mean = 0;
    for(let i=0;i<N;i++){
      const r=data[i*4], g=data[i*4+1], b=data[i*4+2];
      R[i]=r; G[i]=g; B[i]=b;
      L[i] = .299*r + .587*g + .114*b;
      mean += L[i];
    }
    mean /= N;

    /* percentile auto-levels: consistent contrast on ANY photograph */
    const sorted = Float32Array.from(L).sort();
    loL = sorted[Math.floor(N*.02)];
    const hiL = sorted[Math.min(N-1, Math.floor(N*.98))];
    spanL = Math.max(24, hiL-loL);
    for(let i=0;i<N;i++) L[i]=Math.max(0,Math.min(255,(L[i]-loL)*255/spanL));

    /* intensity slider = ink density (gamma) */
    const t = intSlider ? intSlider.value/100 : 1;
    const gamma = 1.7 - t*1.2;
    for(let i=0;i<N;i++) L[i] = 255*Math.pow(L[i]/255, gamma);
    lastGrid = {L:L.slice(), rows, cols};

    const dpr = Math.min(3, (window.devicePixelRatio||1)*exportScale);
    const W = cols*cw, H = rows*fontSize;
    canvas.width  = Math.round(W*dpr);
    canvas.height = Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.font = fontSize + 'px "Space Mono",monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = M.bg;
    ctx.fillRect(0, 0, W, H);
    if(M.anim) return;   /* animated plates draw themselves each frame */

    /* --- BRAILLE HD : 1 char = 2×4 pixels --- */
    if(M.braille){
      const BITS = [0x01,0x08,0x02,0x10,0x04,0x20,0x40,0x80];
      const sw=cols*2, sh=rows*4;
      const bc=sampleSmooth(src, sw, sh);
      const bctx=bc.getContext('2d',{willReadFrequently:true});
      const bd=bctx.getImageData(0,0,sw,sh).data;
      let bm=0; for(let p=0;p<bd.length;p+=4) bm+=.299*bd[p]+.587*bd[p+1]+.114*bd[p+2];
      bm/=(bd.length/4);
      ctx.fillStyle = M.fg;
      for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
        let v=0;
        for(let dy=0;dy<4;dy++) for(let dx=0;dx<2;dx++){
          const p=((y*4+dy)*sw + (x*2+dx))*4;
          const lum=.299*bd[p]+.587*bd[p+1]+.114*bd[p+2];
          if(lum < bm) v |= BITS[dy*2+dx];
        }
        if(v) ctx.fillText(String.fromCharCode(0x2800+v), x*cw, y*fontSize);
      }
    }
    /* --- STRUCTURE : 2× supersampled Sobel, percentile thresholds --- */
    else if(M.edge){
      const ew=cols*2, eh=rows*2;
      const ec=sampleSmooth(src, ew, eh);
      const ed=ec.getContext('2d',{willReadFrequently:true}).getImageData(0,0,ew,eh).data;
      let E=new Float32Array(ew*eh);
      for(let i=0;i<ew*eh;i++) E[i]=.299*ed[i*4]+.587*ed[i*4+1]+.114*ed[i*4+2];
      /* two denoise passes so grain never becomes fake edges */
      for(let p=0;p<2;p++){
        const T=new Float32Array(ew*eh);
        for(let y=1;y<eh-1;y++) for(let x=1;x<ew-1;x++){
          const i=y*ew+x;
          T[i]=(E[i-ew-1]+E[i-ew]+E[i-ew+1]+E[i-1]+E[i]+E[i+1]+E[i+ew-1]+E[i+ew]+E[i+ew+1])/9;
        }
        E=T;
      }
      /* Sobel gradients + magnitudes */
      const MAG=new Float32Array(ew*eh), GXa=new Float32Array(ew*eh), GYa=new Float32Array(ew*eh);
      const mags=[];
      for(let y=1;y<eh-1;y++) for(let x=1;x<ew-1;x++){
        const i=y*ew+x;
        const gx=(E[i-ew+1]+2*E[i+1]+E[i+ew+1])-(E[i-ew-1]+2*E[i-1]+E[i+ew-1]);
        const gy=(E[i+ew-1]+2*E[i+ew]+E[i+ew+1])-(E[i-ew-1]+2*E[i-ew]+E[i-ew+1]);
        GXa[i]=gx; GYa[i]=gy;
        const m=Math.sqrt(gx*gx+gy*gy);
        MAG[i]=m; if(m>0) mags.push(m);
      }
      /* PERCENTILE thresholds: robust on any photograph */
      mags.sort((a,b)=>a-b);
      const hi=mags[Math.floor(mags.length*.985)]||1;
      const strong=hi*.30, weak=hi*.12;
      /* luminance-proportional tone fill = depth under the linework */
      for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
        const i=y*cols+x;
        const a=(1-L[i]/255)*.22;
        if(a>.05){ ctx.fillStyle='rgba(36,26,16,'+a.toFixed(3)+')'; ctx.fillText('.', x*cw, y*fontSize); }
      }
      /* strokes: strongest edge sample inside each 2×2 cell block */
      for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
        let best=0,bx=0,by=0;
        for(let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++){
          const ei=(y*2+dy)*ew+(x*2+dx);
          if(MAG[ei]>best){ best=MAG[ei]; bx=GXa[ei]; by=GYa[ei]; }
        }
        if(best<=weak) continue;
        if(best>=strong){
          let ch;
          if(Math.abs(by)>Math.abs(bx)*1.5) ch='-';
          else if(Math.abs(bx)>Math.abs(by)*1.5) ch='|';
          else ch=(bx*by>0)?'/':'\\';
          ctx.fillStyle=M.fg;
          ctx.fillText(ch, x*cw, y*fontSize);
        } else {
          ctx.fillStyle='rgba(36,26,16,.4)';
          ctx.fillText('·', x*cw, y*fontSize);
        }
      }
    }
    /* --- SILK HD : half-block characters, 2 pixels per cell --- */
    else if(M.half){
      const sc2 = sampleSmooth(src, cols, rows*2);
      const d2 = sc2.getContext('2d',{willReadFrequently:true}).getImageData(0,0,cols,rows*2).data;
      const st=v=>Math.max(0,Math.min(255,(v-loL)*255/spanL));
      const px=(x,y)=>{ const p=(y*cols+x)*4; return [st(d2[p]),st(d2[p+1]),st(d2[p+2])]; };
      for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
        const [r1,g1,b1]=px(x,y*2), [r2,g2,b2]=px(x,y*2+1);
        if((.299*r1+.587*g1+.114*b1)<10 && (.299*r2+.587*g2+.114*b2)<10) continue;
        ctx.fillStyle='rgb('+(r2|0)+','+(g2|0)+','+(b2|0)+')';
        ctx.fillText('\u2584', x*cw, y*fontSize);
        ctx.fillStyle='rgb('+(r1|0)+','+(g1|0)+','+(b1|0)+')';
        ctx.fillText('\u2580', x*cw, y*fontSize);
      }
    }
    /* --- MANUSCRIPT : typewriter stream matched to luminance --- */
    else if(M.text){
      if(!proseMap) buildProse();
      const B=7;
      ctx.fillStyle=M.fg;
      for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
        const i=y*cols+x;
        const level=Math.min(B-1, Math.floor((255-L[i])/256*B));
        if(level===0) continue;
        ctx.fillText(proseChar(level), x*cw, y*fontSize);
      }
    }
    /* --- BINARY : Bayer 4×4 ordered dither — 1s build the light,
         faint 0s fill the shadows like a data field --- */
    else if(M.bayer){
      const B4=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
      for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
        const i=y*cols+x;
        const v=L[i]/255;
        const th=(B4[(y&3)*4+(x&3)]+.5)/16;
        if(v>th){
          ctx.fillStyle='rgba(159,232,160,'+(0.35+v*.65).toFixed(3)+')';
          ctx.fillText('1', x*cw, y*fontSize);
        } else if(v>.06){
          ctx.fillStyle='rgba(159,232,160,.14)';
          ctx.fillText('0', x*cw, y*fontSize);
        }
      }
    }
    /* --- classic ramp plates --- */
    else {
      if(M.ramp==null && !customRamp) buildCustomRamp();
      const ramp = M.ramp==null ? customRamp : M.ramp;
      const len = ramp.length;
      if(M.dither){
        const step=256/len;
        for(let y=0;y<rows;y++){
          const ltr=(y%2===0);
          for(let k=0;k<cols;k++){
            const x=ltr?k:cols-1-k;
            const i=y*cols+x, old=L[i];
            const q=Math.max(0,Math.min(255,Math.round(old/step)*step));
            const err=old-q; L[i]=q;
            const d=ltr?1:-1;
            if(x+d>=0&&x+d<cols) L[i+d]+=err*7/16;
            if(y+1<rows){
              if(x-d>=0&&x-d<cols) L[i+cols-d]+=err*3/16;
              L[i+cols]+=err*5/16;
              if(x+d>=0&&x+d<cols) L[i+cols+d]+=err/16;
            }
          }
        }
      }
      for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
        const i=y*cols+x;
        let lum = L[i];
        if(M.flip) lum = 255-lum;
        const ch = ramp[Math.min(len-1, Math.floor(lum/256*len))];
        if(!ch || ch===' ') continue;
        if(M.color){
          const mx=Math.max(R[i],G[i],B[i]), f=1.3;
          ctx.fillStyle='rgb('+Math.min(255,mx+(R[i]-mx)*f)+','+Math.min(255,mx+(G[i]-mx)*f)+','+Math.min(255,mx+(B[i]-mx)*f)+')';
        } else ctx.fillStyle=M.fg;
        ctx.fillText(ch, x*cw, y*fontSize);
      }
    }

    /* CRT scanlines */
    if(M.crt){
      ctx.fillStyle='rgba(0,0,0,.22)';
      for(let y=0;y<canvas.height;y+=3) ctx.fillRect(0,y,canvas.width,1);
    }
  }

  /* --- ANIMATION SYSTEM --- */
  function startAnim(){
    if(animId || aside || !isActive() || !MODES[mode] || !MODES[mode].anim) return;
    const ctx=canvas.getContext('2d');
    const tick=()=>{ animId=requestAnimationFrame(tick); if(STEP[mode]) STEP[mode](ctx); };
    animId=requestAnimationFrame(tick);
  }
  function stopAnim(){ if(animId){ cancelAnimationFrame(animId); animId=null; } }

  /* --- MATRIX DIGITAL RAIN : the photo gates the storm --- */
  const KATA='アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789';
  let drops=null, mBase=null, mBaseFor=null;
  STEP.matrix=function(ctx){
    if(!lastGrid) return;
    const R=lastGrid.rows;
    /* build a ghost hologram of the photo once per image */
    if(mBaseFor!==lastGrid){
      mBaseFor=lastGrid;
      mBase=document.createElement('canvas');
      mBase.width=Math.max(1,Math.round(cols*cwG));
      mBase.height=Math.max(1,Math.round(R*fsG));
      const bctx=mBase.getContext('2d');
      bctx.font=fsG+'px "Space Mono",monospace'; bctx.textBaseline='top';
      const RAMP10=' .:-=+*#%@';
      for(let y=0;y<R;y++) for(let x=0;x<cols;x++){
        const lum=lastGrid.L[y*cols+x]/255;
        if(lum<.15) continue;
        bctx.fillStyle='rgba(70,160,80,'+(0.05+lum*.22).toFixed(3)+')';
        bctx.fillText(RAMP10[Math.min(9,(lum*10)|0)], x*cwG, y*fsG);
      }
    }
    if(!drops || drops.length!==cols){
      drops=new Array(cols).fill(0).map(()=>({y:Math.random()*-R, s:.25+Math.random()*.75, c:KATA[(Math.random()*KATA.length)|0]}));
    }
    ctx.fillStyle='rgba(2,6,2,.20)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    /* the uploaded photograph, ghosted beneath the rain */
    ctx.save(); ctx.globalAlpha=.5;
    ctx.drawImage(mBase,0,0,cols*cwG,R*fsG);
    ctx.restore();
    ctx.font=fsG+'px "Space Mono",monospace'; ctx.textBaseline='top';
    for(let x=0;x<cols;x++){
      const d=drops[x];
      d.y+=d.s;
      if(d.y>R+6){ d.y=Math.random()*-R; d.s=.25+Math.random()*.75; }
      const yi=Math.floor(d.y);
      if(yi<0||yi>=R) continue;
      const lum=lastGrid.L[yi*cols+x]/255;
      if(lum<.10) continue;   /* dark pixels = no rain, ever */
      if(Math.random()<.07) d.c=KATA[(Math.random()*KATA.length)|0];
      const a=.12+Math.pow(lum,1.3)*.88;
      ctx.fillStyle='rgba(120,255,140,'+a.toFixed(3)+')';
      ctx.fillText(d.c, x*cwG, yi*fsG);
      if(lum>.5){
        ctx.save();
        ctx.shadowColor='rgba(140,255,160,.9)'; ctx.shadowBlur=8;
        ctx.fillStyle='rgba(225,255,225,'+(lum*.9).toFixed(3)+')';
        ctx.fillText(KATA[(Math.random()*KATA.length)|0], x*cwG, yi*fsG);
        ctx.restore();
      }
    }
  };

  /* --- EMBER : the photograph itself burns --- */
  let heat=null;
  STEP.ember=function(ctx){
    if(!lastGrid) return;
    const R=lastGrid.rows, Nn=cols*R;
    if(!heat || heat.length!==Nn) heat=new Float32Array(Nn);
    /* coal bed: EVERY pixel glows by its own light, full frame */
    for(let i=0;i<Nn;i++){
      const lum=lastGrid.L[i]/255;
      const bed=lum*230;
      heat[i]=Math.max(heat[i]*.55+bed*.35, bed*(.7+Math.random()*.55));
    }
    /* flames lick upward: gentle cooling + horizontal shimmer */
    for(let y=0;y<R-1;y++) for(let x=0;x<cols;x++){
      const i=y*cols+x;
      const s=Math.max(0,Math.min(cols-1, x+(Math.random()<.5?(Math.random()<.5?-1:1):0)));
      const up=heat[(y+1)*cols+s]*.94 - 3 - Math.random()*7;
      if(up>heat[i]) heat[i]=up;
    }
    ctx.fillStyle='#050201'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.font=fsG+'px "Space Mono",monospace'; ctx.textBaseline='top';
    const RAMP=' .:-=+*%#@';
    if(!STEP._pal){
      STEP._pal=['#000000','#5a1204','#8a2406','#c33d06','#e8720c','#f0a63c','#ffd27f','#fff3d6','#ffffff','#ffffff']
        .map(h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]);
    }
    const PALRGB=STEP._pal;
    for(let y=0;y<R;y++) for(let x=0;x<cols;x++){
      const h=heat[y*cols+x];
      if(h<14) continue;
      const t9=Math.min(9.999, h/256*10);
      const i0=Math.max(1,t9|0), fr=t9-(t9|0);
      const a=PALRGB[i0], b=PALRGB[i0+1]||a;
      ctx.fillStyle='rgb('+((a[0]+(b[0]-a[0])*fr)|0)+','+((a[1]+(b[1]-a[1])*fr)|0)+','+((a[2]+(b[2]-a[2])*fr)|0)+')';
      ctx.fillText(h<40?'.':RAMP[i0], x*cwG, y*fsG);
    }
  };

  /* --- state helpers --- */
  function isActive(){
    const c = document.querySelector('.chip[data-f="ascii"]');
    return !!(c && c.classList.contains('active'));
  }
  function sync(){
    const on = isActive();
    canvas.style.display = on && !aside && !(MODES[mode]&&MODES[mode].external) ? 'block' : 'none';
    if(window.GpuAscii) GpuAscii.update(mode);
    const sm = document.getElementById('stageMedia');
    if(sm) sm.style.display = on && !aside ? 'none' : '';
    if(on && !aside) render();
    if(on && !aside) startAnim(); else stopAnim();
  }
  function setAside(v){
    aside = v;
    if(v) stopAnim(); else startAnim();
    if(v){
      if(window.GpuAscii) GpuAscii.hide();
      canvas.style.display='none';
      const sm=document.getElementById('stageMedia'); if(sm) sm.style.display='';
    }
  }
  function open(){ const p=document.getElementById('asciiPanel'); if(p) p.style.display=''; render(); startAnim(); }
  function close(){ stopAnim(); if(window.GpuAscii) GpuAscii.hide(); const p=document.getElementById('asciiPanel'); if(p) p.style.display='none'; }
  function doExport(){
    if(mode==='gpu' && window.GpuAscii) return GpuAscii.export();
    getSource(src=>{
      exportScale=2;
      try{ paint(src); }catch(e){ console.warn(e); }
      exportScale=1;
      canvas.toBlob(b=>{
        const a=document.createElement('a');
        a.download='halation-ascii-'+mode+'.png';
        a.href=URL.createObjectURL(b);
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),2000);
        if(window.toast) toast('Exported ✦ halation-ascii-'+mode+'.png');
      });
    });
    return true;
  }

  /* --- wire the panel --- */
  document.addEventListener('click', e=>{
    const a = e.target.closest('.achip');
    if(!a) return;
    document.querySelectorAll('.achip').forEach(c=>c.classList.remove('active'));
    a.classList.add('active');
    mode = a.dataset.m;
    if(MODES[mode] && MODES[mode].cols){
      cols = MODES[mode].cols;
      const c2=document.getElementById('colsSlider'); if(c2) c2.value=cols;
      const v2=document.getElementById('colsVal'); if(v2) v2.textContent=cols;
    }
    const gr = document.getElementById('glyphRow');
    if(gr) gr.style.display = mode==='custom' ? '' : 'none';
    const tr = document.getElementById('textRow');
    if(tr) tr.style.display = mode==='manuscript' ? '' : 'none';
    if(mode==='custom') buildCustomRamp();
    render();
    if(MODES[mode] && MODES[mode].anim) startAnim(); else stopAnim();
    if(window.GpuAscii) GpuAscii.update(mode);
  });
  document.querySelectorAll('.chip[data-f]').forEach(ch=>{
    ch.addEventListener('click', ()=>{ ch.dataset.f==='ascii' ? open() : close(); });
  });
  const cs=document.getElementById('colsSlider');
  if(cs) cs.addEventListener('input', ()=>{ cols=+cs.value; const v=document.getElementById('colsVal'); if(v) v.textContent=cols; render(); });
  const gi=document.getElementById('glyphInput');
  if(gi){ let d; gi.addEventListener('input', ()=>{ clearTimeout(d); d=setTimeout(()=>{ glyphs=gi.value||'@'; buildCustomRamp(); if(mode==='custom') render(); },250); }); }
  /* re-render when a new picture is loaded */
  new MutationObserver(()=>{ if(isActive() && !aside) render(); })
    .observe(document.getElementById('stageMedia'), {childList:true});

  buildCustomRamp();
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(()=>{ if(isActive() && !aside) render(); });
  }
  const pi=document.getElementById('proseInput');
  if(pi){ let d; pi.addEventListener('input', ()=>{ clearTimeout(d); d=setTimeout(()=>{ proseText=pi.value||'@'; buildProse(); if(mode==='manuscript') render(); },300); }); }
  window.HalationASCII = { open, close, sync, setAside, render, export: doExport };
})();
