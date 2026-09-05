// Phase 7A — lecture + mise à jour ; Phase 7B — création via l'Edge Function
// `create-fiche-from-draft` (corr. R §26). Aucun `INSERT` sur `fiches` n'est
// accessible depuis le navigateur (Phase 4 ne l'accorde à personne — seule
// `app_hidden.create_fiche_from_draft`, `service_role` uniquement, peut
// créer une fiche) : `add()` passe donc exclusivement par
// `SupabaseGateway.createFicheFromDraft()`, jamais par un `.from("fiches")
// .insert(...)`.
import { ORDER_STEPS } from "../../lib/types";
import type { Fiche, FicheChamp, FicheChampKey, OrderStatus } from "../../lib/types";
import { isMeaningfulFicheDraft, mapFicheDraftToCloudPayload } from "../../lib/ficheDraft";
import type { FicheInfoPatch, FicheRepository, NewFicheInput } from "../FicheRepository";
import type { RepositoryStatus } from "../RepositoryStatus";
import { CloudCollectionStore } from "./CloudCollectionStore";
import { IndexedDbCollectionCache } from "./cache/IndexedDbCache";
import { DOMAIN_STATUS_TO_CLOUD, mapFicheRowToDomain } from "./mappers/fiche";
import { newFicheInputToDraft } from "./ficheDraftFromInput";
import { createFicheFromDraftResponseSchema, ficheViewRowSchema, parseRowOrThrow } from "./schemas";
import { parseOrThrow, storedFicheSchema } from "../schemas";
import type { GatewayError, SupabaseGateway } from "./gateway";
import type { SupabaseCarnetRepository } from "./SupabaseCarnetRepository";
import type { Database, Json } from "../../lib/supabase/database.types";

type FicheUpdate = Database["public"]["Tables"]["fiches"]["Update"];

/** Erreur métier de `create-fiche-from-draft` (corr. R §11, Phase 7B) —
 * préserve le `message` déjà curaté par l'Edge Function (extrait du corps
 * JSON `{error, message}` par `toFunctionGatewayError`, `gateway.ts`) et
 * expose `code` (`"unauthorized"`/`"forbidden"`/`"invalid_client"`/
 * `"empty_draft"`/...) pour un futur branchement UI fin, sans coupler
 * l'appelant à `FunctionsHttpError` (interne à `@supabase/supabase-js`). */
export class CreateFicheFromDraftError extends Error {
  readonly code: string | undefined;
  constructor(gatewayError: GatewayError) {
    super(gatewayError.message || "La fiche n'a pas pu être créée. Réessaie plus tard.");
    this.name = "CreateFicheFromDraftError";
    this.code = gatewayError.code;
  }
}

/** La fiche a été créée avec succès côté serveur (un numéro a été consommé,
 * un `id` existe réellement en base) mais une étape locale POST-création a
 * échoué (refresh carnet, relecture `fiches_view`) — jamais rejouer
 * `create-fiche-from-draft` dans ce cas : un doublon serait pire qu'une
 * synchronisation locale incomplète (corr. R §16/§18/§19, Phase 7B).
 * `ficheId` reste disponible pour un futur refresh ciblé ou un message UI
 * plus précis, sans élargir `FicheRepository.add()` au-delà de
 * `Promise<string>`. */
export class FicheCreatedButSyncIncompleteError extends Error {
  readonly ficheId: string;
  constructor(ficheId: string, message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "FicheCreatedButSyncIncompleteError";
    this.ficheId = ficheId;
  }
}

/** Message d'erreur unique pour les 3 opérations Phase 4 n'autorise pas
 * encore (`client_id` immuable par ce chemin, médias/paiements hors scope
 * 7A) — jamais un no-op silencieux (corr. R §31/§26). */
function unsupportedFieldError(field: string, phase: string): Error {
  return new Error(
    `SupabaseFicheRepository.setInfo: "${field}" n'est pas modifiable par ce Repository (${phase}). ` +
      "Aucune écriture n'a été effectuée — corriger l'appelant plutôt que d'ignorer ce champ silencieusement.",
  );
}

export interface SupabaseFicheRepositoryOptions {
  gateway: SupabaseGateway;
  workshopId: string;
  /** Nécessaire pour résoudre `Fiche.carnetNumero` depuis `fiches.carnet_id`
   * (aucune vue SQL ne fait ce join, voir corr. R §30). Le type concret
   * (pas seulement `CarnetRepository`) est requis pour pouvoir attendre son
   * hydratation initiale (`bootstrapped`) avant de mapper la première page
   * de fiches — sans quoi chaque fiche serait rejetée faute de carnet
   * résolu. */
  carnets: SupabaseCarnetRepository;
  cache?: IndexedDbCollectionCache<Fiche>;
}

