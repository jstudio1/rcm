
(function(){
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const nav=$('#nav');

/* Sound effects for the flipping tiles, synthesized with Web Audio (no audio files).
   Browsers only allow sound after the visitor clicks, taps or presses a key, so the
   engine starts on the first such gesture. The speaker button turns it on/off and the
   choice is remembered. Each flip = a short air "whoosh" + a soft "clack" as it lands,
   panned left/right by where the tile sits, with small random pitch so it never sounds canned. */
const SFX=(function(){
  const AC=window.AudioContext||window.webkitAudioContext;
  let on=true,ctx=null,master=null,noise=null,last=0;
  try{on=localStorage.getItem('rc-sfx')!=='off'}catch(e){}
  const btns=$$('.snd');
  const ready=()=>!!ctx&&ctx.state==='running';
  const paint=()=>btns.forEach(b=>{b.setAttribute('aria-pressed',on);b.classList.toggle('wait',on&&!ready())});
  function start(){
    if(!on||!AC)return;
    if(!ctx){
      ctx=new AC();master=ctx.createGain();master.gain.value=.55;master.connect(ctx.destination);
      const len=Math.floor(ctx.sampleRate*.3),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
      for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2);
      noise=buf;
    }
    if(ctx.state==='suspended')ctx.resume().then(paint,paint);
    paint();
  }
  ['pointerdown','keydown','touchstart'].forEach(ev=>addEventListener(ev,start,{passive:true}));
  function flip(pan,delayMs){
    if(!on||!ready())return;
    const ms=performance.now();if(ms-last<45)return;last=ms; // a sweep of tiles shouldn't turn into noise
    const t=ctx.currentTime+(delayMs||0)/1000;
    let out=master;
    if(ctx.createStereoPanner){const p=ctx.createStereoPanner();p.pan.value=Math.max(-.9,Math.min(.9,pan));p.connect(master);out=p}
    // whoosh: noise through a band-pass that sweeps up as the slab lifts
    const n=ctx.createBufferSource(),bp=ctx.createBiquadFilter(),g=ctx.createGain();
    n.buffer=noise;n.playbackRate.value=.85+Math.random()*.4;
    bp.type='bandpass';bp.Q.value=1.4;bp.frequency.setValueAtTime(700,t);bp.frequency.exponentialRampToValueAtTime(2400+Math.random()*600,t+.2);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.16,t+.04);g.gain.exponentialRampToValueAtTime(.001,t+.3);
    n.connect(bp);bp.connect(g);g.connect(out);n.start(t);n.stop(t+.31);
    // clack: a short pitched thump when the slab settles back
    const t2=t+.62+Math.random()*.08,o=ctx.createOscillator(),og=ctx.createGain();
    o.type='triangle';o.frequency.setValueAtTime(170+Math.random()*70,t2);o.frequency.exponentialRampToValueAtTime(65,t2+.09);
    og.gain.setValueAtTime(0,t2);og.gain.linearRampToValueAtTime(.2,t2+.006);og.gain.exponentialRampToValueAtTime(.001,t2+.13);
    o.connect(og);og.connect(out);o.start(t2);o.stop(t2+.14);
  }
  function toggle(){
    on=!on;
    try{localStorage.setItem('rc-sfx',on?'on':'off')}catch(e){}
    if(on){start();setTimeout(()=>flip(0),60)} // short preview so the visitor hears what they turned on
    paint();
  }
  btns.forEach(b=>b.addEventListener('click',toggle));
  paint();
  return {flip};
})();

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
  if(img)v.poster=img;
  // the video starts downloading only after the page has finished loading, so it never slows the first paint;
  // on data-saver or very slow connections it is skipped and the still key art stays
  const net=navigator.connection||{},lite=net.saveData||/(^|-)(2g|3g)$/.test(net.effectiveType||'');
  function loadVideo(){
    if(!src||lite)return;
    v.preload='auto';v.src=src;
    if(!reduce){v.autoplay=true;v.addEventListener('canplay',()=>{v.play().catch(()=>{})},{once:true})}
  }
  if(document.readyState==='complete')setTimeout(loadVideo,150);else addEventListener('load',()=>setTimeout(loadVideo,150),{once:true});
  const still=new Image();if(img)still.src=img;
  let tiles=[],W=0,H=0,cols=8,rows=6,tw=1,th=1,built=false;
  const dpr=Math.min(2,devicePixelRatio||1);
  function build(){
    W=box.clientWidth;H=box.clientHeight;
    // not laid out yet (hidden tab, prerender): an empty size would mean endless rows and a frozen page
    if(W<10||H<10){setTimeout(build,300);return}
    cols=W<600?4:W<1000?6:8; rows=Math.min(40,Math.max(4,Math.round(cols*H/W*1.05)));
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
    // tiles wave in when the page is revealed: right away, or after the loading screen opens
    if(!built&&!reduce){if(document.documentElement.classList.contains('ldr-on'))document.addEventListener('rc-loaded',()=>setTimeout(intro,250),{once:true});else setTimeout(intro,400)}
    built=true;
  }
  // copy the part of the current video frame (or the still) that sits under this tile
  function snap(o){
    let src=v,sw0=v.videoWidth,sh0=v.videoHeight;
    if(v.readyState<2||!sw0){src=still;sw0=still.naturalWidth;sh0=still.naturalHeight}
    if(!sw0)return false; // nothing loaded yet: the caller skips the flip instead of showing a black tile
    const g=o.cv.getContext('2d');
    const s=Math.max(W/sw0,H/sh0),ox=(W-sw0*s)*POSX,oy=(H-sh0*s)/2;
    try{g.drawImage(src,(o.c*tw-ox)/s,(o.r*th-oy)/s,tw/s,th/s,0,0,o.cv.width,o.cv.height)}catch(e){return false}
    return true;
  }
  const EASE='cubic-bezier(.22,.61,.2,1)';
  function flip(i,dx,dy,delay){
    const o=tiles[i];if(!o||o.busy)return;o.busy=true;delay=delay||0;
    const horiz=Math.abs(dx)>=Math.abs(dy), sgn=(horiz?dx:-dy)>=0?1:-1, ax=horiz?'rotateY':'rotateX';
    const dur=900+Math.random()*140;
    setTimeout(()=>{
      if(!snap(o)){o.busy=false;return}
      SFX.flip((o.c+.5)/cols*2-1);
      o.t.classList.toggle('x',!horiz);o.t.classList.add('fl');o.h.classList.add('on');
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
