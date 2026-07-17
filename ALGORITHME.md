====================================================================
  PLANDEV — ALGORITHME DE CALCUL DES DÉVIATIONS
  Explication détaillée (moteur : Valhalla)
====================================================================


1. VUE D'ENSEMBLE
-----------------
L'application calcule deux itinéraires de déviation (sens 1 et sens 2)
autour d'une portion de route barrée définie par deux points P1 et P2.

Le calcul s'appuie sur Valhalla, un moteur de routage open-source
hébergé publiquement par OpenStreetMap (valhalla1.openstreetmap.de).

Avantage clé par rapport à OSRM : Valhalla expose nativement le
paramètre exclude_locations, qui force la route à éviter un point
précis du réseau sans nécessiter de pré-calcul ni de contournement
algorithmique côté client.


====================================================================
2. DONNÉES D'ENTRÉE
====================================================================

L'utilisateur fournit :
  - P1 : point de début de la section barrée [lat, lng]
  - P2 : point de fin de la section barrée   [lat, lng]

Ces points sont placés aux coordonnées exactes du clic utilisateur.
Valhalla accroche automatiquement chaque point sur le nœud routier
le plus proche lors du calcul d'itinéraire (snap natif).

Le point milieu est calculé côté client pour alimenter exclude_locations :
  midLat = (P1.lat + P2.lat) / 2
  midLon = (P1.lng + P2.lng) / 2


====================================================================
3. CALCUL DE LA DÉVIATION — exclude_locations Valhalla
====================================================================

3.1 Principe
------------
Pour forcer un contournement, le milieu du segment barré est passé
dans le champ exclude_locations de la requête Valhalla. Valhalla
exclut le nœud routier le plus proche de ce point de son graphe,
rendant la traversée du segment impossible. La route calculée doit
alors obligatoirement passer d'un autre côté.

3.2 Format de la requête (sens 1 : P1 → P2)
--------------------------------------------
  POST https://valhalla1.openstreetmap.de/route
  Content-Type: application/json

  {
    "locations": [
      { "lon": P1[1], "lat": P1[0] },
      { "lon": P2[1], "lat": P2[0] }
    ],
    "costing": "auto",
    "exclude_locations": [
      { "lon": (P1[1]+P2[1])/2, "lat": (P1[0]+P2[0])/2 }
    ],
    "directions_options": { "units": "kilometers" }
  }

3.3 Sens 2 (P2 → P1)
---------------------
Requête identique avec locations inversées :
  "locations": [
    { "lon": P2[1], "lat": P2[0] },
    { "lon": P1[1], "lat": P1[0] }
  ]
Le même exclude_locations (milieu du segment) est utilisé.

Les deux appels sont lancés en parallèle (Promise.all) pour minimiser
le temps de réponse total.

