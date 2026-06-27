/* ===================== HUD (nouvelle interface) ===================== */
// Met à jour les pastilles du HUD (trésor, population, blé, calendrier) avec les
// vraies valeurs du jeu. Défensif comme le reste du projet pendant la migration UI :
// si une pastille n'existe pas (encore), on l'ignore sans planter -- voir setText()
// dans production.js.
function renderHud(){
  setText('hudTreasury', Math.floor(treasury));
  setText('hudPopulation', computeTotalPopulation());
  setText('hudWheat', Math.floor(resources.wheat));

  const cal = document.getElementById('hudCalendar');
  if (cal && typeof getCalendarState === 'function'){
    const state = getCalendarState();
    cal.textContent = `📅 ${t('calendar.month.' + state.month)} · ${t('calendar.day')} ${state.dayOfMonth}`;
  }
}
