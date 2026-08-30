-- enable_extensions_and_enums
-- Phase 2 de la refonte — projet Supabase « sunu-couture-dev » (ref nffcdygtqzlivsresuuk,
-- eu-west-1, PostgreSQL 17). Projet CRÉÉ mais liaison distante INTERDITE jusqu'à
-- validation finale : aucun `supabase db push`, aucune donnée réelle.
-- Statut Phase 2 : « candidate — validation Supabase CLI et advisors en attente ».
--
-- Fichiers rédigés au format horodaté de `supabase migration new` ; la CLI Supabase
-- n'était pas disponible dans l'environnement de préparation (à recréer/vérifier
-- avec la CLI si souhaité — contenu identique).
--
-- gen_random_uuid() est natif depuis PostgreSQL 13 (pg_catalog) — pgcrypto n'est
-- PAS requis. On l'active malgré tout pour l'alignement avec l'image Supabase,
-- dans le schéma `extensions` (jamais `public` — advisor `extension_in_public`).
-- Sur Supabase : `extensions` existe et pgcrypto y est déjà → double no-op.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- Schéma privé pour les fonctions internes (SECURITY DEFINER). NON exposé par
-- PostgREST (db-schemas = public, graphql_public). Voir 20260829120400.
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists app_hidden;
revoke all on schema app_hidden from public;
comment on schema app_hidden is
  'Fonctions internes SECURITY DEFINER — jamais exposé par l''API. USAGE accordé au cas par cas.';

-- Durcissement des fonctions (point 5) : PAS d'`ALTER DEFAULT PRIVILEGES` ici.
-- La forme « IN SCHEMA … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC » est un no-op
-- PostgreSQL (les ADP par schéma ne suppriment pas le grant PUBLIC intégré sur
-- les fonctions) ; la forme globale n'est pas appliquée sans analyse de son
-- impact sur les autres fonctions Supabase. L'enforcement effectif est :
--   1. `anon` n'a PAS `USAGE` sur app_hidden ;
--   2. chaque `create function` est suivi, dans la MÊME transaction, d'un
--      `revoke all … from public` explicite (20260829120400) ;
--   3. un blanket `revoke all on all functions in schema app_hidden from public`
--      (20260829120700) ;
--   4. le test T30 vérifie qu'aucune fonction sensible n'est exécutable par
--      PUBLIC / anon / authenticated.

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums métier
-- ─────────────────────────────────────────────────────────────────────────────

-- Rôles d'atelier (décision D10). L'assistant ne gère ni abonnement ni membres.
create type public.workshop_role as enum ('owner', 'assistant');

-- Cycle de vie d'un carnet physique.
create type public.carnet_status as enum ('active', 'full', 'archived');

-- État structurel d'une fiche (décision D8, point 2). Il n'y a PAS d'état 'draft'
-- côté serveur : le brouillon « Nouvelle fiche » vit uniquement en local
-- (IndexedDB / état d'UI) et n'existe en base qu'une fois promu en fiche 'active'
-- par app_hidden.create_fiche_from_draft() — aucune ligne distante, aucun numéro
-- consommé avant validation.
create type public.fiche_state as enum ('active', 'cancelled', 'archived');

-- Statut métier (décision D8). Libellés écran restent en français :
--   received = « Reçue », sewing = « En couture », ready = « Prête », delivered = « Livrée ».
create type public.fiche_status as enum ('received', 'sewing', 'ready', 'delivered');

-- Types de médias (décision D7). Colonnes techniques dédiées ; durée / dimensions
-- / codec / checksum → media_assets.metadata.
create type public.media_type as enum ('fabric_photo', 'model_photo', 'voice_note', 'signature');

-- Moyen de paiement du client au tailleur (facultatif — nullable partout).
create type public.payment_method as enum ('cash', 'wave', 'orange_money', 'free_money', 'bank', 'other');

-- Abonnement Tayoo.
create type public.subscription_status as enum ('trialing', 'active', 'grace', 'expired', 'cancelled');
create type public.subscription_plan_period as enum ('trial', 'monthly', 'quarterly', 'yearly');
create type public.subscription_txn_status as enum ('pending', 'validated', 'rejected', 'refunded');

-- Résolution d'un conflit de synchronisation (correction F) — jamais une fiche fantôme.
create type public.sync_conflict_state as enum ('open', 'resolved', 'discarded');
