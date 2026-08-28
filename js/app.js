/* ================================================================
   HALATION — shared interactions + per-page logic
   ================================================================ */
document.body.classList.add('js');
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- toast ---------- */
let tTimer;
function toast(msg){
  const t = $('#toast'); if(!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(tTimer);
  tTimer = setTimeout(()=>t.classList.remove('show'), 2800);
}

/* ---------- hero title letter split ---------- */
(function(){
  let dIdx = 0;
  $$('[data-split]').forEach(line=>{
    const walk = node=>{
      [...node.childNodes].forEach(child=>{
        if(child.nodeType === 3){
          const frag = document.createDocumentFragment();
          child.textContent.split('').forEach(c=>{
            const s = document.createElement('span');
            s.className = 'ch';
            s.style.setProperty('--d', dIdx++);
            s.textContent = c === ' ' ? ' ' : c;
            frag.appendChild(s);
          });
          node.replaceChild(frag, child);
        } else if(child.nodeType === 1){ walk(child); }
      });
    };
    walk(line);
  });
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    $$('.hero-title .ch').forEach(c=>c.classList.add('in'));
  }));
})();

/* ---------- scroll reveal ---------- */
(function(){
  const io = new IntersectionObserver(es=>{
    es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  },{threshold:.12});
  $$('.reveal').forEach(el=>io.observe(el));
})();

/* ---------- scroll progress ---------- */
addEventListener('scroll', ()=>{
  const h = document.documentElement, bar = $('#progress');
  if(bar) bar.style.width = (h.scrollTop/(h.scrollHeight-h.clientHeight)*100)+'%';
},{passive:true});

/* ---------- safelight cursor glow ---------- */
(function(){
  const glow = $('#glow'); if(!glow) return;
  if(reduced || !matchMedia('(hover:hover)').matches){ glow.style.display='none'; return; }
  let gx=innerWidth/2, gy=innerHeight/3, tx=gx, ty=gy;
  addEventListener('pointermove', e=>{tx=e.clientX; ty=e.clientY});
  (function loop(){
    gx += (tx-gx)*.08; gy += (ty-gy)*.08;
    glow.style.transform = `translate(${gx}px,${gy}px)`;
    requestAnimationFrame(loop);
  })();
})();

/* ---------- card tilt ---------- */
if(!reduced){
  $$('.tilt').forEach(card=>{
    card.addEventListener('mousemove', e=>{
      const r = card.getBoundingClientRect();
      const x = (e.clientX-r.left)/r.width - .5;
      const y = (e.clientY-r.top)/r.height - .5;
      card.style.transform = `translateY(-6px) rotateX(${-y*5}deg) rotateY(${x*5}deg)`;
    });
    card.addEventListener('mouseleave', ()=> card.style.transform='');
  });
}

/* ---------- mobile nav ---------- */
(function(){
  const burger = $('.burger'), links = $('.nav-links');
  if(!burger || !links) return;
  burger.addEventListener('click', ()=> links.classList.toggle('open'));
  links.querySelectorAll('a').forEach(a=>a.addEventListener('click', ()=> links.classList.remove('open')));
})();

/* ================================================================
   PAGE: gallery — tab filtering
   ================================================================ */
(function(){
  const tabs = $$('.tab'); if(!tabs.length) return;
  tabs.forEach(t=>t.addEventListener('click', ()=>{
    tabs.forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    const v = t.dataset.tab;
    $$('.g-card').forEach(c=> c.classList.toggle('hide', !(v==='all' || c.dataset.cat.split(' ').includes(v))));
  }));
})();

/* ================================================================
   PAGE: home — mini taste demo
   ================================================================ */
(function(){
  const mini = $('#miniStage'); if(!mini) return;
  const MINI = {
    none :'none',
    noir :'grayscale(1) contrast(1.35) brightness(.9)',
    sepia:'sepia(.9) contrast(1.08) brightness(.93)',
    blur :'blur(6px)',
    fade :'contrast(.8) brightness(1.15) saturate(.6)',
  };
  $$('.mchip').forEach(ch=>ch.addEventListener('click', ()=>{
    $$('.mchip').forEach(c=>c.classList.remove('active'));
    ch.classList.add('active');
    mini.style.filter = MINI[ch.dataset.m];
  }));
})();

/* ================================================================
   PAGE: playground — the full darkroom
   ================================================================ */
