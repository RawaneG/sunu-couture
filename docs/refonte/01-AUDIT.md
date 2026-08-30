# Phase 1 — Audit technique de Tayoo (état actuel)

> Version du dépôt auditée : branche `main`, commit `2243635`.
> Date : 2026-08-29. Aucune modification de code n'a été faite pendant cet audit.
> Tests au départ : `npm test` → **19 tests OK** ; `npx tsc -b` → **OK** (TS strict).

---

## 1. Vue d'ensemble

| Élément | Valeur |
|---|---|
| Type | PWA **100 % front**, aucun backend, aucune API |
| Build | Vite 8 + `@vitejs/plugin-react` |
| Langage | TypeScript **strict** (`tsconfig.app.json` : `noUnusedLocals/Parameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`) |
| UI | React **19.2**, React Router **7**, Tailwind **4** (`@tailwindcss/vite`), `framer-motion` 13, `clsx` |
| État | **Zustand 5** + `persist` (middleware `localStorage`) |
| PWA | `vite-plugin-pwa` (Workbox, precache), `registerType: autoUpdate` |
| Fonts | `@fontsource-variable/inter`, `@fontsource-variable/fraunces` |
| Déploiement | Vercel (`vercel.json` : rewrite SPA `/(.*) → /`) |
| Tests | **Vitest 4** — 1 fichier (`src/lib/store.test.ts`), 19 tests, fonctions pures uniquement |
| Lint | `oxlint` (config minimale `.oxlintrc.json`) |
| Icônes | `scripts/generate-icons.mjs` (via `sharp`, devDependency) → `public/pwa/*` |
| Variables d'environnement | **aucune** |

### Dépendances notables et risques de version

- `typescript ~6.0.2`, `vite ^8`, `vitest ^4`, `react ^19.2` : socle très récent. À figer (`package-lock.json` présent) avant d'ajouter Supabase.
- **Absent** : `@supabase/supabase-js`, `idb`/`dexie`, `zod`, client HTTP, lib de dates. Tout est à introduire.
- `sharp` : utilisé uniquement par le script d'icônes, pas au runtime.

---

## 2. Arborescence

```
src/
  main.tsx                 # BrowserRouter + StrictMode
  App.tsx                  # toutes les routes
  index.css                # thème Tailwind + tokens CSS (--paper, --ink, .glass-*)
  lib/
    store.ts               # ⭐ Zustand persist — SOURCE DE VÉRITÉ métier
    store.test.ts           # 19 tests (resteFor, nextFicheSlot, matchesQuery, migrateLegacyState)
    types.ts               # ⭐ tous les types métier + constantes (statuts, clés de champs)
    entitlements.ts        # FICHES_PAR_CARNET = 120 ; peutCreerNouveauCarnet() → true (stub paywall)
    onboarding.ts          # 2 flags localStorage (coach-marks) : sunu-swipe-hint-seen, sunu-carnet-page-hint-seen
    theme.ts               # useTheme() : classe .dark sur <html>, clé localStorage "sunu-theme"
    format.ts              # dates FR, FCFA (Intl), isOverdue, sanitizePhone/Measurement, formatDuration
    search.ts              # normalize() (sans accents) + matchesQuery()
    color.ts               # detectDominantColor() — couleur dominante d'une photo (canvas)
    image.ts               # fileToDownscaledDataUrl() — redim. 720px → dataURL jpeg q0.75
    haptics.ts             # navigator.vibrate wrapper
    icons.tsx              # jeu d'icônes SVG inline
  components/
    layout/  AppShell, Sidebar (desktop), BottomNav (mobile), MobileBrandBar
    ui/      ~30 composants (voir §7)
  pages/
    CarnetList, FicheNew, FicheDetail          # le carnet (accueil)
    OrdersLayout, OrdersList, OrdersEmptyState  # vue « Commandes » (filtre sur fiches)
    ClientsLayout, ClientsList, ClientsEmptyState, ClientDetail, ClientNew
    Catalogue, ModeleNew, ModeleDetail          # catalogue de modèles
```

---

## 3. Routes (`src/App.tsx`)

