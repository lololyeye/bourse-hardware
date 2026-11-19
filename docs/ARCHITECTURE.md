# Bourse du Hardware — audit, architecture et migration

## 1. Audit de la v1 (novembre 2026)

| Domaine | État v1 | Problème |
|---|---|---|
| HTML | Une page, 6 onglets `section.tab` montrés/cachés | Pas de routes, impossible de partager un lien vers un produit |
| CSS | Un seul `style.css`, tokens dans `:root`, thème clair via media query | Pas de réglage de thème, pas de système de mouvement |
| JS | Un seul `app.js` (~400 lignes), état global `S` muté partout, `renderAll()` reconstruit tout le DOM à chaque action | Rendu complet coûteux, écouteurs recréés à chaque rendu |
| Modèle | `prods[id] = {target, hist:[{t,p,src}]}` | Pas de devise, boutique, URL source, méthode ou statut par relevé |
| Stockage | `localStorage["bourse-hardware-v1"]` | JSON malformé → retour silencieux aux valeurs par défaut |
| Calculs | min / moy / max, variation vs relevé précédent et 30 j | Signaux basés sur une « tendance » saisie à la main (`outlook`), pas sur les données |
| Alertes | Déclenchées à l'ajout d'un relevé (baisse %, hausse %, cible) + rappels | Pas configurables par produit, pas d'activation/désactivation, pas d'historique séparé |
| Graphiques | Sparklines SVG faites main | Pas d'infobulle, de zoom, de périodes ni de lignes de référence |
| Notifications | `new Notification()` si permission | Pas de service worker, pas d'action au clic, pas de test |
| Partage | Lien `#d=base64(JSON)` + export/import JSON | Pas de choix du contenu, pas de validation avant import |
| Responsive | Grille qui passe en cartes sous 900 px | Onglets en défilement horizontal sur mobile |

### Cause du problème d'animation dans Brave (vérifiée)

Mesuré dans Brave 158 et Chrome 158 sur cette machine avec `tests/browser/cdp.mjs` :
`matchMedia('(prefers-reduced-motion: reduce)').matches === true`. Le réglage Windows
« Effets d'animation » est désactivé (`HKCU\Control Panel\Desktop\WindowMetrics\MinAnimate = 0`),
et les navigateurs Chromium transmettent ce réglage. La règle v1
`@media (prefers-reduced-motion:reduce){.ticker .track{animation:none}}` coupait donc le ticker,
alors que le fondu des onglets, non conditionné, continuait. Brave ne bloque rien.

Correction : un réglage de mouvement explicite (`auto` | `full` | `reduced` | `none`) appliqué en
`<html data-motion>`. `auto` suit le système. Toutes les animations CSS sont conditionnées par
`[data-motion="full"]`. En mode réduit, le ticker devient une bande statique qu'on peut faire défiler :
le contenu reste visible.

## 2. Architecture v2

Site statique, modules ES natifs, aucune étape de build. Toujours déployable sur GitHub Pages.

```
index.html            coque : barre latérale, barre du haut, <main id="view">
css/tokens.css        couleurs, typo, espacements, thèmes, accents, mouvement
css/app.css           mise en page + composants
js/main.js            démarrage, routeur, coque (barre latérale, recherche, centre de notifications)
js/core/store.js      état, persistance, abonnements, opérations (seul module qui écrit)
js/core/migrate.js    v1 → v2, nettoyage des données malformées (pur, testé)
js/core/validate.js   validation des relevés et des imports (pur, testé)
js/core/analytics.js  stats, indice, tendance, signaux, score « quand acheter » (pur, testé)
js/core/alerts.js     évaluation des règles d'alerte, anti-doublon (pur, testé)
js/core/catalog.js    catégories + catalogue de départ (prix sourcés ou marqués estimation)
js/core/format.js     prix, dates, durées relatives
js/core/share.js      instantanés (deflate + base64url), CSV/JSON
js/ui/dom.js          html`` échappé, délégation d'événements, toasts, dialogues de confirmation
js/ui/icons.js        jeu d'icônes SVG cohérent (trait 1,6 px)
js/ui/chart.js        Lightweight Charts (zoom, déplacement, infobulle, lignes de prix) + repli SVG
js/ui/notify.js       API Notification, service worker, abonnement Web Push (si un serveur est configuré)
js/views/*.js         une vue par route
sw.js                 cache hors ligne (réseau d'abord) + gestionnaires push / notificationclick
js/config.js          point d'accès push + clé VAPID publique (vides = surveillance en arrière-plan désactivée)
tests/*.test.mjs      node --test (analytics, validation, migration, alertes)
tests/browser/*.mjs   tests de bout en bout CDP dans Brave / Chrome / Edge réels
```

