/* ================================================================
   HALATION — RETROLAB 64-Effect Canvas Engine
   Ported faithfully with exact primitive math and presets.
   ================================================================ */
(function(){
  'use strict';

  /* ========================= ENGINE PRIMITIVES ====================== */
  function lut(fn){const a=new Uint8ClampedArray(256);for(let i=0;i<256;i++){const v=fn(i);a[i]=v<0?0:v>255?255:v;}return a;}
  function cur(black,white,gamma){return lut(i=>black+(white-black)*Math.pow(i/255,gamma));}
  function sCurve(a){return lut(i=>{const v=i/255;return (v-a*Math.sin(2*Math.PI*v))*255;});}
  function comp(a,b){const c=new Uint8ClampedArray(256);for(let i=0;i<256;i++)c[i]=a[b[i]];return c;}
  const LUM=(r,g,b)=>.299*r+.587*g+.114*b;

  function pixels(ctx,w,h,fn){const img=ctx.getImageData(0,0,w,h);fn(img.data);ctx.putImageData(img,0,0);}
  function gray(ctx,w,h){pixels(ctx,w,h,d=>{for(let i=0;i<d.length;i+=4){const l=LUM(d[i],d[i+1],d[i+2]);d[i]=d[i+1]=d[i+2]=l;}});}

  function grade(ctx,w,h,o){
    const {r,g,b,sat=1}=o;
    pixels(ctx,w,h,d=>{
      for(let i=0;i<d.length;i+=4){
        let R=d[i],G=d[i+1],B=d[i+2];
        if(r){R=r[R];G=g[G];B=b[B];}
        if(sat!==1){const L=LUM(R,G,B);R=L+(R-L)*sat;G=L+(G-L)*sat;B=L+(B-L)*sat;}
        d[i]=R<0?0:R>255?255:R; d[i+1]=G<0?0:G>255?255:G; d[i+2]=B<0?0:B>255?255:B;
      }
    });
  }
  function grain(ctx,w,h,amt){
    pixels(ctx,w,h,d=>{for(let i=0;i<d.length;i+=4){const n=(Math.random()-.5)*amt;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}});
  }
  function bloom(ctx,w,h,str){
    ctx.save(); ctx.globalCompositeOperation='screen'; ctx.imageSmoothingEnabled=true;
    for(const [f,a] of [[16,str*.7],[6,str*.35]]){
      const c=document.createElement('canvas'), bw=Math.max(2,w/f|0), bh=Math.max(2,h/f|0);
      c.width=bw;c.height=bh; c.getContext('2d').drawImage(ctx.canvas,0,0,bw,bh);
      ctx.globalAlpha=a; ctx.drawImage(c,0,0,w,h);
    }
    ctx.restore();
  }
  function vignette(ctx,w,h,str){
    const cx=w/2,cy=h/2,r=Math.hypot(cx,cy);
    const g=ctx.createRadialGradient(cx,cy,r*.45,cx,cy,r);
    g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,`rgba(0,0,0,${str})`);
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  }
  /* bright dreamy edges instead of dark ones */
  function whiteVignette(ctx,w,h,str){
    const cx=w/2,cy=h/2,r=Math.hypot(cx,cy);
    const g=ctx.createRadialGradient(cx,cy,r*.4,cx,cy,r);
    g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(1,`rgba(255,250,245,${str})`);
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  }
  function leak(ctx,w,h,rgb,str,pos){
    ctx.save(); ctx.globalCompositeOperation='screen';
    const [r,g,b]=rgb; let grd;
    if(pos==='l')       grd=ctx.createLinearGradient(0,0,w*.7,0);
    else if(pos==='r')  grd=ctx.createLinearGradient(w,0,w*.3,0);
    else if(pos==='tl') grd=ctx.createRadialGradient(0,0,0,0,0,Math.max(w,h)*.9);
    else                grd=ctx.createRadialGradient(w,h*.4,0,w,h*.4,Math.max(w,h)*.9);
    grd.addColorStop(0,`rgba(${r},${g},${b},${str})`); grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd; ctx.fillRect(0,0,w,h); ctx.restore();
  }
  /* camera-flash bright centre */
  function flash(ctx,w,h,str=.28){
    const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.2,w/2,h/2,Math.max(w,h)*.75);
    g.addColorStop(0,`rgba(255,255,235,${str})`); g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  }
  function chromatic(ctx,w,h,shift){
    const img=ctx.getImageData(0,0,w,h), d=img.data, src=new Uint8ClampedArray(d);
    for(let y=0;y<h;y++){const row=y*w;
      for(let x=0;x<w;x++){const i=(row+x)*4;
        const xr=x+shift; if(xr<w)  d[i]  =src[(row+xr)*4];
        const xb=x-shift; if(xb>=0) d[i+2]=src[(row+xb)*4+2];
      }}
    ctx.putImageData(img,0,0);
  }
  function scanlines(ctx,w,h,alpha=0.14,gap=3){
    ctx.fillStyle=`rgba(0,0,0,${alpha})`;
    for(let y=0;y<h;y+=gap) ctx.fillRect(0,y,w,1);
  }
  function dust(ctx,w,h,{specks=40,scratches=6,dark=false}={}){
    for(let i=0;i<specks;i++){
      ctx.fillStyle=dark?`rgba(40,30,20,${Math.random()*.35})`:`rgba(255,250,240,${Math.random()*.3})`;
      ctx.beginPath();ctx.arc(Math.random()*w,Math.random()*h,Math.random()*1.6+.3,0,7);ctx.fill();
    }
    for(let i=0;i<scratches;i++){
      const x=Math.random()*w, drift=(Math.random()-.5)*20;
      ctx.strokeStyle=`rgba(${dark?'30,25,20':'255,248,235'},${Math.random()*.18+.05})`;
      ctx.lineWidth=Math.random()*1.1+.3; ctx.beginPath(); ctx.moveTo(x,0);
      for(let yy=0;yy<h;yy+=h/8) ctx.lineTo(x+drift*(yy/h)+(Math.random()-.5)*4,yy);
      ctx.stroke();
    }
  }
  function sparkles(ctx,w,h,n=8){
    ctx.save(); ctx.globalCompositeOperation='screen';
    for(let i=0;i<n;i++){
      const x=Math.random()*w, y=Math.random()*h*.9, s=6+Math.random()*18;
      const g=ctx.createRadialGradient(x,y,0,x,y,s);
      g.addColorStop(0,'rgba(255,255,255,.9)');g.addColorStop(.25,'rgba(255,240,200,.4)');g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,s,0,7); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.65)'; ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x-s,y);ctx.lineTo(x+s,y);ctx.moveTo(x,y-s);ctx.lineTo(x,y+s);ctx.stroke();
    }
    ctx.restore();
  }
  function letterbox(ctx,w,h){const bar=Math.round(h*.1);ctx.fillStyle='#000';ctx.fillRect(0,0,w,bar);ctx.fillRect(0,h-bar,w,bar);}
  function sheen(ctx,w,h){
    ctx.save();ctx.globalCompositeOperation='screen';
    const g=ctx.createLinearGradient(0,0,w*.6,h*.4);
    g.addColorStop(0,'rgba(255,255,255,.28)');g.addColorStop(.5,'rgba(200,220,255,.08)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore();
  }
  function posterize(ctx,w,h,lv){
    pixels(ctx,w,h,d=>{for(let i=0;i<d.length;i+=4){
      d[i]=Math.round(d[i]/lv)*lv; d[i+1]=Math.round(d[i+1]/lv)*lv; d[i+2]=Math.round(d[i+2]/lv)*lv;}});
  }
  function pixelate(ctx,w,h,f){
    const bw=Math.max(2,w/f|0),bh=Math.max(2,h/f|0);
    const c=document.createElement('canvas');c.width=bw;c.height=bh;
    c.getContext('2d').drawImage(ctx.canvas,0,0,bw,bh);
    ctx.imageSmoothingEnabled=false; ctx.drawImage(c,0,0,w,h); ctx.imageSmoothingEnabled=true;
  }
  function blurSoft(ctx,w,h,f=8){
    const bw=Math.max(2,w/f|0),bh=Math.max(2,h/f|0);
    const c=document.createElement('canvas');c.width=bw;c.height=bh;
    const cc=c.getContext('2d'); cc.drawImage(ctx.canvas,0,0,bw,bh);
    ctx.imageSmoothingEnabled=true; ctx.drawImage(c,0,0,w,h);
  }
  /* true hue rotation matrix */
  function hueRotate(ctx,w,h,deg){
    const a=deg*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
    const m=[.213+.787*c-.213*s,.715-.715*c-.715*s,.072-.072*c+.928*s,
             .213-.213*c+.213*s,.715+.285*c+.014*s,.072-.072*c-.283*s,
             .213-.213*c-.013*s,.715-.715*c+.715*s,.072+.928*c+.072*s];
    pixels(ctx,w,h,d=>{for(let i=0;i<d.length;i+=4){
      const r=d[i],g=d[i+1],b=d[i+2];
      d[i]=m[0]*r+m[1]*g+m[2]*b; d[i+1]=m[3]*r+m[4]*g+m[5]*b; d[i+2]=m[6]*r+m[7]*g+m[8]*b;}});
  }
  /* luminance-based split toning */
  function splitTone(ctx,w,h,shR,shG,shB,hiR,hiG,hiB){
    pixels(ctx,w,h,d=>{
      for(let i=0;i<d.length;i+=4){
        const t=LUM(d[i],d[i+1],d[i+2])/255, sh=(1-t)*(1-t), hi=t*t;
        d[i]=d[i]+shR*sh+hiR*hi; d[i+1]=d[i+1]+shG*sh+hiG*hi; d[i+2]=d[i+2]+shB*sh+hiB*hi;
      }
    });
  }
  /* vaporwave striped sun */
  function retroSun(ctx,w,h){
    const r=Math.min(w,h)*.3, x=w*.72, y=h*.42;
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const cc=c.getContext('2d');
    const g=cc.createLinearGradient(0,y-r,0,y+r);
    g.addColorStop(0,'#ffe95c');g.addColorStop(.55,'#ff9d4d');g.addColorStop(1,'#ff3fa4');
    cc.fillStyle=g;cc.beginPath();cc.arc(x,y,r,0,7);cc.fill();
    cc.globalCompositeOperation='destination-out';
    let yy=y+6, t=2, gap=8;
    while(yy<y+r){ cc.fillRect(x-r-4,yy,2*r+8,t); yy+=t+gap; t+=2; gap=Math.max(3,gap-.4); }
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.9;ctx.drawImage(c,0,0);ctx.restore();
  }
  /* aesthetic date stamp — LEFT side */
  function dateStamp(ctx,w,h,{text,style='orange',pos='bl',vertical=false}={}){
    const fs=Math.max(13,Math.round(w*0.033));
    const pad=Math.round(w*0.035);
    ctx.save();
    if('letterSpacing' in ctx) ctx.letterSpacing=Math.round(fs*.14)+'px';
    if(style==='orange'){
      ctx.font=`bold ${fs}px "Courier New",monospace`;
      ctx.fillStyle='#ffab40'; ctx.shadowColor='rgba(255,120,20,.95)'; ctx.shadowBlur=fs*.55;
    }else if(style==='pale'){
      ctx.font=`${fs}px "Courier New",monospace`;
      ctx.fillStyle='rgba(255,246,214,.94)'; ctx.shadowColor='rgba(255,240,180,.6)'; ctx.shadowBlur=fs*.35;
    }else if(style==='digital'){
      ctx.font=`bold ${fs}px Verdana,sans-serif`;
      ctx.fillStyle='#ffffff'; ctx.shadowColor='rgba(0,0,0,.55)'; ctx.shadowBlur=fs*.25;
    }else{
      ctx.font=`italic ${fs}px Georgia,serif`;
      ctx.fillStyle='rgba(255,250,240,.55)';
    }
    if(vertical){ ctx.translate(pad,h-pad); ctx.rotate(-Math.PI/2); ctx.fillText(text,0,0); }
    else if(pos==='tl'){ ctx.fillText(text,pad,pad+fs); }
    else{ ctx.fillText(text,pad,h-pad); }
    ctx.restore();
  }
  function recDot(ctx,w,h){
    const fs=Math.max(13,Math.round(w*.03)), pad=Math.round(w*.035);
    ctx.save();
    ctx.fillStyle='#ff2b2b'; ctx.shadowColor='rgba(255,0,0,.8)'; ctx.shadowBlur=fs*.6;
    ctx.beginPath(); ctx.arc(pad+fs*.35,pad+fs*.5,fs*.3,0,7); ctx.fill();
    ctx.shadowBlur=fs*.3; ctx.font=`bold ${fs}px "Courier New",monospace`; ctx.fillStyle='#fff';
    ctx.fillText('REC',pad+fs*.95,pad+fs*.85);
    ctx.restore();
  }

  /* ===================== RETRO (11 presets) ======================= */
  function fxCam98(ctx,w,h){
    grade(ctx,w,h,{r:cur(6,255,.9),g:cur(4,246,.96),b:cur(8,238,1.05),sat:1.25});
    chromatic(ctx,w,h,2); bloom(ctx,w,h,.15);
    scanlines(ctx,w,h,.12,3); grain(ctx,w,h,14); vignette(ctx,w,h,.22);
    dateStamp(ctx,w,h,{text:'JUL 04 1998',style:'orange'});
  }
  function fxDisposable(ctx,w,h){
    grade(ctx,w,h,{r:cur(10,255,.82),g:cur(10,252,.86),b:cur(8,246,.92),sat:.95});
    flash(ctx,w,h,.28); grain(ctx,w,h,20); vignette(ctx,w,h,.42);
    dateStamp(ctx,w,h,{text:'AUG 21 1999',style:'pale',pos:'tl'});
  }
  function fxDigicam(ctx,w,h){
    grade(ctx,w,h,{r:cur(4,255,.94),g:cur(4,252,.98),b:cur(8,255,.96),sat:1.15});
    grade(ctx,w,h,{r:sCurve(.05),g:sCurve(.05),b:sCurve(.05)});
    bloom(ctx,w,h,.12); grain(ctx,w,h,6); vignette(ctx,w,h,.12);
    dateStamp(ctx,w,h,{text:'2004 08 14',style:'digital'});
  }
  function fxSuper8(ctx,w,h){
    grade(ctx,w,h,{r:cur(24,244,.88),g:cur(18,230,.95),b:cur(10,196,1.05),sat:.7});
    dust(ctx,w,h,{specks:70,scratches:10});
    grain(ctx,w,h,22); grain(ctx,w,h,14);
    bloom(ctx,w,h,.1); vignette(ctx,w,h,.5);
    dateStamp(ctx,w,h,{text:'summer · 1974',style:'faded',vertical:true});
  }
  function fxPolaroid(ctx,w,h){
    grade(ctx,w,h,{r:cur(26,250,.9),g:cur(28,248,.95),b:cur(26,240,.99),sat:.82});
    ctx.save();ctx.globalCompositeOperation='overlay';ctx.fillStyle='rgba(240,230,190,.14)';ctx.fillRect(0,0,w,h);ctx.restore();
    bloom(ctx,w,h,.12); grain(ctx,w,h,7); vignette(ctx,w,h,.18);
  }
  function fxVHS(ctx,w,h){
    grade(ctx,w,h,{r:cur(4,255,.96),g:cur(2,248,1),b:cur(10,252,1.02),sat:1.28});
    grade(ctx,w,h,{r:sCurve(.05),g:sCurve(.05),b:sCurve(.05)});
    chromatic(ctx,w,h,3); bloom(ctx,w,h,.15);
    scanlines(ctx,w,h,.16); grain(ctx,w,h,18); vignette(ctx,w,h,.2);
  }
  function fxSepia23(ctx,w,h){
    pixels(ctx,w,h,d=>{
      for(let i=0;i<d.length;i+=4){
        const r=d[i],g=d[i+1],b=d[i+2];
        d[i]=Math.min(255,.393*r+.769*g+.189*b);
        d[i+1]=Math.min(255,.349*r+.686*g+.168*b);
        d[i+2]=Math.min(255,.272*r+.534*g+.131*b);
      }
    });
    grade(ctx,w,h,{r:cur(20,246,.96),g:cur(16,238,.96),b:cur(10,220,.96)});
    dust(ctx,w,h,{specks:60,scratches:8}); grain(ctx,w,h,16); vignette(ctx,w,h,.45);
    dateStamp(ctx,w,h,{text:'· 1923 ·',style:'faded'});
  }
  function fxGold(ctx,w,h){
    grade(ctx,w,h,{r:cur(12,255,.84),g:cur(8,246,.94),b:cur(4,208,1.12),sat:1.18});
    bloom(ctx,w,h,.35); leak(ctx,w,h,[255,170,60],.45,'r');
    sparkles(ctx,w,h,6); grain(ctx,w,h,9); vignette(ctx,w,h,.25);
  }
  function fxMillennium(ctx,w,h){
    grade(ctx,w,h,{r:cur(8,244,1.02),g:cur(10,250,.98),b:cur(20,255,.88),sat:.85});
    grade(ctx,w,h,{r:sCurve(.05),g:sCurve(.05),b:sCurve(.05)});
    sheen(ctx,w,h); bloom(ctx,w,h,.2); grain(ctx,w,h,5); vignette(ctx,w,h,.12);
    dateStamp(ctx,w,h,{text:'01 01 2000',style:'digital'});
  }
  function fxHomeVideo(ctx,w,h){
    grade(ctx,w,h,{r:cur(12,255,.88),g:cur(8,248,.96),b:cur(4,232,1.04),sat:1.2});
    chromatic(ctx,w,h,1); bloom(ctx,w,h,.15); scanlines(ctx,w,h,.08);
    grain(ctx,w,h,12); vignette(ctx,w,h,.25);
    recDot(ctx,w,h);
    dateStamp(ctx,w,h,{text:'JUN 12 1996',style:'orange'});
  }
  function fxBeach95(ctx,w,h){
    grade(ctx,w,h,{r:cur(14,255,.8),g:cur(10,250,.9),b:cur(6,238,1),sat:1.25});
    flash(ctx,w,h,.22); grain(ctx,w,h,16); vignette(ctx,w,h,.35);
    dateStamp(ctx,w,h,{text:'JUL 1995',style:'pale'});
  }

  /* ========================== AESTHETIC (8 presets) ================= */
  function fxMiami(ctx,w,h){
    grade(ctx,w,h,{r:cur(14,255,.78),g:cur(6,242,.94),b:cur(26,246,1.05),sat:1.35});
    bloom(ctx,w,h,.45); leak(ctx,w,h,[255,90,170],.4,'tl'); leak(ctx,w,h,[80,200,255],.2,'r');
    grain(ctx,w,h,11); vignette(ctx,w,h,.22);
  }
  function fxDreamy(ctx,w,h){
    grade(ctx,w,h,{r:cur(18,252,.86),g:cur(10,236,.98),b:cur(26,255,.9),sat:1.12});
    ctx.save();ctx.globalCompositeOperation='overlay';ctx.fillStyle='rgba(170,130,255,.16)';ctx.fillRect(0,0,w,h);ctx.restore();
    bloom(ctx,w,h,.55); leak(ctx,w,h,[200,160,255],.3,'tl');
    grain(ctx,w,h,6); vignette(ctx,w,h,.15);
  }
  function fxSage(ctx,w,h){
    grade(ctx,w,h,{r:cur(14,246,.98),g:cur(18,252,.92),b:cur(12,234,1.05),sat:.85});
    ctx.save();ctx.globalCompositeOperation='overlay';ctx.fillStyle='rgba(160,190,160,.12)';ctx.fillRect(0,0,w,h);ctx.restore();
    bloom(ctx,w,h,.35); grain(ctx,w,h,6);
  }
  function fxAurora(ctx,w,h){
    grade(ctx,w,h,{r:sCurve(.05),g:sCurve(.05),b:sCurve(.05),sat:1.2});
    ctx.save();
    const g=ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0,'rgba(0,255,220,.55)');g.addColorStop(.5,'rgba(120,80,255,.55)');g.addColorStop(1,'rgba(255,60,180,.55)');
    ctx.globalCompositeOperation='overlay';  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.globalCompositeOperation='soft-light'; ctx.fillRect(0,0,w,h);
    ctx.restore();
    bloom(ctx,w,h,.25); grain(ctx,w,h,8); vignette(ctx,w,h,.2);
  }
  function fxDisco(ctx,w,h){
    grade(ctx,w,h,{r:cur(10,255,1.1),g:cur(4,250,1.02),b:cur(14,255,.98),sat:1.55});
    ctx.save();ctx.globalCompositeOperation='overlay';ctx.fillStyle='rgba(255,0,180,.12)';ctx.fillRect(0,0,w,h);ctx.restore();
    bloom(ctx,w,h,.35); sparkles(ctx,w,h,12); grain(ctx,w,h,12); vignette(ctx,w,h,.3);
  }
  function fxChrome(ctx,w,h){
    grade(ctx,w,h,{r:cur(0,250,1.06),g:cur(2,252,1),b:cur(16,255,.92),sat:.7});
    grade(ctx,w,h,{r:sCurve(.06),g:sCurve(.06),b:sCurve(.06)});
    sheen(ctx,w,h); bloom(ctx,w,h,.22); grain(ctx,w,h,5); vignette(ctx,w,h,.12);
  }
  function fxCine(ctx,w,h){
    grade(ctx,w,h,{r:sCurve(.07),g:sCurve(.07),b:sCurve(.07),sat:1.1});
    splitTone(ctx,w,h,-24,-6,36,36,10,-30);
    bloom(ctx,w,h,.1); grain(ctx,w,h,8); vignette(ctx,w,h,.32); letterbox(ctx,w,h);
  }
  function fxVanilla(ctx,w,h){
    grade(ctx,w,h,{r:cur(24,255,.88),g:cur(20,250,.92),b:cur(14,236,.98),sat:.9});
    bloom(ctx,w,h,.4); leak(ctx,w,h,[255,235,200],.25,'tl'); grain(ctx,w,h,6);
  }

  /* ==================== BLACK & WHITE (12 presets) ================== */
  function fxMono(ctx,w,h){ gray(ctx,w,h); const c=cur(6,250,.95);
    grade(ctx,w,h,{r:c,g:c,b:c}); grain(ctx,w,h,8); vignette(ctx,w,h,.15); }
  function fxNoir(ctx,w,h){ gray(ctx,w,h); const c=comp(sCurve(.11),cur(0,255,1.15));
    grade(ctx,w,h,{r:c,g:c,b:c}); grain(ctx,w,h,14); vignette(ctx,w,h,.5); }
  function fxSilver(ctx,w,h){ gray(ctx,w,h); const c=cur(52,225,1);
    grade(ctx,w,h,{r:c,g:c,b:c}); grain(ctx,w,h,6); vignette(ctx,w,h,.08); }
  function fxInfrared(ctx,w,h){
    pixels(ctx,w,h,d=>{for(let i=0;i<d.length;i+=4){
      let v=d[i]*.85+d[i+1]*.18; d[i]=d[i+1]=d[i+2]=v>255?255:v;}});
    const c=cur(8,255,.85);
    grade(ctx,w,h,{r:c,g:c,b:c}); bloom(ctx,w,h,.45); grain(ctx,w,h,7); vignette(ctx,w,h,.2); }
  function fxCyanotype(ctx,w,h){
    pixels(ctx,w,h,d=>{for(let i=0;i<d.length;i+=4){
      const t=LUM(d[i],d[i+1],d[i+2])/255;
      d[i]=255*(.03+.5*t*t); d[i+1]=255*(.22*t+.58*t*t); d[i+2]=255*(.14+.82*t);}});
    grain(ctx,w,h,8); vignette(ctx,w,h,.28); }
  function fxSelenium(ctx,w,h){ gray(ctx,w,h);
    grade(ctx,w,h,{r:cur(2,246,1.02),g:cur(2,244,1),b:cur(8,255,.95)});
    grain(ctx,w,h,9); vignette(ctx,w,h,.25); }
  function fxAntique(ctx,w,h){ gray(ctx,w,h);
    grade(ctx,w,h,{r:cur(18,255,.95),g:cur(10,240,.98),b:cur(2,205,1.05)});
    dust(ctx,w,h,{specks:30,scratches:4}); grain(ctx,w,h,12); vignette(ctx,w,h,.4); }
  function fxXray(ctx,w,h){
    pixels(ctx,w,h,d=>{for(let i=0;i<d.length;i+=4){
      const l=255-LUM(d[i],d[i+1],d[i+2]); d[i]=l*.82; d[i+1]=l*.92; d[i+2]=l;}});
    grain(ctx,w,h,5); vignette(ctx,w,h,.2); }
  function fxHalftone(ctx,w,h){
    gray(ctx,w,h); const c=sCurve(.06); grade(ctx,w,h,{r:c,g:c,b:c});
    const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
    pixels(ctx,w,h,d=>{
      let p=0;
      for(let y=0;y<h;y++){const by=(y&3)*4;
        for(let x=0;x<w;x++,p+=4){
          const l=LUM(d[p],d[p+1],d[p+2])/255;
          d[p]=d[p+1]=d[p+2]=(l>(bayer[by+(x&3)]+.5)/16)?255:0;
        }}
    }); }
  function fxSketch(ctx,w,h){
    gray(ctx,w,h);
    const inv=document.createElement('canvas');inv.width=w;inv.height=h;
    const ictx=inv.getContext('2d',{willReadFrequently:true});
    ictx.drawImage(ctx.canvas,0,0);
    const ii=ictx.getImageData(0,0,w,h);
    for(let i=0;i<ii.data.length;i+=4){ii.data[i]=255-ii.data[i];ii.data[i+1]=255-ii.data[i+1];ii.data[i+2]=255-ii.data[i+2];}
    ictx.putImageData(ii,0,0);
    const bw=Math.max(2,w>>4), bh=Math.max(2,h>>4);
    const tmp=document.createElement('canvas');tmp.width=bw;tmp.height=bh;
    tmp.getContext('2d').drawImage(inv,0,0,bw,bh);
    ictx.drawImage(tmp,0,0,w,h);
    const bd=ictx.getImageData(0,0,w,h).data;
    pixels(ctx,w,h,d=>{
      for(let i=0;i<d.length;i+=4){
        const b=bd[i]; const v=b>=255?255:Math.min(255,d[i]*255/(255-b));
        d[i]=d[i+1]=d[i+2]=v;
      }
    });
    grain(ctx,w,h,4); }
  function fxStorm(ctx,w,h){ gray(ctx,w,h); const c=sCurve(.06);
    grade(ctx,w,h,{r:c,g:c,b:c}); grain(ctx,w,h,46); grain(ctx,w,h,30); vignette(ctx,w,h,.3); }
  function fxNoirLeak(ctx,w,h){ gray(ctx,w,h); const c=sCurve(.09);
    grade(ctx,w,h,{r:c,g:c,b:c}); leak(ctx,w,h,[255,40,40],.5,'l');
    grain(ctx,w,h,16); vignette(ctx,w,h,.45); }

  /* ====================== LIMINAL CORE (7 presets) =================== */
  function fxBackrooms(ctx,w,h){
    grade(ctx,w,h,{r:cur(20,250,.9),g:cur(22,244,.94),b:cur(6,200,1.08),sat:.75});
    bloom(ctx,w,h,.5);
    ctx.save();ctx.globalAlpha=.06;ctx.fillStyle='#fff';
    for(let y=0;y<h;y+=Math.max(20,h/18|0)) ctx.fillRect(0,y,w,6);
    ctx.restore();
    grain(ctx,w,h,16); vignette(ctx,w,h,.35);
  }
  function fxPoolside(ctx,w,h){
    grade(ctx,w,h,{r:cur(16,238,1.02),g:cur(24,250,.94),b:cur(30,252,.9),sat:.8});
    bloom(ctx,w,h,.6);
    ctx.save();ctx.globalCompositeOperation='screen';
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'rgba(160,240,255,.18)');g.addColorStop(1,'rgba(40,120,160,.12)');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore();
    grain(ctx,w,h,8); vignette(ctx,w,h,.18);
  }
  function fxFog(ctx,w,h){
    grade(ctx,w,h,{r:cur(40,250,.96),g:cur(42,250,.97),b:cur(44,250,.98),sat:.5});
    bloom(ctx,w,h,.7); grain(ctx,w,h,7); vignette(ctx,w,h,.12);
  }
  function fx3am(ctx,w,h){
    grade(ctx,w,h,{r:cur(0,200,1.15),g:cur(4,224,1.02),b:cur(2,210,1.08),sat:.65});
    ctx.save();ctx.globalCompositeOperation='overlay';ctx.fillStyle='rgba(40,80,50,.25)';ctx.fillRect(0,0,w,h);ctx.restore();
    grain(ctx,w,h,26); vignette(ctx,w,h,.55);
  }
  function fxAfterglow(ctx,w,h){
    grade(ctx,w,h,{r:cur(26,244,.95),g:cur(18,230,1),b:cur(30,252,.9),sat:.85});
    ctx.save();ctx.globalCompositeOperation='soft-light';
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'rgba(180,150,255,.8)');g.addColorStop(1,'rgba(60,40,120,.6)');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore();
    bloom(ctx,w,h,.5); grain(ctx,w,h,9); vignette(ctx,w,h,.25);
  }
  function fxMallsoft(ctx,w,h){
    grade(ctx,w,h,{r:cur(30,252,.94),g:cur(24,246,.98),b:cur(28,248,.96),sat:.6});
    ctx.save();ctx.globalCompositeOperation='soft-light';
    const g=ctx.createLinearGradient(0,0,w,0);
    g.addColorStop(0,'rgba(255,190,220,.9)');g.addColorStop(1,'rgba(190,220,255,.7)');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore();
    bloom(ctx,w,h,.55); whiteVignette(ctx,w,h,.14); grain(ctx,w,h,8); vignette(ctx,w,h,.1);
  }
  function fxAirport(ctx,w,h){
    grade(ctx,w,h,{r:cur(22,240,1.02),g:cur(26,246,.99),b:cur(34,252,.92),sat:.45});
    ctx.save();ctx.globalCompositeOperation='overlay';ctx.fillStyle='rgba(150,190,230,.14)';ctx.fillRect(0,0,w,h);ctx.restore();
    bloom(ctx,w,h,.4); grain(ctx,w,h,7); vignette(ctx,w,h,.12); whiteVignette(ctx,w,h,.08);
  }

  /* ======================= WEIRD CORE (8 presets) ==================== */
  function fxCurse(ctx,w,h){
    grade(ctx,w,h,{r:cur(0,255,.8),g:cur(0,255,.85),b:cur(0,255,.9),sat:1.9});
    pixelate(ctx,w,h,10);
    grain(ctx,w,h,20); vignette(ctx,w,h,.2);
  }
  function fxVoid(ctx,w,h){
    grade(ctx,w,h,{sat:1.3});
    const img=ctx.getImageData(0,0,w,h), d=img.data, src=new Uint8ClampedArray(d);
    let y=0,flip=false;
    while(y<h){
      const bh=8+(Math.random()*h*.08|0), ye=Math.min(h,y+bh);
      if(flip){
        for(let yy=y;yy<ye;yy++){const row=yy*w;
          for(let x=0;x<w;x++){const i=(row+x)*4; d[i]=255-src[i]; d[i+1]=255-src[i+1]; d[i+2]=255-src[i+2];}}
      }else{
        const dx=(Math.random()-.5)*w*.1|0;
        if(dx) for(let yy=y;yy<ye;yy++){const row=yy*w;
          for(let x=0;x<w;x++){const sx=(x-dx+w)%w, i=(row+x)*4, j=(row+sx)*4; d[i]=src[j];d[i+1]=src[j+1];d[i+2]=src[j+2];}}
      }
      flip=!flip; y+=bh;
    }
    ctx.putImageData(img,0,0);
    chromatic(ctx,w,h,5); grain(ctx,w,h,18);
  }
  function fxMelt(ctx,w,h){
    grade(ctx,w,h,{sat:1.25});
    const img=ctx.getImageData(0,0,w,h), d=img.data, src=new Uint8ClampedArray(d);
    for(let y=0;y<h;y++){
      const row=y*w;
      const oR=Math.round(Math.sin(y*.03)*8+Math.sin(y*.11)*3);
      const oB=Math.round(Math.sin(y*.05+2)*10+Math.cos(y*.02)*4);
      for(let x=0;x<w;x++){
        const i=(row+x)*4;
        d[i]  =src[(row+((x+oR+w)%w))*4];
        d[i+2]=src[(row+((x+oB+w)%w))*4+2];
      }
    }
    ctx.putImageData(img,0,0);
    grain(ctx,w,h,10); vignette(ctx,w,h,.2);
  }
  function fxEyesore(ctx,w,h){
    posterize(ctx,w,h,6);
    grade(ctx,w,h,{r:cur(0,255,.7),g:cur(0,255,.9),b:cur(0,255,1.2),sat:1.7});
    scanlines(ctx,w,h,.18,2); grain(ctx,w,h,12);
  }
  function fxStatic(ctx,w,h){
    grade(ctx,w,h,{sat:.4,r:sCurve(.08),g:sCurve(.08),b:sCurve(.08)});
    pixels(ctx,w,h,d=>{
      for(let i=0;i<d.length;i+=4){
        if(Math.random()<.28){const n=Math.random()*255; d[i]=n;d[i+1]=n;d[i+2]=n;}
        else{const n=(Math.random()-.5)*30; d[i]+=n;d[i+1]+=n;d[i+2]+=n;}
      }
    });
    scanlines(ctx,w,h,.2,3); vignette(ctx,w,h,.3);
  }
  function fxUnreal(ctx,w,h){
    hueRotate(ctx,w,h,150);
    grade(ctx,w,h,{sat:1.2,r:sCurve(.05),g:sCurve(.05),b:sCurve(.05)});
    bloom(ctx,w,h,.3); grain(ctx,w,h,10); vignette(ctx,w,h,.25);
  }
  function fxFamiliar(ctx,w,h){
    grade(ctx,w,h,{r:cur(0,210,1.2),g:cur(0,205,1.22),b:cur(0,215,1.18),sat:.8});
    flash(ctx,w,h,.4);
    grain(ctx,w,h,22); vignette(ctx,w,h,.5);
  }
  function fxHush(ctx,w,h){
    blurSoft(ctx,w,h,10);
    grade(ctx,w,h,{r:cur(46,246,.96),g:cur(46,246,.97),b:cur(48,248,.98),sat:.4});
    whiteVignette(ctx,w,h,.25); grain(ctx,w,h,6);
  }

  /* ======================= DREAMCORE (4 presets) ===================== */
  function fxDaydream(ctx,w,h){
    grade(ctx,w,h,{r:cur(46,255,.82),g:cur(40,252,.86),b:cur(52,255,.8),sat:1.15});
    ctx.save();ctx.globalCompositeOperation='overlay';ctx.fillStyle='rgba(255,190,220,.14)';ctx.fillRect(0,0,w,h);ctx.restore();
    bloom(ctx,w,h,.7); whiteVignette(ctx,w,h,.22); sparkles(ctx,w,h,5); grain(ctx,w,h,5);
  }
  function fxNeverending(ctx,w,h){
    grade(ctx,w,h,{r:cur(40,252,.9),g:cur(48,255,.86),b:cur(60,255,.78),sat:1.05});
    ctx.save();ctx.globalCompositeOperation='screen';
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'rgba(150,220,255,.25)');g.addColorStop(1,'rgba(255,200,235,.2)');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore();
    bloom(ctx,w,h,.6); whiteVignette(ctx,w,h,.18); grain(ctx,w,h,4);
  }
  function fxLullaby(ctx,w,h){
    blurSoft(ctx,w,h,7);
    grade(ctx,w,h,{r:cur(50,252,.88),g:cur(44,246,.92),b:cur(56,255,.86),sat:.95});
    ctx.save();ctx.globalCompositeOperation='overlay';ctx.fillStyle='rgba(200,180,255,.12)';ctx.fillRect(0,0,w,h);ctx.restore();
    bloom(ctx,w,h,.5); whiteVignette(ctx,w,h,.3); grain(ctx,w,h,4);
  }
  function fxSunnyVoid(ctx,w,h){
    grade(ctx,w,h,{r:cur(70,255,.85),g:cur(66,255,.87),b:cur(56,250,.92),sat:.8});
    bloom(ctx,w,h,.8); leak(ctx,w,h,[255,250,210],.4,'tl');
    whiteVignette(ctx,w,h,.35); grain(ctx,w,h,3);
  }

  /* ======================= VAPORWAVE (4 presets) ===================== */
  function fxMac84(ctx,w,h){
    grade(ctx,w,h,{r:sCurve(.06),g:sCurve(.06),b:sCurve(.06),sat:1.3});
    splitTone(ctx,w,h,34,-4,30,4,26,26);
    scanlines(ctx,w,h,.12); bloom(ctx,w,h,.35); grain(ctx,w,h,8); vignette(ctx,w,h,.28);
  }
  function fxPlaza(ctx,w,h){
    grade(ctx,w,h,{sat:.55});
    ctx.save();ctx.globalCompositeOperation='overlay';
    const g=ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0,'rgba(60,220,210,.55)');g.addColorStop(1,'rgba(170,90,255,.55)');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore();
    bloom(ctx,w,h,.45); whiteVignette(ctx,w,h,.1); grain(ctx,w,h,7); vignette(ctx,w,h,.2);
  }
  function fxSunsetPlaza(ctx,w,h){
    grade(ctx,w,h,{r:sCurve(.05),g:sCurve(.05),b:sCurve(.05),sat:1.2});
    retroSun(ctx,w,h);
    splitTone(ctx,w,h,20,-6,10,24,6,-14);
    scanlines(ctx,w,h,.1); grain(ctx,w,h,9); vignette(ctx,w,h,.25);
  }
  function fxNeoTokyo(ctx,w,h){
    grade(ctx,w,h,{r:cur(6,255,.95),g:cur(0,240,1.05),b:cur(16,255,.9),sat:1.35});
    splitTone(ctx,w,h,38,-8,34,-6,30,26);
    chromatic(ctx,w,h,2); bloom(ctx,w,h,.4); scanlines(ctx,w,h,.14);
    grain(ctx,w,h,10); vignette(ctx,w,h,.3);
  }

  /* ======================= GLITCH ART (4 presets) ==================== */
  function fxDatamosh(ctx,w,h){
    grade(ctx,w,h,{sat:1.2});
    const img=ctx.getImageData(0,0,w,h), d=img.data, src=new Uint8ClampedArray(d);
    const bands=5+(Math.random()*4|0);
    for(let i=0;i<bands;i++){
      const y0=Math.random()*h|0, bh=6+(Math.random()*h*.06|0);
      const period=30+(Math.random()*120|0), dx=Math.random()*w*.2|0;
      for(let yy=y0;yy<Math.min(h,y0+bh);yy++){const row=yy*w;
        for(let x=0;x<w;x++){
          const sx=((x-dx)%period+period)%period, di=(row+x)*4, si=(row+sx)*4;
          d[di]=src[si]; d[di+1]=src[si+1]; d[di+2]=src[si+2];
        }}
    }
    ctx.putImageData(img,0,0);
    chromatic(ctx,w,h,3); scanlines(ctx,w,h,.08,4); grain(ctx,w,h,10);
  }
  function fxPxcrush(ctx,w,h){
    posterize(ctx,w,h,5);
    pixelate(ctx,w,h,Math.max(3,Math.round(w/240)));
    grade(ctx,w,h,{sat:1.4});
    chromatic(ctx,w,h,3); scanlines(ctx,w,h,.1,2); grain(ctx,w,h,8);
  }
  function fxTear(ctx,w,h){
    const img=ctx.getImageData(0,0,w,h), d=img.data, src=new Uint8ClampedArray(d);
    const tears=6+(Math.random()*6|0);
    for(let t=0;t<tears;t++){
      const y0=Math.random()*h|0, bh=1+(Math.random()*3|0), ch=Math.random()<.5?0:2;
      const dx=(10+Math.random()*50|0)*(Math.random()<.5?1:-1);
      for(let yy=y0;yy<Math.min(h,y0+bh);yy++){const row=yy*w;
        for(let x=0;x<w;x++){
          const sx=(x-dx+w)%w;
          d[(row+x)*4+ch]=src[(row+sx)*4+ch];
        }}
    }
    ctx.putImageData(img,0,0);
    grain(ctx,w,h,12); vignette(ctx,w,h,.15);
  }
  function fxCorrupt(ctx,w,h){
    const tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;
    tmp.getContext('2d').drawImage(ctx.canvas,0,0);
    for(let i=0;i<9;i++){
      const sw=w*(.05+Math.random()*.2), sh=h*(.03+Math.random()*.1);
      const sx=Math.random()*(w-sw), sy=Math.random()*(h-sh);
      ctx.drawImage(tmp,sx,sy,sw,sh, sx+(Math.random()-.5)*w*.15, sy+(Math.random()-.5)*h*.08, sw,sh);
    }
    pixels(ctx,w,h,d=>{
      for(let i=0;i<4;i++){
        const y=Math.random()*h|0, c=[Math.random()*255|0,Math.random()*255|0,Math.random()*255|0], row=y*w;
        for(let x=0;x<w;x++){const j=(row+x)*4; d[j]=c[0]; d[j+1]=c[1]; d[j+2]=c[2];}
      }
    });
    grain(ctx,w,h,14);
  }

  /* ===================== NOSTALGIACORE (4 presets) =================== */
  function fxSaturday(ctx,w,h){
    grade(ctx,w,h,{r:cur(14,255,.88),g:cur(12,252,.92),b:cur(8,248,.96),sat:1.35});
    bloom(ctx,w,h,.25); scanlines(ctx,w,h,.07,3);
    grain(ctx,w,h,6); whiteVignette(ctx,w,h,.08); vignette(ctx,w,h,.15);
  }
  function fxYearbook(ctx,w,h){
    grade(ctx,w,h,{r:cur(16,255,.86),g:cur(12,250,.92),b:cur(10,240,.98),sat:1.05});
    flash(ctx,w,h,.24); grain(ctx,w,h,12); vignette(ctx,w,h,.3);
    dateStamp(ctx,w,h,{text:'MAY 2003',style:'pale'});
  }
  function fxGameboy(ctx,w,h){
    pixelate(ctx,w,h,Math.max(2,Math.round(w/360)));
    pixels(ctx,w,h,d=>{
      for(let i=0;i<d.length;i+=4){
        const l=LUM(d[i],d[i+1],d[i+2]);
        if(l<64){d[i]=15;d[i+1]=56;d[i+2]=15;}
        else if(l<128){d[i]=48;d[i+1]=98;d[i+2]=48;}
        else if(l<192){d[i]=139;d[i+1]=172;d[i+2]=15;}
        else{d[i]=155;d[i+1]=188;d[i+2]=16;}
      }
    });
    scanlines(ctx,w,h,.06,2);
  }
  function fxToybox(ctx,w,h){
    grade(ctx,w,h,{r:cur(8,255,.82),g:cur(6,252,.9),b:cur(12,255,.85),sat:1.5});
    bloom(ctx,w,h,.15); grain(ctx,w,h,10); vignette(ctx,w,h,.45);
  }

  /* ============================ REGISTRY ============================ */
  const FX = [
    {id:'none',      name:'ORIGINAL',   group:'RETRO'},
    {id:'cam98',     name:'CAM 98 ◉',   group:'RETRO', fn:fxCam98},
    {id:'disposable',name:'DISPOSABLE ◉',group:'RETRO', fn:fxDisposable},
    {id:'digicam',   name:'DIGICAM 04 ◉',group:'RETRO', fn:fxDigicam},
    {id:'super8',    name:'SUPER 8 ◉',  group:'RETRO', fn:fxSuper8},
    {id:'polaroid',  name:'POLAROID',   group:'RETRO', fn:fxPolaroid},
    {id:'vhs',       name:'VHS 92',     group:'RETRO', fn:fxVHS},
    {id:'sepia23',   name:'1923 ◉',     group:'RETRO', fn:fxSepia23},
    {id:'gold',      name:'GOLDEN HR',  group:'RETRO', fn:fxGold},
    {id:'millennium',name:'Y2K 2000 ◉', group:'RETRO', fn:fxMillennium},
    {id:'homevideo', name:'HOME VIDEO ◉',group:'RETRO', fn:fxHomeVideo},
    {id:'beach95',   name:'BEACH 95 ◉', group:'RETRO', fn:fxBeach95},

    {id:'miami',     name:'MIAMI 86',   group:'AESTHETIC', fn:fxMiami},
    {id:'dreamy',    name:'DREAMY',     group:'AESTHETIC', fn:fxDreamy},
    {id:'sage',      name:'SAGE',       group:'AESTHETIC', fn:fxSage},
    {id:'aurora',    name:'AURORA',     group:'AESTHETIC', fn:fxAurora},
    {id:'disco',     name:'DISCO 79',   group:'AESTHETIC', fn:fxDisco},
    {id:'chrome',    name:'CHROME',     group:'AESTHETIC', fn:fxChrome},
    {id:'cine',      name:'CINEMA',     group:'AESTHETIC', fn:fxCine},
    {id:'vanilla',   name:'VANILLA',    group:'AESTHETIC', fn:fxVanilla},

    {id:'mono',      name:'MONO',       group:'BLACK & WHITE', fn:fxMono},
    {id:'noir',      name:'NOIR',       group:'BLACK & WHITE', fn:fxNoir},
    {id:'silver',    name:'SILVER',     group:'BLACK & WHITE', fn:fxSilver},
    {id:'infrared',  name:'INFRARED',   group:'BLACK & WHITE', fn:fxInfrared},
    {id:'cyan',      name:'CYANOTYPE',  group:'BLACK & WHITE', fn:fxCyanotype},
    {id:'selenium',  name:'SELENIUM',   group:'BLACK & WHITE', fn:fxSelenium},
    {id:'antique',   name:'ANTIQUE',    group:'BLACK & WHITE', fn:fxAntique},
    {id:'xray',      name:'X-RAY',      group:'BLACK & WHITE', fn:fxXray},
    {id:'halftone',  name:'HALFTONE',   group:'BLACK & WHITE', fn:fxHalftone},
    {id:'sketch',    name:'SKETCH',     group:'BLACK & WHITE', fn:fxSketch},
    {id:'storm',     name:'GRAINSTORM', group:'BLACK & WHITE', fn:fxStorm},
    {id:'noirleak',  name:'RED LEAK',   group:'BLACK & WHITE', fn:fxNoirLeak},

    {id:'daydream',  name:'DAYDREAM',   group:'DREAMCORE', fn:fxDaydream},
    {id:'neverend',  name:'NEVERENDING',group:'DREAMCORE', fn:fxNeverending},
    {id:'lullaby',   name:'LULLABY',    group:'DREAMCORE', fn:fxLullaby},
    {id:'sunnyvoid', name:'SUNNY VOID', group:'DREAMCORE', fn:fxSunnyVoid},

    {id:'mac84',     name:'MACINTOSH 84',group:'VAPORWAVE', fn:fxMac84},
    {id:'plaza',     name:'PLAZA',      group:'VAPORWAVE', fn:fxPlaza},
    {id:'sunplaza',  name:'SUNSET PLAZA',group:'VAPORWAVE', fn:fxSunsetPlaza},
    {id:'neotokyo',  name:'NEO TOKYO',  group:'VAPORWAVE', fn:fxNeoTokyo},

    {id:'datamosh',  name:'DATAMOSH',   group:'GLITCH ART', fn:fxDatamosh},
    {id:'pxcrush',   name:'PX CRUSH',   group:'GLITCH ART', fn:fxPxcrush},
    {id:'tear',      name:'COLOR TEAR', group:'GLITCH ART', fn:fxTear},
    {id:'corrupt',   name:'CORRUPTED',  group:'GLITCH ART', fn:fxCorrupt},

    {id:'saturday',  name:'SATURDAY AM',group:'NOSTALGIACORE', fn:fxSaturday},
    {id:'yearbook',  name:'YEARBOOK 03 ◉',group:'NOSTALGIACORE', fn:fxYearbook},
    {id:'gameboy',   name:'GAME BOY',   group:'NOSTALGIACORE', fn:fxGameboy},
    {id:'toybox',    name:'TOYBOX',     group:'NOSTALGIACORE', fn:fxToybox},

    {id:'backrooms', name:'BACKROOMS',  group:'LIMINAL CORE', fn:fxBackrooms},
    {id:'poolside',  name:'POOLSIDE',   group:'LIMINAL CORE', fn:fxPoolside},
    {id:'fog',       name:'FOG',        group:'LIMINAL CORE', fn:fxFog},
    {id:'3am',       name:'3 AM',       group:'LIMINAL CORE', fn:fx3am},
    {id:'afterglow', name:'AFTERGLOW',  group:'LIMINAL CORE', fn:fxAfterglow},
    {id:'mallsoft',  name:'MALLSOFT',   group:'LIMINAL CORE', fn:fxMallsoft},
    {id:'airport',   name:'AIRPORT 4AM',group:'LIMINAL CORE', fn:fxAirport},

    {id:'curse',     name:'CURSED',     group:'WEIRD CORE', fn:fxCurse},
    {id:'void',      name:'VOID',       group:'WEIRD CORE', fn:fxVoid},
    {id:'melt',      name:'MELT',       group:'WEIRD CORE', fn:fxMelt},
    {id:'eyesore',   name:'EYESORE',    group:'WEIRD CORE', fn:fxEyesore},
    {id:'staticfx',  name:'STATIC',     group:'WEIRD CORE', fn:fxStatic},
    {id:'unreal',    name:'UNREAL',     group:'WEIRD CORE', fn:fxUnreal},
    {id:'familiar',  name:'FAMILIAR',   group:'WEIRD CORE', fn:fxFamiliar},
    {id:'hush',      name:'HUSH',       group:'WEIRD CORE', fn:fxHush},
  ];

  const GROUP_COLORS = {
    'RETRO': '#f2c14e',
    'AESTHETIC': '#ff5f9e',
    'BLACK & WHITE': '#cfd3dc',
    'DREAMCORE': '#ffd6e8',
    'VAPORWAVE': '#4de3ff',
    'GLITCH ART': '#6aff8d',
    'NOSTALGIACORE': '#ffb35c',
    'LIMINAL CORE': '#8fe3c0',
    'WEIRD CORE': '#b48cff'
  };

  /* ============================ MODULE STATE ============================ */
  let activeId = 'cam98';
  let activeIntensity = 1.0;
  let isAside = false;
  let isPanelOpen = false;
  let thumbButtons = {};

  /* Main Canvas Display inside Halation Stage */
  let canvas = null;
  let ctx = null;
  let offscreenCanvas = document.createElement('canvas');
  let offscreenCtx = offscreenCanvas.getContext('2d', {willReadFrequently: true});

  function getCanvas(){
    if(!canvas){
      canvas = document.getElementById('retrolabCanvas');
      if(!canvas){
        canvas = document.createElement('canvas');
        canvas.id = 'retrolabCanvas';
        canvas.style.position = 'absolute';
        canvas.style.inset = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';
        canvas.style.display = 'none';
        canvas.style.zIndex = '3';
        const frame = document.querySelector('.stage-frame');
        if(frame) frame.appendChild(canvas);
      }
      ctx = canvas.getContext('2d');
    }
    return canvas;
  }

  function getSourceImage(cb){
    const s = document.querySelector('#stageMedia .subject');
    if(!s) return;
    if(s.tagName === 'IMG'){
      if(s.complete && s.naturalWidth > 0) cb(s);
      else s.onload = () => cb(s);
      return;
    }
    const sym = document.getElementById('scene');
    if(!sym) return;
    try{
      const str = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="960" height="720">' + sym.innerHTML + '</svg>';
      const im = new Image();
      im.onload = () => cb(im);
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
    }catch(e){
      console.warn(e);
    }
  }

  /* Intensity Blending Rule:
     Render effect at full strength on offscreen canvas, then draw it over original with globalAlpha = intensity */
  function applyEffectToCanvas(src, effectId, intensityVal, targetCtx, targetW, targetH){
    const w = targetW || src.naturalWidth || src.width || 960;
    const h = targetH || src.naturalHeight || src.height || 720;
    
    // Draw original
    targetCtx.drawImage(src, 0, 0, w, h);
    
    const fx = FX.find(f => f.id === effectId);
    if(!fx || !fx.fn || effectId === 'none' || intensityVal <= 0) return;

    // Render at full strength on offscreen
    offscreenCanvas.width = w;
    offscreenCanvas.height = h;
    offscreenCtx.drawImage(src, 0, 0, w, h);
    fx.fn(offscreenCtx, w, h);

    // Blend over original with globalAlpha = intensity
    targetCtx.save();
    targetCtx.globalAlpha = Math.max(0, Math.min(1, intensityVal));
    targetCtx.drawImage(offscreenCanvas, 0, 0, w, h);
    targetCtx.restore();
  }

  function render(){
    const cv = getCanvas();
    if(!cv) return;
    getSourceImage(src => {
      const w = src.naturalWidth || src.width || 960;
      const h = src.naturalHeight || src.height || 720;
      if(cv.width !== w || cv.height !== h){
        cv.width = w;
        cv.height = h;
      }
      applyEffectToCanvas(src, activeId, activeIntensity, ctx, w, h);
    });
  }

  /* ============================ THUMBNAIL STRIP ============================ */
  function buildThumbs(container){
    const strip = container || document.getElementById('retrolabStrip');
    if(!strip) return;
    strip.innerHTML = '';
    thumbButtons = {};

    getSourceImage(src => {
      const tw = 120, th = Math.max(50, Math.round(tw * (src.naturalHeight || 720) / (src.naturalWidth || 960)));
      const small = document.createElement('canvas');
      small.width = tw;
      small.height = th;
      small.getContext('2d').drawImage(src, 0, 0, tw, th);

      let rowEl = null, lastGroup = null;
      FX.forEach((fx, idx) => {
        if(fx.group !== lastGroup){
          lastGroup = fx.group;
          const groupEl = document.createElement('div');
          groupEl.className = 'retrolab-group';
          const lbl = document.createElement('div');
          lbl.className = 'retrolab-glabel';
          lbl.textContent = fx.group;
          lbl.style.color = GROUP_COLORS[fx.group] || '#888';
          rowEl = document.createElement('div');
          rowEl.className = 'retrolab-row';
          groupEl.appendChild(lbl);
          groupEl.appendChild(rowEl);
          strip.appendChild(groupEl);
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'retrolab-thumb' + (fx.id === activeId ? ' active' : '');
        btn.dataset.fx = fx.id;

        const c = document.createElement('canvas');
        c.width = tw;
        c.height = th;

        const s = document.createElement('span');
        s.textContent = fx.name;

        btn.appendChild(c);
        btn.appendChild(s);
        rowEl.appendChild(btn);
        thumbButtons[fx.id] = btn;

        btn.onclick = () => {
          selectEffect(fx.id);
        };

        // Stagger thumbnail rendering so UI never freezes
        setTimeout(() => {
          const cc = c.getContext('2d', {willReadFrequently: true});
          cc.drawImage(small, 0, 0);
          if(fx.fn) fx.fn(cc, tw, th);
        }, idx * 15);
      });
      updateActiveThumb();
    });
  }

  function selectEffect(id){
    activeId = id;
    updateActiveThumb();
    
    // Update caption if exists
    const fx = FX.find(f => f.id === id);
    const capName = document.getElementById('capName');
    if(capName && fx) capName.textContent = 'retrolab · ' + fx.name.toLowerCase();
    const capPro = document.getElementById('capPro');
    if(capPro) capPro.innerHTML = 'free ✓';

    render();
    if(window.toast && fx) window.toast('✦ Preset applied: ' + fx.name);
  }

  function updateActiveThumb(){
    for(const id in thumbButtons){
      const btn = thumbButtons[id];
      const on = id === activeId;
      btn.classList.toggle('active', on);
      const fx = FX.find(f => f.id === id);
      btn.style.borderColor = on ? (GROUP_COLORS[fx.group] || '#f2c14e') : 'transparent';
    }
  }

  function isActive(){
    const c = document.querySelector('.chip[data-f="retrolab"]');
    return !!(c && c.classList.contains('active'));
  }

  function sync(){
    const on = isActive();
    const cv = getCanvas();
    if(cv) cv.style.display = on && !isAside ? 'block' : 'none';
    const sm = document.getElementById('stageMedia');
    if(sm) sm.style.display = on && !isAside ? 'none' : '';
    if(on && !isAside) render();
  }

  function open(){
    isPanelOpen = true;
    const panel = document.getElementById('retrolabPanel');
    if(panel) panel.style.display = '';
    sync();
    buildThumbs();
  }

  function close(){
    isPanelOpen = false;
    const panel = document.getElementById('retrolabPanel');
    if(panel) panel.style.display = 'none';
    const cv = getCanvas();
    if(cv) cv.style.display = 'none';
    const sm = document.getElementById('stageMedia');
    if(sm) sm.style.display = '';
  }

  function setAside(v){
    isAside = v;
    const cv = getCanvas();
    if(cv) cv.style.display = !v && isActive() ? 'block' : 'none';
    const sm = document.getElementById('stageMedia');
    if(sm) sm.style.display = v || !isActive() ? '' : 'none';
    if(!v && isActive()) render();
  }

  function setIntensity(val){
    activeIntensity = Math.max(0, Math.min(1, val));
    if(isActive() && !isAside) render();
  }

  function doExport(){
    return new Promise((resolve) => {
      getSourceImage(src => {
        if(!src) return resolve(false);
        const w = src.naturalWidth || src.width || 960;
        const h = src.naturalHeight || src.height || 720;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = w;
        exportCanvas.height = h;
        const exportCtx = exportCanvas.getContext('2d');
        
        applyEffectToCanvas(src, activeId, activeIntensity, exportCtx, w, h);
        
        exportCanvas.toBlob(blob => {
          if(!blob) return resolve(false);
          const a = document.createElement('a');
          a.download = 'halation-retrolab-' + activeId + '.png';
          a.href = URL.createObjectURL(blob);
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          if(window.toast) toast('Exported ✦ halation-retrolab-' + activeId + '.png');
          resolve(true);
        }, 'image/png');
      });
    });
  }

  /* Listen for new photograph upload */
  if(document.getElementById('stageMedia')){
    new MutationObserver(() => {
      if(isActive() && !isAside){
        buildThumbs();
        render();
      }
    }).observe(document.getElementById('stageMedia'), {childList: true});
  }

  // Export public API
  window.RetroLab = {
    FX,
    GROUP_COLORS,
    apply: applyEffectToCanvas,
    render,
    open,
    close,
    sync,
    setAside,
    setIntensity,
    selectEffect,
    buildThumbs,
    export: doExport,
    isActive,
    getActiveId: () => activeId
  };
})();
