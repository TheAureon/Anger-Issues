// The 2D board in the corner. Click a piece to jump into its POV, a dot to move, a red ring to shoot.
import { GLYPHS, fileOf, rankOf, sqAt } from './rules.js';

export class Minimap {
  constructor(canvas, onSquare, onHover) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.flip = false;
    this.data = null;
    canvas.addEventListener('click', (e) => {
      const s = this.squareAt(e);
      if (s >= 0) onSquare(s);
    });
    canvas.addEventListener('pointermove', (e) => onHover(this.squareAt(e)));
    canvas.addEventListener('pointerleave', () => onHover(-1));
  }

  squareAt(e) {
    const r = this.c.getBoundingClientRect();
    const cell = r.width / 8;
    let f = Math.floor((e.clientX - r.left) / cell);
    let rk = 7 - Math.floor((e.clientY - r.top) / cell);
    if (this.flip) {
      f = 7 - f;
      rk = 7 - rk;
    }
    return sqAt(f, rk);
  }

  // Board coords (file/rank as floats, square centres at .5) to canvas pixels.
  px(f, r, cell) {
    const x = this.flip ? 8 - f : f;
    const y = this.flip ? r : 8 - r;
    return [x * cell, y * cell];
  }

  draw(d) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = this.c.clientWidth;
    if (this.c.width !== Math.round(size * dpr)) {
      this.c.width = this.c.height = Math.round(size * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = size / 8;
    // Left/bottom corner of a square in pixels.
    const sqXY = (s) => {
      const [cx, cy] = this.px(fileOf(s) + 0.5, rankOf(s) + 0.5, cell);
      return [cx - cell / 2, cy + cell / 2];
    };
    g.clearRect(0, 0, size, size);
    for (let s = 0; s < 64; s++) {
      const [x, y] = sqXY(s);
      const light = (fileOf(s) + rankOf(s)) % 2 === 1;
      g.fillStyle = light ? '#e6d3aa' : '#8a6644';
      g.fillRect(x, y - cell, cell, cell);
      if (d.coverage && d.coverage.has(s)) {
        g.fillStyle = 'rgba(255,70,50,0.14)';
        g.fillRect(x, y - cell, cell, cell);
      }
      if (d.lastSquares && d.lastSquares.has(s)) {
        g.fillStyle = 'rgba(255,214,70,0.35)';
        g.fillRect(x, y - cell, cell, cell);
      }
      if (s === d.active) {
        g.fillStyle = 'rgba(80,200,255,0.45)';
        g.fillRect(x, y - cell, cell, cell);
      }
      if (s === d.hover) {
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 2;
        g.strokeRect(x + 1, y - cell + 1, cell - 2, cell - 2);
      }
      if (d.fog && !d.fog.has(s)) {
        g.fillStyle = 'rgba(14,15,24,0.72)';
        g.fillRect(x, y - cell, cell, cell);
      }
      if (s === d.checkSq) {
        const grd = g.createRadialGradient(x + cell / 2, y - cell / 2, 2, x + cell / 2, y - cell / 2, cell * 0.7);
        grd.addColorStop(0, 'rgba(255,0,0,0.85)');
        grd.addColorStop(1, 'rgba(255,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(x, y - cell, cell, cell);
      }
    }
    // View cone of the piece we're looking through.
    if (d.cone) {
      const { s, yaw, fov } = d.cone;
      const [cx, cy] = [sqXY(s)[0] + cell / 2, sqXY(s)[1] - cell / 2];
      const sign = this.flip ? -1 : 1;
      const ray = (a) => [cx + -Math.sin(a) * sign * size * 1.5, cy + -Math.cos(a) * sign * size * 1.5];
      const half = fov / 2;
      g.save();
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(...ray(yaw + half));
      g.lineTo(...ray(yaw - half));
      g.closePath();
      g.fillStyle = 'rgba(120,210,255,0.16)';
      g.fill();
      g.restore();
    }
    // Last action.
    if (d.last) {
      const L = d.last;
      const [ax, ay] = this.px(L.a.f, L.a.r, cell);
      const [bx, by] = this.px(L.b.f, L.b.r, cell);
      g.save();
      g.lineWidth = 3;
      g.strokeStyle = L.kind === 'shoot' ? 'rgba(255,60,40,0.85)' : 'rgba(255,200,40,0.8)';
      if (L.kind === 'shoot') g.setLineDash([5, 4]);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
      if (L.kind === 'shoot') {
        g.setLineDash([]);
        g.fillStyle = L.hit ? '#ff3b2a' : '#ffffff';
        g.beginPath();
        g.arc(bx, by, 3.5, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    // Pieces.
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.floor(cell * 0.82)}px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif`;
    for (let s = 0; s < 64; s++) {
      const p = d.board[s];
      if (!p || (d.hidden && d.hidden.has(s))) continue;
      const [x, y] = sqXY(s);
      const glyph = GLYPHS[p.type] + '︎';
      g.lineWidth = 2.5;
      g.strokeStyle = p.color === 'w' ? '#2a2018' : '#f2e8d5';
      g.fillStyle = p.color === 'w' ? '#fffaf0' : '#1d1a22';
      g.strokeText(glyph, x + cell / 2, y - cell / 2 + 1);
      g.fillText(glyph, x + cell / 2, y - cell / 2 + 1);
    }
    // Move dots and target rings.
    if (d.moves) {
      g.fillStyle = 'rgba(40,160,90,0.8)';
      for (const s of d.moves) {
        const [x, y] = sqXY(s);
        g.beginPath();
        g.arc(x + cell / 2, y - cell / 2, cell * 0.15, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (d.targets) {
      g.strokeStyle = '#ff2d1f';
      g.lineWidth = 2.5;
      for (const s of d.targets) {
        const [x, y] = sqXY(s);
        g.beginPath();
        g.arc(x + cell / 2, y - cell / 2, cell * 0.44, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // Coordinates.
    g.font = `bold ${Math.max(8, Math.floor(cell * 0.2))}px system-ui,sans-serif`;
    g.fillStyle = 'rgba(30,20,10,0.6)';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    for (let i = 0; i < 8; i++) {
      const f = this.flip ? 7 - i : i;
      g.fillText('abcdefgh'[f], i * cell + 2, size - 2);
      g.textBaseline = 'top';
      g.fillText(String(this.flip ? i + 1 : 8 - i), 2, i * cell + 2);
      g.textBaseline = 'alphabetic';
    }
  }
}
