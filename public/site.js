(function(){
const $$=s=>[...document.querySelectorAll(s)];
const nav=document.getElementById('nav'),burger=document.getElementById('burger'),t=document.getElementById('toast');
let tm;
burger.addEventListener('click',()=>{const o=nav.classList.toggle('open');burger.setAttribute('aria-expanded',o);document.body.style.overflow=o?'hidden':''});
$$('[data-stay]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();
  const m=el.dataset.msg===undefined?'เร็วๆ นี้':el.dataset.msg;if(!m)return;
  t.textContent=m;t.classList.add('show');clearTimeout(tm);tm=setTimeout(()=>t.classList.remove('show'),2400)}));
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});
$$('.rv').forEach(el=>io.observe(el));
// FAQ: filter the questions as you type, open/close them all
const fq=document.querySelector('.fq');
if(fq){
  const items=$$('.fq-i'),q=fq.querySelector('[data-fq-q]'),cnt=fq.querySelector('[data-fq-count]'),empty=fq.querySelector('[data-fq-empty]'),all=fq.querySelector('[data-fq-all]');
  const norm=s=>s.toLowerCase().replace(/\s+/g,' ').trim();
  const text=items.map(d=>norm(d.textContent));
  if(q)q.addEventListener('input',()=>{const v=norm(q.value);let n=0;
    items.forEach((d,i)=>{const hit=!v||text[i].includes(v);d.hidden=!hit;if(hit)n++;if(v&&hit)d.open=true;});
    if(cnt)cnt.textContent=n+' '+cnt.dataset.unit;if(empty)empty.hidden=n>0;});
  if(all)all.addEventListener('click',()=>{const open=!items.every(d=>d.hidden||d.open);items.forEach(d=>{if(!d.hidden)d.open=open});all.textContent=open?all.dataset.close:all.dataset.open;});
}
})();
