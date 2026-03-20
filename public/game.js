// ============================================================
//  Urban Legends BR — game.js  (client main controller)
//
//  Controls:
//    WASD        = move
//    Mouse       = aim
//    Left click  = shoot
//    Shift       = sprint | Batman double dash
//    Space       = jump / hero ability (swing / fly)
//    Q           = Spider-Man web-zip
//    E           = pick up nearby loot
//    H           = use health pack
//    G           = use shield pack
//    R           = reload
//    T           = open chat
//    ESC         = player menu
// ============================================================

// Wait for DOM before touching any elements
let canvas, ctx;
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('gameCanvas');
  ctx    = canvas.getContext('2d');
  resizeCanvas();
  buildSkinGrid();
  _initGoldenFlash();
});

function resizeCanvas() { if(canvas){canvas.width=window.innerWidth; canvas.height=window.innerHeight;} }
window.addEventListener('resize', resizeCanvas);

// ── Game state ────────────────────────────────────────────────
const Game = {
  socket:      null,
  myId:        null,
  mode:        'ffa',
  localPlayer: null,
  remote:      {},       // id → player state from server
  serverBullets:[],      // bullet visuals from server
  loot:        [],
  zone:        {x:0,y:0,w:2400,h:1800,shrinking:false},
  camera:      {x:0,y:0},
  kills:       0,
  dead:        false,
  reloading:   false,
  nearbyLoot:  null,
  playerList:  [],
  selectedMode:'ffa',

  // Hero ability state (client-side)
  heroState: {
    hero:          null,   // 'spiderman'|'batman'|'ironman'|null
    dashCount:     2,      // Batman: dashes remaining
    dashCooldown:  0,      // ms until dashes reset
    webAnchor:     null,   // {x,y} — Spider-Man web zip target
    zipping:       false,  // currently flying toward web anchor
    flying:        false,  // Iron Man flying upward
    spaceHeld:     false,
  },
};

// ── Mode selector ─────────────────────────────────────────────
function selectMode(m) {
  Game.selectedMode = m;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('sel', b.dataset.mode===m));
}

