// ===== STATE =====
let map;
let chantierMarker = null;
let chantierData   = {};

let P1 = null, P2 = null;
let markerP1 = null, markerP2 = null;
let segmentLayer = null, segmentLabel = null;

let dev1Layers = [], dev2Layers = [], dev3Layers = [];
let dev1Visible = true, dev2Visible = true, dev3Visible = true;

let placingPoints = false;

const OSRM = 'https://router.project-osrm.org';

// Palette des 3 déviations
const DEV_COLORS  = ['#1D9E75', '#185FA5', '#E87722'];
const DEV_CLASSES = ['toggle-green', 'toggle-blue', 'toggle-orange'];
// Décalages perpendiculaires pour séparer les tracés superposés
const DEV_OFFSETS = [+0.000025, -0.000025, 0];

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  const saved = JSON.parse(localStorage.getItem('chantier') || '{}');
  if (saved.nom)        document.getElementById('f-nom').value        = saved.nom;
  if (saved.entreprise) document.getElementById('f-entreprise').value = saved.entreprise;
  if (saved.dateDebut)  document.getElementById('f-date-debut').value = saved.dateDebut;
  if (saved.dateFin)    document.getElementById('f-date-fin').value   = saved.dateFin;
  if (!saved.dateDebut) document.getElementById('f-date-debut').value = new Date().toISOString().split('T')[0];

  if (saved.nom && saved.entreprise && saved.dateDebut && saved.dateFin) {
    chantierData = saved;
    show('panel-search'); hide('panel-info');
  }

  map = L.map('map').setView([48.8566, 2.3522], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19, crossOrigin: true
  }).addTo(map);

  map.on('click', onMapClick);

  document.getElementById('address-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchAddress();
  });
  ['f-nom','f-entreprise','f-date-debut','f-date-fin'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') validateChantierForm();
    });
  });
});

// ===== FORMULAIRE =====
function validateChantierForm() {
  const nom        = document.getElementById('f-nom').value.trim();
  const entreprise = document.getElementById('f-entreprise').value.trim();
  const dateDebut  = document.getElementById('f-date-debut').value;
  const dateFin    = document.getElementById('f-date-fin').value;
  if (!nom || !entreprise || !dateDebut || !dateFin) { show('f-error'); return; }
  hide('f-error');
  chantierData = { nom, entreprise, dateDebut, dateFin };
  localStorage.setItem('chantier', JSON.stringify(chantierData));
  hide('panel-info'); show('panel-search');
}

function goBackToInfo() { hide('panel-search'); show('panel-info'); }

