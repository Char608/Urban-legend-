// js/renderer.js — Player, bullet, particle rendering
// Hero bullet colors: Spider-Man=white, Batman=yellow, Iron Man=cyan
// Default skin bullets = hoodie color, cosmetic skin bullets = gray
'use strict';

const Renderer = {
  particles: [],

  spawnParticles(wx, wy, color, count, camera) {
    for (let i=0;i<count;i++) {
      const ang=Math.random()*Math.PI*2, spd=1+Math.random()*3;
      this.particles.push({
        x:wx, y:wy,
        vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
        life:20+Math.random()*20, maxLife:40,
        color, size:2+Math.random()*3,
      });
    }
  },

  updateParticles() {
    for (let i=this.particles.length-1;i>=0;i--) {
      const p=this.particles[i];
      p.x+=p.vx; p.y+=p.vy;
      p.vx*=0.88; p.vy*=0.88;
      p.life--;
      if (p.life<=0) this.particles.splice(i,1);
    }
  },

  drawParticles(ctx, camera) {
    const {x:cx,y:cy}=camera;
    this.particles.forEach(p=>{
      ctx.globalAlpha=p.life/p.maxLife;
      ctx.fillStyle=p.color;
      ctx.beginPath();
      ctx.arc(p.x-cx,p.y-cy,p.size,0,Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha=1;
  },

  // Bullet color: hero=fixed color, default skin=hoodie color, cosmetic=gray
  _bulletColor(b, localPlayer) {
    if (b.color) return b.color;
    if (b.owner===Game.myId && localPlayer) {
      const skin=SKINS[localPlayer.skin]||SKINS[0];
      // First 8 skins are "default" hoodies, rest are cosmetics → gray
      return localPlayer.skin < 8 ? skin.bullet : '#888888';
    }
    // Remote player bullets — use their skin color if known
    const rp=Game.remote[b.owner];
    if (rp) {
      const s=SKINS[rp.skin]||SKINS[0];
      return rp.skin<8?s.bullet:'#888888';
    }
    return '#cccccc';
  },

  drawBullets(ctx, bullets, camera, localPlayer) {
    const {x:cx,y:cy}=camera;
    bullets.forEach(b=>{
      const col=this._bulletColor(b,localPlayer);
      const sx=b.x-cx, sy=b.y-cy;
      ctx.save();
      ctx.fillStyle=col;
      ctx.shadowColor=col;
      ctx.shadowBlur=8;
      ctx.beginPath();
      ctx.arc(sx,sy,3,0,Math.PI*2);
      ctx.fill();
      ctx.restore();
    });
  },

  drawPlayer(ctx, player, isLocal, camera) {
    const {x:cx,y:cy}=camera;
    const sx=player.x-cx, sy=player.y-cy;
    if (sx<-50||sx>canvas.width+50||sy<-50||sy>canvas.height+50) return;

    const skin=SKINS[player.skin]||SKINS[0];
    const hero=player.hero;

    ctx.save();
    ctx.translate(sx,sy);
    ctx.rotate(player.angle+Math.PI/2);

    // Hero glow
    if (hero) {
      const glowColors={spiderman:'#cc0000',batman:'#ffdd00',ironman:'#00eeff'};
      ctx.shadowColor=glowColors[hero]||'#ffcc00';
      ctx.shadowBlur=22;
    }

    // Ground shadow
    ctx.fillStyle='rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(2,8,10,5,0,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;

    // Body
    if      (hero==='spiderman') this._drawSpiderMan(ctx);
    else if (hero==='batman')    this._drawBatman(ctx);
    else if (hero==='ironman')   this._drawIronMan(ctx);
    else                         this._drawHoodie(ctx,skin,isLocal);

    // Gun barrel (hidden for heroes — they have abilities)
    if (!hero) {
      ctx.fillStyle='#444';
      ctx.fillRect(5,-3,18,5);
    }

    ctx.restore();

    // Health bar
    const hpPct=Math.max(0,player.hp/150);
    const bw=34;
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(sx-bw/2,sy-28,bw,4);
    ctx.fillStyle=hpPct>0.5?'#44dd66':hpPct>0.25?'#ffcc00':'#ee3333';
    ctx.fillRect(sx-bw/2,sy-28,bw*hpPct,4);

    // Shield bar
    if (player.shield>0) {
      const sh=player.shield/50;
      ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(sx-bw/2,sy-34,bw,3);
      ctx.fillStyle='#4488ff';         ctx.fillRect(sx-bw/2,sy-34,bw*sh,3);
    }

    // Name tag
    ctx.font='9px monospace'; ctx.textAlign='center';
    ctx.fillStyle=isLocal?'#ffcc00':(hero?'#ffee88':'#cccccc');
    ctx.fillText(player.name,sx,sy-38);
  },

  // ── Default hoodie character ─────────────────────────────
  _drawHoodie(ctx, skin, isLocal) {
    ctx.fillStyle=skin.hoodie;
    ctx.beginPath(); ctx.roundRect(-10,-10,20,22,[10,10,5,5]); ctx.fill();
    ctx.fillStyle=skin.color;
    ctx.beginPath(); ctx.arc(0,-7,9,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#c8a07a';
    ctx.beginPath(); ctx.arc(0,-7,6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#2a2a2a';
    ctx.fillRect(-3.5,-9.5,2.5,2.5);
    ctx.fillRect(1,-9.5,2.5,2.5);
  },

  // ── Spider-Man ──────────────────────────────────────────
  _drawSpiderMan(ctx) {
    // Red body suit
    ctx.fillStyle='#cc0000';
    ctx.beginPath(); ctx.roundRect(-11,-12,22,24,8); ctx.fill();
    // Blue panels
    ctx.fillStyle='#000099';
    ctx.fillRect(-8,-6,8,14);
    ctx.fillRect(2,-6,8,14);
    // Web lines on body
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=0.8;
    for (let i=-8;i<=8;i+=4){ctx.beginPath();ctx.moveTo(i,-12);ctx.lineTo(i,12);ctx.stroke();}
    // Mask
    ctx.fillStyle='#cc0000';
    ctx.beginPath(); ctx.arc(0,-8,9,0,Math.PI*2); ctx.fill();
    // Spider eyes (white oval lenses)
    ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.ellipse(-3,-9,4,2.5,-0.3,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3,-9,4,2.5,0.3,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#cc0000'; ctx.lineWidth=0.6;
    ctx.beginPath(); ctx.ellipse(-3,-9,4,2.5,-0.3,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(3,-9,4,2.5,0.3,0,Math.PI*2); ctx.stroke();
  },

  // ── Batman ──────────────────────────────────────────────
  _drawBatman(ctx) {
    // Dark body
    ctx.fillStyle='#1a1a1a';
    ctx.beginPath(); ctx.roundRect(-11,-10,22,22,4); ctx.fill();
    // Armor plates
    ctx.fillStyle='#2a2a2a';
    ctx.fillRect(-8,-4,8,10); ctx.fillRect(2,-4,8,10);
    // Bat symbol on chest
    ctx.fillStyle='#ffdd00';
    ctx.beginPath();
    ctx.ellipse(0,2,6,3,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1a1a1a';
    ctx.beginPath(); ctx.ellipse(0,2,3,2,0,0,Math.PI*2); ctx.fill();
    // Cowl (dark with bat ears)
    ctx.fillStyle='#111111';
    ctx.beginPath(); ctx.arc(0,-8,9,0,Math.PI*2); ctx.fill();
    // Bat ears
    ctx.fillStyle='#111111';
    ctx.beginPath(); ctx.moveTo(-7,-14); ctx.lineTo(-10,-20); ctx.lineTo(-4,-14); ctx.fill();
    ctx.beginPath(); ctx.moveTo(7,-14);  ctx.lineTo(10,-20);  ctx.lineTo(4,-14);  ctx.fill();
    // White lens eyes
    ctx.fillStyle='rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.ellipse(-3,-9,3,1.5,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3,-9,3,1.5,0,0,Math.PI*2); ctx.fill();
  },

  // ── Iron Man ────────────────────────────────────────────
  _drawIronMan(ctx) {
    // Red armored suit
    ctx.fillStyle='#aa0000';
    ctx.beginPath(); ctx.roundRect(-11,-12,22,24,5); ctx.fill();
    // Gold chest plate
    ctx.fillStyle='#cc8800';
    ctx.beginPath(); ctx.roundRect(-7,-5,14,12,3); ctx.fill();
    // Arc reactor glow
    ctx.fillStyle='#00eeff';
    ctx.beginPath(); ctx.arc(0,1,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(0,238,255,0.3)';
    ctx.beginPath(); ctx.arc(0,1,8,0,Math.PI*2); ctx.fill();
    // Helmet
    ctx.fillStyle='#990000';
    ctx.beginPath(); ctx.roundRect(-9,-18,18,12,4); ctx.fill();
    // Visor
    ctx.fillStyle='#00eeff';
    ctx.fillRect(-6,-16,12,5);
    ctx.fillStyle='rgba(0,238,255,0.25)';
    ctx.beginPath(); ctx.arc(0,-11,11,0,Math.PI*2); ctx.fill();
  },

  drawCrosshair(ctx, mx, my) {
    const size=10, gap=4;
    ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(mx-size-gap,my); ctx.lineTo(mx-gap,my);
    ctx.moveTo(mx+gap,my);      ctx.lineTo(mx+size+gap,my);
    ctx.moveTo(mx,my-size-gap); ctx.lineTo(mx,my-gap);
    ctx.moveTo(mx,my+gap);      ctx.lineTo(mx,my+size+gap);
    ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.arc(mx,my,5,0,Math.PI*2); ctx.stroke();
  },
};