// ── Join game ─────────────────────────────────────────────────
function joinGame() {
  const name = (document.getElementById('name-in').value||'').trim().toUpperCase() || 'PLAYER';
  const msg  = document.getElementById('connecting-msg');

  // Guard: socket.io must be loaded (requires running server)
  if (typeof io === 'undefined') {
    if (msg) msg.textContent = 'ERROR: Server not running. Deploy to Railway first.';
    console.error('socket.io not loaded — is the server running?');
    return;
  }

  if (msg) msg.textContent = 'CONNECTING...';

  const socket = io({transports:['websocket']});
  Game.socket  = socket;

  socket.on('connect', () => {
    socket.emit('join', {name, skin:selectedSkin, mode:Game.selectedMode});
  });

  socket.on('connect_error', () => {
    if (msg) msg.textContent = 'CONNECTION FAILED. RETRYING...';
  });

  // ── joined: initial game state ───────────────────────────
  socket.on('joined', (data) => {
    Game.myId  = data.playerId;
    Game.mode  = data.mode;
    Game.loot  = data.loot;
    Game.zone  = data.zone;
    MAP.walls  = data.walls;

    Game.localPlayer = {
      x:data.x, y:data.y, angle:0,
      hp:150, shield:0,
      weapon: data.weapon||'default',
      weaponName: data.weaponName||'DEFAULT GUN',
      ammo: data.ammo||30, maxAmmo: data.maxAmmo||30,
      skin: selectedSkin, name,
      speed: 3.4,
      inventory:{healthPacks:0,shieldPacks:0},
    };

    // Populate remote players (others already in session)
    Game.remote = {};
    Object.entries(data.players||{}).forEach(([id,p]) => {
      if (id !== Game.myId) Game.remote[id] = p;
    });

    Input.init();
    Chat.init(socket);
    Voice.init(socket);

    document.getElementById('title-screen').style.display  = 'none';
    document.getElementById('game-screen').style.display   = 'block';
    const badge = document.getElementById('mode-badge');
    if (badge) badge.textContent = {ffa:'FREE FOR ALL',br:'BATTLE ROYALE'}[data.mode]||data.mode.toUpperCase();

    if (msg) msg.textContent = '';
    updateHUDAll();
    requestAnimationFrame(gameLoop);
  });

  // ── state: 20-tick server broadcast ──────────────────────
  socket.on('state', (data) => {
    if (data.zone) Game.zone = data.zone;
    if (data.bullets) Game.serverBullets = data.bullets;
    if (data.players) {
      Game.remote = {};
      Object.entries(data.players).forEach(([id,p]) => {
        if (id !== Game.myId) Game.remote[id] = p;
      });
      // Sync HP/shield from server (authoritative)
      if (data.players[Game.myId] && Game.localPlayer) {
        const me = data.players[Game.myId];
        Game.localPlayer.hp     = me.hp;
        Game.localPlayer.shield = me.shield;
        if (me.hero !== undefined) syncHero(me.hero);
      }
    }
    updateHealthHUD();
  });

  // ── hit: took damage ─────────────────────────────────────
  socket.on('hit', ({hp, shield}) => {
    if (!Game.localPlayer) return;
    Game.localPlayer.hp     = Math.max(0,hp);
    Game.localPlayer.shield = Math.max(0,shield);
    updateHealthHUD();
    canvas.style.filter = 'brightness(2.5) saturate(0)';
    setTimeout(()=>{ canvas.style.filter=''; },70);
  });

  // ── ammo_update ──────────────────────────────────────────
  socket.on('ammo_update', ({ammo, maxAmmo}) => {
    if (!Game.localPlayer) return;
    Game.localPlayer.ammo    = ammo;
    Game.localPlayer.maxAmmo = maxAmmo;
    updateAmmoHUD();
  });

  // ── reload_done ──────────────────────────────────────────
  socket.on('reload_done', ({ammo, maxAmmo}) => {
    if (!Game.localPlayer) return;
    Game.localPlayer.ammo    = ammo;
    Game.localPlayer.maxAmmo = maxAmmo;
    Game.reloading = false;
    const bar = document.getElementById('reload-bar-wrap');
    if (bar) bar.style.display='none';
    updateAmmoHUD();
  });

  // ── weapon_update: picked up a new gun ───────────────────
  socket.on('weapon_update', ({weapon, ammo, maxAmmo, name}) => {
    if (!Game.localPlayer) return;
    Game.localPlayer.weapon     = weapon;
    Game.localPlayer.weaponName = name||weapon.toUpperCase();
    Game.localPlayer.ammo       = ammo;
    Game.localPlayer.maxAmmo    = maxAmmo;
    updateAmmoHUD();
    addKillFeed(`You picked up ${name||weapon.toUpperCase()}`, '#44ffcc');
  });

  // ── hero_pickup: Spider-Man / Batman / Iron Man ───────────
  socket.on('hero_pickup', ({hero, ammo, maxAmmo, weaponName}) => {
    if (!Game.localPlayer) return;
    // Drops all inventory (GDD rule)
    Game.localPlayer.inventory = {healthPacks:0, shieldPacks:0};
    Game.localPlayer.ammo      = ammo;
    Game.localPlayer.maxAmmo   = maxAmmo;
    Game.localPlayer.weaponName= weaponName||hero.toUpperCase();
    syncHero(hero);
    updateHUDAll();
    const names = {spiderman:'SPIDER-MAN',batman:'BATMAN',ironman:'IRON MAN'};
    addKillFeed(`★ You are now ${names[hero]||hero.toUpperCase()}! ★`, '#ee22ff');
    // Flash
    const fl = document.getElementById('golden-flash');
    if (fl) {fl.classList.add('active'); setTimeout(()=>fl.classList.remove('active'),600);}
  });

  // ── inventory_update ─────────────────────────────────────
  socket.on('inventory_update', (inv) => {
    if (!Game.localPlayer) return;
    Game.localPlayer.inventory = inv;
    updateInventoryHUD();
  });

  // ── loot_removed ─────────────────────────────────────────
  socket.on('loot_removed', (lootId) => {
    Game.loot = Game.loot.filter(l=>l.id!==lootId);
    Game.nearbyLoot = null;
    document.getElementById('pickup-hint').style.display='none';
  });

  // ── loot_spawn ───────────────────────────────────────────
  socket.on('loot_spawn', (item) => {
    Game.loot.push(item);
  });

  // ── player_killed ────────────────────────────────────────
  socket.on('player_killed', ({victimId, victimName, killerName}) => {
    if (victimId === Game.myId) {
      handleDeath();
    } else {
      if (Game.localPlayer && killerName === Game.localPlayer.name) {
        Game.kills++;
        document.getElementById('kill-num').textContent = Game.kills;
        const rp = Game.remote[victimId];
        if (rp) Renderer.spawnParticles(rp.x, rp.y, '#ffcc00', 14, Game.camera);
      }
    }
    addKillFeed(`${killerName} → ${victimName}`);
  });

  // ── respawned (FFA) ──────────────────────────────────────
  socket.on('respawned', ({x, y, weapon, ammo, maxAmmo, weaponName}) => {
    if (!Game.localPlayer) return;
    Game.localPlayer.x=x; Game.localPlayer.y=y;
    Game.localPlayer.hp=150; Game.localPlayer.shield=0;
    Game.localPlayer.weapon=weapon||'default';
    Game.localPlayer.weaponName=weaponName||'DEFAULT GUN';
    Game.localPlayer.ammo=ammo||30; Game.localPlayer.maxAmmo=maxAmmo||30;
    Game.localPlayer.inventory={healthPacks:0,shieldPacks:0};
    syncHero(null);
    Game.dead=false;
    document.getElementById('death-screen').style.display='none';
    updateHUDAll();
  });

  // ── announcement ─────────────────────────────────────────
  socket.on('announcement', ({text}) => {
    const el=document.getElementById('announcement');
    if (!el) return;
    el.textContent=text; el.style.opacity='1';
    setTimeout(()=>{el.style.opacity='0';},4000);
  });

  // ── player_joined / left ──────────────────────────────────
  socket.on('player_joined', ({id,name,skin,x,y}) => {
    Game.remote[id]={x,y,name,skin,hp:150,alive:true,angle:0,hero:null};
    addKillFeed(`${name} joined`,  '#888888');
  });

  socket.on('player_left', ({id, name}) => {
    delete Game.remote[id];
    addKillFeed(`${name} left`, '#555555');
  });

  // ── player_list (ESC menu) ────────────────────────────────
  socket.on('player_list', (list) => {
    Game.playerList = list;
    if (escMenuOpen) updateEscPlayerList();
  });

  // ── game_over ────────────────────────────────────────────
  socket.on('game_over', ({winner}) => {
    const el=document.getElementById('gameover-screen');
    if (!el) return;
    el.style.display='flex';
    const w=document.getElementById('gameover-winner');
    if (w) w.textContent = winner===Game.localPlayer?.name ? '🏆 YOU WIN!' : `Winner: ${winner}`;
  });
}

