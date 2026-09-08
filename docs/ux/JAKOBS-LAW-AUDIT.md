# Audit Jakob's Law — Tayoo

Principe : les tailleurs sénégalais qui utilisent Tayoo passent bien plus de
temps sur WhatsApp, Wave et Android que sur Tayoo. Chaque écran est comparé à
ce qu'une application mobile familière ferait — jamais à l'esthétique de ces
applications, seulement à leurs **conventions d'interaction** (retour,
placement des actions, feedback, listes, formulaires).

Ce document est actionnable, pas exhaustif : chaque ligne débouche sur un
changement fait ou une recommandation explicitement différée (avec la raison).

## Trois niveaux de navigation (retenus, aucun 4e système introduit)

- **Niveau 1** — Accueil / Commandes / Catalogue / Clients : `BottomNav`
  (mobile) + `Sidebar` (desktop).
- **Niveau 2** — détail (Client / Fiche / Modèle) : `PageHeader` (← Retour +
  titre + actions).
- **Niveau 3** — création/modification (Nouveau client / Nouvelle fiche /
  Nouveau modèle / paiement) : ← Retour déterministe + titre + formulaire +
  CTA principal unique.

## Matrice UX

| Écran | Objectif utilisateur | Action principale | Action secondaire | Retour attendu | Pattern nav. | Convention familière | Friction observée | Changement |
|---|---|---|---|---|---|---|---|---|
| `/connexion`, `/numero`, `/creer-code`, `/code` | S'identifier sans SMS/mot de passe | Continuer / Entrer mon code | Retour, "Ce n'est pas mon numéro" | Étape précédente, numéro préconservé | Wizard séquentiel | Onboarding mobile (WhatsApp Business, Wave) à 3-4 écrans | Déjà traité (PR #15) : Retour visible, PIN jamais en historique, recovery `phone_in_use` | Aucun — hors périmètre de cette tâche, vérifié conforme |
| `/` (Carnet) | Retrouver une fiche vite | Nouvelle fiche (FAB) | Rechercher, Sélectionner | — (racine) | Niveau 1 | Liste + FAB (Android Contacts/WhatsApp) | FAB réimplémenté en double du composant partagé `Fab` ; actions de sélection à 28px | **Fait** : `CarnetList` réutilise `<Fab/>` ; boutons de sélection/pagination portés à 44px |
| `/carnet/nouvelle` | Décrire une commande sans la perdre | Créer la fiche | Retour | `/` ou `/clients/:id` si ouverte depuis un client | Niveau 3 | Formulaire mobile standard | Retour sans confirmation même après saisie ; retour toujours vers `/` même venant d'un client | **Fait** : confirmation "Quitter sans enregistrer ?" si saisie réelle ; retour contextuel vers le client d'origine |
| `/carnet/:id` (Fiche) | Consulter/modifier une commande | (auto-save par champ) | Appeler, Supprimer | `/` | Niveau 2 | Fiche papier numérisée | Boutons Appeler/Supprimer à 32-40px ; bouton "Ajouter" (paiement) sous 44px | **Fait** : 44px partout ; flow paiement déjà conforme (§38, Phase 11A, non modifié) |
| `/commandes` | Suivre l'avancement de toutes les commandes | Nouvelle fiche (FAB) | Filtrer, Rechercher | — (racine) | Niveau 1 | Filtres à puces (Gmail, Wave historique) | "Aucune commande" affiché même quand il y a 0 fiche au total, sans CTA | **Fait** : état vide générique distingué de "aucun résultat pour ce filtre", CTA "Créer la fiche" |
| `/commandes/nouvelle` | (alias) | Créer la fiche | Retour | `/` | Niveau 3 | — | Même écran que `/carnet/nouvelle` (`FicheNew`) — cohérent par construction | Aucun changement nécessaire |
| `/clients` | Retrouver un client | Ajouter un client | Rechercher, Sélectionner | — (racine) | Niveau 1 | Contacts (téléphone) | "Aucun client trouvé" affiché même à 0 client, sans CTA ; bouton Ajouter (desktop) à 32px | **Fait** : état vide dédié + CTA "Ajouter un client" (même libellé que la création) ; touch targets 44px |
| `/clients/nouveau` | Enregistrer un client rapidement | Ajouter le client | Retour | `/clients` | Niveau 3 | Formulaire mobile standard | Retour sans confirmation ; pas de libellé "en cours" pendant l'ajout | **Fait** : confirmation avant perte + libellé "Ajout…" |
| `/clients/:id` | Voir l'historique d'un client, créer une fiche | Nouvelle fiche pour X | Appeler, Supprimer | `/clients` | Niveau 2 | Fiche contact | Boutons Appeler/Supprimer sous 44px ; pas de "Modifier" (nom/téléphone/photo) | **Fait** : 44px. **Différé** : "Modifier" nécessite `ClientRepository.update()`, absent des deux backends — changement de repository, hors périmètre UX (voir §Recommandations) |
| `/catalogue` | Parcourir/choisir un modèle | Ajouter un modèle | Sélectionner | — (racine) | Niveau 1 | Grille photo (Pinterest-like, déjà minimal) | Pas de recherche (seul écran liste sans `search`) ; actions de sélection à 28px | **Fait** : 44px. **Différé** : recherche catalogue (feature UI pure mais non demandée explicitement comme friction bloquante — voir Recommandations) |
| `/catalogue/nouveau` | Créer un modèle nommé | Créer le modèle | Retour | `/catalogue` | Niveau 3 | Formulaire mobile standard | Retour sans confirmation | **Fait** : confirmation avant perte + libellé "Création…" (déjà présent) |
| `/catalogue/:id` | Gérer les photos/patron d'un modèle | (auto-save nom, ajout médias) | Supprimer | `/catalogue` | Niveau 2 | Album photo | Bouton Supprimer sous 44px | **Fait** : 44px |
| Empty states génériques | Comprendre pourquoi c'est vide et agir | CTA cohérent avec la création | — | — | — | "Aucun élément, ajoute-en un" (toute app CRUD) | Confusion empty-vs-recherche sur Clients/Commandes (voir ci-dessus) | **Fait** pour Clients/Commandes ; Carnet/Catalogue étaient déjà corrects |
| Suppression (client/fiche/modèle) | Ne jamais supprimer par erreur | Confirmer/Annuler | — | Vers la liste, jamais la fiche supprimée | Dialogue modal | Confirmation destructive standard | Déjà conforme partout (`ConfirmDialog`, bouton distinct, retour vers la liste) | Aucun changement — vérifié conforme |
| Paiement (`AvanceChampCell`) | Enregistrer un versement sans erreur | Ajouter | — | — | Inline | Ledger explicite (Wave transaction confirm) | Déjà conforme (§38 respecté, Phase 11A) ; bouton "Ajouter" sous 44px | **Fait** : 44px uniquement (texte et logique intacts) |
| Photo (client/tissu/modèle) | Ajouter/retirer une photo | Ajouter une photo | Supprimer | — | Inline | Caméra/Galerie (tout OS mobile) | Boutons de suppression/fermeture à 32-36px | **Fait** : 44px (`PhotoCapture`, `FabricPhotos`) |
| Note vocale | Enregistrer un message comme sur WhatsApp | Micro | Supprimer, Lire | — | Inline | Messagerie vocale (WhatsApp, sans en copier le visuel) | Boutons lecture/suppression à 32-40px | **Fait** : 44px (`VoiceRecorder`) — la zone "Arrêter" en cours d'enregistrement était déjà pleine largeur, donc déjà conforme |
| `BottomNav` | Changer de section principale | Toucher une destination | — | — | Niveau 1 | Bottom nav Android/iOS standard | Icône SEULE, aucun libellé visible ; état actif = couleur seule | **Fait** : libellé visible sous chaque icône, état actif = forme (pastille) + libellé en gras, jamais la couleur seule |
| `PageHeader` (partagé) | Revenir en arrière depuis n'importe quel écran secondaire | ← Retour | Rechercher, Fermer recherche | Selon l'écran (voir ci-dessus) | Niveau 2/3 | Barre de titre Android/iOS | Boutons Retour/Rechercher/Fermer à 32px, sous le minimum WCAG | **Fait** : 44px partout ; nouveau prop `onBack` pour permettre une confirmation avant de quitter un formulaire |
| `/sauvegarde` | Outil ponctuel du porteur (hors usage quotidien) | — | — | — | — | — | — | Explicitement hors périmètre (§5) — non touché |

