'use strict';
// ============================================================
//  map.js — Urban Legends BR  "LA City" Map
//
//  Rendering follows the pseudo-3D painter's algorithm from GDD:
//    1. Ground  (asphalt, sidewalks, grass, parks)
//    2. Street props (cars, dumpsters, fire hydrants)
//    3. Building south-wall depth strips (fake 3-D shadow)
//    4. Loot items
//    5. Bullets  (called from game.js)
//    6. Players  (sorted by Y, called from game.js)
//    7. Building TOP faces (overlap entities south of building)
//    8. Zone overlay
//    9. Screen-space UI  (called from game.js)
//
//  Collision walls are sent from the server — MAP.walls is
//  populated in game.js on the 'joined' event.
// ============================================================

const MAP = {
  WORLD_W: 2400,
  WORLD_H: 1800,
  walls: [],   // set by server

  // ── Color palette (LA vibe) ───────────────────────────────
  C: {
    asphalt:      '#1e1e18',
    asphalt2:     '#252520',
    sidewalk:     '#3a3830',
    sidewalk2:    '#46443a',
    lane_line:    'rgba(200,180,80,0.18)',
    curb:         '#2e2c26',
    grass:        '#2a3d1a',
    grass2:       '#243318',
    park:         '#1e3414',
    park_path:    '#3a3428',
    lot:          '#2a2820',
    lot_line:     'rgba(255,255,255,0.07)',
    shadow:       'rgba(0,0,0,0.55)',
    // building wall (south face — fake depth)
    wall_hi:      '#1a1a14',
    wall_lo:      '#141410',
  },

  // ── Building definitions (matches server layout exactly) ──
  // type drives visual style, name drives sign text
  BUILDINGS: [
    {x:120, y:120, w:300,h:200, type:'highrise',  label:'SUNSET TOWER',   wallH:28, roofCol:'#7a90b8', faceCol:'#556070', accent:'#88aadd'},
    {x:550, y:80,  w:240,h:180, type:'office',    label:'PACIFIC PLAZA',  wallH:22, roofCol:'#6a8090', faceCol:'#486070', accent:'#66aacc'},
    {x:900, y:100, w:200,h:250, type:'highrise',  label:'VEGA HEIGHTS',   wallH:32, roofCol:'#6080a0', faceCol:'#405568', accent:'#7799bb'},
    {x:1200,y:80,  w:300,h:200, type:'mall',      label:'LEGENDS MALL',   wallH:18, roofCol:'#a08855', faceCol:'#806840', accent:'#cc9944'},
    {x:1600,y:120, w:280,h:220, type:'hotel',     label:'PALM ROYALE',    wallH:24, roofCol:'#b09060', faceCol:'#907050', accent:'#ddaa55'},
    {x:100, y:450, w:220,h:280, type:'apartment', label:'GROVE APTS',     wallH:20, roofCol:'#907055', faceCol:'#705540', accent:'#aa8855'},
    {x:420, y:500, w:260,h:240, type:'shop',      label:'BODEGA ROW',     wallH:16, roofCol:'#907848', faceCol:'#705838', accent:'#bb9944'},
    {x:800, y:420, w:180,h:200, type:'shop',      label:'PAWN SHOP',      wallH:14, roofCol:'#808858', faceCol:'#606644', accent:'#aaaa55'},
    {x:1050,y:480, w:250,h:300, type:'office',    label:'MERIDIAN BLDG',  wallH:26, roofCol:'#5878a0', faceCol:'#405570', accent:'#6699cc'},
    {x:1400,y:440, w:200,h:260, type:'apartment', label:'SANTOS APTS',    wallH:18, roofCol:'#a07040', faceCol:'#805530', accent:'#cc8833'},
    {x:1700,y:400, w:350,h:280, type:'warehouse', label:'EASTSIDE DEPOT', wallH:20, roofCol:'#686058', faceCol:'#504840', accent:'#887766'},
    {x:120, y:900, w:300,h:200, type:'shop',      label:'WESTSIDE MKT',   wallH:14, roofCol:'#a07838', faceCol:'#7a5828', accent:'#cc9933'},
    {x:550, y:850, w:280,h:250, type:'office',    label:'HARBOR VIEW',    wallH:22, roofCol:'#607888', faceCol:'#486070', accent:'#5599aa'},
    {x:900, y:880, w:220,h:220, type:'apartment', label:'OCEAN FLATS',    wallH:18, roofCol:'#907868', faceCol:'#706050', accent:'#aa9966'},
    {x:1200,y:820, w:300,h:260, type:'mall',      label:'EASTGATE CTR',   wallH:20, roofCol:'#887888', faceCol:'#685870', accent:'#aa88aa'},
    {x:1600,y:860, w:280,h:200, type:'warehouse', label:'CHROME STORAGE', wallH:16, roofCol:'#707868', faceCol:'#586050', accent:'#889966'},
    {x:200, y:1250,w:260,h:200, type:'apartment', label:'CRENSHAW APTS',  wallH:16, roofCol:'#9a7048', faceCol:'#785538', accent:'#bb8833'},
    {x:600, y:1200,w:300,h:280, type:'shop',      label:'SOUTHSIDE MKT',  wallH:14, roofCol:'#a07840', faceCol:'#7a5830', accent:'#cc9933'},
    {x:1000,y:1300,w:240,h:220, type:'warehouse', label:'HARBOR FREIGHT', wallH:18, roofCol:'#706860', faceCol:'#585048', accent:'#887766'},
    {x:1300,y:1200,w:350,h:280, type:'mall',      label:'SOUTH PLAZA',    wallH:20, roofCol:'#888098', faceCol:'#686078', accent:'#aa88cc'},
    {x:1750,y:1250,w:280,h:200, type:'office',    label:'APEX TOWER',     wallH:26, roofCol:'#587098', faceCol:'#405878', accent:'#5588cc'},
  ],

  // ── Parks ─────────────────────────────────────────────────
  PARKS: [
    {x:440, y:120, w:90,  h:210, name:'PLAZA'},
    {x:1460,y:700, w:200, h:100, name:'GROVE PARK'},
    {x:820, y:1130,w:155, h:95,  name:'POCKET PARK'},
    {x:1600,y:1120,w:115, h:95,  name:'EAST GREEN'},
  ],

  // ── Parking lots ──────────────────────────────────────────
  LOTS: [
    {x:430, y:356, w:260,h:74},
    {x:820, y:648, w:180,h:62},
    {x:1450,y:356, w:240,h:74},
    {x:1060,y:748, w:200,h:62},
    {x:230, y:1132,w:280,h:72},
    {x:1320,y:1132,w:240,h:62},
  ],

  // ── Palm trees ────────────────────────────────────────────
  PALMS: [
    // Sunset Blvd (y≈350 street edge)
    {x:80},{x:210},{x:460},{x:610},{x:810},{x:1010},{x:1190},{x:1380},{x:1600},{x:1800},{x:2000},{x:2200},
    // Olympic (y≈730)
    {x:150},{x:400},{x:670},{x:900},{x:1100},{x:1300},{x:1500},{x:1700},{x:1950},{x:2150},
    // Pico (y≈1100)
    {x:100},{x:380},{x:700},{x:970},{x:1140},{x:1360},{x:1580},{x:1900},{x:2100},{x:2300},
  ],

  // street Y positions for palm placement
  STREET_Y: [350, 730, 1100, 1470],

  // ── Pre-seeded random cars ────────────────────────────────
  // Parked along street edges (purely visual)
  CARS: null, // built once on first draw

  _buildCars() {
    const rng = (seed) => { let x=seed; return ()=>{x=(x*1664525+1013904223)&0xffffffff;return(x>>>0)/0xffffffff;}; };
    const r = rng(42);
    const cars = [];
    const carColors = ['#8b2222','#22448b','#3a3a2a','#888840','#336633','#884422','#554488','#228888','#666666','#ccaa22'];

    // Parked along horizontal streets
    [350,730,1100,1470].forEach(sy => {
      for (let x=60; x<2350; x+=80+r()*60) {
        if (r()<0.55) {
          cars.push({x:x, y:sy-26, w:34, h:18, col:carColors[Math.floor(r()*carColors.length)], dir:'h'});
        }
      }
      for (let x=60; x<2350; x+=80+r()*60) {
        if (r()<0.55) {
          cars.push({x:x, y:sy+62, w:34, h:18, col:carColors[Math.floor(r()*carColors.length)], dir:'h'});
        }
      }
    });

    // Parked along vertical avenues
    [350,720,1140,1530,1980].forEach(sx => {
      for (let y=60; y<1750; y+=80+r()*60) {
        if (r()<0.55) {
          cars.push({x:sx-26, y:y, w:18, h:34, col:carColors[Math.floor(r()*carColors.length)], dir:'v'});
        }
      }
      for (let y=60; y<1750; y+=80+r()*60) {
        if (r()<0.55) {
          cars.push({x:sx+62, y:y, w:18, h:34, col:carColors[Math.floor(r()*carColors.length)], dir:'v'});
        }
      }
    });
    return cars;
  },

  // ── MAIN DRAW ─────────────────────────────────────────────
  draw(ctx, camera) {
    if (!this.CARS) this.CARS = this._buildCars();
    const {x:cx, y:cy} = camera;
    const sw = canvas.width, sh = canvas.height;
    const C = this.C;

    // ── 1. Ground base ────────────────────────────────────
    ctx.fillStyle = C.asphalt;
    ctx.fillRect(0, 0, sw, sh);

    // ── Sidewalk grid (city blocks) ───────────────────────
    // Draw sidewalk color first, streets cut over it
    ctx.fillStyle = C.sidewalk;
    ctx.fillRect(0, 0, sw, sh);

    // ── Streets (asphalt) ─────────────────────────────────
    // Horizontal boulevards
    const streetH = [350, 730, 1100, 1470];
    const streetV = [350, 720, 1140, 1530, 1980];
    const streetW = 80;

    streetH.forEach(sy => {
      const ry = sy - cy;
      if (ry > sh || ry + streetW < 0) return;
      ctx.fillStyle = C.asphalt2;
      ctx.fillRect(0, ry, sw, streetW);
      // Lane dashes
      ctx.strokeStyle = C.lane_line;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([22,18]);
      ctx.beginPath();
      ctx.moveTo(0, ry+40); ctx.lineTo(sw, ry+40);
      ctx.stroke();
      ctx.setLineDash([]);
      // Curb lines
      ctx.strokeStyle = C.curb;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0,ry);        ctx.lineTo(sw,ry);
      ctx.moveTo(0,ry+streetW);ctx.lineTo(sw,ry+streetW);
      ctx.stroke();
    });

    streetV.forEach(sx => {
      const rx = sx - cx;
      if (rx > sw || rx + streetW < 0) return;
      ctx.fillStyle = C.asphalt2;
      ctx.fillRect(rx, 0, streetW, sh);
      // Lane dashes
      ctx.strokeStyle = C.lane_line;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([22,18]);
      ctx.beginPath();
      ctx.moveTo(rx+40, 0); ctx.lineTo(rx+40, sh);
      ctx.stroke();
      ctx.setLineDash([]);
      // Curb lines
      ctx.strokeStyle = C.curb;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx,0);        ctx.lineTo(rx,sh);
      ctx.moveTo(rx+streetW,0);ctx.lineTo(rx+streetW,sh);
      ctx.stroke();
    });

    // ── Parks ─────────────────────────────────────────────
    this.PARKS.forEach(p => {
      const px=p.x-cx, py=p.y-cy;
      if (px>sw||py>sh||px+p.w<0||py+p.h<0) return;
      // Grass base
      ctx.fillStyle=C.park; ctx.fillRect(px,py,p.w,p.h);
      // Inner lighter patch
      ctx.fillStyle=C.grass; ctx.fillRect(px+6,py+6,p.w-12,p.h-12);
      // Winding path
      ctx.strokeStyle=C.park_path; ctx.lineWidth=5; ctx.setLineDash([12,8]);
      ctx.beginPath();
      ctx.moveTo(px+10,py+p.h/2);
      ctx.bezierCurveTo(px+p.w*0.3,py+10,px+p.w*0.7,py+p.h-10,px+p.w-10,py+p.h/2);
      ctx.stroke(); ctx.setLineDash([]);
      // Park label
      ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.font='bold 8px monospace';
      ctx.textAlign='center';
      ctx.fillText(p.name, px+p.w/2, py+p.h/2+3);
    });

    // ── Parking lots ──────────────────────────────────────
    this.LOTS.forEach(l => {
      const lx=l.x-cx, ly=l.y-cy;
      if (lx>sw||ly>sh||lx+l.w<0||ly+l.h<0) return;
      ctx.fillStyle=C.lot; ctx.fillRect(lx,ly,l.w,l.h);
      // Parking space lines
      ctx.strokeStyle=C.lot_line; ctx.lineWidth=1; ctx.setLineDash([]);
      const slotW=22;
      for (let ox=slotW;ox<l.w;ox+=slotW){
        ctx.beginPath();ctx.moveTo(lx+ox,ly);ctx.lineTo(lx+ox,ly+l.h);ctx.stroke();
      }
      ctx.strokeStyle='rgba(255,255,255,0.04)';
      ctx.strokeRect(lx,ly,l.w,l.h);
    });

    // ── Palm trees (behind buildings, on street edge) ────
    this._drawPalms(ctx, cx, cy, false);

    // ── Parked cars ──────────────────────────────────────
    this._drawCars(ctx, cx, cy);

    // ── Building SOUTH WALLS (fake 3-D depth strips) ─────
    // Drawn BEFORE roof so entities between building and
    // camera row look "in front of" the building face
    this.BUILDINGS.forEach(b => {
      const bx=b.x-cx, by=b.y-cy;
      if (bx>sw||by>sh||bx+b.w<0||by+b.h+b.wallH<0) return;
      const wy = by + b.h;   // south wall top Y on screen
      const wh = b.wallH;
      // South wall face — darker shade for depth
      const grad = ctx.createLinearGradient(0,wy,0,wy+wh);
      grad.addColorStop(0, C.wall_hi);
      grad.addColorStop(1, C.wall_lo);
      ctx.fillStyle = grad;
      ctx.fillRect(bx, wy, b.w, wh);
      // Bottom shadow line
      ctx.fillStyle='rgba(0,0,0,0.4)';
      ctx.fillRect(bx, wy+wh-3, b.w, 3);
    });
  },

  // ── Draw building TOP FACES (painter's pass after players) ─
  drawBuildingTops(ctx, camera) {
    const {x:cx, y:cy} = camera;
    const sw=canvas.width, sh=canvas.height;
    const C = this.C;
    const t=Date.now()/1800;

    this.BUILDINGS.forEach(b => {
      const bx=b.x-cx, by=b.y-cy;
      if (bx>sw||by>sh||bx+b.w<0||by+b.h<0) return;

      // ── Roof face ───────────────────────────────────────
      ctx.fillStyle = b.roofCol;
      ctx.fillRect(bx, by, b.w, b.h);

      // Subtle inner lighter area
      ctx.fillStyle='rgba(255,255,255,0.04)';
      ctx.fillRect(bx+4, by+4, b.w-8, b.h-8);

      // ── Windows grid ────────────────────────────────────
      this._drawWindows(ctx, b, bx, by, t);

      // ── Roof details by type ────────────────────────────
      this._drawRoofDetail(ctx, b, bx, by);

      // ── Door openings ────────────────────────────────────
      const DW=52;
      const dxL = b.x + Math.floor(b.w/2) - Math.floor(DW/2);
      // South door cutout
      ctx.fillStyle='rgba(12,8,6,0.98)';
      ctx.fillRect(dxL-cx, by+b.h-22, DW, 24);
      ctx.strokeStyle=b.accent; ctx.lineWidth=1.5;
      ctx.strokeRect(dxL-cx, by+b.h-22, DW, 24);
      // East door on wide buildings
      if (b.w >= 240) {
        const dyT = b.y + Math.floor(b.h/2) - Math.floor(DW/2);
        ctx.fillStyle='rgba(12,8,6,0.98)';
        ctx.fillRect(bx+b.w-22, dyT-cy, 24, DW);
        ctx.strokeStyle=b.accent; ctx.lineWidth=1.5;
        ctx.strokeRect(bx+b.w-22, dyT-cy, 24, DW);
      }

      // ── Building name sign ──────────────────────────────
      ctx.save();
      ctx.fillStyle='rgba(0,0,0,0.55)';
      const sw2=Math.min(b.w-16, b.label.length*6.5+14);
      const sx2=bx+b.w/2-sw2/2;
      ctx.fillRect(sx2, by+b.h-18, sw2, 12);
      ctx.fillStyle=b.accent;
      ctx.font='bold 7px monospace';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(b.label, bx+b.w/2, by+b.h-12);
      ctx.textBaseline='alphabetic';
      ctx.restore();

      // ── Roof edge highlight (top face border) ───────────
      ctx.strokeStyle='rgba(255,255,255,0.07)';
      ctx.lineWidth=1;
      ctx.strokeRect(bx,by,b.w,b.h);

      // ── Left & top edge bright strips ───────────────────
      ctx.fillStyle='rgba(255,255,255,0.06)';
      ctx.fillRect(bx,by,2,b.h);
      ctx.fillRect(bx,by,b.w,2);
    });

    // ── Palm trees (above buildings for correct Z) ───────
    this._drawPalms(ctx, cx, cy, true);
  },

  // ── Windows ───────────────────────────────────────────────
  _drawWindows(ctx, b, bx, by, t) {
    const cols = Math.floor((b.w-20)/20);
    const rows = Math.floor((b.h-20)/20);
    if (cols<=0||rows<=0) return;
    for (let r=0;r<rows;r++) {
      for (let c=0;c<cols;c++) {
        const wx = bx+10+c*20;
        const wy = by+10+r*20;
        const seed = (b.x+b.y+r*97+c*31)%13;
        // Some windows lit (yellow), most dark
        const flicker = seed<4 ? 0.12+Math.sin(t+seed)*0.06 : 0;
        if (seed<4) {
          ctx.fillStyle=`rgba(255,220,100,${flicker+0.08})`;
        } else if (seed<6) {
          ctx.fillStyle='rgba(100,160,220,0.10)'; // office blue glow
        } else {
          ctx.fillStyle='rgba(0,0,0,0.20)';
        }
        ctx.fillRect(wx,wy,12,12);
      }
    }
  },

  // ── Roof detail overlays ──────────────────────────────────
  _drawRoofDetail(ctx, b, bx, by) {
    switch(b.type) {
      case 'highrise':
        // AC units
        ctx.fillStyle='rgba(0,0,0,0.3)';
        ctx.fillRect(bx+b.w*0.2,by+b.h*0.2,30,20);
        ctx.fillRect(bx+b.w*0.6,by+b.h*0.2,30,20);
        ctx.fillRect(bx+b.w*0.4,by+b.h*0.6,25,18);
        // Antenna
        ctx.strokeStyle='rgba(150,150,150,0.4)';
        ctx.lineWidth=1.5;
        ctx.beginPath();
        ctx.moveTo(bx+b.w/2,by+b.h*0.1);
        ctx.lineTo(bx+b.w/2,by-8);
        ctx.stroke();
        ctx.fillStyle='#cc4444';
        ctx.beginPath();
        ctx.arc(bx+b.w/2,by-8,2.5,0,Math.PI*2);
        ctx.fill();
        break;
      case 'mall':
        // Skylights
        ctx.fillStyle='rgba(150,220,255,0.12)';
        ctx.fillRect(bx+b.w*0.2,by+b.h*0.2,b.w*0.6,b.h*0.25);
        ctx.fillRect(bx+b.w*0.2,by+b.h*0.55,b.w*0.6,b.h*0.2);
        ctx.strokeStyle='rgba(150,200,255,0.2)';
        ctx.lineWidth=1;
        ctx.strokeRect(bx+b.w*0.2,by+b.h*0.2,b.w*0.6,b.h*0.25);
        break;
      case 'warehouse':
        // Corrugated roof lines
        ctx.strokeStyle='rgba(0,0,0,0.15)';
        ctx.lineWidth=2;
        for(let i=0;i<b.w;i+=10){
          ctx.beginPath();
          ctx.moveTo(bx+i,by);ctx.lineTo(bx+i,by+b.h);
          ctx.stroke();
        }
        break;
      case 'shop':
        // Awning hint on south side
        ctx.fillStyle='rgba('+
          (150+Math.floor(b.x)%80)+','+
          (80+Math.floor(b.y)%60)+','+
          '50,0.35)';
        ctx.fillRect(bx, by+b.h-18, b.w, 14);
        break;
      case 'hotel':
        // Pool on roof
        ctx.fillStyle='rgba(40,120,200,0.35)';
        ctx.fillRect(bx+b.w*0.3,by+b.h*0.25,b.w*0.4,b.h*0.3);
        ctx.strokeStyle='rgba(80,160,255,0.4)';
        ctx.lineWidth=1.5;
        ctx.strokeRect(bx+b.w*0.3,by+b.h*0.25,b.w*0.4,b.h*0.3);
        break;
    }
  },

  // ── Palm trees ────────────────────────────────────────────
  // pass=false: draw trunk (behind buildings)
  // pass=true:  draw top fronds (above buildings)
  _drawPalms(ctx, cx, cy, topPass) {
    const sw=canvas.width, sh=canvas.height;
    const time=Date.now()/1200;

    this.PALMS.forEach((p,i) => {
      // Assign to a street Y based on index band
      const streetY = this.STREET_Y[i % this.STREET_Y.length];
      const wx = p.x, wy = streetY - 18;
      const sx=wx-cx, sy=wy-cy;
      if (sx<-30||sx>sw+30||sy<-80||sy>sh+30) return;

      const sway = Math.sin(time+i*1.3)*2;

      if (!topPass) {
        // Trunk
        ctx.strokeStyle='#6b4a28';
        ctx.lineWidth=4;
        ctx.beginPath();
        ctx.moveTo(sx,sy+36);
        ctx.bezierCurveTo(sx+sway*0.5,sy+24,sx+sway,sy+12,sx+sway,sy);
        ctx.stroke();
      } else {
        // Fronds
        ctx.save();
        ctx.translate(sx+sway, sy);
        for (let f=0;f<7;f++) {
          const ang = (f/7)*Math.PI*2+time*0.3;
          const len = 14+Math.sin(time+f)*2;
          ctx.strokeStyle=`rgba(40,${100+f*8},30,0.85)`;
          ctx.lineWidth=2.5;
          ctx.beginPath();
          ctx.moveTo(0,0);
          ctx.lineTo(Math.cos(ang)*len,Math.sin(ang)*len*0.55);
          ctx.stroke();
        }
        ctx.restore();
      }
    });
  },

  // ── Parked cars ───────────────────────────────────────────
  _drawCars(ctx, cx, cy) {
    const sw=canvas.width, sh=canvas.height;
    (this.CARS||[]).forEach(c => {
      const sx=c.x-cx, sy=c.y-cy;
      if (sx>sw+40||sy>sh+40||sx+c.w<-40||sy+c.h<-40) return;
      // Body
      ctx.fillStyle=c.col;
      ctx.fillRect(sx,sy,c.w,c.h);
      // Windshield
      ctx.fillStyle='rgba(150,200,255,0.25)';
      if (c.dir==='h') {
        ctx.fillRect(sx+4,sy+3,c.w-8,c.h-6);
      } else {
        ctx.fillRect(sx+3,sy+4,c.w-6,c.h-8);
      }
      // Shadow under car
      ctx.fillStyle='rgba(0,0,0,0.3)';
      ctx.fillRect(sx+2,sy+c.h-2,c.w-2,3);
    });
  },

  // ── Loot items ────────────────────────────────────────────
  drawLoot(ctx, camera, lootItems) {
    const {x:cx,y:cy}=camera;
    const sw=canvas.width, sh=canvas.height;
    const time=Date.now()/500;

    lootItems.forEach(loot => {
      const sx=loot.x-cx, sy=loot.y-cy;
      if (sx<-24||sx>sw+24||sy<-24||sy>sh+24) return;
      const bob=Math.sin(time+loot.x*0.01)*3;

      let color, label, bgColor, size;
      switch(loot.type) {
        case 'health':   color='#44dd66'; label='HP'; bgColor='rgba(0,40,10,0.85)';  size=15; break;
        case 'shield':   color='#4488ff'; label='SH'; bgColor='rgba(0,10,50,0.85)';  size=15; break;
        case 'shotgun':  color='#ffaa44'; label='SG'; bgColor='rgba(40,18,0,0.85)';  size=15; break;
        case 'bounce':   color='#44ffcc'; label='BG'; bgColor='rgba(0,40,30,0.85)';  size=15; break;
        case 'hero':
          color='#ee22ff'; label='★'; bgColor='rgba(30,0,40,0.90)'; size=20;
          break;
        default: return;
      }

      ctx.save();
      // Glow
      ctx.shadowColor=color;
      ctx.shadowBlur=12+Math.sin(time*2+loot.x)*4;

      // Box
      ctx.fillStyle=bgColor;
      ctx.strokeStyle=color;
      ctx.lineWidth=1.5;
      const half=size/2;
      ctx.fillRect(sx-half,sy-half+bob,size,size);
      ctx.strokeRect(sx-half,sy-half+bob,size,size);

      // Label
      ctx.shadowBlur=0;
      ctx.fillStyle=color;
      ctx.font=loot.type==='hero'?'bold 13px monospace':'bold 8px monospace';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(label,sx,sy+bob);

      // Hero sub-label
      if (loot.type==='hero' && loot.hero) {
        ctx.fillStyle='rgba(238,34,255,0.7)';
        ctx.font='6px monospace';
        ctx.fillText({spiderman:'S-MAN',batman:'BAT',ironman:'IM'}[loot.hero]||'', sx, sy+bob+13);
      }

      ctx.restore();
    });
  },

  // ── Zone overlay (BR mode) ────────────────────────────────
  drawZone(ctx, camera, zone) {
    const {x:cx,y:cy}=camera;
    const sw=canvas.width, sh=canvas.height;
    const zsx=zone.x-cx, zsy=zone.y-cy;
    const time=Date.now()/200;

    // Darken OUTSIDE the zone using 4 rects (avoids clearRect blowout)
    ctx.fillStyle='rgba(0,0,80,0.38)';
    // Top strip
    ctx.fillRect(0,0,sw,Math.max(0,zsy));
    // Bottom strip
    const zBot=zsy+zone.h;
    if (zBot<sh) ctx.fillRect(0,zBot,sw,sh-zBot);
    // Left strip
    ctx.fillRect(0,Math.max(0,zsy),Math.max(0,zsx),Math.min(zone.h,sh-Math.max(0,zsy)));
    // Right strip
    const zRight=zsx+zone.w;
    if (zRight<sw) ctx.fillRect(zRight,Math.max(0,zsy),sw-zRight,Math.min(zone.h,sh-Math.max(0,zsy)));

    // Zone border — dashed blue
    ctx.strokeStyle='#4499ff';
    ctx.lineWidth=3;
    ctx.setLineDash([12,7]);
    ctx.strokeRect(zsx,zsy,zone.w,zone.h);
    ctx.setLineDash([]);

    // Animated police lights along border
    const perimeter=2*(zone.w+zone.h);
    const numLights=Math.floor(perimeter/55);
    for (let i=0;i<numLights;i++) {
      const t=((i/numLights)+(time*0.04))%1;
      let lx,ly;
      const seg1=zone.w/perimeter, seg2=(zone.w+zone.h)/perimeter, seg3=(2*zone.w+zone.h)/perimeter;
      if      (t<seg1)  { lx=zsx+t*perimeter;           ly=zsy; }
      else if (t<seg2)  { lx=zsx+zone.w;                ly=zsy+(t*perimeter-zone.w); }
      else if (t<seg3)  { lx=zsx+zone.w-(t*perimeter-zone.w-zone.h); ly=zsy+zone.h; }
      else              { lx=zsx;                        ly=zsy+zone.h-(t*perimeter-2*zone.w-zone.h); }

      const isRed=((i+Math.floor(time))%2===0);
      ctx.fillStyle=isRed?'rgba(255,70,70,0.85)':'rgba(70,120,255,0.85)';
      ctx.shadowColor=isRed?'#ff4444':'#4488ff';
      ctx.shadowBlur=8;
      ctx.beginPath();
      ctx.arc(lx,ly,4.5,0,Math.PI*2);
      ctx.fill();
      ctx.shadowBlur=0;
    }
  },
};
