/* ===================== BOUCLE D'AFFICHAGE ===================== */
// La simulation (tick) tourne à 1/seconde via setInterval (voir main.js).
// L'affichage tourne lui à ~60fps via requestAnimationFrame, pour permettre
// l'interpolation de position des walkers et le cycle d'animation de marche.
const TICK_DURATION_MS = 1000;
let lastTickTimestamp = performance.now();

function startRenderLoop(){
  function frame(now){
    render(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
