// js/chat.js — Text chat (global + DMs)
// Server events: chat (global), dm (direct message)
'use strict';

const Chat = {
  currentTab:'global',
  tabs:{global:[]},
  dmPartners:{},
  socket:null,
  _open:false,

  init(socket) {
    this.socket=socket;
    const inp=document.getElementById('chat-in');
    if (!inp) return;
    inp.addEventListener('focus',()=>{ Input.chatFocused=true; });
    inp.addEventListener('blur', ()=>{ Input.chatFocused=false; });

    // ── server → client ──
    socket.on('chat', msg=>{
      this.addMessage('global',msg.from,msg.fromId,msg.message,false);
    });

    socket.on('dm', msg=>{
      const partnerId=msg.fromId===Game.myId?msg.toId:msg.fromId;
      const partnerName=msg.fromId===Game.myId?(this.dmPartners[partnerId]?.name||'DM'):msg.from;
      if (!this.tabs[partnerId]) this.openDM(partnerId,partnerName);
      this.addMessage(partnerId,msg.from,msg.fromId,msg.message,true);
    });
  },

  open() {
    const wrap=document.getElementById('chat-wrap');
    if (wrap) wrap.style.display='flex';
    const inp=document.getElementById('chat-in');
    if (inp) inp.focus();
    this._open=true;
  },

  close() {
    const inp=document.getElementById('chat-in');
    if (inp) inp.blur();
    Input.chatFocused=false;
    this._open=false;
  },

  send() {
    const inp=document.getElementById('chat-in');
    if (!inp||!inp.value.trim()||!this.socket) return;
    const text=inp.value.trim();
    inp.value='';
    if (this.currentTab==='global') {
      this.socket.emit('chat',{message:text});
    } else {
      const partnerId=this.currentTab;
      this.socket.emit('dm',{toId:partnerId,message:text});
    }
    this.close();
  },

  openDM(partnerId, partnerName) {
    if (!this.tabs[partnerId]) {
      this.tabs[partnerId]=[];
      this.dmPartners[partnerId]={id:partnerId,name:partnerName};
      const tabRow=document.getElementById('dm-tabs');
      if (tabRow) {
        const btn=document.createElement('button');
        btn.className='ctab';
        btn.dataset.tab=partnerId;
        btn.textContent=partnerName;
        btn.onclick=()=>this.switchTab(partnerId);
        tabRow.appendChild(btn);
      }
    }
    this.switchTab(partnerId);
    this.open();
  },

  switchTab(tabId) {
    this.currentTab=tabId;
    document.querySelectorAll('.ctab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tabId||(tabId==='global'&&b.id==='tab-global')));
    const box=document.getElementById('chat-box');
    if (!box) return;
    box.innerHTML='';
    (this.tabs[tabId]||[]).forEach(m=>this._renderMsg(m.senderName,m.senderId,m.text,m.isDM));
    box.scrollTop=box.scrollHeight;
    const dot=document.querySelector(`[data-tab="${tabId}"] .unread`);
    if (dot) dot.remove();
  },

  addMessage(tabId, senderName, senderId, text, isDM) {
    if (!this.tabs[tabId]) this.tabs[tabId]=[];
    this.tabs[tabId].push({senderName,senderId,text,isDM});
    if (this.currentTab===tabId) {
      this._renderMsg(senderName,senderId,text,isDM);
      const box=document.getElementById('chat-box');
      if (box) box.scrollTop=box.scrollHeight;
    } else {
      const btn=document.querySelector(`[data-tab="${tabId}"]`);
      if (btn&&!btn.querySelector('.unread')){const d=document.createElement('span');d.className='unread';btn.appendChild(d);}
    }
  },

  _renderMsg(senderName,senderId,text,isDM) {
    const box=document.getElementById('chat-box');
    if (!box) return;
    const div=document.createElement('div');
    div.className='chat-msg'+(isDM?' dm':'');
    const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    div.innerHTML=`<span class="chat-name" onclick="Chat.openDM('${senderId}','${senderName}')">${esc(senderName)}:</span> <span>${esc(text)}</span>`;
    box.appendChild(div);
  },

  addSystemMessage(text) {
    const box=document.getElementById('chat-box');
    if (!box) return;
    const div=document.createElement('div');
    div.className='chat-msg system';
    div.style.color='#555';
    div.textContent=text;
    box.appendChild(div);
    box.scrollTop=box.scrollHeight;
  },
};

function sendChat() { Chat.send(); }
function toggleChat() { Chat._open ? Chat.close() : Chat.open(); }
function switchTab(id) { Chat.switchTab(id); }
