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
  let animId=null, lastGrid=null, cwG=9.6, fsG=16, fwG=0, fhG=0, dprG=1;
  let loL=0, spanL=255;
  const STEP={};
  const intSlider = document.getElementById('intensity');

  /* --- turn the current subject (img or sample svg) into an Image --- */
  function getSource(cb){
    const s = document.querySelector('#stageMedia .subject');
    if(!s){ cb(null); return; }
    if(s.tagName === 'IMG'){ cb(s); return; }
    const sym = document.getElementById('scene');
    if(!sym){ cb(null); return; }
    try{
      const str = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="960" height="720">' + sym.innerHTML + '</svg>';
      const im = new Image();
      im.onload = ()=> cb(im);
      im.onerror = ()=> cb(null);
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
    }catch(e){ console.warn(e); cb(null); }
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
    const fctx=f.getContext('2d');
    fctx.imageSmoothingEnabled=true;
    fctx.imageSmoothingQuality='high';
    fctx.drawImage(c,0,0,w,h);
    return f;
  }

  /* --- shared helpers --- */
  const glyphMeter = document.createElement('canvas');
  glyphMeter.width = glyphMeter.height = 32;
  const glyphMeterCtx = glyphMeter.getContext('2d', {willReadFrequently:true});
  /* measure a glyph's visual weight: ink coverage (pixels above alpha threshold) */
  function measureGlyph(ch){
    glyphMeterCtx.clearRect(0,0,32,32);
    glyphMeterCtx.fillStyle='#fff';
    glyphMeterCtx.font='24px "Space Mono",monospace';
    glyphMeterCtx.textAlign='center';
    glyphMeterCtx.textBaseline='middle';
    glyphMeterCtx.fillText(ch,16,16);
    const d=glyphMeterCtx.getImageData(0,0,32,32).data; let n=0;
    for(let i=3;i<d.length;i+=4) if(d[i]>64) n++;
    return n;
  }
  /* #rrggbb → rgba() string */
  function hexToRgba(hex, a){
    const h=hex.replace('#','');
    const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
    return 'rgba('+r+','+g+','+b+','+a+')';
  }
  /* proper HSL saturation boost (no clipping) */
  function saturateRGB(r,g,b,f){
    r/=255; g/=255; b/=255;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2;
    let h=0, s=0;
    if(mx!==mn){
      const d=mx-mn;
      s = l>0.5 ? d/(2-mx-mn) : d/(mx+mn);
      if(mx===r) h=(g-b)/d+(g<b?6:0);
      else if(mx===g) h=(b-r)/d+2;
      else h=(r-g)/d+4;
      h/=6;
    }
    s=Math.min(1, s*f);
    let r2,g2,b2;
    if(s===0){ r2=g2=b2=l; }
    else{
      const q = l<0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
      const hue2rgb=t=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
      r2=hue2rgb(h+1/3); g2=hue2rgb(h); b2=hue2rgb(h-1/3);
    }
    return [Math.round(r2*255), Math.round(g2*255), Math.round(b2*255)];
  }

  /* --- measure each custom glyph's visual weight, sort light→dark --- */
  function buildCustomRamp(){
    const rawChars = [...new Set(glyphs.split(''))];
    const nonSpace = rawChars.filter(c=>c.trim().length > 0);
    if(!nonSpace.length){ customRamp=' @'; return; }
    const scored = nonSpace.map(ch=>({ch, n:measureGlyph(ch)})).sort((a,b)=>a.n-b.n);
    const hasHeavy = scored.some(s=>s.n >= 50 || s.ch==='█' || s.ch==='@' || s.ch==='#');
    customRamp = ' ' + scored.map(s=>s.ch).join('') + (hasHeavy ? '' : '█');
  }

  /* --- MANUSCRIPT : prose optical density ramp builder --- */
  let proseText='In the darkroom every photograph waits for its second life, and light remembers what the eye forgets.';
  let proseRamp=null;
  function buildProseRamp(){
    const raw = (proseText && proseText.trim().length > 0) ? proseText.trim() : 'HALATION';
    const uniq = [...new Set(raw.split(''))];
    const nonSpace = uniq.filter(c => c.trim().length > 0);
    if(!nonSpace.length){ proseRamp=' .o@'; return; }
    const scored = nonSpace.map(ch => ({ ch, n: measureGlyph(ch) })).sort((a, b) => a.n - b.n);
    proseRamp = ' ' + scored.map(s => s.ch).join('');
  }

  /* --- the engine --- */
  function render(){
    if(busy || aside) return;
    if(MODES[mode] && MODES[mode].external) return;
    busy = true;
    getSource(src=>{
      try{ if(src) paint(src); }catch(e){ console.warn(e); }
      busy=false;
    });
  }

  function paint(src, scale, fit){
    const M = MODES[mode];
    const iw = src.naturalWidth || 960, ih = src.naturalHeight || 720;

    const fontSize = 16*(scale||1);
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
    for(let i=0;i<N;i++){
      const r=data[i*4], g=data[i*4+1], b=data[i*4+2];
      R[i]=r; G[i]=g; B[i]=b;
      L[i] = .299*r + .587*g + .114*b;
    }

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

    const dpr = Math.min(3, (window.devicePixelRatio||1)*(scale||1));
    const W = cols*cw, H = rows*fontSize;
    const fw = (fit===false) ? W : (frame.clientWidth || W);
    const fh = (fit===false) ? H : (frame.clientHeight || H);
    fwG=fw; fhG=fh; dprG=dpr;
    const s = (fit===false) ? 1 : Math.min(fw/W, fh/H);
    const ox = (fw - W*s)/2, oy = (fh - H*s)/2;
    canvas.width  = Math.round(fw*dpr);
    canvas.height = Math.round(fh*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.font = fontSize + 'px "Space Mono",monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = M.bg;
    ctx.fillRect(0, 0, fw, fh);
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    if(M.anim) return;   /* animated plates draw themselves each frame */

    /* --- BRAILLE HD : 1 char = 2×4 pixels --- */
    if(M.braille){
      const BITS = [0x01,0x08,0x02,0x10,0x04,0x20,0x40,0x80];
      const sw=cols*2, sh=rows*4;
      const bc=sampleSmooth(src, sw, sh);
      const bctx=bc.getContext('2d',{willReadFrequently:true});
      const bd=bctx.getImageData(0,0,sw,sh).data;
      const lum=new Float32Array(sw*sh);
      for(let p=0;p<sw*sh;p++) lum[p]=.299*bd[p*4]+.587*bd[p*4+1]+.114*bd[p*4+2];
      /* local-mean adaptive threshold: preserves edges & contours */
      const blur=new Float32Array(sw*sh);
      const RAD=2;
      for(let y=0;y<sh;y++) for(let x=0;x<sw;x++){
        let sum=0,cnt=0;
        for(let dy=-RAD;dy<=RAD;dy++) for(let dx=-RAD;dx<=RAD;dx++){
          const yy=y+dy, xx=x+dx;
          if(yy<0||yy>=sh||xx<0||xx>=sw) continue;
          sum+=lum[yy*sw+xx]; cnt++;
        }
        blur[y*sw+x]=sum/cnt;
      }
      ctx.fillStyle = M.fg;
      for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
        let v=0;
        for(let dy=0;dy<4;dy++) for(let dx=0;dx<2;dx++){
          const p=(y*4+dy)*sw + (x*2+dx);
          if(lum[p] > blur[p]+3 || lum[p] > 140) v |= BITS[dy*2+dx];
        }
        if(v) ctx.fillText(String.fromCharCode(0x2800+v), x*cw, y*fontSize);
      }
    }
    /* --- STRUCTURE : Master Architectural & Pen-and-Ink Engraving --- */
    else if(M.edge){
      const ew=cols*2, eh=rows*2;
      const ec=sampleSmooth(src, ew, eh);
      const ed=ec.getContext('2d',{willReadFrequently:true}).getImageData(0,0,ew,eh).data;
      const E=new Float32Array(ew*eh);
      for(let i=0;i<ew*eh;i++) E[i]=.299*ed[i*4]+.587*ed[i*4+1]+.114*ed[i*4+2];

      /* 1. Clamped Gaussian Blur (5x5 separable kernel: [1, 4, 6, 4, 1]) */
      const tempB=new Float32Array(ew*eh);
      const B=new Float32Array(ew*eh);
      for(let y=0;y<eh;y++){
        const row=y*ew;
        for(let x=0;x<ew;x++){
          let sum=0;
          for(let dx=-2;dx<=2;dx++){
            const cx=Math.max(0,Math.min(ew-1, x+dx));
            const w=(dx===0)?6:(Math.abs(dx)===1)?4:1;
            sum += E[row+cx]*w;
          }
          tempB[row+x]=sum/16;
        }
      }
      for(let y=0;y<eh;y++){
        for(let x=0;x<ew;x++){
          let sum=0;
          for(let dy=-2;dy<=2;dy++){
            const cy=Math.max(0,Math.min(eh-1, y+dy));
            const w=(dy===0)?6:(Math.abs(dy)===1)?4:1;
            sum += tempB[cy*ew+x]*w;
          }
          B[y*ew+x]=sum/16;
        }
      }

      /* 2. High-precision Sobel Gradients (with border clamping) */
      const MAG=new Float32Array(ew*eh), GXa=new Float32Array(ew*eh), GYa=new Float32Array(ew*eh);
      for(let y=0;y<eh;y++){
        const yTop=Math.max(0,y-1)*ew;
        const yMid=y*ew;
        const yBot=Math.min(eh-1,y+1)*ew;
        for(let x=0;x<ew;x++){
          const xL=Math.max(0,x-1);
          const xR=Math.min(ew-1,x+1);
          const gx=(B[yTop+xR]+2*B[yMid+xR]+B[yBot+xR]) - (B[yTop+xL]+2*B[yMid+xL]+B[yBot+xL]);
          const gy=(B[yBot+xL]+2*B[yBot+x]+B[yBot+xR]) - (B[yTop+xL]+2*B[yTop+x]+B[yTop+xR]);
          const i=y*ew+x;
          GXa[i]=gx;
          GYa[i]=gy;
          MAG[i]=Math.sqrt(gx*gx+gy*gy);
        }
      }

      /* 3. Non-maximum suppression */
      const NMS=new Float32Array(ew*eh);
      for(let y=1;y<eh-1;y++){
        const row=y*ew;
        for(let x=1;x<ew-1;x++){
          const i=row+x, m=MAG[i];
          if(m<10){ NMS[i]=0; continue; }
          let a=Math.atan2(GYa[i],GXa[i]);
          if(a<0) a+=Math.PI;
          let n1=0, n2=0;
          if(a<Math.PI/8 || a>=7*Math.PI/8){
            n1=MAG[i-1]; n2=MAG[i+1];
          } else if(a<3*Math.PI/8){
            n1=MAG[i-ew+1]; n2=MAG[i+ew-1];
          } else if(a<5*Math.PI/8){
            n1=MAG[i-ew]; n2=MAG[i+ew];
          } else {
            n1=MAG[i-ew-1]; n2=MAG[i+ew+1];
          }
          NMS[i]=(m>=n1 && m>=n2)?m:0;
        }
      }

      /* 4. Adaptive Hysteresis thresholds based on surviving magnitude distribution */
      const mags=[];
      for(let i=0;i<ew*eh;i++) if(NMS[i]>8) mags.push(NMS[i]);
      mags.sort((a,b)=>a-b);
      const hi=mags.length ? mags[Math.floor(mags.length*0.55)] : 22;
      const lo=hi*0.35;

      /* 5. Hysteresis edge tracking */
      const EDGE=new Uint8Array(ew*eh), stack=[];
      for(let i=0;i<ew*eh;i++) if(NMS[i]>=hi){ EDGE[i]=1; stack.push(i); }
      while(stack.length){
        const i=stack.pop(), x=i%ew, y=(i/ew)|0;
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
          if(dx===0 && dy===0) continue;
          const nx=x+dx, ny=y+dy;
          if(nx<0||nx>=ew||ny<0||ny>=eh) continue;
          const ni=ny*ew+nx;
          if(EDGE[ni]===0 && NMS[ni]>=lo){ EDGE[ni]=1; stack.push(ni); }
        }
      }

      /* 6. Volumetric Cross-Hatch & Tonal Depth (paper: #efe4cd, fg: #241a10) */
      for(let y=0;y<rows;y++){
        for(let x=0;x<cols;x++){
          const i=y*cols+x;
          const lum=L[i];
          if(lum>225) continue; // Clean highlight
          let toneChar='', toneAlpha=0.2;
          if(lum<=50){
            toneChar='#'; toneAlpha=0.50;
          } else if(lum<=100){
            toneChar='+'; toneAlpha=0.38;
          } else if(lum<=150){
            toneChar=':'; toneAlpha=0.28;
          } else if(lum<=195){
            toneChar='.'; toneAlpha=0.20;
          } else {
            toneChar='.'; toneAlpha=0.12;
          }
          if(toneChar){
            ctx.fillStyle=hexToRgba(M.fg, toneAlpha.toFixed(2));
            ctx.fillText(toneChar, x*cw, y*fontSize);
          }
        }
      }

      /* 7. Rich Architectural Strokes & Corners */
      for(let y=0;y<rows;y++){
        for(let x=0;x<cols;x++){
          let bestMag=0, bx=0, by=0, edgeCount=0;
          for(let dy=0;dy<2;dy++){
            for(let dx=0;dx<2;dx++){
              const ei=(y*2+dy)*ew+(x*2+dx);
              if(EDGE[ei]){
                edgeCount++;
                if(MAG[ei]>bestMag){
                  bestMag=MAG[ei];
                  bx=GXa[ei];
                  by=GYa[ei];
                }
              }
            }
          }
          if(bestMag<=0) continue;

          let ch;
          if(edgeCount>=3){
            ch='+';
          } else {
            const absX=Math.abs(bx), absY=Math.abs(by);
            if(absY>absX*1.5){
              ch='-';
            } else if(absX>absY*1.5){
              ch='|';
            } else {
              ch=(bx*by>0)?'/':'\\';
            }
          }
          ctx.fillStyle=M.fg;
          ctx.fillText(ch, x*cw, y*fontSize);
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
    /* --- MANUSCRIPT : Master Typewriter Prose Calligram --- */
    else if(M.text){
      if(!proseRamp) buildProseRamp();
      const ramp = proseRamp;
      const rLen = ramp.length;

      /* 1. Detect Background Polarity (Dark BG Graphic vs Light BG Photo) */
      let borderSum = 0, borderCount = 0;
      for(let x = 0; x < cols; x++){
        borderSum += L[x] + L[(rows - 1) * cols + x];
        borderCount += 2;
      }
      for(let y = 1; y < rows - 1; y++){
        borderSum += L[y * cols] + L[y * cols + (cols - 1)];
        borderCount += 2;
      }
      const avgBorderLum = borderSum / borderCount;
      const isDarkBg = avgBorderLum < 85;

      /* 2. Sub-Pixel Difference of Gaussians (DoG) for Razor-Sharp Edge Contours */
      const ew = cols * 2, eh = rows * 2;
      const ec = sampleSmooth(src, ew, eh);
      const ed = ec.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, ew, eh).data;
      const E = new Float32Array(ew * eh);
      for(let i = 0; i < ew * eh; i++) E[i] = .299 * ed[i * 4] + .587 * ed[i * 4 + 1] + .114 * ed[i * 4 + 2];

      // Narrow Gaussian G1 (3x3)
      const G1 = new Float32Array(ew * eh);
      for(let y = 0; y < eh; y++){
        const yTop = Math.max(0, y - 1) * ew;
        const yMid = y * ew;
        const yBot = Math.min(eh - 1, y + 1) * ew;
        for(let x = 0; x < ew; x++){
          const xL = Math.max(0, x - 1);
          const xR = Math.min(ew - 1, x + 1);
          const sum = E[yTop + xL] + 2 * E[yTop + x] + E[yTop + xR] +
                      2 * E[yMid + xL] + 4 * E[yMid + x] + 2 * E[yMid + xR] +
                      E[yBot + xL] + 2 * E[yBot + x] + E[yBot + xR];
          G1[yMid + x] = sum / 16;
        }
      }

      // Wide Gaussian G2 (5x5 separable)
      const tempG2 = new Float32Array(ew * eh);
      const G2 = new Float32Array(ew * eh);
      for(let y = 0; y < eh; y++){
        const row = y * ew;
        for(let x = 0; x < ew; x++){
          let sum = 0;
          for(let dx = -2; dx <= 2; dx++){
            const cx = Math.max(0, Math.min(ew - 1, x + dx));
            const w = (dx === 0) ? 6 : (Math.abs(dx) === 1) ? 4 : 1;
            sum += E[row + cx] * w;
          }
          tempG2[row + x] = sum / 16;
        }
      }
      for(let y = 0; y < eh; y++){
        for(let x = 0; x < ew; x++){
          let sum = 0;
          for(let dy = -2; dy <= 2; dy++){
            const cy = Math.max(0, Math.min(eh - 1, y + dy));
            const w = (dy === 0) ? 6 : (Math.abs(dy) === 1) ? 4 : 1;
            sum += tempG2[cy * ew + x] * w;
          }
          G2[y * ew + x] = sum / 16;
        }
      }

      // Difference of Gaussians & Sobel Edge Magnitude
      const edgeScore = new Float32Array(cols * rows);
      for(let y = 0; y < rows; y++){
        const yTop = Math.max(0, y * 2 - 1) * ew;
        const yMid = (y * 2) * ew;
        const yBot = Math.min(eh - 1, y * 2 + 1) * ew;
        for(let x = 0; x < cols; x++){
          const xL = Math.max(0, x * 2 - 1);
          const xR = Math.min(ew - 1, x * 2 + 1);
          
          const dogTL = G1[yTop + xL] - 0.96 * G2[yTop + xL];
          const dogTR = G1[yTop + xR] - 0.96 * G2[yTop + xR];
          const dogML = G1[yMid + xL] - 0.96 * G2[yMid + xL];
          const dogMR = G1[yMid + xR] - 0.96 * G2[yMid + xR];
          const dogBL = G1[yBot + xL] - 0.96 * G2[yBot + xL];
          const dogBR = G1[yBot + xR] - 0.96 * G2[yBot + xR];
          const dogTC = G1[yTop + x * 2] - 0.96 * G2[yTop + x * 2];
          const dogBC = G1[yBot + x * 2] - 0.96 * G2[yBot + x * 2];
          
          const gx = (dogTR + 2 * dogMR + dogBR) - (dogTL + 2 * dogML + dogBL);
          const gy = (dogBL + 2 * dogBC + dogBR) - (dogTL + 2 * dogTC + dogTR);
          const mag = Math.sqrt(gx * gx + gy * gy);
          edgeScore[y * cols + x] = Math.min(1.0, mag / 2.0);
        }
      }

      /* 3. Dithered Typographic Prose Rendering on Paper */
      const T = new Float32Array(cols * rows);
      for(let i = 0; i < cols * rows; i++){
        const lum = L[i];
        const tone = isDarkBg ? (lum / 255.0) : ((255.0 - lum) / 255.0);
        const edge = edgeScore[i];
        T[i] = Math.max(0, Math.min(1.0, Math.pow(tone, 1.1) * 0.90 + Math.pow(edge, 0.85) * 0.40));
      }

      ctx.fillStyle = M.fg;
      for(let y = 0; y < rows; y++){
        for(let x = 0; x < cols; x++){
          const i = y * cols + x;
          const val = T[i];
          if(val < 0.06) continue; // Clean highlight paper

          // Map continuous density to the sorted prose character ramp
          const idx = Math.min(rLen - 1, Math.floor(val * rLen));
          const ch = ramp[idx];
          if(!ch || ch === ' ') continue;

          // Render ink with tonal opacity for beautiful depth
          const alpha = (val >= 0.70) ? 1.0 : (0.40 + 0.60 * (val / 0.70));
          ctx.fillStyle = (alpha >= 0.95) ? M.fg : hexToRgba(M.fg, alpha.toFixed(2));
          ctx.fillText(ch, x * cw, y * fontSize);
        }
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
          const [cr,cg,cb]=saturateRGB(R[i],G[i],B[i],1.3);
          ctx.fillStyle='rgb('+cr+','+cg+','+cb+')';
        } else ctx.fillStyle=M.fg;
        ctx.fillText(ch, x*cw, y*fontSize);
      }
    }

    /* CRT scanlines */
    if(M.crt){
      ctx.save();
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.fillStyle='rgba(0,0,0,.22)';
      for(let y=0;y<fh;y+=3) ctx.fillRect(0,y,fw,1);
      ctx.restore();
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
    ctx.save();
    ctx.setTransform(dprG,0,0,dprG,0,0);
    ctx.fillStyle='rgba(2,6,2,.20)';
    ctx.fillRect(0,0,fwG,fhG);
    ctx.restore();
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
    ctx.save();
    ctx.setTransform(dprG,0,0,dprG,0,0);
    ctx.fillStyle='#050201'; ctx.fillRect(0,0,fwG,fhG);
    ctx.restore();
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
      if(!src) return;
      try{ paint(src, 2, false); }catch(e){ console.warn(e); }
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
  buildProseRamp();
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(()=>{ if(isActive() && !aside) render(); });
  }
  const pi=document.getElementById('proseInput');
  if(pi){ let d; pi.addEventListener('input', ()=>{ clearTimeout(d); d=setTimeout(()=>{ proseText=pi.value||'@'; buildProseRamp(); if(mode==='manuscript') render(); },250); }); }
  window.HalationASCII = { open, close, sync, setAside, render, export: doExport };
})();