(function(){
  const stage = $('#stageMedia'); if(!stage) return;

  const F = {
    none : {name:'original', t:1, css:()=>'none'},
    blur : {name:'soft blur', t:.5, css:t=>`blur(${(t*12).toFixed(1)}px)`},
    noir : {name:'silver noir', t:.6, css:t=>`grayscale(1) contrast(${(1+t*.7).toFixed(2)}) brightness(${(1-t*.2).toFixed(2)})`},
    sepia: {name:'sepia ’72', t:.8, css:t=>`sepia(${t.toFixed(2)}) contrast(${(1+t*.15).toFixed(2)}) brightness(${(1-t*.08).toFixed(2)})`},
    fade : {name:'morning fade', t:.6, css:t=>`contrast(${(1-t*.35).toFixed(2)}) brightness(${(1+t*.3).toFixed(2)}) saturate(${(1-t*.7).toFixed(2)})`},
    grain: {name:'grain veil', t:.5, ovl:'grain', css:t=>`contrast(${(1-t*.15).toFixed(2)}) sepia(${(t*.3).toFixed(2)}) brightness(1.03)`},
    vig  : {name:'deep vignette', t:.6, ovl:'vig', css:t=>`brightness(${(1.06-t*.1).toFixed(2)}) contrast(${(1+t*.12).toFixed(2)}) saturate(${(1-t*.2).toFixed(2)})`},
    halo : {pro:1,name:'halation bloom', t:.6, css:t=>`saturate(${(1+t).toFixed(2)}) contrast(${(1+t*.25).toFixed(2)}) brightness(${(1+t*.15).toFixed(2)}) hue-rotate(${(-t*15).toFixed(0)}deg)`},
    duo  : {pro:1,duo:1,name:'duotone dream', t:.8, css:t=>`grayscale(1) contrast(${(1+t*.3).toFixed(2)})`},
    burn : {pro:1,name:'film burn ’86', t:.6, css:t=>`saturate(${(1+t*1.4).toFixed(2)}) contrast(${(1+t*.5).toFixed(2)}) sepia(${(t*.4).toFixed(2)}) brightness(${(1+t*.05).toFixed(2)})`},
    cyano: {pro:1,name:'cyanotype', t:.8, css:t=>`grayscale(1) sepia(1) hue-rotate(185deg) saturate(${(1+t*2.6).toFixed(2)}) contrast(${(1+t*.2).toFixed(2)}) brightness(${(1-t*.15).toFixed(2)})`},
    ascii: {name:'ascii press', t:.7, css:()=>'none'},
  };
  let current='none', curT=F.none.t, uploaded=false;
  const subj = ()=> stage.querySelector('.subject');
  const slider = $('#intensity'), intVal = $('#intVal');

  function apply(){
    const f = F[current], s = subj();
    if(s) s.style.filter = f.css(curT);
    $('#duoOverlay').style.opacity = f.duo ? curT : 0;
    const ovl = $('#fxOverlay');
    ovl.dataset.mode = f.ovl || '';
    $('#proMark').classList.toggle('on', !!f.pro && current!=='ascii');
    $('#capName').textContent = f.name;
    $('#capPro').innerHTML = f.pro ? '✦ pro preview' : 'free ✓';
    if(intVal) intVal.textContent = Math.round(curT*100)+'%';
    if(window.HalationASCII) HalationASCII.sync();
  }
  $$('.chip[data-f]').forEach(chip=>chip.addEventListener('click', ()=>{
    $$('.chip[data-f]').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    current = chip.dataset.f;
    curT = F[current].t;
    if(slider) slider.value = curT*100;
    if(current==='ascii' && window.HalationASCII) window.HalationASCII.open();
    apply();
  }));
  if(slider) slider.addEventListener('input', ()=>{ curT = slider.value/100; apply(); });

  /* upload */
  const input = $('#fileInput'), dz = $('#dropzone');
  if(dz && input){
    dz.addEventListener('click', e=>{ if(e.target.id!=='useSample') input.click(); });
    dz.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault(); input.click();} });
    ['dragover','dragenter'].forEach(ev=>dz.addEventListener(ev, e=>{e.preventDefault(); dz.style.borderColor='var(--amber)';}));
    ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev, e=>{e.preventDefault(); dz.style.borderColor='';}));
    dz.addEventListener('drop', e=>{ const f=e.dataTransfer.files[0]; if(f) loadFile(f); });
    input.addEventListener('change', e=>{ const f=e.target.files[0]; if(f) loadFile(f); });
  }
  function loadFile(file){
    if(!file.type.startsWith('image/')) return toast('That doesn’t look like an image ✦');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      stage.innerHTML = '';
      const im = document.createElement('img');
      im.src = url; im.className='subject'; im.alt='your uploaded photograph';
      stage.appendChild(im);
      uploaded = true; apply();
      toast('Photograph loaded ✦ choose a chemistry');
    };
    img.src = url;
  }
  const sampleBtn = $('#useSample');
  if(sampleBtn) sampleBtn.addEventListener('click', e=>{
    e.stopPropagation();
    stage.innerHTML = '<svg class="subject" viewBox="0 0 480 360" preserveAspectRatio="xMidYMid slice"><use href="#scene"/></svg>';
    uploaded = false; apply();
  });

  /* compare / reset / export */
  const cmp = $('#compareBtn');
  if(cmp){
    const on  = ()=>{ const s=subj(); if(s) s.style.filter='none'; $('#duoOverlay').style.opacity=0; $('#fxOverlay').dataset.mode=''; $('#proMark').classList.remove('on'); if(window.HalationASCII) HalationASCII.setAside(true); };
    const off = ()=> apply();
    ['pointerdown','touchstart'].forEach(ev=>cmp.addEventListener(ev, e=>{e.preventDefault(); on();}));
    ['pointerup','pointerleave','touchend'].forEach(ev=>cmp.addEventListener(ev, off));
  }
  const rst = $('#resetBtn');
  if(rst) rst.addEventListener('click', ()=>{
    $$('.chip[data-f]').forEach(c=>c.classList.toggle('active', c.dataset.f==='none'));
    current='none'; curT=1; if(slider) slider.value=100; apply();
    toast('Back to the original negative ✦');
  });
  const dl = $('#dlBtn');
  if(dl) dl.addEventListener('click', ()=>{
    const f = F[current];
    if(current==='ascii' && window.HalationASCII) return HalationASCII.export();
    if(f.pro) return toast('✦ Export blocked — Pro chemistry needs a Pro key');
    if(!uploaded) return toast('Upload a photo first — sample scenes can’t be exported');
    const s = subj();
    try{
      const cv = document.createElement('canvas');
      cv.width = s.naturalWidth || 960; cv.height = s.naturalHeight || 720;
      const ctx = cv.getContext('2d');
      const css = f.css(curT);
      if(css !== 'none') ctx.filter = css;
      ctx.drawImage(s, 0, 0, cv.width, cv.height);
      const a = document.createElement('a');
      a.download = 'halation-' + current + '.png';
      a.href = cv.toDataURL('image/png');
      a.click();
      toast('Exported ✦ halation-' + current + '.png');
    }catch(err){ toast('Your browser blocked the export — try Chrome or Firefox'); }
  });
  apply();
})();

