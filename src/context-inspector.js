import { icons } from './icons.js';
import { t } from './i18n.js';
import { getContextSafe as ctx, escapeHtml as esc } from './utils.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';
import { emptyStateHtml, tabsHtml } from './ui-templates.js';

const textOf = m => typeof m === 'string' ? m : String(m?.content ?? m?.mes ?? m?.text ?? '');
const idOf = m => String(m?.identifier ?? m?.name ?? '').toLowerCase();

export class ContextInspector {
  constructor(toast){ this.toast=toast; this.button=null; this.root=null; this.events=[]; this.last=null; this.mounted=false; this.boundChat=e=>{void this.captureChat(e)}; this.boundData=(e,d)=>{void this.captureData(e,d)}; }
  mount(){ this.ensureButton(); this.ensurePanel(); this.bind(); this.syncVisibility(); this.mounted=true; }
  unmount(){ for(const e of this.events){ try{e.source.removeListener(e.type,e.handler)}catch(_){} } this.events=[]; this.button?.remove(); this.root?.remove(); this.button=this.root=null; document.body.classList.remove('nt-context-open'); }
  bind(){ if(this.events.length) return; const c=ctx(), s=c?.eventSource, et=c?.eventTypes||c?.event_types; if(!s||!et)return; for(const [type,handler] of [[et.CHAT_COMPLETION_PROMPT_READY,this.boundChat],[et.GENERATE_AFTER_DATA,this.boundData]]) if(type){ try{s.on(type,handler);this.events.push({source:s,type,handler})}catch(_){} } }
  ensureButton(){ if(this.button=document.querySelector('#nt-context-inspector-button')) return this.button; const b=document.createElement('button'); b.id='nt-context-inspector-button'; b.type='button'; b.title=t('Context Inspector'); b.innerHTML=`<span>${icons.inspector}</span>`; b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();this.toggle()}); document.body.append(b); this.button=b; return b; }
  ensurePanel(){
    if(this.root=document.querySelector('#nt-context-inspector'))return this.root;
    const {root:r,body}=createModalShell({
      id:'nt-context-inspector',
      title:t('Context Inspector'),
      subtitle:t('Inspect the exact prompt sent to the model'),
      icon:icons.inspector,
      size:'large',
      modalClass:'nt-tool-modal nt-context-modal',
      backdropClass:'nt-tool-backdrop',
      bodyClass:'nt-context-body',
      bodyAttrs:{'data-nt-context-body':''},
      closeAttrs:{'data-nt-context-close':''},
    });
    body.insertAdjacentHTML('beforebegin',`<div class="nt-context-summary" data-nt-context-summary></div>${tabsHtml('nt-context-tab',[
      {id:'overview',label:t('Overview'),active:true},
      {id:'prompt',label:t('Final Prompt')},
    ])}`);
    r.addEventListener('click',e=>{if(e.target.closest('[data-nt-context-close]'))this.close();const tab=e.target.closest('[data-nt-context-tab]');if(tab){r.querySelectorAll('[data-nt-context-tab]').forEach(x=>x.classList.toggle('is-active',x===tab));this.render(tab.dataset.ntContextTab)}});
    document.body.append(r);this.root=r;this.render();return r;
  }
  syncVisibility(){ if(this.button) this.button.hidden=document.body?.dataset?.mtView!=='chat'; }
  toggle(){ this.root?.hidden ? this.open() : this.close(); }
  open(){ this.ensurePanel(); showModalShell(this.root); document.body.classList.add('nt-context-open'); this.render(); }
  close(){ if(!this.root||this.root.hidden)return; hideModalShell(this.root,{immediate:false});document.body.classList.remove('nt-context-open'); }
  async captureChat(data){ if(data?.dryRun)return; const messages=Array.isArray(data?.chat)?data.chat:[]; await this.capture(messages,'chat'); }
  async captureData(data,dryRun){ if(dryRun)return; const prompt=data?.prompt; if(prompt!==undefined) await this.capture(prompt,'text'); }
  classify(m){ const role=String(m?.role||'').toLowerCase(), id=idOf(m); if(role==='prompt') return t('Final Prompt'); if(role==='user'||role==='assistant') return t('Chat History'); if(/world|lore|wi\b/.test(id))return t('World Info'); if(/persona/.test(id))return t('Persona'); if(/character|char description|personality|scenario/.test(id))return t('Character'); if(/example/.test(id))return t('Examples'); if(/post|history instruction|jailbreak/.test(id))return t('Post-History Instructions'); if(/system|main/.test(id)||role==='system')return t('System Prompt'); return t('Other'); }
  async capture(prompt,mode){ const c=ctx(); const items=Array.isArray(prompt)?prompt:[{role:'prompt',content:String(prompt??'')}]; const blocks=await Promise.all(items.map(async m=>{const text=textOf(m);let tokens=0;try{tokens=await c?.getTokenCountAsync?.(text)||0}catch(_){}return {category:this.classify(m),role:m?.role||'prompt',name:m?.name||m?.identifier||'',text,tokens}})); const groups={}; for(const b of blocks){(groups[b.category]??=[]).push(b)} const total=blocks.reduce((a,b)=>a+b.tokens,0); const max=Number(c?.mainApi==='openai'?c?.chatCompletionSettings?.openai_max_context:c?.maxContext)||0; this.last={mode,blocks,groups,total,max,at:Date.now(),model:c?.getChatCompletionModel?.()||''}; this.render(); }
  getStats(){ return { tokens:this.last?.total||0,max:this.last?.max||0,percent:this.last?.max?Math.round((this.last.total/this.last.max)*100):0 }; }
  render(tab){ if(!this.root)return; tab=tab||this.root.querySelector('[data-nt-context-tab].is-active')?.dataset.ntContextTab||'overview'; const s=this.root.querySelector('[data-nt-context-summary]'), body=this.root.querySelector('[data-nt-context-body]'); if(!this.last){s.innerHTML=`<div class="nt-context-meter"><div><b>0</b><span>${t('tokens captured')}</span></div><div class="nt-context-bar"><i style="width:0%"></i></div><small>${t('Generate a reply to capture context usage.')}</small></div>`;body.innerHTML=emptyStateHtml({icon:icons.inspector,title:t('No prompt captured yet'),subtitle:t('Generate a reply to inspect the prompt sent to the model.')});return;} const pct=this.last.max?Math.min(100,Math.round(this.last.total/this.last.max*100)):0; s.innerHTML=`<div class="nt-context-meter"><div><b>${this.last.total.toLocaleString()}</b><span>${this.last.max?` / ${this.last.max.toLocaleString()} ${t('tokens')}`:t('tokens')}</span></div><div class="nt-context-bar"><i style="width:${pct}%"></i></div><small>${this.last.max?`${pct}% ${t('of context used')}`:esc(this.last.model)}</small></div>`; if(tab==='prompt'){body.innerHTML=`<div class="nt-context-prompt">${this.last.blocks.map((b,i)=>`<details ${i<3?'open':''}><summary><b>${esc(b.category)}</b><span>${b.tokens} ${t('tokens')}</span></summary><pre>${esc(b.text)}</pre></details>`).join('')}</div>`;return;} body.innerHTML=`<div class="nt-context-groups">${Object.entries(this.last.groups).map(([name,arr])=>{const tok=arr.reduce((a,b)=>a+b.tokens,0);const p=this.last.total?Math.round(tok/this.last.total*100):0;return `<article><div><b>${esc(name)}</b><span>${tok} ${t('tokens')} · ${p}%</span></div><div class="nt-context-mini"><i style="width:${p}%"></i></div><small>${arr.length} ${t('prompt blocks')}</small></article>`}).join('')}</div>`; }
}
