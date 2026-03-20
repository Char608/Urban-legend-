// js/skins.js — Skin definitions and selector
'use strict';

const SKINS = [
  { name: 'Classic Red', color: '#cc3333', bullet: '#ff6666', hoodie: '#aa2222' },
  { name: 'Midnight',    color: '#222255', bullet: '#aaaaff', hoodie: '#111133' },
  { name: 'Ice',         color: '#ccddff', bullet: '#88ccff', hoodie: '#aabbee' },
  { name: 'Volt',        color: '#cccc00', bullet: '#ffff44', hoodie: '#aaaa00' },
  { name: 'Ocean',       color: '#1155bb', bullet: '#44aaff', hoodie: '#003388' },
  { name: 'Flame',       color: '#cc5500', bullet: '#ff8822', hoodie: '#993300' },
  { name: 'Phantom',     color: '#552288', bullet: '#cc66ff', hoodie: '#331155' },
  { name: 'Gold',        color: '#ccaa00', bullet: '#ffdd44', hoodie: '#aa8800' },
];

let selectedSkin = 0;

// Build skin grid — called after DOM is ready
function buildSkinGrid() {
  const grid = document.getElementById('skin-row');
  if (!grid) { console.error('skin-row not found'); return; }
  grid.innerHTML = '';
  SKINS.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'skin-opt' + (i === 0 ? ' selected' : '');
    d.style.background = `linear-gradient(160deg, ${s.color}, ${s.hoodie})`;
    d.style.width  = '40px';
    d.style.height = '40px';
    d.style.borderRadius = '4px';
    d.style.cursor = 'pointer';
    d.style.border = i === 0 ? '2px solid #fff' : '2px solid transparent';
    d.style.transition = '0.15s';
    d.title = s.name;
    d.onclick = () => {
      document.querySelectorAll('.skin-opt').forEach(x => {
        x.classList.remove('selected');
        x.style.border = '2px solid transparent';
        x.style.transform = '';
      });
      d.classList.add('selected');
      d.style.border = '2px solid #fff';
      d.style.transform = 'scale(1.1)';
      selectedSkin = i;
    };
    grid.appendChild(d);
  });
}