// ===== ADRESSE =====
async function searchAddress() {
  const addr = document.getElementById('address-input').value.trim();
  if (!addr) return;
  hide('search-error');
  try {
    const data = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1&countrycodes=fr`,
      { headers: { 'Accept-Language': 'fr' } }
    ).then(r => r.json());
    if (!data.length) { show('search-error'); return; }
    const { lat, lon, display_name } = data[0];
    map.setView([+lat, +lon], 17);
    if (chantierMarker) map.removeLayer(chantierMarker);
    chantierMarker = L.marker([+lat, +lon], {
      icon: L.divIcon({ className:'', iconAnchor:[60,12],
        html:`<div style="background:#E24B4A;color:white;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.25)">📍 ${escapeHtml(chantierData.nom)||'Chantier'}</div>` })
    }).addTo(map);
    const btn = document.getElementById('btn-next-draw');
    btn.style.display = 'block';
    btn.textContent   = `✓ "${display_name.split(',')[0]}" — Valider →`;
  } catch {
    document.getElementById('search-error').textContent = 'Erreur réseau.';
    show('search-error');
  }
}

// ===== ÉTAPE 2 : PLACEMENT P1 / P2 =====
function goToDraw() {
  hide('panel-search'); show('panel-draw');
  placingPoints = true;
  map.getContainer().style.cursor = 'crosshair';
  indicator('→ Cliquez sur P1 (début du segment barré)');
  setStatus('Zoomez sur la route et cliquez sur le <strong>début</strong> de la portion à barrer.');
}

async function onMapClick(e) {
  if (!placingPoints) return;
  const pt = [e.latlng.lat, e.latlng.lng];

  if (!P1) {
    setStatus('Accrochage sur la route…');
    P1 = await snapToRoad(pt);
    if (markerP1) map.removeLayer(markerP1);
    markerP1 = pointMarker(P1, 'P1', '#E24B4A').addTo(map);
    indicator('→ Cliquez sur P2 (fin du segment barré)');
    setStatus('P1 posé ✓ — Cliquez sur la <strong>fin</strong> de la portion à barrer.');

  } else if (!P2) {
    setStatus('Accrochage sur la route…');
    const snapped = await snapToRoad(pt);
    if (haversineM(snapped, P1) < 20) { setStatus('⚠ Trop proche de P1. Cliquez plus loin.'); return; }
    P2 = snapped;
    if (markerP2) map.removeLayer(markerP2);
    markerP2 = pointMarker(P2, 'P2', '#E24B4A').addTo(map);
    placingPoints = false;
    map.getContainer().style.cursor = '';
    indicator('✓ Segment défini');
    setStatus(`✓ ${Math.round(haversineM(P1, P2))}m de route barrée — Cliquez sur "Générer les déviations".`);
    document.getElementById('btn-generate').style.display = 'block';
    drawSegment();
  }
}

async function drawSegment() {
  if (!P1 || !P2) return;
  if (segmentLayer) map.removeLayer(segmentLayer);
  if (segmentLabel) map.removeLayer(segmentLabel);
  const coords = await osrmDirect(P1, P2) || [P1, P2];
  segmentLayer = L.polyline(coords, { color:'#E24B4A', weight:5, opacity:.9, dashArray:'10,6' }).addTo(map);
  const mid = coords[Math.floor(coords.length / 2)];
  segmentLabel = L.marker(mid, {
    icon: L.divIcon({ className:'', iconAnchor:[50,-5],
      html:`<div style="background:#E24B4A;color:white;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3)">⛔ Route barrée</div>` })
  }).addTo(map);
  map.fitBounds(L.latLngBounds(coords).pad(0.5));
}

function resetDraw() {
  P1 = null; P2 = null;
  [markerP1, markerP2, segmentLayer, segmentLabel].forEach(l => { if (l) map.removeLayer(l); });
  markerP1 = markerP2 = segmentLayer = segmentLabel = null;
  clearDevLayers();
  const btn = document.getElementById('btn-generate');
  btn.style.display = 'none'; btn.disabled = false;
  btn.textContent   = 'Générer les déviations →';
  placingPoints = true;
  map.getContainer().style.cursor = 'crosshair';
  indicator('→ Cliquez sur P1 (début du segment barré)');
  setStatus('Cliquez sur le <strong>début</strong> de la portion à barrer.');
}

function clearDevLayers() {
  [dev1Layers, dev2Layers, dev3Layers].forEach(arr => arr.forEach(l => map.removeLayer(l)));
  dev1Layers = []; dev2Layers = []; dev3Layers = [];
}

// =============================================================
// ALGORITHME : 3 MEILLEURES DÉVIATIONS
//
// Phase 1 — Alternatives OSRM (les deux sens en parallèle)
//   OSRM calcule jusqu'à 3 routes dans chaque sens :
//     routes[0] = directe = segment barré → ignorée
//     routes[1], routes[2] = alternatives naturelles
//   On collecte toutes les alternatives des 2 sens (max 4),
//   on déduplique (similaire ou inversé = même route physique),
//   on trie par longueur croissante.
//
// Phase 2 — Bypass perpendiculaire (fallback si < 3 routes)
//   Waypoints perpendiculaires au milieu du segment, snappés
//   sur la route la plus proche. On teste gauche puis droite
//   à 4 distances croissantes (150m → 1200m).
//
// Résultat : jusqu'à 3 routes uniques, les plus courtes d'abord.
// Chaque route est décalée de ±2.5m pour la lisibilité si
// les tracés se superposent (cas des routes bidirectionnelles).
// =============================================================
async function generateDeviation() {
  if (!P1 || !P2) return;
  const btn = document.getElementById('btn-generate');
  btn.textContent = 'Calcul en cours…'; btn.disabled = true;
  clearDevLayers();

  setStatus('Recherche des itinéraires alternatifs…');

  // Phase 1 : alternatives OSRM dans les deux sens en parallèle
  const [alts12, alts21] = await Promise.all([
    osrmAlternatives(P1, P2),
    osrmAlternatives(P2, P1)
  ]);

  // Pool de routes uniques (hors route directe = [0])
  const pool = [];

  const addToPool = (route) => {
    if (!route || route.length < 2) return;
    const dup = pool.some(r =>
      coordsSimilar(r, route) || coordsSimilar(r, [...route].reverse())
    );
    if (!dup) pool.push(route);
  };

  // Alternatives P1→P2 (déjà dans le bon sens)
  alts12.slice(1).forEach(addToPool);
  // Alternatives P2→P1 (sens inverse — on les ajoute telles quelles,
  // les flèches sur la carte indiqueront le sens correct)
  alts21.slice(1).forEach(addToPool);

  // Phase 2 : bypass si moins de 3 routes trouvées
  if (pool.length < 3) {
    setStatus('Calcul des contournements…');
    for (const dist of [0.0015, 0.003, 0.006, 0.012]) {
      if (pool.length >= 3) break;
      const [left, right] = perpWaypoints(P1, P2, dist);
      const [sl, sr] = await Promise.all([snapToRoad(left), snapToRoad(right)]);
      const [rl, rr] = await Promise.all([
        osrmViaWaypoint(P1, sl, P2),
        osrmViaWaypoint(P1, sr, P2)
      ]);
      [rl, rr].forEach(r => { if (pool.length < 3) addToPool(r); });
    }
  }

  // Trier par longueur croissante (plus court = meilleur)
  pool.sort((a, b) => routeLen(a) - routeLen(b));

  // Afficher jusqu'à 3 routes
  const allLayers = [dev1Layers, dev2Layers, dev3Layers];
  let ok = 0;

  pool.slice(0, 3).forEach((coords, i) => {
    const displayed = offsetCoords(coords, DEV_OFFSETS[i]);
    allLayers[i] = renderDeviation(displayed, DEV_COLORS[i], `Dév. ${i+1}`);
    allLayers[i].forEach(l => l.addTo(map));
    ok++;
  });

  dev1Layers = allLayers[0]; dev2Layers = allLayers[1]; dev3Layers = allLayers[2];

  // Masquer le bouton de la 3e déviation si elle n'existe pas
  const btn3 = document.getElementById('toggle-dev3');
  if (btn3) btn3.style.display = pool.length >= 3 ? '' : 'none';

  hide('panel-draw'); show('panel-result');
  document.getElementById('result-info').innerHTML = `
    <strong>${escapeHtml(chantierData.nom)||'Chantier'}</strong><br>
    ${escapeHtml(chantierData.entreprise)}<br>
    Du ${fmtDate(chantierData.dateDebut)} au ${fmtDate(chantierData.dateFin)}<br>
    <span style="color:${ok>0?'#1D9E75':'#E24B4A'}">
      ${ok>0 ? `✓ ${ok} déviation(s) calculée(s)` : '⚠ Impossible de calculer — réessayez'}
    </span>`;

  dev1Visible = true; dev2Visible = true; dev3Visible = true;
  updateToggles();

  const all = pool.slice(0,3).flat();
  if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.25));
}

// ===== OSRM =====

async function osrmAlternatives(from, to) {
  try {
    const url  = `${OSRM}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?alternatives=3&overview=full&geometries=geojson`;
    const data = await fetch(url).then(r => r.json());
    return (data.routes||[]).map(r => r.geometry.coordinates.map(c => [c[1],c[0]]));
  } catch { return []; }
}

async function osrmDirect(from, to) {
  try {
    const url  = `${OSRM}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const data = await fetch(url).then(r => r.json());
    return data.routes?.[0]?.geometry?.coordinates?.map(c => [c[1],c[0]]) || null;
  } catch { return null; }
}

