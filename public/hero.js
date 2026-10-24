
(function(){
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const nav=$('#nav');

/* tile grid over the burnout loop video (RayCity login style) */
(function(){
  const box=document.getElementById('tiles');if(!box)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small=matchMedia('(max-width: 900px)').matches;
  const POSX=small?.74:.5;
  // background video (720p on phones); the key art is the poster and the fallback
  const v=document.createElement('video');v.className='bgv';v.muted=true;v.loop=true;v.playsInline=true;v.setAttribute('playsinline','');v.setAttribute('muted','');
  // file paths come from the admin (home > hero background) via data attributes
  const src=(small?box.dataset.videoSm:box.dataset.video)||box.dataset.video||'',img=box.dataset.image||'';
  v.preload='auto';if(img)v.poster=img;if(src)v.src=src;
  if(!reduce&&src){v.autoplay=true;v.addEventListener('canplay',()=>{v.play().catch(()=>{})},{once:true})}
  const still=new Image();if(img)still.src=img;
  let tiles=[],W=0,H=0,cols=8,rows=6,tw=1,th=1,built=false;
  const dpr=Math.min(2,devicePixelRatio||1);
  function build(){
    W=box.clientWidth;H=box.clientHeight;
    cols=W<600?4:W<1000?6:8; rows=Math.max(4,Math.round(cols*H/W*1.05));
    tw=W/cols;th=H/rows;box.innerHTML='';box.appendChild(v);tiles=[];
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const h=document.createElement('div');h.className='h';h.style.cssText='left:'+(c*tw)+'px;top:'+(r*th)+'px;width:'+(tw+.5)+'px;height:'+(th+.5)+'px';box.appendChild(h);
      const t=document.createElement('div');t.className='t';
      const depth=Math.round(Math.max(18,Math.min(38,Math.min(tw,th)*.24)));
      t.style.cssText='left:'+(c*tw)+'px;top:'+(r*th)+'px;width:'+(tw+.5)+'px;height:'+(th+.5)+'px;--w:'+(tw+.5)+'px;--h:'+(th+.5)+'px;--d:'+depth+'px';
      t.innerHTML='<div class="f"><canvas></canvas></div><div class="k"></div><i class="s l"></i><i class="s r"></i><i class="s u"></i><i class="s b"></i><div class="e"></div>';
      const cv=t.querySelector('canvas');cv.width=Math.ceil(tw*dpr);cv.height=Math.ceil(th*dpr);
      box.appendChild(t);tiles.push({t,h,cv,e:t.lastChild,c,r,busy:false});
    }
    for(let r=1;r<rows;r++)for(let c=1;c<cols;c++){const d=document.createElement('span');d.className='dot';d.style.left=(c*tw)+'px';d.style.top=(r*th)+'px';box.appendChild(d)}
    if(!built&&!reduce)setTimeout(intro,400);
    built=true;
  }
  // copy the part of the current video frame (or the still) that sits under this tile
  function snap(o){
    let src=v,sw0=v.videoWidth,sh0=v.videoHeight;
    if(v.readyState<2||!sw0){src=still;sw0=still.naturalWidth;sh0=still.naturalHeight}
    const g=o.cv.getContext('2d');if(!sw0){g.fillStyle='#111';g.fillRect(0,0,o.cv.width,o.cv.height);return}
    const s=Math.max(W/sw0,H/sh0),ox=(W-sw0*s)*POSX,oy=(H-sh0*s)/2;
    try{g.drawImage(src,(o.c*tw-ox)/s,(o.r*th-oy)/s,tw/s,th/s,0,0,o.cv.width,o.cv.height)}catch(e){}
  }
  const EASE='cubic-bezier(.22,.61,.2,1)';
  function flip(i,dx,dy,delay){
    const o=tiles[i];if(!o||o.busy)return;o.busy=true;delay=delay||0;
    const horiz=Math.abs(dx)>=Math.abs(dy), sgn=(horiz?dx:-dy)>=0?1:-1, ax=horiz?'rotateY':'rotateX';
    const dur=900+Math.random()*140;
    setTimeout(()=>{
      snap(o);o.t.classList.toggle('x',!horiz);o.t.classList.add('fl');o.h.classList.add('on');
      // a thick slab: lifts toward the viewer, turns a full revolution with a small damped wobble, settles back
      const P='perspective(900px) ';
      const a=o.t.animate([
        {transform:P+ax+'(0deg) rotateZ(0deg) translateZ(0)'},
        {transform:P+ax+'('+(sgn*60)+'deg) rotateZ(-5deg) translateZ(30px)',offset:.16},
        {transform:P+ax+'('+(sgn*150)+'deg) rotateZ(6deg) translateZ(46px)',offset:.36},
        {transform:P+ax+'('+(sgn*240)+'deg) rotateZ(-5deg) translateZ(40px)',offset:.56},
        {transform:P+ax+'('+(sgn*320)+'deg) rotateZ(3deg) translateZ(18px)',offset:.78},
        {transform:P+ax+'('+(sgn*350)+'deg) rotateZ(-1.5deg) translateZ(6px)',offset:.9},
        {transform:P+ax+'('+(sgn*360)+'deg) rotateZ(0deg) translateZ(0)'}
      ],{duration:dur,easing:'cubic-bezier(.4,.1,.2,1)'});
      o.e.animate([{opacity:0},{opacity:1,offset:.2},{opacity:1,offset:.7},{opacity:0}],{duration:dur,easing:'ease-out'});
      a.onfinish=a.oncancel=()=>{o.busy=false;o.t.classList.remove('fl');o.h.classList.remove('on')};
    },delay);
  }
  // opening: a diagonal wave of flips across the grid
  function intro(){for(const o of tiles)flip(o.r*cols+o.c,1,0,(o.r+o.c)*55)}
  let lastIdx=-1,lx=0,ly=0,lastMove=0;
  function hit(x,y){const r=box.getBoundingClientRect();x-=r.left;y-=r.top;if(x<0||y<0||x>=r.width||y>=r.height)return -1;return Math.floor(y/th)*cols+Math.floor(x/tw)}
  function move(x,y){
    lastMove=performance.now();const i=hit(x,y);const dx=x-lx,dy=y-ly;lx=x;ly=y;
    if(i!==lastIdx){if(i>=0)flip(i,dx,dy);lastIdx=i}
  }
  {
    addEventListener('pointermove',e=>move(e.clientX,e.clientY),{passive:true});
    addEventListener('touchmove',e=>{const t=e.touches[0];if(t)move(t.clientX,t.clientY)},{passive:true});
    // scrolling slides new tiles under a resting cursor (or the middle of the screen on touch): wobble those too
    // the page itself never scrolls (body is locked), so wheel / touch-drag stand in for "scroll"
    let seen=false,lastScroll=0;
    addEventListener('pointermove',()=>{seen=true},{once:true,passive:true});
    function scrolled(d){
      const now=performance.now();if(!d||!tiles.length||now-lastScroll<120)return;lastScroll=now;lastMove=now;
      const x=seen?lx:innerWidth*(.2+Math.random()*.6),y=seen?ly:innerHeight*(.3+Math.random()*.4);
      const i=hit(x,y);if(i<0)return;
      flip(i,0,-d);
      // neighbours follow so a scroll feels like a ripple
      const c=i%cols,r=Math.floor(i/cols);
      flip(c+1<cols?i+1:i-1,0,-d,80);
      if(Math.abs(d)>40)flip(r+(d>0?1:-1)>=0&&r+(d>0?1:-1)<rows?i+(d>0?1:-1)*cols:i,0,-d,160);
    }
    addEventListener('wheel',e=>scrolled(e.deltaY||e.deltaX),{passive:true});
    addEventListener('scroll',()=>scrolled(1),{passive:true});
    let ty=0;
    addEventListener('touchstart',e=>{if(e.touches[0])ty=e.touches[0].clientY},{passive:true});
    addEventListener('touchmove',e=>{const t=e.touches[0];if(t){scrolled(ty-t.clientY||1);ty=t.clientY}},{passive:true});
    setInterval(()=>{
      if(document.hidden||performance.now()-lastMove<5000||!tiles.length)return;
      const start=Math.floor(Math.random()*tiles.length),hz=Math.random()<.6,dir=Math.random()<.5?1:-1;
      let r=Math.floor(start/cols),c=start%cols;
      for(let k=0;k<3;k++){flip(r*cols+c,hz?dir:0,hz?0:-dir,k*90);if(hz)c+=dir;else r+=dir;if(c<0||c>=cols||r<0||r>=rows)break}
    },2600);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)v.pause();else v.play().catch(()=>{})});
  }
  build();let rt;addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(build,200)});
})();

/* mobile drawer */
const burger=$('#burger');
burger.addEventListener('click',()=>{const o=nav.classList.toggle('open');burger.setAttribute('aria-expanded',o);document.body.style.overflow=o?'hidden':''});
const t=$('#toast');let tm;
$$('[data-stay]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();
  if(nav.classList.contains('open')){nav.classList.remove('open');burger.setAttribute('aria-expanded',false);document.body.style.overflow=''}
  const m=el.dataset.msg===undefined?'เร็วๆ นี้':el.dataset.msg;if(!m)return;
  t.textContent=m;t.classList.add('show');clearTimeout(tm);tm=setTimeout(()=>t.classList.remove('show'),2400)}));
})();


/* header turns solid once the page scrolls */
(function(){const n=document.getElementById('nav');if(!n)return;const f=()=>n.classList.toggle('solid',scrollY>40);addEventListener('scroll',f,{passive:true});f()})();
