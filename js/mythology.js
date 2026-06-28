/* ===================== ETAT DE LA FAVEUR DIVINE ===================== */
let favor = 50;
let productionMultiplier = 1;
let productionEffectTicksLeft = 0;

/* ===================== OFFRANDE (action joueur) ===================== */
function makeOffering(){
  const cost = FAVOR_OFFERING_COST.sculpture;
  if (resources.sculpture < cost){
    showNotification(t('mythology.notEnoughSculpture', { cost }), 'bad');
    return;
  }
  resources.sculpture -= cost;
  if (typeof applyOfferingToGods === 'function') applyOfferingToGods();
  else favor = Math.min(FAVOR_MAX, favor + FAVOR_OFFERING_GAIN);
  debugInfo('Offrande faite', { favor });
  updateResourceBar();
  renderMythologyPanel();
  if (typeof renderGodSatisfactionPanel === 'function') renderGodSatisfactionPanel();
}

/* ===================== TICK MYTHOLOGIE ===================== */
function tickMythology(){
  if (typeof tickGodSatisfaction === 'function'){
    tickGodSatisfaction();
  } else {
    favor = Math.max(0, favor - FAVOR_DECAY_PER_TICK);
  }

  if (productionEffectTicksLeft > 0){
    productionEffectTicksLeft--;
    if (productionEffectTicksLeft === 0){
      productionMultiplier = 1;
      debugInfo('Effet divin terminé');
    }
  } else if (favor >= FAVOR_BLESSING_THRESHOLD && Math.random() < FAVOR_EVENT_CHANCE_PER_TICK){
    productionMultiplier = PRODUCTION_BOOST_MULTIPLIER;
    productionEffectTicksLeft = PRODUCTION_EFFECT_DURATION_TICKS;
    showNotification(t('mythology.blessing'), 'good');
    debugInfo('Bénédiction divine', { favor });
  } else if (favor <= FAVOR_CATASTROPHE_THRESHOLD && Math.random() < FAVOR_EVENT_CHANCE_PER_TICK){
    productionMultiplier = PRODUCTION_PENALTY_MULTIPLIER;
    productionEffectTicksLeft = PRODUCTION_EFFECT_DURATION_TICKS;
    showNotification(t('mythology.catastrophe'), 'bad');
    debugWarn('Catastrophe divine', { favor });
  }

  renderMythologyPanel();
}

/* ===================== AFFICHAGE PANNEAU ===================== */
function renderMythologyPanel(){
  const bar = document.getElementById('favorBarFill');
  const label = document.getElementById('favorLabel');
  if (!bar || !label) return;
  bar.style.width = `${favor}%`;
  bar.classList.toggle('favor-low', favor <= FAVOR_CATASTROPHE_THRESHOLD);
  bar.classList.toggle('favor-high', favor >= FAVOR_BLESSING_THRESHOLD);
  label.textContent = `${Math.round(favor)}/${FAVOR_MAX}`;
  if (typeof renderGodSatisfactionPanel === 'function') renderGodSatisfactionPanel();
}