3.4 Fallback — route directe sans exclusion
-------------------------------------------
Si Valhalla retourne une erreur HTTP (typiquement erreur 442 :
l'exclusion du point rend tout itinéraire impossible), la fonction
calculerDeviation() bascule automatiquement vers valhallaDirectRoute(),
qui refait la même requête sans exclude_locations. Dans ce cas, la
déviation affichée est l'itinéraire direct (aucune alternative).

Cas déclenchant le fallback :
  - Zone isolée sans rue parallèle (réseau en impasse)
  - P1/P2 très rapprochés sur une petite voie sans contournement
  - Panne ou limite de débit du serveur Valhalla public


====================================================================
4. DÉCODAGE DE LA GÉOMÉTRIE
====================================================================

Valhalla retourne la géométrie encodée en polyline6 (encodage Google
Polyline avec précision 1e-6 au lieu de 1e-5).

La fonction decodePolyline6(encoded) décode cette chaîne en un tableau
de coordonnées [[lat, lng], [lat, lng], ...] directement exploitable
par Leaflet (qui attend le format [lat, lng]).

Algorithme de décodage (décalage de bits) :
  Pour chaque paire de valeurs encodées (lat, lng) :
    1. Lire les octets jusqu'à trouver un octet < 0x20
    2. Appliquer le décalage de bits et le complément à 1 si négatif
    3. Diviser par 1e6 pour obtenir la valeur en degrés
    4. Accumuler (valeurs différentielles)

Les coordonnées sont extraites depuis :
  data.trip.legs[0].shape


====================================================================
5. SENS 2 — ROUTE BIDIRECTIONNELLE
====================================================================

Si les deux itinéraires (P1→P2 et P2→P1) passent physiquement par
les mêmes rues (route bidirectionnelle à double sens), leurs tracés
sont géographiquement identiques mais parcourus en sens inverse.

La fonction coordsSimilar(c1, c2) détecte ce cas en comparant les
points médians des deux tracés :
  Si distance(milieu_c1, milieu_c2) < 0.0003° (~33m) → similaires

Dans ce cas, le tracé du sens 2 est simplement l'inversion du sens 1 :
  coords2 = [...coords1].reverse()

Cela représente fidèlement la réalité : les voitures en sens retour
empruntent les mêmes rues dans l'autre direction.


====================================================================
6. DÉCALAGE VISUEL (OFFSET PERPENDICULAIRE)
====================================================================

Lorsque les deux tracés sont identiques (ou très proches), les deux
polylignes se superposent sur la carte et seule la couleur du dessus
est visible.

La fonction offsetCoords(coords, offsetDeg) décale chaque point
perpendiculairement de ~3m (0.000030°) avant l'affichage :

  Sens 1 : offset de +0.000030° (vers la gauche du vecteur directionnel)
  Sens 2 : offset de -0.000030° (vers la droite)

Calcul du décalage pour chaque point du tracé :
  - Vecteur directionnel local : D = (coords[i+1] - coords[i-1])
  - Longueur : L = √(D.lat² + D.lng²)
  - Vecteur perpendiculaire normalisé : n = (-D.lng/L, D.lat/L)
  - Point décalé : [c.lat + n.lat × offset, c.lng + n.lng × offset]

Pour les extrémités (premier et dernier point), le vecteur est calculé
avec le point voisin unique disponible.

Résultat : les deux lignes apparaissent côte à côte sur la carte,
clairement distinguables même sur un tracé physiquement commun.


====================================================================
7. AFFICHAGE DU SEGMENT BARRÉ
====================================================================

Le tracé en pointillé rouge (⛔ Route barrée) est obtenu par un appel
séparé à valhallaDirectRoute(P1, P2), sans exclusion, dès que P2 est
posé. Cet appel est asynchrone (fire-and-forget) : le bouton
"Générer les déviations" s'affiche immédiatement pendant que le tracé
se charge en arrière-plan.

Si la requête Valhalla échoue (réseau, point hors réseau), la ligne
de secours est une droite simple entre P1 et P2.


====================================================================
8. LIMITATIONS CONNUES
====================================================================

a) Exclusion par point unique
   L'exclusion porte sur un seul point (le milieu du segment P1→P2).
   Pour un segment long, un itinéraire alternatif pourrait théoriquement
   emprunter le début ou la fin de la section barrée sans passer par
   le milieu exclu. L'utilisation de exclude_polygons avec la zone
   dessinée par l'utilisateur serait plus robuste mais n'est pas
   encore implémentée.

b) Dépendance au réseau OSM
   Valhalla route sur les données OpenStreetMap. Des rues manquantes
   ou mal étiquetées peuvent conduire à des déviations sous-optimales
   ou à l'absence de résultat.

c) Fallback = itinéraire direct
   Si exclude_locations rend le trajet impossible (erreur 442),
   la déviation affichée est l'itinéraire direct P1→P2, c'est-à-dire
   la route barrée elle-même. L'utilisateur doit alors repositionner
   P1 et P2 ou dessiner une zone plus large.

d) Serveur public Valhalla
   L'instance valhalla1.openstreetmap.de est gratuite mais sans
   garantie de disponibilité ni de débit. Pour un usage en production,
   une instance Valhalla dédiée ou Stadia Maps (free tier) est
   recommandée.

e) Snap visuel vs snap de routage
   Les marqueurs P1 et P2 sont posés aux coordonnées exactes du clic.
   Valhalla accroche ces points sur le réseau routier au moment du
   calcul. Il peut exister un léger écart visuel entre la position
   du marqueur et le début réel de l'itinéraire calculé.


====================================================================
9. RÉSUMÉ DU FLUX D'EXÉCUTION
====================================================================

  1. L'utilisateur pose P1 et P2 sur la carte (clic simple, pas de snap)
  2. drawBlockedSegment() est appelé en arrière-plan :
       valhallaDirectRoute(P1, P2) → tracé rouge pointillé
  3. Clic "Générer les déviations" :

     ┌─ Promise.all([
     │    calculerDeviation(P1, P2),   ← sens 1
     │    calculerDeviation(P2, P1)    ← sens 2
     │  ])
     │
     │  Pour chaque sens, calculerDeviation() :
     │    POST Valhalla avec exclude_locations=[milieu]
     │      ├─ Succès → decodePolyline6(shape) → [[lat,lng], ...]
     │      └─ Erreur → valhallaDirectRoute() (fallback sans exclusion)
     │
     ├─ coordsSimilar(coords1, coords2.reverse()) ?
     │     ├─ Oui → coords2 = [...coords1].reverse()
     │     └─ Non → garder coords2 de Valhalla
     │
     ├─ offsetCoords(coords1, +0.000030°)  → display1
     ├─ offsetCoords(coords2, -0.000030°)  → display2
     │
     └─ Afficher display1 (vert) + display2 (bleu)
        avec polylignes + flèches directionnelles + labels

====================================================================
  Fin du document
====================================================================
