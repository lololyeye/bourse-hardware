# Bourse du Hardware

Suivi des prix des composants PC façon terminal boursier : indice du marché, graphiques interactifs, watchlist, signaux d'achat expliqués, alertes, configurations comparées et plan d'achat selon le budget.

Site : https://lololyeye.github.io/bourse-hardware/

## Principes

- **Aucun prix inventé.** Les prix de départ sont marqués « estimation » et n'entrent pas dans les signaux. Un signal demande au moins 3 relevés réels.
- **Pas de scraping.** Le site ne lit pas les boutiques depuis le navigateur. Les prix viennent :
  - de tes relevés (saisie, relevé groupé, import CSV/JSON) ;
  - des relevés publiés dans [`data/prices.json`](data/prices.json) : des prix neufs lus à la main sur des pages publiques, chacun avec son lien et sa date. L'app les ajoute une seule fois à l'historique et ne les remet pas si tu les supprimes.

  Les liens « Comparer les offres » ouvrent des recherches.
- **Une estimation s'efface devant un vrai prix.** Dès qu'un produit a un relevé réel, son estimation de départ reste dans l'historique mais n'est plus utilisée.
- **Tes données restent chez toi** (`localStorage`). Le partage passe par un lien qui contient une copie compressée, sans serveur. Le budget n'y figure que si tu le coches.
- **Une mise à jour n'efface jamais tes données.** Les données v1 restent en place et une copie datée est créée. Les données illisibles sont conservées telles quelles. Une réinitialisation enregistre une copie avant. Tout est visible dans Réglages → Stockage.

## Lancer en local

```
npm run serve
```

Puis ouvrir http://localhost:5173. Aucun `npm install` n'est nécessaire : le site n'a pas d'étape de build.

## Tests

```
npm test               # tests unitaires (Node ≥ 22)
npm run test:browsers  # Brave, Chrome et Edge s'ils sont installés, via le protocole DevTools
```

Les tests navigateur lancent un serveur local, ouvrent chaque navigateur en mode headless avec un profil temporaire et vérifient :

- la migration v1 → v2 ;
- les 12 pages en 1366 px et 375 px, sans débordement horizontal ;
- le graphique ;
- l'ajout d'un relevé depuis le formulaire ;
- le déclenchement unique d'une alerte ;
- les modes d'animation (préférence système réduite ou non, réglages « Pleines » et « Aucune ») ;
- le partage sans budget ;
- l'import par lien ;
- l'absence d'erreurs console.

Les captures sont enregistrées dans `tests/browser/out/`.

## Architecture

```
index.html            coquille + script d'apparence avant affichage (pas de flash de thème)
css/tokens.css        couleurs, espacements, durées d'animation, thèmes, niveaux de mouvement
css/app.css           composants et mise en page responsive
js/main.js            routeur, coquille (menu, barre du haut, recherche, notifications), rappels
js/core/              logique pure, testée sous Node
  catalog.js          catégories, boutiques, produits et estimations de départ, calendrier promos
  analytics.js        stats, tendance, fraîcheur, fiabilité, signaux, score d'achat, indice
  alerts.js           types d'alertes, évaluation, anti-doublon
  validate.js         validation des relevés, CSV
  migrate.js          état par défaut, normalisation, migration v1
  plan.js             plan d'achat mensuel, totaux et compatibilité des configs
  derive.js           données dérivées mémorisées par révision
  store.js            source de vérité unique, seul module qui écrit dans localStorage
  share.js            instantanés, export, import
js/ui/                DOM, icônes, graphiques, notifications
js/views/             une page par fichier
sw.js                 hors-ligne, réception Web Push, clic sur notification
tests/                tests unitaires, serveur local, tests navigateur
```

Seule dépendance : [Lightweight Charts](https://github.com/tradingview/lightweight-charts) 4.2.0 (TradingView, Apache-2.0), chargée depuis jsDelivr avec une version figée. Si elle ne se charge pas, un graphique SVG simplifié prend le relais. Les polices Geist viennent de Google Fonts.

Les détails sont dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : audit de la v1, cause du problème d'animation sous Brave, modèle de données et migration.

## Animations et Brave

Si Windows a « Effets d'animation » désactivé (Paramètres → Accessibilité → Effets visuels), Brave et Chrome signalent `prefers-reduced-motion: reduce` aux sites. Le site respecte ce réglage en mode « Auto ». Le réglage Animations (Réglages, ou l'icône soleil en haut à droite) permet de choisir Pleines, Réduites ou Aucune pour ce site seulement. La page Réglages affiche un diagnostic.

## Serveur (optionnel, non inclus)

GitHub Pages ne sert que des fichiers statiques. Ces fonctions ont besoin d'un serveur et sont **désactivées** :

| Fonction | Ce qu'il faudrait |
|---|---|
| Alertes quand le site est fermé (Web Push) | Un serveur qui garde les abonnements push et envoie les messages, signés avec une clé VAPID **privée** stockée côté serveur uniquement |
| Relevé automatique des prix | Une source autorisée : API d'un comparateur ou flux affilié. Pas de scraping |
| Synchronisation entre appareils ou avec un ami | Un stockage partagé avec authentification |

Le côté navigateur est prêt :

- `sw.js` gère les événements `push` et `notificationclick` ;
- `js/ui/notify.js` sait créer un abonnement push.

Pour brancher un serveur, renseigner dans `js/config.js` :

- `pushEndpoint`, l'URL qui reçoit les abonnements ;
- `vapidPublicKey`, la clé **publique** uniquement.

La clé privée ne doit jamais se trouver dans ce dépôt.
