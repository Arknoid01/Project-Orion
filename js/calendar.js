/* ===================== CALENDRIER (mois attiques) ===================== */
// Tout est calculé à partir de DEBUG.tickCount -- aucun compteur séparé à maintenir
// ou sauvegarder, donc aucun risque de désynchronisation au chargement d'une partie.
function getCalendarState(){
  const totalTicks = DEBUG.tickCount;
  const day = Math.floor(totalTicks / DAY_DURATION_TICKS) + 1; // jour absolu, 1-indexé
  const monthIndex = Math.floor((day - 1) / DAYS_PER_MONTH) % MONTHS.length;
  const dayOfMonth = ((day - 1) % DAYS_PER_MONTH) + 1;
  const year = Math.floor((day - 1) / (DAYS_PER_MONTH * MONTHS.length)) + 1;
  const month = MONTHS[monthIndex];
  return { day, year, monthIndex, dayOfMonth, month: month.key, season: month.season };
}

// Pas persisté : juste un repère pour détecter un changement de mois. Au premier
// appel (chargement de page ou reprise de sauvegarde), on mémorise sans notifier --
// sinon reprendre une partie en plein hiver déclencherait une fausse notification.
let lastMonthIndex = null;

function checkMonthChange(){
  const state = getCalendarState();
  if (lastMonthIndex === null){
    lastMonthIndex = state.monthIndex;
    return;
  }
  if (state.monthIndex !== lastMonthIndex){
    lastMonthIndex = state.monthIndex;
    const icon = SEASON_ICONS[state.season];
    showNotification(t('calendar.monthChange', { icon, month: t('calendar.month.' + state.month) }), 'good');
    debugInfo('Changement de mois', { month: state.month, year: state.year });
    if (typeof processForeignTrade === 'function') processForeignTrade(); // ventes mensuelles à l'export
  }
}

function renderCalendarPanel(){
  const el = document.getElementById('calendarDisplay');
  if (!el) return;
  const { year, month, season, dayOfMonth } = getCalendarState();
  const icon = SEASON_ICONS[season];
  el.textContent = `${icon} ${t('calendar.month.' + month)} — ${t('calendar.year')} ${year} (${dayOfMonth}/${DAYS_PER_MONTH})`;
}
