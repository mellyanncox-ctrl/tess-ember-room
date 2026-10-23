/* The Ember Room: shared behaviour. No third-party trackers. */
(()=>{
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- privacy-safe event tracking ----
     Sends only an event name and non-identifying context (page, service).
     Works with Plausible if it is installed; otherwise does nothing. */
  function track(name,props){try{if(window.plausible)window.plausible(name,{props});}catch(e){}}
  document.addEventListener('click',e=>{const a=e.target.closest('[data-track]');if(!a)return;
    track(a.dataset.track,{page:document.body.dataset.page||'',service:a.dataset.service||''});});
  /* Calendly confirms a booking with a postMessage; record the event type only */
  addEventListener('message',e=>{if(e.origin!=='https://calendly.com')return;const d=e.data||{};
    if(d.event==='calendly.event_scheduled')track('calendly_scheduled',{page:document.body.dataset.page||''});});

  /* ---- mobile drawer ---- */
  const drawer=$('#drawer'), open=$('[data-open-drawer]'), close=$('[data-close-drawer]');
  function setDrawer(on){if(!drawer)return;drawer.hidden=!on;document.body.style.overflow=on?'hidden':'';open&&open.setAttribute('aria-expanded',on);if(on)close&&close.focus();else open&&open.focus();}
  open&&open.addEventListener('click',()=>setDrawer(true));
  close&&close.addEventListener('click',()=>setDrawer(false));
  addEventListener('keydown',e=>{if(e.key==='Escape'&&drawer&&!drawer.hidden)setDrawer(false);});
  $$('#drawer a').forEach(a=>a.addEventListener('click',()=>setDrawer(false)));

  /* ---- header and book bar appear after the first screen ---- */
  const first=$('.hero,.page-hero'), head=$('.site-head'), bar=$('.bookbar');
  if(first&&'IntersectionObserver'in window){
    new IntersectionObserver(([en])=>{const past=!en.isIntersecting;
      if(document.body.classList.contains('home')&&head)head.classList.toggle('show',past);
      if(bar)bar.classList.toggle('show',past);}).observe(first);
  }

  /* ---- pill tabs ---- */
  $$('[data-tabs]').forEach(box=>{
    const tabs=$$('[role=tab]',box), count=$('[data-count]',box);
    function pick(t,focus){tabs.forEach(x=>{const on=x===t;x.setAttribute('aria-selected',on);x.tabIndex=on?0:-1;
      const p=document.getElementById(x.getAttribute('aria-controls'));if(p)p.hidden=!on;});
      if(focus)t.focus();
      const p=document.getElementById(t.getAttribute('aria-controls'));if(count&&p)count.textContent=`[${p.dataset.n}/${tabs.length}]`;
      track('tab_select',{page:document.body.dataset.page||'',service:t.dataset.service||t.textContent.trim()});}
    tabs.forEach((t,i)=>{t.addEventListener('click',()=>pick(t));
      t.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();pick(tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length],true);}});});
    const first=tabs.find(t=>t.getAttribute('aria-selected')==='true')||tabs[0];
    tabs.forEach(x=>{const on=x===first;x.tabIndex=on?0:-1;const p=document.getElementById(x.getAttribute('aria-controls'));if(p)p.hidden=!on;});
  });

  /* ---- FAQ open tracking ---- */
  $$('.faq details').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)track('faq_open',{page:document.body.dataset.page||'',service:d.id||''});}));

  /* ---- contact form: no backend yet, no health information collected ---- */
  $$('form[data-contact]').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();
    if(!f.reportValidity())return;track('contact_submit',{page:document.body.dataset.page||''});
    const done=f.querySelector('.done');f.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);if(done)done.hidden=false;}));

  /* ---- canvases: portrait (sharp, black and white), reeded glass ---- */
  function loadImg(src){return new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src;});}
  function fit(c){const d=Math.min(devicePixelRatio||1,2);c.width=Math.round(c.clientWidth*d);c.height=Math.round(c.clientHeight*d);return[c.width,c.height];}
  function cover(img,w,h,fx,fy){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
    const ir=img.naturalWidth/img.naturalHeight,cr=w/h;let sw,sh,sx,sy;
    if(ir>cr){sh=img.naturalHeight;sw=sh*cr;sx=(img.naturalWidth-sw)*fx;sy=0}else{sw=img.naturalWidth;sh=sw/cr;sx=0;sy=(img.naturalHeight-sh)*fy}
    x.drawImage(img,sx,sy,sw,sh,0,0,w,h);return c;}
  function reed(src,ctx,x0,x1,h,fw,k){const sc=src.width/ctx.canvas.width;
    for(let x=x0;x<x1;x+=fw){const w=Math.min(fw,x1-x);const sx=Math.max(0,(x-fw*k)*sc),sw=Math.min(src.width-sx,fw*(1+2*k)*sc);
      ctx.drawImage(src,sx,0,sw,src.height,x,0,w,h);const g=ctx.createLinearGradient(x,0,x+w,0);
      g.addColorStop(0,'rgba(255,235,210,.10)');g.addColorStop(.35,'rgba(255,255,255,0)');g.addColorStop(.85,'rgba(0,0,0,.28)');g.addColorStop(1,'rgba(0,0,0,.4)');ctx.fillStyle=g;ctx.fillRect(x,0,w,h);}}
  const painters={
    motion(c,img){const[w,h]=fit(c);const ctx=c.getContext('2d');ctx.fillStyle='#5B2A38';ctx.fillRect(0,0,w,h);if(!img)return;
      const fx=parseFloat(c.dataset.fx||.62),fy=parseFloat(c.dataset.fy||.25);
      const src=cover(img,w,h,fx,fy);const tone=document.createElement('canvas');tone.width=w;tone.height=h;const t=tone.getContext('2d');
      t.filter='grayscale(1) sepia(.12) brightness(1.05) contrast(1.12)';t.drawImage(src,0,0);t.filter='none';
      ctx.drawImage(tone,0,0);},
    reed(c,img){const[w,h]=fit(c);const ctx=c.getContext('2d');ctx.fillStyle='#5B2A38';ctx.fillRect(0,0,w,h);if(!img)return;
      const src=cover(img,w,h,.5,parseFloat(c.dataset.fy||.7));const to=parseFloat(c.dataset.to||1);
      ctx.filter='saturate(.55)';ctx.drawImage(src,0,0);ctx.filter='none';reed(src,ctx,0,w*to,h,Math.max(14,w/40),1.1);
      ctx.fillStyle='rgba(91,42,56,.5)';ctx.fillRect(0,0,w,h);if(to<1){ctx.fillStyle='rgba(229,227,220,.3)';ctx.fillRect(Math.round(w*to),0,1,h);}}
  };
  const canvases=$$('canvas[data-paint]');
  Promise.all(canvases.map(c=>loadImg(c.dataset.src))).then(imgs=>{
    const draw=()=>canvases.forEach((c,i)=>painters[c.dataset.paint]&&painters[c.dataset.paint](c,imgs[i]));
    draw();let t;addEventListener('resize',()=>{clearTimeout(t);t=setTimeout(draw,140);});
  });
})();