// ── Death handling ────────────────────────────────────────────
function handleDeath() {
  Game.dead = true;
  const scr=document.getElementById('death-screen');
  if (!scr) return;
  scr.style.display='flex';
  const msg=document.getElementById('death-msg');
  const tmr=document.getElementById('respawn-timer');
  if (Game.mode==='ffa') {
    if (msg) msg.textContent='Respawning in...';
    let t=3; if (tmr) tmr.textContent=t;
    const iv=setInterval(()=>{t--;if(tmr)tmr.textContent=t;if(t<=0){clearInterval(iv);if(tmr)tmr.textContent='';}},1000);
  } else {
    if (msg) msg.textContent='You are eliminated.';
    if (tmr) tmr.textContent='';
  }
}

function leaveGame() {
  if (Game.socket) Game.socket.disconnect();
  document.getElementById('game-screen').style.display='none';
  document.getElementById('death-screen').style.display='none';
  document.getElementById('esc-menu').style.display='none';
  document.getElementById('gameover-screen').style.display='none';
  document.getElementById('title-screen').style.display='flex';
  Game.dead=false; Game.kills=0;
}

// ── Hero sync ─────────────────────────────────────────────────
function syncHero(hero) {
  Game.heroState.hero = hero;
  Game.heroState.dashCount    = 2;
  Game.heroState.dashCooldown = 0;
  Game.heroState.webAnchor    = null;
  Game.heroState.zipping      = false;
  Game.heroState.flying       = false;
  updateHeroHUD();
}

