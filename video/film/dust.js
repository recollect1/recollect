// Slow drifting dust motes behind every title card.
(() => {
  const c = document.createElement('canvas');
  c.id = 'dust'; c.width = 1280; c.height = 720;
  document.body.prepend(c);
  const g = c.getContext('2d');
  const motes = Array.from({ length: 90 }, () => ({
    x: Math.random() * 1280, y: Math.random() * 720, r: 0.6 + Math.random() * 1.8,
    vx: (Math.random() - 0.5) * 0.15, vy: -0.05 - Math.random() * 0.2, a: 0.15 + Math.random() * 0.45,
    hue: Math.random() < 0.5 ? '255,198,92' : '95,230,255',
  }));
  (function frame() {
    g.clearRect(0, 0, 1280, 720);
    for (const m of motes) {
      m.x += m.vx; m.y += m.vy;
      if (m.y < -5) { m.y = 725; m.x = Math.random() * 1280; }
      g.beginPath(); g.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      g.fillStyle = `rgba(${m.hue},${m.a})`; g.shadowBlur = 8; g.shadowColor = `rgba(${m.hue},0.8)`; g.fill();
    }
    requestAnimationFrame(frame);
  })();
})();
