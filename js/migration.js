/* ===================== IMMIGRATION / EMIGRATION ===================== */
// Combine la politique fiscale (taxes.js) et la faveur divine (mythology.js) en une
// seule "attractivité" de la cité (0 = catastrophique, 1 = idéale), qui influence :
//   - growthChance() : vitesse de croissance des maisons -> reprend taxGrowthChance()
//     (taxes.js) et y ajoute un bonus/malus selon la faveur
//   - emigrationChance() : risque qu'une maison PERDE un niveau même si ses besoins
//     sont remplis, dès que l'attractivité tombe sous un seuil -- contrairement à la
//     dégradation classique (houses.js), qui ne se déclenche que si un besoin manque

function cityAttractiveness(){
  const favorComponent = favor / FAVOR_MAX;  // 0 (dieux mécontents) .. 1 (combles)
  const taxComponent = 1 - taxRate;          // 0 (taux maximum) .. 1 (aucun impôt)
  return (favorComponent + taxComponent) / 2;
}

function growthChance(){
  const base = taxGrowthChance(); // courbe pure liée au taux (voir taxes.js)
  const favorBonus = (favor / FAVOR_MAX - 0.5) * GROWTH_FAVOR_INFLUENCE;
  return Math.max(0.02, Math.min(0.98, base + favorBonus + festivalHappinessBonus()));
}

function emigrationChance(){
  const attractiveness = cityAttractiveness();
  if (attractiveness >= EMIGRATION_THRESHOLD) return 0;
  const base = (EMIGRATION_THRESHOLD - attractiveness) * EMIGRATION_STRENGTH;
  return Math.max(0, base - festivalHappinessBonus()); // un festival apaise aussi le risque d'émigration
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