async function osrmViaWaypoint(from, via, to) {
  try {
    const pts  = `${from[1]},${from[0]};${via[1]},${via[0]};${to[1]},${to[0]}`;
    const url  = `${OSRM}/route/v1/driving/${pts}?overview=full&geometries=geojson`;
    const data = await fetch(url).then(r => r.json());
    return data.routes?.[0]?.geometry?.coordinates?.map(c => [c[1],c[0]]) || null;
  } catch { return null; }
}

async function snapToRoad(pt) {
  try {
    const url  = `${OSRM}/nearest/v1/driving/${pt[1]},${pt[0]}?number=1`;
    const data = await fetch(url).then(r => r.json());
    const loc  = data.waypoints?.[0]?.location;
    if (loc) return [loc[1], loc[0]];
  } catch {}
  return pt;
}

// ===== GÉOMÉTRIE =====

function perpWaypoints(p1, p2, dist) {
  const dLat = p2[0]-p1[0], dLng = p2[1]-p1[1];
  const len  = Math.hypot(dLat, dLng) || 1;
  const pLat = -dLng/len, pLng = dLat/len;
  const mLat = (p1[0]+p2[0])/2, mLng = (p1[1]+p2[1])/2;
  return [
    [mLat + pLat*dist, mLng + pLng*dist],
    [mLat - pLat*dist, mLng - pLng*dist]
  ];
}

