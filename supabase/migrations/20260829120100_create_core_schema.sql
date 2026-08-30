-- create_core_schema
-- Cœur métier : ateliers, membres, carnets, clients, fiches, versements, médias,
-- catalogue de modèles. RLS activée dans 20260829120600 ; politiques en Phase 4.
--
-- ISOLATION MULTI-ATELIER (point 1) : chaque relation enfant → parent scopée par
-- `workshop_id` passe par une CLÉ ÉTRANGÈRE COMPOSITE `(workshop_id, <parent_id>)`
-- vers `parent (workshop_id, id)`. Une référence inter-ateliers devient donc
-- impossible au niveau du moteur, en plus de la RLS. Cela impose un index UNIQUE
-- `(workshop_id, id)` sur chaque table parente. `ON DELETE SET NULL (colonne)`
-- (liste de colonnes) requiert PostgreSQL ≥ 15 — cible Supabase = 17. ✓

-- ─────────────────────────────────────────────────────────────────────────────
-- workshops — un atelier = une unité d'isolation (racine de la chaîne)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.workshops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 120),
  owner_id    uuid not null references auth.users (id) on delete restrict,  -- source canonique (point 6)
  is_demo     boolean not null default false,          -- correction G
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index workshops_owner_idx on public.workshops (owner_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- workshop_members — appartenance + rôle. Politiques NON récursives en Phase 4
-- (correction E). owner_id de workshops reste la source canonique ; la ligne
-- membre 'owner' est tenue synchrone par déclencheur (20260829120400, point 6).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.workshop_members (
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.workshop_role not null default 'assistant',
  created_at  timestamptz not null default now(),
  primary key (workshop_id, user_id)
);
create index workshop_members_user_idx on public.workshop_members (user_id);
-- Exactement un 'owner' par atelier.
create unique index workshop_members_one_owner_uidx
  on public.workshop_members (workshop_id)
  where role = 'owner';

-- ─────────────────────────────────────────────────────────────────────────────
-- carnets — 30 pages × 4 = 120 fiches. Numérotation via next_number (décision D9),
-- jamais MAX()+1, jamais réutilisée après archivage / suppression logique.
-- L'allocation d'un numéro + l'insertion de la fiche passent par
-- app_hidden.create_fiche_from_draft() (20260829120400) — jamais le front seul.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.carnets (
  id                uuid primary key default gen_random_uuid(),
  workshop_id       uuid not null references public.workshops (id) on delete cascade,
  number            int  not null check (number >= 1),
  status            public.carnet_status not null default 'active',
  fiches_par_carnet int  not null default 120 check (fiches_par_carnet > 0),
  next_number       int  not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz,
  unique (workshop_id, number),
  unique (workshop_id, id),                 -- cible des FK composites (point 1)
  constraint carnets_next_number_range
    check (next_number between 1 and fiches_par_carnet + 1)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- clients — identité (décision D2) + téléphone E.164 (décision D3)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  workshop_id   uuid not null references public.workshops (id) on delete cascade,
  display_name  text not null check (length(btrim(display_name)) between 1 and 200),
  first_name    text check (first_name is null or length(btrim(first_name)) > 0),
  last_name     text check (last_name  is null or length(btrim(last_name))  > 0),
  nickname      text check (nickname   is null or length(btrim(nickname))   > 0),
  phone_e164    text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  phone_display text,
  metadata      jsonb not null default '{}'::jsonb,   -- legacy_name, legacy_phone, color_seed
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (workshop_id, id)                  -- cible des FK composites (point 1)
);
-- Unicité téléphone : seulement si non nul ET client non supprimé (décision D3).
create unique index clients_workshop_phone_uidx
  on public.clients (workshop_id, phone_e164)
  where phone_e164 is not null and deleted_at is null;
create index clients_workshop_active_idx
  on public.clients (workshop_id)
  where deleted_at is null;
create index clients_workshop_name_idx
  on public.clients (workshop_id, lower(display_name));

-- ─────────────────────────────────────────────────────────────────────────────
-- fiches — enregistrement unique d'un travail (source de vérité).
-- 'Commandes' = simple vue filtrée de cette table. Pas d'état 'draft' : une fiche
-- n'existe en base qu'une fois validée (state 'active').
-- ─────────────────────────────────────────────────────────────────────────────
create table public.fiches (
  id            uuid primary key default gen_random_uuid(),
  workshop_id   uuid not null references public.workshops (id) on delete cascade,
  carnet_id     uuid not null,
  client_id     uuid,                                  -- nullable (décision D4)
  number        int  not null check (number >= 1),
  page_number   int  not null check (page_number >= 1),
  slot_number   int  not null check (slot_number between 1 and 4),
  state         public.fiche_state   not null default 'active',
  status        public.fiche_status  not null default 'received',
  measurements  jsonb not null default '{}'::jsonb,   -- { [cle]: { valeur, historique[] } }
  garment       text  not null default '',
  description   text,
  fabric_notes  text,
  quantity      int   not null default 1 check (quantity >= 1),
  due_date      date,                                  -- jamais pré-rempli
  total_price   integer not null default 0 check (total_price >= 0),  -- entier FCFA
  settled_at    timestamptz,
  -- signature : plus de colonne dédiée (point 4) → media_assets(type='signature')
  version       int   not null default 1 check (version >= 1),        -- verrou optimiste
  metadata      jsonb not null default '{}'::jsonb,   -- legacy_identity, fabric_color, legacy_id
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (carnet_id, number),
  unique (workshop_id, id),                 -- cible des FK composites (point 1)
  -- page_number / slot_number toujours cohérents avec number (30 pages × 4).
  constraint fiches_page_slot_coherent check (
    page_number = ((number - 1) / 4) + 1
    and slot_number = ((number - 1) % 4) + 1
  ),
  -- FK COMPOSITES : carnet et client obligatoirement du MÊME atelier (point 1).
  -- carnet : ON DELETE NO ACTION (point 5) — protège les carnets. Un carnet
  -- contenant des fiches ne peut PAS être supprimé directement (contrôle en fin
  -- de commande) ; l'archivage (UPDATE status='archived') reste possible ; un
  -- DELETE d'atelier fonctionne car NO ACTION est vérifié en fin de commande,
  -- après que le CASCADE de fiches.workshop_id a retiré les fiches.
  constraint fiches_carnet_same_workshop_fk
    foreign key (workshop_id, carnet_id)
    references public.carnets (workshop_id, id) on delete no action,
  -- client : suppression (rare, physique) → seul client_id repasse à NULL.
  constraint fiches_client_same_workshop_fk
    foreign key (workshop_id, client_id)
    references public.clients (workshop_id, id) on delete set null (client_id)
);
-- Index de préfixe EXACT pour les FK composites (point 4).
create index fiches_workshop_carnet_idx    on public.fiches (workshop_id, carnet_id);
create index fiches_workshop_client_idx    on public.fiches (workshop_id, client_id);
create index fiches_workshop_state_due_idx on public.fiches (workshop_id, state, due_date);
-- Idempotence de l'import : retrouver une fiche par son ancien id local.
create index fiches_legacy_id_idx on public.fiches ((metadata ->> 'legacy_id')) where metadata ? 'legacy_id';

-- ─────────────────────────────────────────────────────────────────────────────
-- client_payments — argent versé PAR le client AU tailleur. Historique de
-- versements. paid_at nullable (décision D6). amount > 0 (justif. D6).
-- reste = total_price − Σ(amount)  → vue fiche_balances. Jamais stocké.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.client_payments (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  fiche_id    uuid not null,
  amount      integer not null check (amount > 0),    -- entier FCFA, strictement positif
  paid_at     timestamptz,                            -- NULL autorisé (import legacy, D6)
  recorded_at timestamptz not null default now(),
  method      public.payment_method,                  -- facultatif
  note        text,
  metadata    jsonb not null default '{}'::jsonb,     -- { source: 'legacy_import' }
  created_at  timestamptz not null default now(),
  constraint client_payments_fiche_same_workshop_fk
    foreign key (workshop_id, fiche_id)
    references public.fiches (workshop_id, id) on delete cascade
);
create index client_payments_fiche_idx          on public.client_payments (fiche_id);
create index client_payments_workshop_fiche_idx on public.client_payments (workshop_id, fiche_id);  -- FK composite (point 4)

-- ─────────────────────────────────────────────────────────────────────────────
-- media_assets — 1 ligne par photo tissu / vocal / signature d'une fiche.
-- La signature est un media_assets de type 'signature' (point 4), au plus un par
-- fiche. Fichier réel dans un bucket privé (Phase 8) ; metadata jsonb = durée,
-- dimensions, codec, checksum (décision D7).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  fiche_id     uuid not null,
  type         public.media_type not null,
  storage_path text not null,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes >= 0),
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint media_assets_fiche_same_workshop_fk
    foreign key (workshop_id, fiche_id)
    references public.fiches (workshop_id, id) on delete cascade
);
create unique index media_assets_storage_path_uidx
  on public.media_assets (storage_path) where deleted_at is null;
