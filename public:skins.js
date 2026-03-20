// js/skins.js — Skin definitions and selector
const SKINS = [
  { name: 'Classic Red',  color: '#cc3333', bullet: '#ff6666', hoodie: '#aa2222' },
  { name: 'Midnight',     color: '#222255', bullet: '#aaaaff', hoodie: '#111133' },
  { name: 'Ice',          color: '#ccddff', bullet: '#88ccff', hoodie: '#aabbee' },
  { name: 'Volt',         color: '#cccc00', bullet: '#ffff44', hoodie: '#aaaa00' },
  { name: 'Ocean',        color: '#1155bb', bullet: '#44aaff', hoodie: '#003388' },
  { name: 'Flame',        color: '#cc5500', bullet: '#ff8822', hoodie: '#993300' },
  { name: 'Phantom',      color: '#552288', bullet: '#cc66ff', hoodie: '#331155' },
  { name: 'Gold',         color: '#ccaa00', bullet: '#ffdd44', hoodie: '#aa8800' },
];

let selectedSkin = 0;

// Build skin grid in title screen
(function buildSkinGrid() {
  const grid = document.getElementById('skin-row');
  if (!grid) return;
  SKINS.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'skin-opt' + (i === 0 ? ' selected' : '');
    d.style.background = `linear-gradient(160deg, ${s.color}, ${s.hoodie})`;
    d.title = s.name;
    d.dataset.name = s.name;
    d.onclick = () => {
      document.querySelectorAll('.skin-opt').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
      selectedSkin = i;
    };
    grid.appendChild(d);
  });
})();
