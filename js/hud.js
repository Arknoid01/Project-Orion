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
  if (typeof renderColonyHud === 'function') renderColonyHud();
  if (typeof renderAdventureHud === 'function') renderAdventureHud();
}

/* ===================== PANNEAU GESTION ===================== */
// Liste de toutes les ressources (stock/capacité) affichée dans le panneau "Gestion",
// qui regroupe aussi les raccourcis Gestion de la ville / Carte du monde.
const MANAGE_RESOURCE_ORDER = [
  'wheat', 'fish', 'marble', 'sculpture', 'olives', 'oil', 'grapes', 'wine',
  'wool', 'clothing', 'coal', 'bronze', 'arms',
];
const MANAGE_RESOURCE_ICONS = {
  wheat:'🌾', fish:'🐟', marble:'🪨', sculpture:'🗿', olives:'🫒', oil:'🛢️', grapes:'🍇', wine:'🍷',
  wool:'🧶', clothing:'👕', coal:'🪵', bronze:'🥉', arms:'🗡️',
};

function renderManageResourceList(){
  const el = document.getElementById('manageResourceList');
  if (!el) return;
  const caps = (typeof computeCaps === 'function') ? computeCaps() : {};
  el.innerHTML = MANAGE_RESOURCE_ORDER.map(k => {
    const cap = (caps[k] != null) ? ` / ${caps[k]}` : '';
    const icon = MANAGE_RESOURCE_ICONS[k] || '📦';
    return `<div class="row"><span>${icon} ${t('resource.' + k)}</span><b>${Math.floor(resources[k] || 0)}${cap}</b></div>`;
  }).join('');
}

function openManagePanel(){
  renderManageResourceList();
  if (typeof renderEconomyBalance === 'function') renderEconomyBalance();
  if (typeof renderGodSatisfactionPanel === 'function') renderGodSatisfactionPanel();
  if (typeof togglePanel === 'function') togglePanel('managePanel');
}