create unique index media_assets_one_signature_per_fiche_uidx
  on public.media_assets (fiche_id) where type = 'signature' and deleted_at is null;
create index media_assets_fiche_idx          on public.media_assets (fiche_id);
create index media_assets_workshop_fiche_idx on public.media_assets (workshop_id, fiche_id);  -- FK composite (point 4)

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalogue de modèles (lookbook + patron de coupe). Scoping workshop_id.
-- Un modèle a un nom NON VIDE (point 3) — le brouillon reste local jusqu'à
-- validation, aucune ligne créée à l'ouverture du formulaire.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.modeles (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  nom         text not null check (length(btrim(nom)) between 1 and 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (workshop_id, id)                  -- cible de la FK composite (point 1)
);
create index modeles_workshop_active_idx on public.modeles (workshop_id) where deleted_at is null;

create table public.modele_medias (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  modele_id    uuid not null,
  kind         text not null check (kind in ('photo', 'patron')),
  storage_path text not null,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes >= 0),
  position     int  not null default 0,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint modele_medias_modele_same_workshop_fk
    foreign key (workshop_id, modele_id)
    references public.modeles (workshop_id, id) on delete cascade
);
create unique index modele_medias_storage_path_uidx
  on public.modele_medias (storage_path) where deleted_at is null;
create index modele_medias_modele_idx          on public.modele_medias (modele_id);
create index modele_medias_workshop_modele_idx on public.modele_medias (workshop_id, modele_id);  -- FK composite (point 4)
