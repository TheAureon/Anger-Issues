import './style.css';
import { initRapier } from './physics.js';
import { Game } from './game.js';
import { UI } from './ui.js';

async function boot() {
  const app = document.getElementById('app');
  await initRapier();
  document.getElementById('loading')?.remove();
  const game = new Game(app);
  new UI(game);
  game.start();
  // Handy for debugging from the console.
  window.angerIssues = game;
}

boot().catch((err) => {
  console.error(err);
  const l = document.getElementById('loading');
  if (l) l.textContent = 'Could not start the game: ' + err.message;
});
