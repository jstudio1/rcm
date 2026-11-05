(function(){
/* Home page slider. The progress bar under the pictures is a CSS animation; when it ends, the next picture shows,
   so the bar and the timing can never drift apart. It pauses while the pointer or keyboard focus is on the slider,
   while the tab is hidden, while the slider is off screen, and when the visitor presses the pause button. */
document.querySelectorAll('.sl-box').forEach(function(b){
  var slides=[].slice.call(b.querySelectorAll('.sl-s')),dots=[].slice.call(b.querySelectorAll('.sl-d')),n=slides.length;
  b.style.setProperty('--ms',(+b.dataset.ms||5000)+'ms');
  if(n<2)return;
  var i=0,hover=false,focus=false,hidden=document.hidden,away=false,user=false;
  var cnt=b.querySelector('.sl-count'),pp=b.querySelector('.sl-pp'),view=b.querySelector('.sl-view');
  var auto=b.dataset.auto==='1';
  function pad(k){return (k<9?'0':'')+(k+1)}
  function state(){b.classList.toggle('paused',hover||focus||hidden||away||user);b.classList.toggle('manual',!auto)}
  function go(k){
    i=(k+n)%n;
    slides.forEach(function(s,j){s.classList.toggle('on',j===i);if(j===i)s.removeAttribute('aria-hidden');else s.setAttribute('aria-hidden','true')});
    dots.forEach(function(d,j){d.classList.remove('on','seen');if(j<i)d.classList.add('seen');d.removeAttribute('aria-current')});
    void b.offsetWidth; // restart the bar animation
    dots[i].classList.add('on');dots[i].setAttribute('aria-current','true');
    if(cnt)cnt.textContent=pad(i)+' / '+pad(n-1);
  }
  b.addEventListener('animationend',function(e){if(auto&&e.animationName==='sl-fill'&&e.target.parentNode===dots[i])go(i+1)});
  b.querySelector('.prev').addEventListener('click',function(){go(i-1)});
  b.querySelector('.next').addEventListener('click',function(){go(i+1)});
  dots.forEach(function(d,j){d.addEventListener('click',function(){go(j)})});
  if(pp){
    if(!auto){user=true}
    pp.addEventListener('click',function(){
      if(!auto){auto=true;user=false;go(i)} else user=!user;
      pp.setAttribute('aria-pressed',user);pp.setAttribute('aria-label',user?pp.dataset.play:pp.dataset.pause);state();
    });
  }
  b.addEventListener('mouseenter',function(){hover=true;state()});b.addEventListener('mouseleave',function(){hover=false;state()});
  b.addEventListener('focusin',function(e){focus=e.target.matches(':focus-visible');state()});b.addEventListener('focusout',function(){focus=false;state()});
  document.addEventListener('visibilitychange',function(){hidden=document.hidden;state()});
  if('IntersectionObserver' in window)new IntersectionObserver(function(en){away=!en[0].isIntersecting;state()},{threshold:.25}).observe(b);
  b.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'){go(i-1)}else if(e.key==='ArrowRight'){go(i+1)}});
  // swipe on touch screens
  var x0=null,y0=0;
  view.addEventListener('pointerdown',function(e){if(e.pointerType==='mouse')return;x0=e.clientX;y0=e.clientY});
  view.addEventListener('pointerup',function(e){if(x0===null)return;var dx=e.clientX-x0,dy=e.clientY-y0;x0=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5)go(i+(dx<0?1:-1))});
  view.addEventListener('pointercancel',function(){x0=null});
  state();
});
})();