// ── Game actions ──────────────────────────────────────────────
Game.reload = function() {
  if (!Game.socket||!Game.localPlayer||Game.reloading) return;
  const p=Game.localPlayer;
  if (p.ammo===p.maxAmmo||Game.heroState.hero) return;
  Game.reloading=true;
  Game.socket.emit('reload');
  const wrap=document.getElementById('reload-bar-wrap');
  const fill=document.getElementById('reload-bar-fill');
  const reloadMs={default:1500,shotgun:2000,bounce:1500}[p.weapon]||1500;
  if (wrap){wrap.style.display='block';}
  if (fill){fill.style.width='0%';fill.style.transition=`width ${reloadMs}ms linear`;requestAnimationFrame(()=>{fill.style.width='100%';});}
};

Game.useHealth = function() {
  if (!Game.socket) return;
  Game.socket.emit('use_health');
};

Game.useShield = function() {
  if (!Game.socket) return;
  Game.socket.emit('use_shield');
};

Game.pickupNearby = function() {
  if (!Game.nearbyLoot||!Game.socket) return;
  Game.socket.emit('pickup', {lootId:Game.nearbyLoot.id});
  Game.nearbyLoot=null;
  document.getElementById('pickup-hint').style.display='none';
};

// ── Game loop ─────────────────────────────────────────────────
let lastTime=0;
function gameLoop(ts) {
  const dt=Math.min(ts-lastTime, 50); lastTime=ts;
  if (!Game.dead) update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

// ── Client-side wall collision ────────────────────────────────
function resolveWalls(p) {
  const hw=13, hh=13;
  p.x=Math.max(hw+32,Math.min(MAP.WORLD_W-hw-32,p.x));
  p.y=Math.max(hh+32,Math.min(MAP.WORLD_H-hh-32,p.y));
  for (const w of MAP.walls) {
    if (p.x-hw<w.x+w.w && p.x+hw>w.x && p.y-hh<w.y+w.h && p.y+hh>w.y) {
      const oL=(p.x+hw)-w.x, oR=(w.x+w.w)-(p.x-hw);
      const oT=(p.y+hh)-w.y, oB=(w.y+w.h)-(p.y-hh);
      const m=Math.min(oL,oR,oT,oB);
      if (m===oL) p.x=w.x-hw;
      else if (m===oR) p.x=w.x+w.w+hw;
      else if (m===oT) p.y=w.y-hh;
      else p.y=w.y+w.h+hh;
    }
  }
}

// ── Update ────────────────────────────────────────────────────
let lastShot=0;
function update(dt) {
  if (!Game.localPlayer||!Game.socket) return;
  const p=Game.localPlayer;
  const hs=Game.heroState;
  const keys=Input.keys;

  // ─ Movement ─
  let mx=0,my=0;
  if (keys['KeyA']||keys['ArrowLeft'])  mx-=1;
  if (keys['KeyD']||keys['ArrowRight']) mx+=1;
  if (keys['KeyW']||keys['ArrowUp'])    my-=1;
  if (keys['KeyS']||keys['ArrowDown'])  my+=1;

  const len=Math.sqrt(mx*mx+my*my)||1;
  let spd=p.speed;

  // ─ Sprint (non-hero) ─
  const sprinting = (keys['ShiftLeft']||keys['ShiftRight']) && !hs.hero;
  if (sprinting && (mx||my)) spd*=1.65;

  // ─ Batman double dash ─
  if (hs.hero==='batman' && Input.justPressed('ShiftLeft','ShiftRight') && hs.dashCount>0 && (mx||my)) {
    spd*=9;
    hs.dashCount--;
    if (hs.dashCount===0) hs.dashCooldown=3000;
    Renderer.spawnParticles(p.x,p.y,'#ffdd00',8,Game.camera);
  }
  if (hs.dashCooldown>0) {
    hs.dashCooldown-=dt;
    if (hs.dashCooldown<=0) { hs.dashCooldown=0; hs.dashCount=2; }
  }
  updateHeroHUD();

  // ─ Spider-Man zip ─
  if (hs.hero==='spiderman' && hs.zipping && hs.webAnchor) {
    const ax=hs.webAnchor.x, ay=hs.webAnchor.y;
    const ddx=ax-p.x, ddy=ay-p.y, dist=Math.sqrt(ddx*ddx+ddy*ddy);
    if (dist<20) { hs.zipping=false; hs.webAnchor=null; }
    else {
      const s=Math.min(12, dist);
      p.x+=ddx/dist*s; p.y+=ddy/dist*s;
    }
    mx=0; my=0; // override movement while zipping
  }

  // ─ Iron Man fly ─
  if (hs.hero==='ironman' && keys['Space'] && (mx||my)) spd*=1.8;

  // ─ Apply movement ─
  if (!hs.zipping) {
    p.x+=(mx/len)*spd*(dt/16);
    p.y+=(my/len)*spd*(dt/16);
    resolveWalls(p);
  }

  // ─ Aim ─
  const wx=Input.mouse.x+Game.camera.x;
  const wy=Input.mouse.y+Game.camera.y;
  p.angle=Math.atan2(wy-p.y,wx-p.x);

  // ─ Shoot ─
  if (Input.mouse.down && !Input.chatFocused) {
    const now=Date.now();
    const fireRate=240; // client-side debounce (server validates actual rate)
    if (now-lastShot > fireRate && !Game.reloading) {
      lastShot=now;
      Game.socket.emit('shoot',{angle:p.angle, x:p.x, y:p.y});
    }
  }

  // ─ Spider-Man web zip — Q key fires web, Space holds to swing ─
  if (hs.hero==='spiderman' && Input.justPressed('KeyQ') && !hs.zipping) {
    hs.webAnchor={x:wx, y:wy};
    hs.zipping=true;
    Renderer.spawnParticles(wx,wy,'#ffffff',6,Game.camera);
  }

  // ─ Send position to server ─
  Game.socket.emit('move',{x:p.x, y:p.y, angle:p.angle});

  // ─ Camera ─
  Game.camera.x=Math.max(0,Math.min(MAP.WORLD_W-canvas.width,  p.x-canvas.width/2));
  Game.camera.y=Math.max(0,Math.min(MAP.WORLD_H-canvas.height, p.y-canvas.height/2));

  // ─ Nearby loot check ─
  Game.nearbyLoot=null;
  Game.loot.forEach(l=>{
    const dx=l.x-p.x,dy=l.y-p.y;
    if (Math.sqrt(dx*dx+dy*dy)<52) Game.nearbyLoot=l;
  });
  const hint=document.getElementById('pickup-hint');
  if (hint) {
    if (Game.nearbyLoot) {
      const labels={shotgun:'SHOTGUN',bounce:'BOUNCE GUN',health:'HEALTH PACK',shield:'SHIELD PACK',
                    hero:({spiderman:'SPIDER-MAN',batman:'BATMAN',ironman:'IRON MAN'}[Game.nearbyLoot.hero]||'HERO')};
      hint.style.display='block';
      hint.textContent=`[E]  Pick up  ${labels[Game.nearbyLoot.type]||Game.nearbyLoot.type.toUpperCase()}`;
    } else {
      hint.style.display='none';
    }
  }

  // ─ Zone warning ─
  const z=Game.zone;
  const outside=p.x<z.x||p.x>z.x+z.w||p.y<z.y||p.y>z.y+z.h;
  const warn=document.getElementById('zone-warn');
  if (warn) warn.style.opacity=(outside&&Game.mode==='br')?'1':'0';

  // ─ Particles ─
  Renderer.updateParticles();
  Input.clearJust();
}

// ── Draw — pseudo-3D painter's algorithm ─────────────────────
// Order: ground → south walls → loot → players (Y-sorted) →
//        building tops → zone → particles → crosshair
function draw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // 1. Ground, streets, parks, cars, south-wall depth strips
  MAP.draw(ctx,Game.camera);

  // 2. Loot (on ground, below players)
  MAP.drawLoot(ctx,Game.camera,Game.loot);

  // 3. Web-zip line (behind player)
  if (Game.heroState.hero==='spiderman' && Game.heroState.webAnchor && Game.localPlayer) {
    const p=Game.localPlayer;
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,0.65)';
    ctx.lineWidth=2;
    ctx.setLineDash([6,4]);
    ctx.beginPath();
    ctx.moveTo(p.x-Game.camera.x, p.y-Game.camera.y);
    ctx.lineTo(Game.heroState.webAnchor.x-Game.camera.x, Game.heroState.webAnchor.y-Game.camera.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 4. Bullets
  Renderer.drawBullets(ctx,Game.serverBullets,Game.camera,Game.localPlayer);

  // 5. Players + local player — Y-sorted so south players draw over north
  const allPlayers = [];
  Object.entries(Game.remote).forEach(([id,rp])=>{
    if (rp.alive) allPlayers.push({data:rp, isLocal:false});
  });
  if (Game.localPlayer && !Game.dead) {
    allPlayers.push({data:{...Game.localPlayer,hero:Game.heroState.hero}, isLocal:true});
  }
  allPlayers.sort((a,b)=>a.data.y-b.data.y);
  allPlayers.forEach(p=>Renderer.drawPlayer(ctx,p.data,p.isLocal,Game.camera));

  // 6. Building TOP faces — overlap players who are north of building
  MAP.drawBuildingTops(ctx,Game.camera);

  // 7. Zone overlay (BR only)
  if (Game.mode==='br') MAP.drawZone(ctx,Game.camera,Game.zone);

  // 8. Particles
  Renderer.drawParticles(ctx,Game.camera);

  // 9. Crosshair
  Renderer.drawCrosshair(ctx,Input.mouse.x,Input.mouse.y);
}

// ── HUD helpers ───────────────────────────────────────────────
function updateHUDAll() { updateHealthHUD(); updateAmmoHUD(); updateInventoryHUD(); updateHeroHUD(); }

function updateHealthHUD() {
  if (!Game.localPlayer) return;
  const p=Game.localPlayer;
  const hf=document.getElementById('hp-fill');
  const sf=document.getElementById('sh-fill');
  if (hf) hf.style.width=Math.max(0,p.hp/150*100)+'%';
  if (sf) sf.style.width=Math.max(0,p.shield/50*100)+'%';
}

function updateAmmoHUD() {
  if (!Game.localPlayer) return;
  const p=Game.localPlayer;
  const ac=document.getElementById('ammo-cur');
  const am=document.getElementById('ammo-max');
  const gn=document.getElementById('gun-lbl');
  const inf=p.maxAmmo===9999;
  if (ac) ac.textContent=inf?'∞':p.ammo;
  if (am) am.textContent=inf?'∞':p.maxAmmo;
  if (gn) gn.textContent=p.weaponName||p.weapon?.toUpperCase()||'DEFAULT GUN';
}

function updateInventoryHUD() {
  if (!Game.localPlayer) return;
  const inv=Game.localPlayer.inventory;
  const hp=document.getElementById('inv-hp');
  const sh=document.getElementById('inv-sh');
  if (hp) { hp.textContent='HP×'+inv.healthPacks; hp.className='inv-slot'+(inv.healthPacks>0?' filled':''); }
  if (sh) { sh.textContent=inv.shieldPacks?'SHIELD':'—';  sh.className='inv-slot'+(inv.shieldPacks>0?' filled':''); }
}

function updateHeroHUD() {
  const hs=Game.heroState;
  const el=document.getElementById('hero-hud');
  if (!el) return;
  if (!hs.hero) { el.style.display='none'; return; }
  el.style.display='block';
  const labels={spiderman:'🕷 SPIDER-MAN',batman:'🦇 BATMAN',ironman:'🚀 IRON MAN'};
  el.querySelector('#hero-name').textContent=labels[hs.hero]||hs.hero.toUpperCase();

  const ab=el.querySelector('#hero-ability');
  if (hs.hero==='batman') {
    const cd=hs.dashCooldown>0?` (${(hs.dashCooldown/1000).toFixed(1)}s)`:'';
    if (ab) ab.textContent=`SHIFT · DASH  ×${hs.dashCount}${cd}`;
  } else if (hs.hero==='spiderman') {
    if (ab) ab.textContent='Q · WEB ZIP    SPACE · SWING';
  } else if (hs.hero==='ironman') {
    if (ab) ab.textContent='SPACE · FLY    PASSIVE REGEN';
  }
}

function addKillFeed(text, color) {
  const feed=document.getElementById('kill-feed');
  if (!feed) return;
  const div=document.createElement('div');
  div.className='kf-entry';
  div.style.color=color||'#ffcc44';
  div.textContent=text;
  feed.appendChild(div);
  setTimeout(()=>div.remove(),3500);
}

// ── Golden flash div — injected after DOM ready ───────────────
function _initGoldenFlash() {
  const gf=document.createElement('div');
  gf.id='golden-flash';
  const gs=document.getElementById('game-screen');
  if (gs) gs.appendChild(gf);
}
