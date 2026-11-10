// Inline SVG icons (stroke style, 24×24) and chess-piece silhouettes. Crisp at any size and the
// same on every device, unlike emoji or font glyphs.

const P = {
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m16 9 6 6M22 9l-6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M16 14.2A5.5 5.5 0 0 1 22 20"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  medal: '<path d="M8 3h8l-2 6h-4L8 3z"/><circle cx="12" cy="15" r="6"/><path d="m12 12 1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 14.3l2-.3 1-2z"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  home: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>',
  eye: '<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/>',
  boot: '<path d="M7 3h5v8l6 2.5a3 3 0 0 1 2 2.8V19H4v-3l3-1V3z"/><path d="M4 19v2h16v-2"/>',
  gun: '<path d="M2 8h17l2 2v2H11l-1 2H8l-1 4H3l1.5-6H2V8z"/><path d="M19 8V6"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2c-.5-.8-1.5-1.2-2.5-1.2-1.4 0-2.5.8-2.5 1.9 0 2.6 5.2 1.4 5.2 4.1 0 1.1-1.2 2-2.7 2-1.1 0-2.1-.5-2.6-1.3M12 6.5V8M12 16v1.5"/>',
  swap: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  fire: '<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8 0 4 3 7 7 7z"/>',
  door: '<path d="M14 3h5v18h-5M10 17l5-5-5-5M15 12H3"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// Filled chess-piece silhouettes (viewBox 0 0 24 24), outlined so both colours read on any panel.
const PIECES = {
  p: '<circle cx="12" cy="7.5" r="3.4"/><path d="M8.8 12.2h6.4l1.6 6.3H7.2z"/>',
  r: '<path d="M6.5 4h2.4v2h1.8V4h2.6v2h1.8V4h2.4v4.4l-1.7 1.6.8 8.5H7.4l.8-8.5-1.7-1.6z"/>',
  n: '<path d="M7.5 18.5c0-3.5 1.6-5.4 3.6-6.6-1.7.2-3.1.9-4 1.9L5.5 12l3.6-6.3 1.4-2.2 1.2 1.8C16 6 17.7 9 17.5 13.2l-.4 5.3z"/>',
  b: '<path d="M12 3.2c2.6 2 4 4.4 4 6.6 0 2-1.2 3.1-2.2 3.6l1.6 5.1H8.6l1.6-5.1C9.2 12.9 8 11.8 8 9.8c0-2.2 1.4-4.6 4-6.6z"/><path class="cut" d="m10.6 8.4 3-2.4"/>',
  q: '<path d="M4.2 7.2 7.6 10l1.6-5.2L12 9.8l2.8-5L16.4 10l3.4-2.8-2 11.3H6.2z"/>',
  k: '<path d="M11 2.8h2v2h2v2h-2v2.1c2.7.5 4.6 2.4 4.6 4.8 0 1.3-.5 2.3-1.2 3.2l.4 1.6H7.2l.4-1.6c-.7-.9-1.2-1.9-1.2-3.2 0-2.4 1.9-4.3 4.6-4.8V6.8H9v-2h2z"/>',
};
export function pieceIcon(type, color, cls = '') {
  return `<svg class="pc pc-${color} ${cls}" viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="18.5" width="13" height="2.6" rx="1"/>${PIECES[type]}</svg>`;
}

// Fill every [data-icon] element in the page with its icon, placed before any text.
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    if (el.querySelector(':scope > svg.ic')) continue;
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
  }
}
