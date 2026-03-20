// js/input.js — Keyboard + mouse state
// Tracks current keys, justPressed (single-frame), and mouse position/click
'use strict';

const Input = {
  keys:    {},
  justKeys:{},  // single-frame press flags
  mouse:   {x:0,y:0,down:false},
  chatFocused: false,

  init() {
    document.addEventListener('keydown', e => this._onKeyDown(e));
    document.addEventListener('keyup',   e => { this.keys[e.code]=false; });
    const c=document.getElementById('gameCanvas');
    c.addEventListener('mousemove', e => {
      const r=c.getBoundingClientRect();
      this.mouse.x=e.clientX-r.left;
      this.mouse.y=e.clientY-r.top;
    });
    c.addEventListener('mousedown', () => { this.mouse.down=true;  });
    c.addEventListener('mouseup',   () => { this.mouse.down=false; });
    c.addEventListener('contextmenu', e => e.preventDefault());
  },

  _onKeyDown(e) {
    if (!this.keys[e.code]) this.justKeys[e.code]=true; // only on first press
    this.keys[e.code]=true;

    // Chat
    if (e.code==='KeyT' && !this.chatFocused) { e.preventDefault(); Chat.open(); return; }
    if (e.code==='Enter' && this.chatFocused)  { Chat.send(); return; }
    if (e.code==='Escape') {
      e.preventDefault();
      this.chatFocused ? Chat.close() : toggleEscMenu();
      return;
    }
    if (this.chatFocused) return;

    // Game hotkeys
    if (e.code==='KeyR') Game.reload();
    if (e.code==='KeyE') Game.pickupNearby();   // E = pick up
    if (e.code==='KeyH') Game.useHealth();
    if (e.code==='KeyG') Game.useShield();
    // Q, Space, Shift handled per-frame in game.js update loop
  },

  // Returns true if ANY of the given key codes were just pressed this frame
  justPressed(...codes) {
    return codes.some(c => this.justKeys[c]);
  },

  // Called once per frame AFTER all update logic consumes justKeys
  clearJust() {
    this.justKeys = {};
  },
};

// ── ESC Menu ──────────────────────────────────────────────────
let escMenuOpen=false;

function toggleEscMenu() {
  escMenuOpen=!escMenuOpen;
  const menu=document.getElementById('esc-menu');
  menu.style.display=escMenuOpen?'flex':'none';
  if (escMenuOpen) {
    updateEscPlayerList();
    if (Game.socket) Game.socket.emit('player_list_request');
  }
}

function closeEscMenu() {
  escMenuOpen=false;
  document.getElementById('esc-menu').style.display='none';
}

function updateEscPlayerList() {
  const list=document.getElementById('esc-player-list');
  if (!list) return;
  list.innerHTML='';
  (Game.playerList||[]).forEach(p=>{
    const row=document.createElement('div');
    row.className='esc-player';
    const isYou=p.id===Game.myId;
    const skin=SKINS[p.skin]||SKINS[0];
    row.innerHTML=`
      <div style="width:12px;height:12px;border-radius:50%;background:${skin.color};flex-shrink:0"></div>
      <span class="esc-pname${isYou?' you':''}">${p.name}${isYou?' (YOU)':''}</span>
      ${!isYou?`
        <button class="esc-btn" onclick="Voice.toggleMutePeer('${p.id}',this)">MUTE</button>
        <button class="esc-btn" onclick="Chat.openDM('${p.id}','${p.name}');closeEscMenu()">DM</button>
      `:''}
    `;
    list.appendChild(row);
  });
}
