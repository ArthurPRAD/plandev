# PlanDév — Plan de déviation automatique

Application web gratuite pour générer des plans de déviation automatiquement à partir d'une adresse de chantier.

## Lancement rapide

### Option 1 — VS Code Live Server (recommandé)
1. Ouvrir le dossier `deviation-app/` dans VS Code
2. Installer l'extension **Live Server** (ritwickdey.LiveServer)
3. Clic droit sur `index.html` → **Open with Live Server**
4. L'application s'ouvre sur `http://127.0.0.1:5500`

### Option 2 — Python (si installé)
```bash
cd deviation-app
python -m http.server 8080
# Ouvrir http://localhost:8080
```

### Option 3 — Node.js
```bash
cd deviation-app
npx serve .
```

> ⚠️ Ne pas ouvrir index.html directement en double-cliquant (file://) — les APIs externes seront bloquées par le navigateur.

---

## Stack technique (100% gratuit)

| Composant | Outil |
|---|---|
| Carte | Leaflet.js 1.9.4 |
| Fond de carte | OpenStreetMap |
| Recherche adresse | Nominatim API |
| Calcul d'itinéraires | OSRM API publique |
| Dessin sur carte | Leaflet.draw |
| Export PDF | html2canvas + jsPDF |

---

## Structure

```
deviation-app/
├── index.html        → Formulaire infos chantier
├── map.html          → Carte + dessin + génération + export
├── css/
│   └── style.css
├── js/
│   ├── form.js       → Logique formulaire
│   ├── map.js        → Logique carte, dessin, OSRM
│   └── pdf.js        → Export PDF
└── README.md
```

---

## Flux utilisateur

1. **Formulaire** → nom du chantier, entreprise, dates
2. **Localisation** → recherche de l'adresse sur la carte
3. **Dessin** → tracer la zone barrée sur la carte
4. **Génération** → calcul automatique des déviations via OSRM
5. **Export** → téléchargement du PDF avec carte + légende + infos

---

## Hébergement gratuit

- **Vercel** : `npx vercel` dans le dossier
- **GitHub Pages** : push sur un repo public, activer Pages sur la branche `main`
- **Netlify** : glisser-déposer le dossier sur netlify.com

---

## V2 — Fonctionnalités prévues

- Panneaux de signalisation normalisés IDRRIM
- Multi-phases de chantier
- Sauvegarde / historique
- Partage par lien
- Authentification utilisateur
