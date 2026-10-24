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
})();