function offsetCoords(coords, deg) {
  if (coords.length < 2 || deg === 0) return coords;
  return coords.map((c, i) => {
    const prev = coords[i > 0 ? i-1 : i+1];
    const next = coords[i < coords.length-1 ? i+1 : i-1];
    const dLat = next[0]-prev[0], dLng = next[1]-prev[1];
    const len  = Math.hypot(dLat, dLng) || 1;
    return [c[0] + (-dLng/len)*deg, c[1] + (dLat/len)*deg];
  });
}

function routeLen(coords) {
  return coords.slice(1).reduce((acc, c, i) =>
    acc + Math.hypot(c[0]-coords[i][0], c[1]-coords[i][1]), 0);
}

function haversineM(a, b) {
  const R = 6371000, r = x => x*Math.PI/180;
  const dLat = r(b[0]-a[0]), dLng = r(b[1]-a[1]);
  const h = Math.sin(dLat/2)**2 + Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dLng/2)**2;
  return R*2*Math.asin(Math.sqrt(h));
}

function coordsSimilar(c1, c2) {
  if (!c1||!c2||!c1.length||!c2.length) return false;
  const m1 = c1[Math.floor(c1.length/2)], m2 = c2[Math.floor(c2.length/2)];
  return Math.hypot(m1[0]-m2[0], m1[1]-m2[1]) < 0.0003;
}

// ===== AFFICHAGE =====
function renderDeviation(coords, color, label) {
  const layers = [L.polyline(coords, { color, weight:5, opacity:.85 })];
  layers.push(...renderArrows(coords, color));
  const mid = coords[Math.floor(coords.length * 0.45)];
  layers.push(L.marker(mid, {
    icon: L.divIcon({ className:'', iconAnchor:[42,10],
      html:`<div style="background:${color};color:white;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.2)">${label}</div>` })
  }));
  return layers;
}

function renderArrows(coords, color) {
  if (coords.length < 3) return [];
  return [0.25, 0.55, 0.8].map(pct => {
    const idx   = Math.max(1, Math.floor(coords.length * pct));
    const f = coords[idx-1], t = coords[idx];
    const angle = Math.atan2(t[1]-f[1], t[0]-f[0]) * 180/Math.PI;
    const pt    = [(f[0]+t[0])/2, (f[1]+t[1])/2];
    return L.marker(pt, {
      icon: L.divIcon({ className:'', iconSize:[14,14], iconAnchor:[7,7],
        html:`<div style="transform:rotate(${angle-90}deg);color:${color};font-size:14px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">▲</div>` })
    });
  });
}

function pointMarker(pt, label, color) {
  return L.marker(pt, {
    icon: L.divIcon({ className:'', iconSize:[28,28], iconAnchor:[14,14],
      html:`<div style="background:${color};color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid white">${label}</div>` })
  });
}

// ===== TOGGLES =====
function toggleDev1() { dev1Visible = !dev1Visible; dev1Layers.forEach(l => dev1Visible ? l.addTo(map) : map.removeLayer(l)); updateToggles(); }
function toggleDev2() { dev2Visible = !dev2Visible; dev2Layers.forEach(l => dev2Visible ? l.addTo(map) : map.removeLayer(l)); updateToggles(); }
function toggleDev3() { dev3Visible = !dev3Visible; dev3Layers.forEach(l => dev3Visible ? l.addTo(map) : map.removeLayer(l)); updateToggles(); }

function updateToggles() {
  const states = [
    { id:'toggle-dev1', cls:'toggle-green',  vis:dev1Visible, lbl:'Dév. 1' },
    { id:'toggle-dev2', cls:'toggle-blue',   vis:dev2Visible, lbl:'Dév. 2' },
    { id:'toggle-dev3', cls:'toggle-orange', vis:dev3Visible, lbl:'Dév. 3' },
  ];
  states.forEach(({ id, cls, vis, lbl }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.className = `toggle-btn ${cls}${vis ? '' : ' inactive'}`;
    btn.textContent = (vis ? '👁 ' : '🙈 ') + lbl;
  });
}

// ===== UTILS =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
const show = id => { document.getElementById(id).style.display = 'block'; };
const hide = id => { document.getElementById(id).style.display = 'none'; };
function indicator(msg) { document.getElementById('step-indicator').textContent = msg; }
function setStatus(msg)  { const el = document.getElementById('draw-status'); el.innerHTML = msg; el.style.display = 'block'; }
function fmtDate(s) { return s ? new Date(s).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'}) : ''; }
function resetAll() { localStorage.removeItem('chantier'); window.location.reload(); }

window.getMap          = () => map;
window.getChantierData = () => chantierData;