| Route | Composant | Effet |
|---|---|---|
| `/` | `CarnetList` | **Accueil = le carnet** (liste paginée, 1 carnet actif visible) |
| `/carnet` | → redirection `/` | |
| `/carnet/nouvelle` | `FicheNew` | ⚠️ **crée une fiche vide immédiatement** puis `replace` → `/carnet/:id` |
| `/carnet/:id` | `FicheDetail` | Édition **en place** de la fiche (pas d'écran « formulaire ») |
| `/commandes` | `OrdersLayout` | Split desktop : `OrdersList` (gauche, toujours) + `Outlet` |
| `/commandes` (index) | `OrdersEmptyState` | |
| `/commandes/:id` | → redirection `/carnet/:id` | compat anciens liens |
| `/commandes/nouvelle` | `FicheNew` | ⚠️ même création involontaire |
| `/catalogue` | `Catalogue` | grille de modèles |
| `/catalogue/nouveau` | `ModeleNew` | ⚠️ **crée un modèle vide immédiatement** puis `replace` → `/catalogue/:id` |
| `/catalogue/:id` | `ModeleDetail` | édition en place |
| `/clients` | `ClientsLayout` | split : `ClientsList` + `Outlet` |
| `/clients` (index) | `ClientsEmptyState` | |
| `/clients/:id` | `ClientDetail` | |
| `/clients/nouveau` | `ClientNew` | **vrai formulaire** (nom requis, tél. + photo facultatifs) — le seul de l'app |

Pas de route 404, pas de route `/carnet/:id/*`. Navigation basse : Accueil / Commandes / Catalogue / Clients.

---

## 4. Modèle de données actuel (`src/lib/types.ts`)

### 4.1 `Client`
```ts
{ id: string; name: string; phone: string; photo: string | null; colorSeed: string }
```
- **`name` = un seul champ** (pas de prénom/nom séparés).
- `phone` = chaîne **formatée avec espaces** (« 77 512 44 08 »), pas normalisée.
- `photo` : **jamais persistée** (voir §5, `partialize`).
- `colorSeed` : couleur d'avatar déterministe.

### 4.2 `Fiche` — enregistrement unique d'un travail (source de vérité)
```ts
{
  id: string;
  carnetNumero: number;          // quel carnet physique (1, 2, 3…)
  numero: number;                // 1..120 dans ce carnet — jamais réattribué

  nom: string; prenom: string; telephone: string;   // texte libre, « comme sur le papier »
  clientId: string | null;                          // lien optionnel vers Client

  champs: Record<FicheChampKey, { valeur: string; historique: string[] }>;
  voiceNote: VoiceNote | null;   // { url, duration, recordedAt } — url = dataURL base64 (webm)
  tissuPhotos: { id: string; dataUrl: string }[];   // base64 inline

  dueDate: string | null;        // ISO, jamais pré-rempli
  soldeLe: string | null;
  signature: string | null;      // dataURL PNG base64

  price: number;                 // entier FCFA
  avance: number;                // ⚠️ UN SEUL nombre (pas d'historique de versements)

  garment: string; description: string | null; fabricColor: string;   // « compléments »
  status: "recu" | "couture" | "pret" | "livre";
  late: boolean;                 // ⚠️ dérivé mais STOCKÉ (recalculé à chaque mutation de statut/date)
  createdAt: string;
}
```

**Clés de champs** (`FICHE_MESURE_KEYS`) : `E, Cou, P, T, M, C, H, F, G, TM, LR, LP, LJ` (13 mesures) + `FICHE_INFO_KEYS` : `nbrePagnes, tissusDeposes`. Chaque champ garde un **historique des valeurs rayées** (`historique[]`), affiché comme sur le papier.

### 4.3 `Modele` (catalogue)
```ts
{ id: string; nom: string; photos: TissuPhoto[]; patronPhotos: TissuPhoto[]; createdAt: string }
```

### 4.4 `OrderStatus`
`recu | couture | pret | livre` — libellés FR dans `STATUS_LABEL`. **≠** vocabulaire cible du cahier des charges (`received | sewing | ready | delivered`).

### 4.5 Absent complètement
`workshop`, `workshop_member`, `user`, `carnet` (table), `client_payment`, `media_asset`, `subscription`, `subscription_transaction`, `version` (optimistic-lock), `deleted_at`.

---

## 5. Ce qui est réellement persisté

### `localStorage["sunu-couture"]` (Zustand `persist`)
```jsonc
{ "state": { "clients": [...], "fiches": [...], "modeles": [...] }, "version": 12 }
```
- `partialize` : sur les **clients**, `photo` est forcé à `null` avant écriture → **une photo de client ne survit jamais à un rechargement** (limitation intentionnelle mais non signalée à l'utilisateur).
- **fiches et modèles écrits en entier**, ce qui inclut :
  - `tissuPhotos[].dataUrl` : **JPEG base64 inline**
  - `signature` : **PNG base64 inline**
  - `voiceNote.url` : **audio webm base64 inline**
- `version: 12`, `migrate: migrateLegacyState`.

### Autres clés `localStorage`
| Clé | Rôle |
|---|---|
| `sunu-theme` | `"dark"` / `"light"` (lu aussi par un script inline dans `index.html`) |
| `sunu-swipe-hint-seen` | coach-mark « glissez pour changer de page » |
| `sunu-carnet-page-hint-seen` | idem pagination carnet |

### Conséquences / bugs de persistance
1. **Quota `localStorage` (~5 Mo) explosé rapidement** : quelques fiches avec photos + vocal en base64 suffisent. Quand `setItem` échoue, Zustand **n'écrit rien** → perte silencieuse des modifications suivantes. **Risque de perte de données réel dès le pilote.**
2. **Aucune sauvegarde hors de l'appareil.** Changement de téléphone = tout est perdu.
3. **Aucune isolation** : tout est en clair, lisible par quiconque a le téléphone / ouvre les DevTools.
4. `IndexedDB` : **non utilisé**.
5. La seed (`seedClients` + `seedFiches`) est **l'état initial systématique**. Sur un appareil neuf, l'utilisateur voit « Awa Diouf », « Modou Fall », etc. **Aucun marqueur « démo »** ne distingue ces données de vraies saisies.

---

## 6. Store & logique métier (`src/lib/store.ts`)

### Actions
| Action | Comportement | Point d'attention |
|---|---|---|
| `addClient({name, phone, photo})` | crée + place en tête | **aucune détection de doublon téléphone** |
| `deleteClient(id)` / `deleteClients(ids)` | supprime le client, met `clientId=null` sur ses fiches (fiches conservées) | client **hard-deleted**, pas de `deleted_at`, pas d'annulation |
| `addFiche(input?)` | attribue le prochain créneau (`nextFicheSlot`) et **insère immédiatement** | ⚠️ appelée dès l'ouverture de « Nouvelle fiche » |
| `setFicheInfo(id, patch)` | merge partiel | |
| `setFicheChamp(id, key, valeur)` | si la valeur change et l'ancienne était non vide → push dans `historique` | |
| `strikeFicheChamp` / `restoreFicheChamp` | rature / restaure la dernière valeur | |
| `addFicheTissuPhoto(id, dataUrl)` | ajoute une photo **base64** | |
| `setFicheStatus` / `advanceFiche` | change le statut, **recalcule `late`** | `late` stocké, se périme (pas recalculé au simple affichage si la date passe) |
| `deleteFiche` / `deleteFiches` | **suppression dure**, `ConfirmDialog` « irréversible », **pas d'annulation** | |
| `addModele` … `removeModeles` | CRUD modèle, suppressions dures | |

### Fonctions pures exportées (testées)
- `resteFor({price, avance})` → `price - avance` (**peut être négatif** ; l'UI `ResteChampCell` clampe l'affichage à 0, `resteFor` non).
- `nextFicheSlot(fiches)` → `{carnetNumero, numero}` : max `carnetNumero`, puis max `numero` dans ce carnet + 1 ; si ≥ 120 → carnet suivant, `numero: 1`.
  - Gère les **trous au milieu** (test dédié). **Mais** : si on supprime la **dernière** fiche du carnet, le prochain ajout **réutilise ce numéro** (le max est recalculé sur le tableau vivant). À corriger : le numéro doit être « consommé » définitivement (compteur persistant, cf. table `carnets`).
- `matchesQuery(query, ...fields)` : recherche insensible casse/accents, sur nom, téléphone, numéro, vêtement.

### `migrateLegacyState(persisted)` — migrations internes déjà en place
Gère la remontée depuis d'anciennes formes du store (v8 : `clients`/`orders`/`fiches` séparés ; formes intermédiaires avec `payments[]` ou `champs.prix`/`champs.avance`). **9 tests**. Points clés déjà codés :
- une fiche legacy garde **son** `nom/prenom/telephone` verbatim ;
- `clientId` = lien bonus si un client existant correspond (par téléphone puis par nom), sinon `null` ;
- `champs.prix`/`champs.avance` (texte) → `price`/`avance` (nombres) ;
- `payments[]` intermédiaire → `avance = somme(montant)` ;
- `retraitLe` absent → `dueDate: null` (pas de date inventée) ;
- mesures/vocal restés au niveau client → repliés dans la fiche la plus récente du client.

➡️ **Cette fonction est la base directe de l'assistant de migration cloud** (voir plan de migration).

---

## 7. Composants UI

### Utilisés
`AppShell`, `Sidebar`, `BottomNav`, `MobileBrandBar`, `PageHeader` (titre + recherche + actions), `Avatar`, `BrandMark`, `Fab`, `Tile`, `ConfirmDialog` (modale destructive), `SwipeRow` (glisser pour appeler), `OrderRow`, `StatusPill` (+ `STATUS_DOT_COLOR`), `FicheChampCell` (champ + popover historique), `FichePaiementCells` (`PrixChampCell`, `AvanceChampCell`, `ResteChampCell`), `FabricPhotos`, `PhotoCapture` (+ `PhotoSourceSheet` appareil/galerie), `ImageCropper`, `VoiceRecorder`, `VoiceNotePlayer`, `SignaturePad`, `ClientFields` (photo + nom + tél.), `ModeleGrid`, `ModelePickerSheet` (choisir un modèle depuis une fiche).

### ⚠️ Composants morts (définis, jamais importés)
`ClientPickerSheet`, `MeasurementsInput`, `GarmentPicker`, `Stepper`, `ColorSwatchPicker`, `PriceInput`.
Ce sont des restes de l'ancien parcours `OrderNew/OrderDetail` supprimé au commit `c7fbaa2`. **`ClientPickerSheet` existe donc déjà** (liste + recherche + création inline d'un client) mais **n'est branché nulle part** : le parcours « Nouvelle fiche » actuel ne passe **jamais** par un choix de client — il ouvre une fiche vierge avec des champs `Nom`/`Prénom`/`Téléphone` en texte libre.

---

## 8. Doublons & incohérences carnet / clients / commandes

1. **Commandes = déjà une vue filtrée des fiches** (`OrdersList` filtre `fiches`), et `/commandes/:id` redirige vers `/carnet/:id`. ✅ conforme à l'intention du cahier des charges. Reste à supprimer les vestiges (`OrdersEmptyState`, `OrderToFicheRedirect`) au moment du nettoyage.
2. **Identité dupliquée** : `fiche.{nom,prenom,telephone}` (texte libre) **vs** `Client.{name,phone}` (lié). Partout, le code fait un *fallback* (`clientFieldsFor`, `OrderRow`, `FicheDetail`). Le passage au modèle PostgreSQL impose de trancher (voir décisions).
3. **`Client.name` = 1 champ** ; `Fiche` a `nom` + `prenom` ; cible PG = `first_name` / `last_name` / `nickname`. Réconciliation nécessaire.
4. **Aucune détection de doublon** à la création de client (`ClientNew`, `ClientPickerSheet`). Le cahier des charges l'exige (« si le téléphone existe déjà, proposer le client existant »).
5. `numero` de fiche = clé « visible » ; il ne doit **pas** servir d'identifiant technique (déjà le cas : `id` string séparé). ✅

---

## 9. Comportements qui créent / suppriment des données

### Création involontaire (bug prioritaire du cahier des charges)
| Déclencheur | Code | Effet |
|---|---|---|
| Ouvrir `/carnet/nouvelle` ou `/commandes/nouvelle` | `FicheNew` `useEffect` → `addFiche()` | **fiche vide persistée**, un `numero` consommé, apparaît dans le carnet & dans « Commandes » |
| FAB « + » de `CarnetList` | `handleAdd()` → `addFiche()` direct puis `navigate` | idem (ne passe même pas par la route) |
| Lien « Nouvelle fiche » de la `Sidebar` | `<Link to="/carnet/nouvelle">` | idem |
| `Fab` de `OrdersList` | `to="/commandes/nouvelle"` | idem |
| Ouvrir `/catalogue/nouveau` | `ModeleNew` `useEffect` → `addModele()` | **modèle vide persisté** |
| « Nouvelle fiche pour {client} » (`ClientDetail`) | `addFiche({clientId, prenom, nom, telephone, prefillChamps})` | crée immédiatement (mais au moins pré-rempli) — copie les **dernières mesures** du client **sans confirmation** |

➡️ Il faut un **brouillon local** (IndexedDB / état mémoire) : la fiche n'est écrite (localement puis cloud) qu'à la **première information utile** ou sur **confirmation explicite**. Le `numero` ne doit être réservé qu'à ce moment-là.

### Suppression
- `deleteFiche(s)`, `removeModele(s)` : **suppression dure**, `ConfirmDialog` « irréversible », **aucune annulation**, aucun `deleted_at`, aucune archive.
- `deleteClient(s)` : client supprimé dur, fiches conservées avec `clientId=null`.
- Le cahier des charges veut : suppression **réversible**, bouton **« Annuler »**, `deleted_at`, statut `archived`.

---

## 10. Photos, vocaux, signatures — stratégie actuelle

| Média | Capture | Traitement | Stockage |
|---|---|---|---|
| Photo tissu / modèle | `PhotoCapture` (`capture="environment"` ou galerie) → `ImageCropper` **ou** `fileToDownscaledDataUrl` | redim. **720 px**, JPEG **q0.75** ; `detectDominantColor()` sur la 1re photo tissu → `fiche.fabricColor` | **base64 dataURL inline** dans `fiche.tissuPhotos[]` / `modele.photos[]` (donc dans `localStorage`) |
| Photo client | `PhotoCapture` sans crop | `URL.createObjectURL` (**blob URL**) | non persistée (`partialize` force `null`) — **perdue au reload** |
| Note vocale | `VoiceRecorder` — `MediaRecorder`, `audio/webm` | `FileReader` → **base64 dataURL** (mode `persist` utilisé par `FicheDetail`) ; sinon `blob:` URL éphémère | `fiche.voiceNote.url` **base64 inline** |
| Signature | `SignaturePad` canvas | `canvas.toDataURL("image/png")` | `fiche.signature` **base64 inline** |

**Risques :**
- `MediaRecorder` + `audio/webm` : **support iOS/Safari instable** (souvent `mp4`/`aac` seulement). Le pilote est Android → acceptable court terme, à sécuriser ensuite.
- Tout média = base64 dans `localStorage` → cf. §5.1 (quota).
- Aucun bucket privé, aucune URL signée, aucun `media_assets`.

---

## 11. Sécurité (état actuel)

- **Aucune authentification**, aucun compte, aucun serveur.
- Données **en clair** dans `localStorage`, mono-appareil.
- **Pas de multi-atelier**, pas de `workshop_id`, pas de RLS (pas de base).
- Numéros de téléphone, voix, photos, signatures, mesures : stockés sans consentement, sans politique de conservation, sans possibilité d'export/suppression structurée.
- Aucune clé secrète dans le front (il n'y en a aucune) — mais rien n'est prévu pour en protéger (Edge Functions, `service_role`, secrets paiement).

---

## 12. Configuration PWA

- `VitePWA` : `registerType: 'autoUpdate'`, `devOptions.enabled: false` (pas de SW en dev ; `dev-dist/` est gitignoré).
- Manifest : `Tayoo`, `standalone`, `portrait-primary`, `lang: fr`, icônes 192/512 + maskables.
- Workbox : `globPatterns: ['**/*.{js,css,html,woff2,png,svg}']` (precache de l'app shell), `navigateFallbackDenylist: [/^\/api\//]`.
- **Aucune règle de runtime caching** (aucune API à cacher aujourd'hui), **aucune file d'attente offline**, **aucun Background Sync**.
- Offline actuel = uniquement l'app shell + les données déjà dans `localStorage` (puisque tout est local). L'app « fonctionne hors ligne » par accident d'architecture, pas par conception.

---

## 13. Tests existants

`src/lib/store.test.ts` — **19 tests**, fonctions pures uniquement :
- `resteFor` (3) — soustraction, solde exact, dépassement négatif.
- `nextFicheSlot` (4) — carnet neuf, incrément, bascule à 120, trous.
- `matchesQuery` (3) — numéro, téléphone avec espaces, casse/accents.
- `migrateLegacyState` v8→v9 (9) — cf. §6.

**Absent** : test de composant, test de rendu, e2e, test RLS/isolation, test hors-ligne, test de synchro, harnais Vitest DOM (`environment: 'jsdom'` non configuré — `vite.config.ts` n'a pas de bloc `test`).

---

## 14. Synthèse des écarts vs cahier des charges

| Domaine | État actuel | Cible |
|---|---|---|
| Persistance métier | `localStorage` (base64 inline) | Supabase PG + Storage privé + IndexedDB (cache/queue) |
| Couche d'accès | Composants → `useStore` directement | **Repository** interposé (remplaçable par NestJS) |
| Auth | aucune | Supabase Auth + session appareil + PIN local de déverrouillage + révocation ancien téléphone |
| Multi-atelier | aucun | `workshop_id` partout + **RLS** + tests d'isolation A/B |
| Médias | base64 dans `localStorage` | buckets privés `workshops/{id}/fiches/{id}/{fileId}` + URLs signées courtes + `media_assets` |
| « Nouvelle fiche » | crée une fiche vide immédiatement | brouillon local, écriture à la 1re info utile / confirmation |
| Parcours client | pas de choix de client (texte libre) ; `ClientPickerSheet` mort | `Client déjà connu` / `Nouveau client`, recherche, reprise mesures avec confirmation, anti-doublon téléphone |
| Paiements | `avance` = 1 nombre | `client_payments` (montant, date, moyen, note), `reste = prix − Σ versements`, garde-fous (≥ 0, sur-paiement signalé) |
| Suppression | dure, « irréversible » | logique (`deleted_at` / `archived`), **Annuler** |
| Statuts | `recu/couture/pret/livre` | `received/sewing/ready/delivered` + `state: draft/active/cancelled/archived` |
| Carnet | `carnetNumero` = nombre sur la fiche | table `carnets` + contrainte unique `(workshop_id, number)` + compteur non réutilisable |
| Hors-ligne | accidentel | file d'opérations idempotentes, états explicites (« Enregistré sur ce téléphone » / « Synchronisation… » / « Sauvegardé » / « Connexion nécessaire » / « Échec — réessayer »), conflit via `version` + `updated_at` |
| Abonnement | `entitlements.ts` = stub `true` | `subscriptions` / `subscription_transactions` configurables en base, découverte 20 fiches, alerte à 15, grâce 7 j |
| Vie privée | rien | info tailleur, consentement client, politique, conservation, export, journal d'accès, procédure téléphone perdu (CDP Sénégal) |
| Tests | 19 (fonctions pures) | + métier, sécurité/RLS, hors-ligne, UX terrain |
| `late` | dérivé **mais stocké** | dérivé à l'affichage |
| `colorSeed` / `fabricColor` / historique des champs | spécificités Tayoo à **préserver** | conserver (jsonb `measurements`, colonnes dédiées) |

---

## 15. Ce qui fonctionne et doit être préservé

- Carnet paginé « papier » (30 pages × 4 = 120), navigation par glissement, recherche nom/téléphone/numéro/vêtement.
- Édition **en place** de la fiche (pas de gros formulaire).
- **Historique des valeurs rayées** par champ (`historique[]` + popover « ancienne valeur » + Restaurer).
- Note vocale enregistrée/écoutée sur la fiche (audio original conservé).
- Photos tissu avec **détection auto de la couleur dominante**.
- Catalogue de modèles (lookbook + patron de coupe) → injection dans une fiche en un tap.
- « Nouvelle fiche pour {client} » qui **pré-remplit les dernières mesures**.
- Pastille de statut unique par fiche (« En retard » l'emporte).
- Thème clair/sombre animé, haptique, `MobileBrandBar` / `Sidebar` / `BottomNav`.
- `migrateLegacyState` (socle de l'import cloud).
- Conventions d'accessibilité déjà largement respectées (icônes + `aria-label`, cibles ~44 px, `ConfirmDialog`, libellés FR courts).

---

## 16. Décisions métier / techniques à valider avant la Phase 2

1. **Projet Supabase** : ✅ tranché — `sunu-couture-dev` créé (compte perso, `eu-west-1`, PG 17, non relié) ; `prod` plus tard. Voir `03-DECISIONS.md` D1.
2. **Identité client** : `Client.name` (1 champ) → `first_name` + `last_name` + `nickname`. Règle de découpage à l'import (aujourd'hui `name.split(/\s+/)` : 1er mot = prénom). Le cahier des charges autorise « nom **ou** surnom » → `last_name` et `first_name` doivent pouvoir être vides si `nickname` est rempli.
3. **Téléphone** : format de `phone_normalized` — chiffres bruts (`77XXXXXXX`) ou E.164 (`+221…`). Impact sur l'anti-doublon et un futur OTP.
4. **`avance` → `client_payments`** : à l'import, créer **1 versement** = montant de l'avance, `paid_at = fiche.createdAt`, `method = null`, `note = "Reprise du carnet"`. À confirmer.
5. **`media_assets`** : la table du cahier des charges n'a pas de colonne `duration` (utile pour le vocal). Ajouter `duration_seconds` **ou** une colonne `metadata jsonb`.
6. **Statuts** : bascule `recu/couture/pret/livre` → `received/sewing/ready/delivered` (libellés FR inchangés à l'écran). Confirmer le mapping et la table de correspondance pour l'import.
7. **`carnets`** : à l'import, créer une ligne `carnets` par `carnetNumero` distinct ; définir le **compteur de numéros** (colonne `next_number` ou `MAX(number)+1` verrouillé) pour empêcher la réutilisation.
8. **Authentification pilote** : e-mail+mot de passe créés en accompagnement, ou magic link, ou téléphone ? (le cahier des charges déconseille d'imposer un e-mail complexe). Choix du mécanisme de **révocation** de l'ancien téléphone.
9. **Rôles** : `owner` + `assistant` uniquement au départ ; l'assistant ne gère pas l'abonnement (à traduire en politique RLS + test).
10. **Tarifs abonnement** : confirmés comme **expérimentaux** (20 fiches gratuites, 1 000 / 2 500 / 10 000 FCFA). Ils vivront en base (`subscriptions.plan_code` + table de plans), **pas en dur**.
11. **Hébergement / domaine** : rester sur Vercel pour le front ? Edge Functions Supabase pour les opérations privilégiées.
12. **CDP Sénégal** : qui pilote la conformité (déclaration, politique de confidentialité, durée de conservation) ?
13. **Stratégie de bascule** : *dual-write* (écrire `localStorage` **et** cloud pendant une période de transition) ou bascule sèche après import validé ? Recommandation : import unique + `localStorage` conservé en sauvegarde lecture seule jusqu'à validation explicite.

---

## 17. Risques identifiés

| Risque | Gravité | Mitigation |
|---|---|---|
| Perte de données `localStorage` (quota dépassé par les base64) **avant même la migration** | Élevée | Export JSON de secours **immédiat** au premier lancement de l'assistant ; prévenir les pilotes de ne pas accumuler de photos d'ici la bascule |
| `MediaRecorder`/webm non lisible sur certains navigateurs | Moyenne | Pilote Android ; détecter le type MIME supporté ; conserver le blob original |
| Migration : collision de `numero` si import partiel rejoué | Moyenne | Import idempotent (clé `legacyId` → `uuid` mémorisée), transaction, vérification des compteurs |
| RLS mal écrite = fuite inter-ateliers | Élevée | Tests d'isolation A/B **obligatoires** avant toute donnée réelle (Phase 4) |
| Secrets exposés côté front | Élevée | `service_role` et secrets paiement **uniquement** en Edge Functions ; revue avant chaque déploiement |
| Divergence hors-ligne (2 téléphones) | Moyenne | `version` + `updated_at`, conservation des deux versions + confirmation |
| Composants morts réintroduits par erreur | Faible | Les supprimer au nettoyage (Phase 6/9) ou les réutiliser explicitement (`ClientPickerSheet`) |
| Socle de dépendances très récent (TS 6, Vite 8, Vitest 4) | Faible | `package-lock.json` figé ; ne pas mettre à jour pendant la refonte |

---

## 18. État des lieux — commandes exécutées

```
$ npm test        → Test Files 1 passed (1) | Tests 19 passed (19)
$ npx tsc -b      → exit 0 (aucune erreur de typage)
```

*Fin de l'audit — voir `02-PLAN-MIGRATION.md` pour le plan de migration détaillé et phasé.*