export class SupabaseFicheRepository implements FicheRepository {
  private readonly gateway: SupabaseGateway;
  private readonly workshopId: string;
  private readonly carnets: SupabaseCarnetRepository;
  private readonly store: CloudCollectionStore<Fiche>;

  /** Résout une fois le cycle hydratation-cache + attente des carnets +
   * premier refresh réseau terminé (succès ou échec). */
  readonly bootstrapped: Promise<void>;

  constructor(options: SupabaseFicheRepositoryOptions) {
    if (!options.workshopId) {
      throw new Error("SupabaseFicheRepository : workshopId requis (jamais un atelier arbitraire, corr. R §13).");
    }
    this.gateway = options.gateway;
    this.workshopId = options.workshopId;
    this.carnets = options.carnets;
    this.store = new CloudCollectionStore<Fiche>({
      cache: options.cache ?? new IndexedDbCollectionCache<Fiche>("fiches", options.workshopId),
      getId: (f) => f.id,
      validateCachedItem: (raw) => parseOrThrow(storedFicheSchema, raw, "SupabaseFicheRepository cache"),
    });
    this.bootstrapped = this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    await this.store.hydrateFromCache();
    // Le cache local est déjà mappé (carnetNumero résolu au moment de son
    // écriture) — seul le refresh réseau a besoin des carnets hydratés.
    await this.carnets.bootstrapped;
    await this.store.refresh(() => this.fetchActiveFiches());
  }