### Dépendance unique

**TradingView Lightweight Charts 4.2.0** (≈ 45 ko gzip, Apache-2.0), chargée depuis jsDelivr avec
une version fixée. Choisie plutôt qu'ECharts (≈ 330 ko) ou Chart.js (sans axe temporel natif, zoom par
plugin) : axe temporel, zoom et déplacement natifs, lignes de prix, rendu canvas rapide. Si le CDN est
injoignable, `chart.js` bascule sur un graphique SVG avec infobulle. Le site ne casse jamais.

### Modèle de données v2 (`localStorage["bourse-hardware-v2"]`)

```
products[]      {id, name, brand, category, specs{socket,memType,tdp,watts,formFactor}, createdAt}
observations[]  {id, productId, price, currency, retailer, sourceUrl, ts, method:'seed'|'manual'|'import'|'api', status:'estimate'|'verified'|'unverified'}
watchlist[]     {productId, target, priority, note, favorite, deadline}
alerts[]        {id, productId, type, threshold, notify, enabled, createdAt, lastTriggeredAt, armed}
notifications[] {id, ts, alertId, productId, title, body, read}
budget          {net, fixed, life, saved, pcMonthly, safetyMonthly, plan[{id,label,productIds,extra,resale,done}]}
configs[]       {id, name, budget, parts{cpu,gpu,motherboard,ram,storage,psu,case,cooling,monitor}, owned{}}
settings        {theme, accent, motion, chartStyle, currency, dateFormat, staleDays, reminderDays, weights{}, browserNotif}
meta            {version:2, createdAt, migratedFrom, lastObservationAt}
```

### Migration (jamais destructive)

1. Lecture de `bourse-hardware-v2`. Si absent, lecture de `bourse-hardware-v1`.
2. La v1 est **copiée** dans `bourse-hardware-v1-backup-<date>` puis convertie. La clé v1 n'est jamais supprimée.
3. `hist[]` → `observations[]` (`estimation` → `method:'seed', status:'estimate'`, `relevé` → `method:'manual', status:'verified'`).
   `target` → `watchlist`. Le fil d'alertes → `notifications`. Budget, ordre GPU d'abord, revente, prix modifiés et achats cochés → `budget.plan`.
4. Chaque champ est validé ; un enregistrement invalide est écarté et compté dans `meta.migrationReport`, jamais en silence.
5. Si le JSON est illisible, la chaîne brute est sauvegardée sous `bourse-hardware-corrupt-<ts>` avant de repartir de zéro, et l'utilisateur est prévenu.

## 3. Honnêteté des données

- Aucun prix n'est inventé. Les prix de départ affichent leur source ou le badge « Estimation ».
- Chaque prix affiche son âge (« vérifié il y a 3 j ») et un indicateur de fraîcheur (frais / vieillissant / périmé).
- Les signaux demandent au moins 3 relevés vérifiés, sinon « Données insuffisantes ».
- Aucun scraping des boutiques depuis le navigateur. Les mises à jour automatiques et les push en arrière-plan demandent un
  serveur (voir README, section « Serveur »). Sans serveur, l'interface l'indique.
