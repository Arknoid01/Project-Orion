/* ===================== DEFAITE ===================== */
// Symétrique des objectifs (victoire), mais pour l'échec. Deux conditions
// indépendantes, chacune avec un compteur "depuis combien de ticks d'affilée" pour
// éviter qu'un incident passager (incendie, trésor brièvement à sec) ne déclenche
// une défaite injuste -- il faut que la situation dure.
let everHadPopulation = false;
let zeroPopulationStreak = 0;
let bankruptStreak = 0;
let defeatAnnounced = false;
let defeatReason = null; // 'population' | 'bankruptcy'

function checkDefeat(){
  if (defeatAnnounced) return; // une fois annoncée, on ne la redéclenche pas

  const pop = computeTotalPopulation();
  if (pop > 0) everHadPopulation = true;

  zeroPopulationStreak = (everHadPopulation && pop === 0) ? zeroPopulationStreak + 1 : 0;
  bankruptStreak = (treasury < 0) ? bankruptStreak + 1 : 0;

  if (zeroPopulationStreak >= DEFEAT_POPULATION_TICKS){
    triggerDefeat('population');
  } else if (bankruptStreak >= DEFEAT_BANKRUPTCY_TICKS){
    triggerDefeat('bankruptcy');
  }

  renderObjectivesPanel(); // affiche/masque la bannière de défaite
}

function triggerDefeat(reason){
  defeatAnnounced = true;
  defeatReason = reason;
  showNotification(t('defeat.' + reason), 'bad');
  debugWarn('Défaite : ' + reason);
}