/* ================================================================
   PAGE: pricing — billing toggle
   ================================================================ */
(function(){
  const pill = $('#billPill'); if(!pill) return;
  const prices = $$('.price[data-month]');
  const labels = { m: $('#lblMonth'), y: $('#lblYear') };
  const note = $('#billNote');
  pill.addEventListener('click', ()=>{
    const yearly = pill.classList.toggle('yearly');
    if(labels.m) labels.m.classList.toggle('on', !yearly);
    if(labels.y) labels.y.classList.toggle('on', yearly);
    prices.forEach(p=>{
      p.classList.remove('bump'); void p.offsetWidth;
      p.classList.add('bump');
      p.innerHTML = (yearly ? p.dataset.year : p.dataset.month) + p.dataset.suffix;
    });
    if(note) note.textContent = yearly ? 'billed $72 once a year — two months free' : 'billed monthly, cancel anytime';
  });
})();

/* ================================================================
   PAGE: login — tabs + demo submit
   ================================================================ */
(function(){
  const tabs = $$('.auth-tabs button'); if(!tabs.length) return;
  tabs.forEach(b=>b.addEventListener('click', ()=>{
    tabs.forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const which = b.dataset.form;
    $('#formIn').classList.toggle('hide', which!=='in');
    $('#formUp').classList.toggle('hide', which!=='up');
  }));
  $$('.auth-form').forEach(f=>f.addEventListener('submit', e=>{
    e.preventDefault();
    toast('✦ Demo site — authentication isn’t wired yet');
  }));
})();

/* ---------- pricing plan buttons (any page) ---------- */
$$('.plan .btn[data-plan]').forEach(b=>b.addEventListener('click', ()=>{
  toast(b.dataset.plan === 'pro'
    ? '✦ Demo site — no real billing, promise. Wire Stripe here.'
    : 'Welcome to the Sketchbook ✦ head to the playground.');
}));