## Recommandations différées (hors périmètre de ce tour, notées pour un futur tour UX ou produit)

- **Modifier un client** (nom/téléphone/photo après création) : aucune UX ne
  peut l'exposer sans d'abord ajouter `ClientRepository.update()` aux deux
  implémentations (local + Supabase) — c'est un changement de repository,
  explicitement interdit par le périmètre de cette tâche ("pas
  d'architecture"). À traiter dans un tour dédié.
- **Recherche sur `/catalogue`** : c'est le seul écran-liste sans barre de
  recherche (`PageHeader` le permet déjà, `ModeleGrid` n'a pas encore de query
  de filtrage). Ajout UI pur, mais volumineux à valider visuellement sans
  outil de capture d'écran disponible dans cet environnement — différé plutôt
  que livré à moitié vérifié.
- **Retour clavier/souris sur desktop** pour les pages détail pleine page
  (`FicheDetail`, `ModeleDetail` hors master-detail) : actuellement aucun
  bouton retour n'apparaît en desktop (`PageHeader` ne rend son bouton Retour
  que dans son bandeau mobile). Le Sidebar reste la seule sortie. Risque
  mineur (desktop = usage secondaire pour ce public mobile-first), noté pour
  un futur passage mais non corrigé ici pour limiter le risque de régression
  visuelle desktop sans QA visuelle disponible.
- **`AvanceChampCell` : bouton "Effacer" (prix/avance)** reste sous 44px —
  action rare (annuler une saisie pas encore validée) dans une ligne très
  dense façon carnet papier ; l'agrandir casserait la mise en page compacte
  sans QA visuelle possible ici. Documenté, non corrigé.

## Ce qui était DÉJÀ conforme (vérifié, non retouché)

- Aucune trace de `navigate(-1)` dans tout le code métier — tous les retours
  sont déjà déterministes (`backTo`/destinations explicites).
- Suppression : confirmation systématique, bouton destructif visuellement
  distinct, retour vers la liste jamais vers l'objet supprimé.
- Paiement : montant jamais commité au clavier, action "Ajouter" explicite
  (Phase 11A, non modifiée).
- Vocabulaire technique (`Workshop`, `Repository`, `Supabase`, `UUID`...)
  absent de toute l'UI utilisateur.
- Atelier (workshop) invisible — jamais réintroduit.
- Auth PIN : Retour visible, recovery `phone_in_use`, `AuthPublicRoute`,
  PIN jamais en historique — déjà livré par PR #15, revérifié sans régression.
