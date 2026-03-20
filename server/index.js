'use strict';
// ============================================================
//  Urban Legends BR — Server (index.js)
//
//  EVENT CONTRACT
//  client → server:  join, move, shoot, reload, pickup,
//                    use_health, use_shield, chat, dm,
//                    player_list_request,
//                    voice_offer, voice_answer, voice_ice
//  server → client:  joined, state, hit, ammo_update,
//                    reload_done, inventory_update, hero_pickup,
//                    weapon_update, loot_removed, loot_spawn,
//                    player_killed, player_damaged, respawned,
//                    announcement, player_joined, player_left,
//                    player_list, game_over,
//                    chat, dm,
//                    voice_offer, voice_answer, voice_ice
// ============================================================

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors:{origin:'*'}, pingInterval:2000, pingTimeout:5000 });

app.use(express.static(path.join(__dirname,'../public')));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Urban Legends BR on :${PORT}`));

// ── Constants ─────────────────────────────────────────────────
const WORLD_W = 2400, WORLD_H = 1800;
const TICK_MS = 50;   // 20 ticks/sec
const P_RAD   = 13;   // player collision radius

// ── Weapon stats (GDD-final) ─────────────────────────────────
const WEAPONS = {
  default: { name:'DEFAULT GUN',  dmg:23,  ammo:30,   maxAmmo:30,  reload:1500, fireRate:150, pellets:1, spread:0.04, spd:14, bounces:0 },
  shotgun: { name:'SHOTGUN',      dmg:14,  ammo:5,    maxAmmo:5,   reload:2000, fireRate:900, pellets:7, spread:0.28, spd:12, bounces:0 },
  bounce:  { name:'BOUNCE GUN',   dmg:20,  ammo:15,   maxAmmo:15,  reload:1500, fireRate:300, pellets:1, spread:0.01, spd:11, bounces:3 },
};

// ── Hero primary weapon stats ─────────────────────────────────
const HERO_W = {
  spiderman: { name:'WEB SHOT',    dmg:15, ammo:10,   maxAmmo:10,   fireRate:420, pellets:1, spread:0.02, spd:13, bounces:0 },
  batman:    { name:'BATARANGS',   dmg:12, ammo:9,    maxAmmo:9,    fireRate:180, pellets:1, spread:0.06, spd:12, bounces:0 },
  ironman:   { name:'PLASMA BEAM', dmg:12, ammo:9999, maxAmmo:9999, fireRate:75,  pellets:1, spread:0.0,  spd:16, bounces:0 },
};

// ── Map builder ───────────────────────────────────────────────
function buildMap() {
  const walls = [];
  const buildings = [
    {x:120,y:120,w:300,h:200},{x:550,y:80,w:240,h:180},
    {x:900,y:100,w:200,h:250},{x:1200,y:80,w:300,h:200},
    {x:1600,y:120,w:280,h:220},{x:100,y:450,w:220,h:280},
    {x:420,y:500,w:260,h:240},{x:800,y:420,w:180,h:200},
    {x:1050,y:480,w:250,h:300},{x:1400,y:440,w:200,h:260},
    {x:1700,y:400,w:350,h:280},{x:120,y:900,w:300,h:200},
    {x:550,y:850,w:280,h:250},{x:900,y:880,w:220,h:220},
    {x:1200,y:820,w:300,h:260},{x:1600,y:860,w:280,h:200},
    {x:200,y:1250,w:260,h:200},{x:600,y:1200,w:300,h:280},
    {x:1000,y:1300,w:240,h:220},{x:1300,y:1200,w:350,h:280},
    {x:1750,y:1250,w:280,h:200},
  ];
  const add = (x,y,w,h) => walls.push({x,y,w,h});

  // World border
  add(0,0,WORLD_W,30); add(0,WORLD_H-30,WORLD_W,30);
  add(0,0,30,WORLD_H); add(WORLD_W-30,0,30,WORLD_H);

  // Building hollow walls WITH doorways so players can enter and find loot.
  // South wall has a centred door. Wide buildings (>=240px) also get an east door.
  const T  = 22;  // wall thickness
  const DW = 52;  // door opening width (player radius 13, needs clear gap)
  buildings.forEach(b => {
    const midX = b.x + Math.floor(b.w / 2);
    const midY = b.y + Math.floor(b.h / 2);
    const dxL  = midX - Math.floor(DW / 2);
    const dyT  = midY - Math.floor(DW / 2);
    // North wall solid
    add(b.x, b.y, b.w, T);
    // South wall with centred door
    add(b.x,    b.y+b.h-T, dxL - b.x,        T);
    add(dxL+DW, b.y+b.h-T, b.x+b.w-(dxL+DW), T);
    // West wall solid
    add(b.x, b.y, T, b.h);
    // East wall: door at mid for wide buildings
    if (b.w >= 240) {
      add(b.x+b.w-T, b.y,    T, dyT - b.y);
      add(b.x+b.w-T, dyT+DW, T, b.y+b.h-(dyT+DW));
    } else {
      add(b.x+b.w-T, b.y, T, b.h);
    }
  });

  // Alley cover / obstacles
  [{x:470,y:200,w:20,h:80},{x:780,y:300,w:80,h:20},
   {x:1150,y:320,w:20,h:80},{x:1380,y:200,w:80,h:20},
   {x:350,y:700,w:20,h:100},{x:760,y:650,w:100,h:20},
   {x:1250,y:750,w:20,h:80},{x:1570,y:700,w:80,h:20}
  ].forEach(c => add(c.x,c.y,c.w,c.h));

  return { walls, buildings };
}

function hitsWall(x,y,walls) {
  return walls.some(w => x-P_RAD<w.x+w.w && x+P_RAD>w.x && y-P_RAD<w.y+w.h && y+P_RAD>w.y);
}

function safeSpawn(walls) {
  for (let i=0;i<400;i++) {
    const x=80+Math.random()*(WORLD_W-160), y=80+Math.random()*(WORLD_H-160);
    if (!hitsWall(x,y,walls)) return {x,y};
  }
  return {x:300,y:300};
}

// ── Loot generator ────────────────────────────────────────────
function genLoot(walls, buildings) {
  const items = [];

  buildings.forEach(b => {
    const count = 2 + Math.floor(Math.random()*3);
    for (let i=0;i<count;i++) {
      const x = b.x+35+Math.random()*(b.w-70);
      const y = b.y+35+Math.random()*(b.h-70);
      const r = Math.random();
      let type;
      if      (r<0.30) type='shotgun';
      else if (r<0.55) type='bounce';
      else if (r<0.78) type='health';
      else             type='shield';
      items.push({id:uuidv4(),x,y,type});
    }
  });

  // Hero mythics — rare, 1-2 per match
  const spots = [
    {x:270,y:220},{x:670,y:170},{x:1000,y:200},
    {x:1350,y:180},{x:1740,y:220},{x:310,y:600},{x:1825,y:540},
  ].sort(()=>Math.random()-0.5);
  const heroTypes = ['spiderman','batman','ironman'];
  const n = 1+Math.floor(Math.random()*2);
  spots.slice(0,n).forEach((s,i) => {
    items.push({id:uuidv4(),x:s.x,y:s.y,type:'hero',hero:heroTypes[i%3]});
  });

  return items;
}

// ── Sessions ──────────────────────────────────────────────────
const sessions = {};

function findOrCreate(mode) {
  const maxP = mode==='br'?20:16;
  for (const sid in sessions) {
    const s=sessions[sid];
    if (s.mode===mode && s.phase!=='ended' && Object.keys(s.players).length<maxP) return s;
  }
  const {walls,buildings} = buildMap();
  const id = uuidv4();
  const s = {
    id,mode,players:{},bullets:{},
    loot:genLoot(walls,buildings),
    walls,buildings,
    zone:{x:0,y:0,w:WORLD_W,h:WORLD_H,shrinking:false},
    zoneTimer:90000,phase:'waiting',interval:null,
  };
  sessions[id]=s;
  return s;
}

function startTick(session) {
  if (session.interval) return;
  session.phase='active';
  session.interval=setInterval(()=>{
    if (session.phase==='ended'||Object.keys(session.players).length===0) {
      clearInterval(session.interval);
      setTimeout(()=>delete sessions[session.id],30000);
      return;
    }
    tick(session);
  },TICK_MS);
}

// ── Tick ──────────────────────────────────────────────────────
function tick(session) {
  const now=Date.now();

  // Zone (BR only)
  if (session.mode==='br') {
    session.zoneTimer-=TICK_MS;
    if (session.zoneTimer<=0 && !session.zone.shrinking) {
      session.zone.shrinking=true;
      io.to(session.id).emit('announcement',{text:'⚠  THE ZONE IS CLOSING  ⚠'});
    }
    if (session.zone.shrinking) {
      const r=0.28;
      session.zone.x+=r; session.zone.y+=r;
      session.zone.w=Math.max(300,session.zone.w-r*2);
      session.zone.h=Math.max(300,session.zone.h-r*2);
    }
    Object.values(session.players).forEach(p=>{
      if (!p.alive) return;
      const z=session.zone;
      if (p.x<z.x||p.x>z.x+z.w||p.y<z.y||p.y>z.y+z.h) {
        const dps=session.zone.shrinking?10:5;
        applyDmg(session,p,dps*(TICK_MS/1000),null,'THE ZONE');
      }
    });
  }

  // Iron Man passive regen
  Object.values(session.players).forEach(p=>{
    if (!p.alive||p.hero!=='ironman') return;
    if (now-p.lastHit>2000 && p.hp<150) {
      p.hp=Math.min(150,p.hp+2*(TICK_MS/1000));
      io.to(p.id).emit('hit',{hp:p.hp,shield:p.shield});
    }
  });

  // Bullets
  const rm=[];
  Object.values(session.bullets).forEach(b=>{
    b.x+=b.vx; b.y+=b.vy; b.life--;
    if (b.life<=0||b.x<0||b.x>WORLD_W||b.y<0||b.y>WORLD_H){rm.push(b.id);return;}
    let wallHit=false;
    for (const w of session.walls) {
      if (b.x>w.x&&b.x<w.x+w.w&&b.y>w.y&&b.y<w.y+w.h) {
        if (b.bounces>0) {
          const cx=b.x-(b.x>w.x+w.w/2?w.x+w.w:w.x);
          const cy=b.y-(b.y>w.y+w.h/2?w.y+w.h:w.y);
          if (Math.abs(cx)<Math.abs(cy)) b.vx*=-1; else b.vy*=-1;
          b.bounces--; b.dmg=Math.max(1,Math.round(b.dmg*0.65));
        } else wallHit=true;
        break;
      }
    }
    if (wallHit){rm.push(b.id);return;}
    Object.values(session.players).forEach(p=>{
      if (!p.alive||p.id===b.owner) return;
      const dx=b.x-p.x,dy=b.y-p.y;
      if (Math.sqrt(dx*dx+dy*dy)<15){rm.push(b.id);applyDmg(session,p,b.dmg,b.owner);}
    });
  });
  rm.forEach(id=>delete session.bullets[id]);

  // Broadcast state
  const pSt={};
  Object.values(session.players).forEach(p=>{
    pSt[p.id]={x:p.x,y:p.y,angle:p.angle,alive:p.alive,hp:p.hp,shield:p.shield,name:p.name,skin:p.skin,hero:p.hero};
  });
  io.to(session.id).emit('state',{players:pSt,bullets:Object.values(session.bullets),zone:session.zone});

  // BR win check
  if (session.mode==='br') {
    const alive=Object.values(session.players).filter(p=>p.alive);
    if (alive.length<=1&&Object.keys(session.players).length>1){
      io.to(session.id).emit('game_over',{winner:alive[0]?.name||'Nobody'});
      session.phase='ended';
    }
  }
}

function applyDmg(session, player, dmg, killerId, killerLabel) {
  if (!player.alive) return;
  player.lastHit=Date.now();
  let rem=dmg;
  if (player.shield>0){const s=Math.min(player.shield,rem);player.shield-=s;rem-=s;}
  player.hp=Math.max(0,player.hp-rem);
  io.to(player.id).emit('hit',{hp:player.hp,shield:player.shield});
  io.to(session.id).emit('player_damaged',{id:player.id,hp:player.hp,shield:player.shield});
  if (player.hp<=0){
    player.alive=false;
    const kName=killerLabel||(killerId&&session.players[killerId]?session.players[killerId].name:'Unknown');
    io.to(session.id).emit('player_killed',{victimId:player.id,victimName:player.name,killerName:kName});
    if (session.mode!=='br'){
      setTimeout(()=>{
        if (!session.players[player.id]) return;
        const sp=safeSpawn(session.walls);
        Object.assign(player,{x:sp.x,y:sp.y,hp:150,shield:0,alive:true,hero:null,weapon:'default',
          ammo:WEAPONS.default.maxAmmo,inventory:{healthPacks:0,shieldPacks:0}});
        io.to(player.id).emit('respawned',{x:sp.x,y:sp.y,weapon:'default',ammo:player.ammo,maxAmmo:WEAPONS.default.maxAmmo,weaponName:'DEFAULT GUN'});
      },3000);
    }
  }
}

// ── Socket handlers ───────────────────────────────────────────
io.on('connection',socket=>{
  let session=null;
  const pid=socket.id;

  socket.on('join',({name,skin,mode})=>{
    session=findOrCreate(mode||'ffa');
    const sp=safeSpawn(session.walls);
    const p={
      id:pid,name:(name||'PLAYER').slice(0,12).toUpperCase(),
      skin:skin||0,x:sp.x,y:sp.y,angle:0,
      hp:150,shield:0,alive:true,
      weapon:'default',hero:null,
      ammo:WEAPONS.default.maxAmmo,
      inventory:{healthPacks:0,shieldPacks:0},
      lastShot:0,reloading:false,lastHit:0,
    };
    session.players[pid]=p;
    socket.join(session.id);
    startTick(session);

    const others={};
    Object.entries(session.players).forEach(([k,v])=>{
      others[k]={x:v.x,y:v.y,name:v.name,skin:v.skin,hp:v.hp,alive:v.alive,hero:v.hero,angle:v.angle};
    });

    socket.emit('joined',{
      playerId:pid,sessionId:session.id,mode:session.mode,
      x:sp.x,y:sp.y,
      weapon:'default',ammo:p.ammo,maxAmmo:WEAPONS.default.maxAmmo,weaponName:WEAPONS.default.name,
      loot:session.loot,walls:session.walls,zone:session.zone,players:others,
    });
    socket.to(session.id).emit('player_joined',{id:pid,name:p.name,skin:p.skin,x:sp.x,y:sp.y});
  });

  socket.on('move',({x,y,angle})=>{
    if (!session) return;
    const p=session.players[pid]; if (!p||!p.alive) return;
    p.x=Math.max(35,Math.min(WORLD_W-35,x));
    p.y=Math.max(35,Math.min(WORLD_H-35,y));
    p.angle=angle;
  });

  socket.on('shoot',({angle,x,y})=>{
    if (!session) return;
    const p=session.players[pid]; if (!p||!p.alive) return;
    const now=Date.now();
    const wDef=p.hero?HERO_W[p.hero]:(WEAPONS[p.weapon]||WEAPONS.default);
    if (now-p.lastShot<wDef.fireRate) return;
    if (wDef.maxAmmo!==9999&&p.ammo<=0) return;
    p.lastShot=now;
    if (wDef.maxAmmo!==9999) p.ammo=Math.max(0,p.ammo-1);

    const heroColor={spiderman:'#ffffff',batman:'#ffdd00',ironman:'#00eeff'};
    const bColor=p.hero?heroColor[p.hero]:null;

    for (let i=0;i<(wDef.pellets||1);i++){
      const ang=angle+(Math.random()-0.5)*wDef.spread+(wDef.pellets>1?(i-wDef.pellets/2)*0.12:0);
      const b={id:uuidv4(),x:x+Math.cos(ang)*20,y:y+Math.sin(ang)*20,
        vx:Math.cos(ang)*wDef.spd,vy:Math.sin(ang)*wDef.spd,
        dmg:wDef.dmg,bounces:wDef.bounces||0,
        owner:pid,life:110,color:bColor,weapon:p.hero||p.weapon};
      session.bullets[b.id]=b;
    }
    socket.emit('ammo_update',{ammo:p.ammo,maxAmmo:wDef.maxAmmo});
  });

  socket.on('reload',()=>{
    if (!session) return;
    const p=session.players[pid]; if (!p||!p.alive||p.hero||p.reloading) return;
    const wDef=WEAPONS[p.weapon]||WEAPONS.default;
    if (p.ammo>=wDef.maxAmmo) return;
    p.reloading=true;
    setTimeout(()=>{
      if (!session.players[pid]) return;
      p.ammo=wDef.maxAmmo; p.reloading=false;
      socket.emit('reload_done',{ammo:wDef.maxAmmo,maxAmmo:wDef.maxAmmo});
    },wDef.reload);
  });

  socket.on('pickup',({lootId})=>{
    if (!session) return;
    const p=session.players[pid]; if (!p||!p.alive) return;
    const idx=session.loot.findIndex(l=>l.id===lootId);
    if (idx<0) return;
    const loot=session.loot[idx];
    const dx=loot.x-p.x,dy=loot.y-p.y;
    if (Math.sqrt(dx*dx+dy*dy)>58) return;
    session.loot.splice(idx,1);
    io.to(session.id).emit('loot_removed',lootId);

    if (loot.type==='hero') {
      // Hero pickup: DROPS all inventory
      p.hero=loot.hero; p.inventory={healthPacks:0,shieldPacks:0};
      p.ammo=HERO_W[loot.hero].maxAmmo;
      socket.emit('hero_pickup',{hero:loot.hero,ammo:p.ammo,maxAmmo:HERO_W[loot.hero].maxAmmo,weaponName:HERO_W[loot.hero].name});
    } else if (loot.type==='shotgun'||loot.type==='bounce') {
      if (!p.hero){
        p.weapon=loot.type; p.ammo=WEAPONS[loot.type].maxAmmo; p.reloading=false;
        socket.emit('weapon_update',{weapon:loot.type,ammo:p.ammo,maxAmmo:WEAPONS[loot.type].maxAmmo,name:WEAPONS[loot.type].name});
      }
    } else if (loot.type==='health') {
      if (p.inventory.healthPacks<3){p.inventory.healthPacks++;socket.emit('inventory_update',p.inventory);}
    } else if (loot.type==='shield') {
      if (p.inventory.shieldPacks<1){p.inventory.shieldPacks++;socket.emit('inventory_update',p.inventory);}
    }

    setTimeout(()=>{
      if (session&&session.phase!=='ended'){const nl={...loot,id:uuidv4()};session.loot.push(nl);io.to(session.id).emit('loot_spawn',nl);}
    },25000);
  });

  socket.on('use_health',()=>{
    if (!session) return;
    const p=session.players[pid]; if (!p||!p.alive) return;
    if (p.inventory.healthPacks<=0||p.hp>=150) return;
    p.inventory.healthPacks--; p.hp=Math.min(150,p.hp+50);
    socket.emit('hit',{hp:p.hp,shield:p.shield});
    socket.emit('inventory_update',p.inventory);
  });

  socket.on('use_shield',()=>{
    if (!session) return;
    const p=session.players[pid]; if (!p||!p.alive) return;
    if (p.inventory.shieldPacks<=0||p.shield>=50) return;
    p.inventory.shieldPacks--; p.shield=50;
    socket.emit('hit',{hp:p.hp,shield:p.shield});
    socket.emit('inventory_update',p.inventory);
  });

  socket.on('chat',({message})=>{
    if (!session) return;
    const p=session.players[pid]; if (!p) return;
    io.to(session.id).emit('chat',{from:p.name,fromId:pid,message:message.slice(0,200)});
  });

  socket.on('dm',({toId,message})=>{
    if (!session) return;
    const p=session.players[pid]; if (!p) return;
    const msg={from:p.name,fromId:pid,toId,message:message.slice(0,200)};
    socket.emit('dm',msg); io.to(toId).emit('dm',msg);
  });

  socket.on('player_list_request',()=>{
    if (!session) return;
    socket.emit('player_list',Object.values(session.players).map(p=>({id:p.id,name:p.name,alive:p.alive,hp:p.hp,skin:p.skin})));
  });

  // WebRTC relay
  socket.on('voice_offer',  ({toId,offer})     =>io.to(toId).emit('voice_offer',  {fromId:pid,offer}));
  socket.on('voice_answer', ({toId,answer})    =>io.to(toId).emit('voice_answer', {fromId:pid,answer}));
  socket.on('voice_ice',    ({toId,candidate}) =>io.to(toId).emit('voice_ice',    {fromId:pid,candidate}));

  socket.on('disconnect',()=>{
    if (!session) return;
    const p=session.players[pid];
    if (p){socket.to(session.id).emit('player_left',{id:pid,name:p.name});delete session.players[pid];}
  });
});