  /** Un lot réseau est un SNAPSHOT ATOMIQUE : la moindre ligne invalide fait
   * échouer le fetch entier — jamais un `console.warn` + `skip` qui
   * accepterait une collection tronquée comme si elle était complète
   * (revue post-7A). `CloudCollectionStore.refresh()` conserve alors le
   * cache existant plutôt que d'appliquer ce résultat partiel. */
  private async fetchActiveFiches(): Promise<Fiche[]> {
    const { data, error } = await this.gateway.listActiveFiches(this.workshopId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((raw) => {
      const row = parseRowOrThrow(ficheViewRowSchema, raw, "SupabaseFicheRepository");
      return mapFicheRowToDomain(row, (carnetId) => this.carnets.getCarnetNumero(carnetId));
    });
  }

  list(): Fiche[] {
    return this.store.list();
  }

  get(id: string): Fiche | undefined {
    return this.store.get(id);
  }

  listByClient(clientId: string): Fiche[] {
    return this.store.list().filter((f) => f.clientId === clientId);
  }

  getStatus(): RepositoryStatus {
    return this.store.getStatus();
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  async refresh(): Promise<void> {
    await this.store.refresh(() => this.fetchActiveFiches());
  }

  dispose(): void {
    this.store.dispose();
  }

  /** Phase 7B — SEULE porte de création : `create-fiche-from-draft` (Edge
   * Function), jamais un `.from("fiches").insert(...)` (voir tête de
   * fichier). Réutilise le brouillon 9A (`isMeaningfulFicheDraft`,
   * `mapFicheDraftToCloudPayload`) : un payload non significatif est rejeté
   * AVANT tout appel réseau, même si le serveur revalide la même règle
   * (défense en profondeur, jamais un aller-retour réseau inutile). Après
   * succès serveur, la fiche existe déjà : plus aucune étape suivante ne doit
   * rejouer la création, même si le refresh carnet ou la relecture échoue
   * (voir `FicheCreatedButSyncIncompleteError`). */
  async add(input?: NewFicheInput): Promise<string> {
    const draft = newFicheInputToDraft(input);
    if (!isMeaningfulFicheDraft(draft)) {
      throw new Error(
        "SupabaseFicheRepository.add: brouillon vide — ajoute au moins un client, un nom/prénom/téléphone, " +
          "un vêtement, une description ou une mesure avant de créer la fiche.",
      );
    }
    const payload = mapFicheDraftToCloudPayload(draft);

    const { data, error } = await this.gateway.createFicheFromDraft(this.workshopId, draft.clientId, payload);
    if (error) throw new CreateFicheFromDraftError(error);

    const { fiche: created } = parseRowOrThrow(createFicheFromDraftResponseSchema, data, "SupabaseFicheRepository.add");
    if (created.workshop_id !== this.workshopId) {
      throw new Error(
        `SupabaseFicheRepository.add: la fiche créée (${created.id}) appartient à un autre atelier que ` +
          "celui attendu — réponse serveur incohérente, jamais ignorée silencieusement.",
      );
    }

    // À partir d'ici, la fiche EXISTE côté serveur — plus aucun chemin
    // ci-dessous ne doit jamais réappeler createFicheFromDraft (§16).
    await this.carnets.refresh();
    const carnetRefreshError = this.carnets.getLastRefreshError();
    if (carnetRefreshError) {
      throw new FicheCreatedButSyncIncompleteError(
        created.id,
        "La fiche a été créée, mais le carnet n'a pas pu être synchronisé. Rafraîchis les données.",
        carnetRefreshError,
      );
    }

    const { data: ficheData, error: ficheError } = await this.gateway.getFicheById(this.workshopId, created.id);
    if (ficheError) {
      throw new FicheCreatedButSyncIncompleteError(
        created.id,
        "La fiche a été créée, mais sa relecture a échoué. Rafraîchis les données.",
        new Error(ficheError.message),
      );
    }

    let fiche: Fiche;
    try {
      const row = parseRowOrThrow(ficheViewRowSchema, ficheData, "SupabaseFicheRepository.add");
      fiche = mapFicheRowToDomain(row, (carnetId) => this.carnets.getCarnetNumero(carnetId));
    } catch (mapError) {
      throw new FicheCreatedButSyncIncompleteError(
        created.id,
        "La fiche a été créée, mais sa relecture a échoué. Rafraîchis les données.",
        mapError,
      );
    }

    this.store.applyMutation(fiche.id, fiche);
    return fiche.id;
  }

  private async applyUpdate(id: string, update: FicheUpdate): Promise<void> {
    const { data, error } = await this.gateway.updateFiche(this.workshopId, id, update);
    if (error) throw new Error(error.message);
    const row = parseRowOrThrow(ficheViewRowSchema, data, "SupabaseFicheRepository");
    const fiche = mapFicheRowToDomain(row, (carnetId) => this.carnets.getCarnetNumero(carnetId));
    this.store.applyMutation(fiche.id, fiche);
  }

  /** Fusionne `metadata.legacy_identity`/`metadata.fabric_color` à partir de
   * la ligne SERVEUR actuelle (pas du cache local, potentiellement périmé) —
   * jamais un `metadata: {...}` qui écraserait des clés non touchées ici
   * (ex. un futur `legacy_id` posé par la Phase 6B0). */
  private async buildMergedMetadata(
    id: string,
    patch: Pick<FicheInfoPatch, "nom" | "prenom" | "telephone" | "fabricColor">,
  ): Promise<Record<string, Json>> {
    const { data, error } = await this.gateway.getFicheById(this.workshopId, id);
    if (error) throw new Error(error.message);
    const row = parseRowOrThrow(ficheViewRowSchema, data, "SupabaseFicheRepository.setInfo");
    // `row.metadata` vient d'une colonne jsonb tout juste relue — ses
    // valeurs sont, par construction, déjà compatibles `Json`. Zod la
    // valide en `Record<string, unknown>` (frontière de lecture volontairement
    // souple, la forme de `metadata` n'est pas figée) ; ce Repository ne
    // fait que la recopier et y ajouter des chaînes, jamais une valeur
    // arbitraire non sérialisable — la relecture ci-dessous est donc sûre.
    const metadata: Record<string, Json> = { ...(row.metadata as Record<string, Json> | null) };
    const currentIdentity =
      metadata.legacy_identity && typeof metadata.legacy_identity === "object" && !Array.isArray(metadata.legacy_identity)
        ? (metadata.legacy_identity as Record<string, Json>)
        : {};
    const nextIdentity: Record<string, Json> = { ...currentIdentity };
    if (patch.nom !== undefined) nextIdentity.nom = patch.nom;
    if (patch.prenom !== undefined) nextIdentity.prenom = patch.prenom;
    if (patch.telephone !== undefined) nextIdentity.telephone = patch.telephone;
    metadata.legacy_identity = nextIdentity;
    if (patch.fabricColor !== undefined) metadata.fabric_color = patch.fabricColor;
    return metadata;
  }

  async setInfo(id: string, patch: FicheInfoPatch): Promise<void> {
    if (patch.clientId !== undefined) {
      throw unsupportedFieldError("clientId", "aucun GRANT UPDATE sur client_id, Phase 4");
    }
    if (patch.voiceNote !== undefined) throw unsupportedFieldError("voiceNote", "Phase 8A — médias fiche");
    if (patch.signature !== undefined) throw unsupportedFieldError("signature", "Phase 8A — médias fiche");
    if (patch.avance !== undefined) throw unsupportedFieldError("avance", "Phase 11A — paiements cloud");

    const update: FicheUpdate = {};
    if (patch.garment !== undefined) update.garment = patch.garment;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.price !== undefined) update.total_price = patch.price;
    if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
    if (patch.soldeLe !== undefined) update.settled_at = patch.soldeLe;

    const touchesMetadata = patch.nom !== undefined || patch.prenom !== undefined || patch.telephone !== undefined || patch.fabricColor !== undefined;
    if (touchesMetadata) {
      update.metadata = await this.buildMergedMetadata(id, patch);
    }

    if (Object.keys(update).length === 0) return;
    await this.applyUpdate(id, update);
  }

  /** `tissusDeposes` a deux sources cloud (`measurements.tissusDeposes` ET
   * la colonne dédiée `fabric_notes`, corr. R §9 — voir `mappers/fiche.ts`)
   * : toute écriture de ce champ précis met À JOUR LES DEUX dans la MÊME
   * mutation réseau, jamais l'une sans l'autre (sinon la prochaine lecture
   * détecterait une divergence et rejetterait la ligne). */
  private buildChampUpdate(id: string, key: FicheChampKey, mutate: (current: FicheChamp) => FicheChamp): FicheUpdate {
    const cached = this.store.get(id);
    if (!cached) {
      throw new Error(
        `SupabaseFicheRepository: fiche ${id} absente du cache — impossible de fusionner "measurements" sans lire une valeur actuelle fiable.`,
      );
    }
    const nextChamp = mutate(cached.champs[key]);
    const nextChamps = { ...cached.champs, [key]: nextChamp };
    const measurements: Record<string, { valeur: string; historique: string[] }> = {};
    for (const champKey of Object.keys(nextChamps) as FicheChampKey[]) {
      measurements[champKey] = { valeur: nextChamps[champKey].valeur, historique: nextChamps[champKey].historique };
    }
    const update: FicheUpdate = { measurements };
    if (key === "tissusDeposes") {
      update.fabric_notes = nextChamp.valeur.trim() === "" ? null : nextChamp.valeur;
    }
    return update;
  }

  async setChamp(id: string, key: FicheChampKey, valeur: string): Promise<void> {
    const update = this.buildChampUpdate(id, key, (current) => {
      if (current.valeur === valeur) return current;
      const historique = current.valeur.trim() ? [...current.historique, current.valeur] : current.historique;
      return { valeur, historique };
    });
    await this.applyUpdate(id, update);
  }

  async strikeChamp(id: string, key: FicheChampKey): Promise<void> {
    const update = this.buildChampUpdate(id, key, (current) => {
      if (!current.valeur.trim()) return current;
      return { valeur: "", historique: [...current.historique, current.valeur] };
    });
    await this.applyUpdate(id, update);
  }

  async restoreChamp(id: string, key: FicheChampKey): Promise<void> {
    const update = this.buildChampUpdate(id, key, (current) => {
      const last = current.historique[current.historique.length - 1];
      if (last === undefined) return current;
      return { valeur: last, historique: current.historique.slice(0, -1) };
    });
    await this.applyUpdate(id, update);
  }

  async setStatus(id: string, status: OrderStatus): Promise<void> {
    await this.applyUpdate(id, { status: DOMAIN_STATUS_TO_CLOUD[status] });
  }

  async advance(id: string): Promise<void> {
    const cached = this.store.get(id);
    if (!cached) throw new Error(`SupabaseFicheRepository: fiche ${id} absente du cache.`);
    const idx = ORDER_STEPS.indexOf(cached.status);
    const next = ORDER_STEPS[Math.min(idx + 1, ORDER_STEPS.length - 1)];
    await this.setStatus(id, next);
  }

  async remove(id: string): Promise<void> {
    await this.removeMany([id]);
  }

  async removeMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.gateway.softDeleteFiches(this.workshopId, ids);
    if (error) throw new Error(error.message);
    for (const id of ids) this.store.applyMutation(id, null);
  }
}
