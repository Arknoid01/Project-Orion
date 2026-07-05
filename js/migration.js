/* ===================== IMMIGRATION / EMIGRATION ===================== */
// Combine la politique fiscale (taxes.js) et la faveur divine (mythology.js) en une
// seule "attractivité" de la cité (0 = catastrophique, 1 = idéale), qui influence :
// growthChance() / emigrationChance() : tirages une fois par jour de jeu (houses.js).

function cityAttractiveness(){
  const favorComponent = favor / FAVOR_MAX;  // 0 (dieux mécontents) .. 1 (combles)
  const taxComponent = 1 - taxRate;          // 0 (taux maximum) .. 1 (aucun impôt)
  return (favorComponent + taxComponent) / 2;
}

function growthChance(){
  const base = taxGrowthChance(); // courbe pure liée au taux (voir taxes.js)
  const favorBonus = (favor / FAVOR_MAX - 0.5) * GROWTH_FAVOR_INFLUENCE;
  return Math.max(0.02, Math.min(0.98, base + favorBonus + festivalHappinessBonus()
    + ((typeof venueHappinessBonus === 'function') ? venueHappinessBonus() : 0)
    + ((typeof artifactBonus === 'function') ? artifactBonus('growth') : 0)));
}

function emigrationChance(){
  const attractiveness = cityAttractiveness();
  if (attractiveness >= EMIGRATION_THRESHOLD) return 0;
  const base = (EMIGRATION_THRESHOLD - attractiveness) * EMIGRATION_STRENGTH;
  return Math.max(0, base - festivalHappinessBonus() - ((typeof venueHappinessBonus === 'function') ? venueHappinessBonus() : 0));
}

// Notification unique (pas une par maison) au passage sous le seuil, avec un debounce
// similaire à bankruptNotified (economy.js) pour ne pas spammer chaque tick.
let emigrationWarningShown = false;
function checkEmigrationWarning(){
  if (cityAttractiveness() < EMIGRATION_THRESHOLD){
    if (!emigrationWarningShown){
      showNotification(t('migration.emigrationWarning'), 'bad');
      emigrationWarningShown = true;
    }
  } else {
    emigrationWarningShown = false;
  }
}
