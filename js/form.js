function goToMap() {
  const nom = document.getElementById('nom-chantier').value.trim();
  const entreprise = document.getElementById('entreprise').value.trim();
  const dateDebut = document.getElementById('date-debut').value;
  const dateFin = document.getElementById('date-fin').value;

  if (!nom || !entreprise || !dateDebut || !dateFin) {
    document.getElementById('form-error').style.display = 'block';
    return;
  }

  localStorage.setItem('chantier', JSON.stringify({ nom, entreprise, dateDebut, dateFin }));
  window.location.href = 'map.html';
}

// Permettre la touche Entrée
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') goToMap();
});

// Pré-remplir la date du jour
const today = new Date().toISOString().split('T')[0];
document.getElementById('date-debut').value = today;
