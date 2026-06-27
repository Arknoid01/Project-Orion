/* ===================== TAUX D'IMPOSITION (reglable par le joueur) ===================== */
// taxRate : 0 (aucun impôt) à 1 (taux maximum). Réglé via le curseur du panneau
// Gouvernement (voir index.html / ui.js). Trois effets dérivés, tous des interpolations
// linéaires simples entre les bornes définies dans config.js :
//   - taxCollectionRate()    : drachmes/habitant/tick desservi (proportionnel direct)
//   - taxEfficiencyMultiplier() : pénalise/booste la production (haut taux = pénalité)
//   - taxGrowthChance()      : probabilité d'évolution d'une maison par tick (haut taux = lent)
let taxRate = TAX_RATE_DEFAULT;

function setTaxRate(value){
  taxRate = Math.max(0, Math.min(1, value));
  debugInfo('Taux d\'imposition modifié', { taxRate });
  renderTaxPanel();
}

function lerp(a, b, t){ return a + (b - a) * t; }

function taxCollectionRate(){
  return TAX_BASE_PER_POP * taxRate;
}

function taxEfficiencyMultiplier(){
  return lerp(TAX_EFFICIENCY_AT_ZERO, TAX_EFFICIENCY_AT_MAX, taxRate);
}

function taxGrowthChance(){
  return lerp(TAX_GROWTH_CHANCE_AT_ZERO, TAX_GROWTH_CHANCE_AT_MAX, taxRate);
}

/* ===================== AFFICHAGE PANNEAU GOUVERNEMENT ===================== */
function renderTaxPanel(){
  const slider = document.getElementById('taxRateSlider');
  const rateLabel = document.getElementById('taxRateLabel');
  const effectsEl = document.getElementById('taxEffects');
  if (!slider) return; // panneau pas encore dans le DOM

  slider.value = Math.round(taxRate * 100);
  rateLabel.textContent = `${Math.round(taxRate * 100)}%`;

  const efficiencyPct = Math.round(taxEfficiencyMultiplier() * 100);
  const growthPct = Math.round(growthChance() * 100);
  const attractivenessPct = Math.round(cityAttractiveness() * 100);
  effectsEl.innerHTML = `
    <p>💰 ${t('government.collection')} : ${taxCollectionRate().toFixed(2)} dr. ${t('inspector.perTick')} ${t('government.perServedPop')}</p>
    <p class="${efficiencyPct >= 100 ? 'need-ok' : 'need-missing'}">⚙️ ${t('government.efficiency')} : ${efficiencyPct}%</p>
    <p class="${growthPct >= 50 ? 'need-ok' : 'need-missing'}">🏠 ${t('government.growth')} : ${growthPct}%</p>
    <p class="${attractivenessPct >= 50 ? 'need-ok' : 'need-missing'}">🌍 ${t('government.attractiveness')} : ${attractivenessPct}%</p>
  `;
}
