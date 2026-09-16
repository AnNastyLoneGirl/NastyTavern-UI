import { icons } from './icons.js';
import { t } from './i18n.js';
import { getContextSafe as ctx, escapeHtml as esc } from './utils.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';
import { emptyStateHtml, tabsHtml } from './ui-templates.js';

const snippet=v=>String(v??'').replace(/\s+/g,' ').trim().slice(0,160);

export class ChatTools {
  constructor(toast){this.toast=toast;this.button=null;this.root=null;this.tab='bookmarks';this.events=[];this.boundChat=()=>setTimeout(()=>this.render(),0);}
  mount(){this.ensureButton();this.ensurePanel();this.bind();this.syncVisibility();}
  unmount(){for(const e of this.events){try{e.source.removeListener(e.type,e.handler)}catch(_){}}this.events=[];this.button?.remove();this.root?.remove();this.button=this.root=null;document.body.classList.remove('nt-chat-tools-open');}
  bind(){if(this.events.length)return;const c=ctx(),s=c?.eventSource,et=c?.eventTypes||c?.event_types;if(!s||!et)return;for(const k of ['CHAT_CHANGED','CHAT_CREATED','MESSAGE_RECEIVED','MESSAGE_SENT','MESSAGE_UPDATED']){if(!et[k])continue;try{s.on(et[k],this.boundChat);this.events.push({source:s,type:et[k],handler:this.boundChat})}catch(_){}}}
  ensureStore(){const c=ctx();if(!c?.chatMetadata)return null;c.chatMetadata.nastyTavernChatTools??={bookmarks:[],notes:[]};const x=c.chatMetadata.nastyTavernChatTools;x.bookmarks??=[];x.notes??=[];return x;}
  save(){try{ctx()?.saveMetadataDebounced?.()}catch(_){} }
  ensureButton(){if(this.button=document.querySelector('#nt-chat-tools-button'))return this.button;const b=document.createElement('button');b.id='nt-chat-tools-button';b.type='button';b.title=t('Chat Tools');b.innerHTML=`<span>${icons.bookmark}</span>`;b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();this.toggle()});document.body.append(b);this.button=b;return b;}
  ensurePanel(){
    if(this.root=document.querySelector('#nt-chat-tools'))return this.root;
    const {root:r,body}=createModalShell({
      id:'nt-chat-tools',
      title:t('Chat Tools'),
      subtitle:t('Bookmarks and private session notes'),
      icon:icons.bookmark,
      modalClass:'nt-tool-modal nt-chat-tools-modal',
      backdropClass:'nt-tool-backdrop',
      bodyClass:'nt-chat-tools-body',
      bodyAttrs:{'data-nt-ct-body':''},
      closeAttrs:{'data-nt-ct-close':''},
    });
    body.insertAdjacentHTML('beforebegin',tabsHtml('nt-ct-tab',[
      {id:'bookmarks',label:t('Bookmarks'),active:true},
      {id:'notes',label:t('Session Notes')},
    ]));
    r.addEventListener('click',e=>this.onClick(e));
    r.addEventListener('input',e=>this.onInput(e));
    r.addEventListener('change',e=>this.onChange(e));
    document.body.append(r);this.root=r;this.render();return r;
  }
  syncVisibility(){if(this.button)this.button.hidden=document.body?.dataset?.mtView!=='chat';}
  toggle(){this.root?.hidden?this.open():this.close()}
  open(){this.ensurePanel();showModalShell(this.root);document.body.classList.add('nt-chat-tools-open');this.render()}
  close(){if(!this.root||this.root.hidden)return;hideModalShell(this.root,{immediate:false});document.body.classList.remove('nt-chat-tools-open')}
  messages(){return Array.isArray(ctx()?.chat)?ctx().chat:[]}
  render(){if(!this.root)return;const body=this.root.querySelector('[data-nt-ct-body]');const store=this.ensureStore();if(!store){body.innerHTML=emptyStateHtml({title:t('Open a chat first')});return;}this.syncMarkers(store);this.root.querySelectorAll('[data-nt-ct-tab]').forEach(b=>b.classList.toggle('is-active',b.dataset.ntCtTab===this.tab));if(this.tab==='notes'){body.innerHTML=this.renderNotes(store);return;}body.innerHTML=this.renderBookmarks(store)}
  renderBookmarks(store){const msgs=this.messages();const options=msgs.map((m,i)=>`<option value="${i}">#${i+1} · ${esc(m?.name||m?.role||'')} · ${esc(snippet(m?.mes??m?.content))}</option>`).join('');return `<div class="nt-chat-tools-create"><select data-nt-ct-message>${options}</select><input data-nt-ct-title placeholder="${t('Bookmark title (optional)')}"><input data-nt-ct-tag placeholder="${t('Tag (optional)')}"><button class="menu_button" data-nt-ct-add-bookmark>${icons.plus}<span>${t('Add bookmark')}</span></button></div><div class="nt-chat-bookmarks">${store.bookmarks.length?store.bookmarks.map((b,i)=>`<article><div><b>${esc(b.title||`${t('Message')} #${Number(b.messageIndex)+1}`)}</b><small>${esc(b.tag||'')} ${b.tag?'· ':''}#${Number(b.messageIndex)+1}</small><p>${esc(b.snippet)}</p></div><div><button class="menu_button" data-nt-ct-goto="${i}">${t('Go to')}</button><button data-nt-ct-delete-bookmark="${i}" class="menu_button menu_button_icon is-danger">${icons.trash}</button></div></article>`).join(''):emptyStateHtml({icon:icons.bookmark,title:t('No bookmarks yet'),subtitle:t('Save important moments from this conversation.')})}</div>`}
  renderNotes(store){return `<div class="nt-notes-toolbar"><button class="menu_button" data-nt-ct-add-note>${icons.plus}<span>${t('New note')}</span></button></div><div class="nt-session-notes">${store.notes.length?store.notes.map((n,i)=>`<article data-nt-note-index="${i}"><input class="nt-note-title" value="${esc(n.title||'')}" placeholder="${t('Note title')}"><textarea class="nt-note-text" rows="5" placeholder="${t('Write a private note…')}">${esc(n.text||'')}</textarea><div><small>${new Date(n.updatedAt||n.createdAt||Date.now()).toLocaleString()}</small><button class="menu_button" data-nt-ct-copy-note="${i}">${icons.copy}<span>${t('Copy')}</span></button><button data-nt-ct-delete-note="${i}" class="menu_button menu_button_icon is-danger">${icons.trash}</button></div></article>`).join(''):emptyStateHtml({icon:icons.note,title:t('No session notes yet'),subtitle:t('Notes stay outside the model prompt.')})}</div>`}

  syncMarkers(store){const nodes=[...document.querySelectorAll('#chat .mes')];nodes.forEach(n=>n.classList.remove('nt-message-bookmarked'));for(const b of store?.bookmarks||[]){let index=Number(b.messageIndex);if(b.messageText){const found=this.messages().findIndex(m=>String(m?.mes??m?.content??'')===b.messageText&&(!b.messageName||String(m?.name||'')===b.messageName));if(found>=0)index=found;}nodes[index]?.classList.add('nt-message-bookmarked')}}
  onClick(e){if(e.target.closest('[data-nt-ct-close]'))return this.close();const tab=e.target.closest('[data-nt-ct-tab]');if(tab){this.tab=tab.dataset.ntCtTab;return this.render()}const store=this.ensureStore();if(!store)return;if(e.target.closest('[data-nt-ct-add-bookmark]')){const idx=Number(this.root.querySelector('[data-nt-ct-message]')?.value||0),m=this.messages()[idx];store.bookmarks.push({messageIndex:idx,messageText:String(m?.mes??m?.content??''),messageName:String(m?.name||''),title:this.root.querySelector('[data-nt-ct-title]')?.value.trim()||'',tag:this.root.querySelector('[data-nt-ct-tag]')?.value.trim()||'',snippet:snippet(m?.mes??m?.content),createdAt:Date.now()});this.save();return this.render()}const go=e.target.closest('[data-nt-ct-goto]');if(go){this.goTo(store.bookmarks[Number(go.dataset.ntCtGoto)]);return}const db=e.target.closest('[data-nt-ct-delete-bookmark]');if(db){store.bookmarks.splice(Number(db.dataset.ntCtDeleteBookmark),1);this.save();return this.render()}if(e.target.closest('[data-nt-ct-add-note]')){store.notes.unshift({title:'',text:'',createdAt:Date.now(),updatedAt:Date.now()});this.save();return this.render()}const dn=e.target.closest('[data-nt-ct-delete-note]');if(dn){store.notes.splice(Number(dn.dataset.ntCtDeleteNote),1);this.save();return this.render()}const cp=e.target.closest('[data-nt-ct-copy-note]');if(cp){const n=store.notes[Number(cp.dataset.ntCtCopyNote)];navigator.clipboard?.writeText?.(`${n?.title?`${n.title}\n`:''}${n?.text||''}`);this.toast?.(t('Note copied.'));}}
  onInput(e){const card=e.target.closest('[data-nt-note-index]');if(!card)return;const store=this.ensureStore(),n=store?.notes?.[Number(card.dataset.ntNoteIndex)];if(!n)return;if(e.target.matches('.nt-note-title'))n.title=e.target.value;if(e.target.matches('.nt-note-text'))n.text=e.target.value;n.updatedAt=Date.now();clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.save(),300)}
  onChange(){ }
  goTo(bookmark){let index=Number(bookmark?.messageIndex);const messages=this.messages();if(bookmark?.messageText){const found=messages.findIndex(m=>String(m?.mes??m?.content??'')===bookmark.messageText&&(!bookmark.messageName||String(m?.name||'')===bookmark.messageName));if(found>=0)index=found;}const el=document.querySelector(`#chat .mes[mesid="${index}"],#chat .mes[data-message-id="${index}"]`)||document.querySelectorAll('#chat .mes')[index];if(el){this.close();el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('nt-bookmark-flash');setTimeout(()=>el.classList.remove('nt-bookmark-flash'),1400)}else this.toast?.(t('Message is not currently loaded.'))}
}
