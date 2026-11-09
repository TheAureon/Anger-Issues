/*
 * UsForge leaderboard bridge.
 *
 * When the game runs inside UsForge's page (an iframe), the final score of a
 * run is reported to the parent page, which asks for a nickname and saves it.
 * Opened on its own (no parent frame), this does nothing.
 */
export function sendScoreToUsForge(score) {
  // Only when running inside UsForge's page; does nothing when the game is opened on its own.
  if (window.parent === window) return;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score >= 1e12) return;
  try {
    window.parent.postMessage({ usforge: 'score', score: Math.round(score), unit: 'points' }, '*');
  } catch (e) {
    /* never let reporting break the game */
  }
}

// Also available globally, as UsForge's integration guide expects.
window.sendScoreToUsForge = sendScoreToUsForge;
