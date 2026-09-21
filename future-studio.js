/* Presentation and accessible dialog behaviour; course/payment data stays in app.js. */
(()=>{'use strict';
  const ids=['authModal','checkoutModal','scholarshipModal'];
  let active=null,returnFocus=null,previousOverflow='';
  const closers={authModal:()=>window.closeAuth(),checkoutModal:()=>{if(!document.getElementById('payStep2')?.classList.contains('hidden'))return false;window.closeCheckout();},scholarshipModal:()=>window.closeScholarship()};
  function sync(){
    const visible=ids.map(id=>document.getElementById(id)).find(el=>el&&!el.classList.contains('hidden'))||null;
    if(visible===active)return;
    if(visible){
      if(!active){returnFocus=document.activeElement;previousOverflow=document.body.style.overflow;}
      active=visible;document.body.style.overflow='hidden';active.setAttribute('role','dialog');active.setAttribute('aria-modal','true');
      if(!active.hasAttribute('aria-labelledby')){const heading=active.querySelector('h3,h2');if(heading){heading.id=heading.id||`${active.id}Heading`;active.setAttribute('aria-labelledby',heading.id);}}
      requestAnimationFrame(()=>{const focusable=[...(active?.querySelectorAll('input:not([type="hidden"]),button')||[])].find(el=>el.getClientRects().length&&!el.disabled);focusable?.focus({preventScroll:true});});
    }else{active=null;document.body.style.overflow=previousOverflow;returnFocus?.focus?.({preventScroll:true});}
  }
  ids.forEach(id=>{const el=document.getElementById(id);if(el)new MutationObserver(sync).observe(el,{attributes:true,attributeFilter:['class']});});
  document.addEventListener('keydown',event=>{
    if(!active)return;
    if(event.key==='Escape'){event.preventDefault();closers[active.id]?.();return;}
    if(event.key==='Tab'){
      const nodes=[...active.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length);
      if(!nodes.length){event.preventDefault();return;}
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&(document.activeElement===first||!active.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!active.contains(document.activeElement))){event.preventDefault();first.focus();}
    }
  });
  document.querySelectorAll('label').forEach(label=>{if(label.htmlFor)return;const input=label.parentElement?.querySelector('input,select,textarea');if(input?.id)label.htmlFor=input.id;});
  document.querySelectorAll('.faq-item summary').forEach(summary=>{const icon=document.createElement('i');icon.className='fas fa-chevron-down';icon.setAttribute('aria-hidden','true');summary.append(icon);});
  const total=document.getElementById('catalogTotal');if(total&&window.COURSES)total.textContent=window.COURSES.length;
})();
