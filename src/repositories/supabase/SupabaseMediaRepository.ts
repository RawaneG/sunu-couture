// Phase 8A — médias FICHE cloud (`public.media_assets`, bucket Storage privé
// `media`). CRUD PostgREST normal pour les métadonnées (Phase 4 accorde déjà
// SELECT/INSERT/UPDATE(metadata, deleted_at) à `authenticated`, contrairement
// à `fiches` — AUCUNE Edge Function ici, §57) ; upload/signature via
// Storage, jamais `getPublicUrl()` (bucket privé) ni `storage.remove()` pour
// une suppression normale (§19).
//
// PAS d'IndexedDB pour ce Repository (corr. R §13) : les URLs signées sont
// éphémères, les persister serait trompeur (Phase 12 traitera l'offline
// blob/cache). Tout vit en mémoire — `mediaMap` (lignes validées) et
// `signedUrls` (`storage_path → {signedUrl, expiresAt}`), reconstruits à
// chaque bootstrap/refresh.
//
// Médias MODÈLE (Phase 8B, `public.modele_medias`) : partagent le MÊME
// bucket Storage privé `media`, le même cache de signatures (`signedUrls`,
// clé = `storage_path`, jamais confondu avec les clés fiche/modèle car les
// paths ne se recoupent jamais — préfixes `.../fiches/...` vs
// `.../modeles/...`), et le même timer de rafraîchissement — mais un domaine
// mémoire séparé (`modeleMediaMap`) : jamais une ligne `modele_medias`
// mélangée à une ligne `media_assets`.
import type { TissuPhoto, VoiceNote } from "../../lib/types";
import type { Json } from "../../lib/supabase/database.types";
import type { MediaRepository } from "../MediaRepository";
import type { RepositoryStatus } from "../RepositoryStatus";
import { READY_STATUS } from "../RepositoryStatus";
import { blobToDataUrl, parseDataUrl, readImageDimensions, sha256Hex } from "../../lib/dataUrl";
import {
  ALLOWED_MEDIA_BUCKET_MIME_TYPES,
  ALLOWED_MODELE_MEDIA_MIME_TYPES,
  isAllowedMediaBucketMime,
  isAllowedModeleMediaMime,
  normalizeMediaMime,
} from "./mediaMime";
import { buildMediaObjectPath, buildModeleMediaObjectPath } from "./mediaPath";
import { mapFabricPhotoRowToDomain, mapModeleMediaRowToDomain, mapSignatureRowToDomain, mapVoiceNoteRowToDomain } from "./mappers/media";
import {
  ficheViewRowSchema,
  mediaAssetRowSchema,
  modeleMediaRowSchema,
  modeleRowSchema,
  parseRowOrThrow,
  type FicheMediaType,
  type MediaAssetRow,
  type ModeleMediaKind,
  type ModeleMediaRow,
} from "./schemas";
import type { SupabaseGateway } from "./gateway";

/** ≤ 300 s (§28) — bucket privé, jamais `getPublicUrl()`. */
export const SIGNED_URL_TTL_SECONDS = 300;
/** Rafraîchit avant expiration plutôt que de laisser un média inutilisable
 * en cours de consultation d'une fiche (§29). */
const REFRESH_MARGIN_SECONDS = 60;
const NOMINAL_REFRESH_DELAY_MS = (SIGNED_URL_TTL_SECONDS - REFRESH_MARGIN_SECONDS) * 1000;
/** Cadence de retry après un ÉCHEC du rafraîchissement PÉRIODIQUE des URLs
 * signées uniquement — jamais un retry d'upload/insert/soft-delete (§21,
 * inchangé). Sans ce retry court, un échec unique à t=240s laisserait
 * l'ancienne URL expirer à t=300s puis attendre le cycle nominal suivant
 * (t=480s) avant une nouvelle tentative — ~180s avec un média inutilisable. */
const SIGNED_URL_RETRY_SECONDS = 30;

interface SignedUrlEntry {
  signedUrl: string;
  expiresAt: number;
}

export interface SupabaseMediaRepositoryOptions {
  gateway: SupabaseGateway;
  workshopId: string;
}

export class SupabaseMediaRepository implements MediaRepository {
  private readonly gateway: SupabaseGateway;
  private readonly workshopId: string;

  private mediaMap = new Map<string, MediaAssetRow>();
  /** Domaine séparé pour les médias MODÈLE (Phase 8B) — jamais mélangé avec
   * `mediaMap` (médias FICHE), voir le commentaire de tête du fichier. */
  private modeleMediaMap = new Map<string, ModeleMediaRow>();
  /** Cache de signatures PARTAGÉ entre médias fiche et médias modèle — clé
   * = `storage_path`, jamais ambiguë entre les deux domaines (préfixes de
   * path disjoints, §31). */
  private signedUrls = new Map<string, SignedUrlEntry>();
  /** Repli d'affichage SESSION UNIQUEMENT (§30) — pour un média ajouté cette
   * session dont la signature immédiate a échoué, jamais persisté. */
  private sessionFallback = new Map<string, string>();
  private statusValue: RepositoryStatus = { status: "loading" };
  private readonly listeners = new Set<() => void>();
  private epoch = 0;
  private disposed = false;
  private lastRefreshError: Error | null = null;
  private refreshTimerId: ReturnType<typeof setTimeout> | null = null;

  /** Résout une fois le cycle bootstrap (fetch + validation + signature de
   * TOUTES les URLs) terminé — succès ou échec. */
  readonly bootstrapped: Promise<void>;

  constructor(options: SupabaseMediaRepositoryOptions) {
    if (!options.workshopId) {
      throw new Error("SupabaseMediaRepository : workshopId requis (jamais un atelier arbitraire, corr. R §13).");
    }
    this.gateway = options.gateway;
    this.workshopId = options.workshopId;
    this.bootstrapped = this.refresh();
  }

  getStatus(): RepositoryStatus {
    return this.statusValue;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private setStatus(next: RepositoryStatus): void {
    this.statusValue = next;
  }

  dispose(): void {
    this.disposed = true;
    if (this.refreshTimerId !== null) clearTimeout(this.refreshTimerId);
    this.listeners.clear();
  }

  /** Éviction CACHE MÉMOIRE uniquement (correctif ciblé) — aucune requête
   * serveur, aucune suppression Storage. Appelée par
   * `createPhase8BCloudRepositories` juste après qu'un soft-delete de
   * modèle est confirmé côté serveur (`SupabaseModeleRepository.
   * onModelesRemoved`) : sans cette éviction, `modeleMediaMap` garderait des
   * rows dont le `storage_path` est désormais refusé par la policy Storage
   * (`modeles.deleted_at IS NULL`), empoisonnant le prochain rafraîchissement
   * PÉRIODIQUE atomique des URLs signées (`signAllPaths` échoue en bloc dès
   * qu'UN SEUL path du lot est refusé — y compris pour les médias FICHE du
   * même lot) en boucle de retry (30 s) sans jamais réussir. Ne touche
   * JAMAIS `mediaMap`/`derivedCache` (médias fiche) — uniquement
   * `modeleMediaMap` et les entrées `signedUrls`/`sessionFallback` qui lui
   * correspondent. */
  evictModeleMedia(modeleIds: readonly string[]): void {
    if (modeleIds.length === 0) return;
    const idSet = new Set(modeleIds);
    let changed = false;
    for (const row of this.modeleMediaMap.values()) {
      if (!idSet.has(row.modele_id)) continue;
      this.modeleMediaMap.delete(row.id);
      this.sessionFallback.delete(row.id);
      this.signedUrls.delete(row.storage_path);
      changed = true;
    }
    if (!changed) return; // rien à évincer — jamais de notification inutile
    this.epoch += 1;
    this.notify();
  }

  /** Contrainte DOMAINE (la DB ne l'impose pas pour `voice_note`, seulement
   * pour `signature` via son index partiel) : au plus une `voice_note`
   * active par fiche — jamais résolue en prenant arbitrairement la dernière
   * (§17). Une seule ligne en trop fait échouer tout le lot. */
  private assertAtMostOneVoiceNotePerFiche(rows: MediaAssetRow[]): void {
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.type !== "voice_note") continue;
      if (seen.has(row.fiche_id)) {
        throw new Error(
          `SupabaseMediaRepository: plusieurs voice_note actives détectées pour la fiche ${row.fiche_id} — ` +
            "incohérence de données, jamais résolue en prenant arbitrairement la dernière.",
        );
      }
      seen.add(row.fiche_id);
    }
  }

  /** Signe TOUS les paths d'un lot — une seule signature échouée fait
   * échouer le lot entier (§14/§28), jamais un résultat partiel. Générique
   * sur le path (pas sur `MediaAssetRow`) depuis la Phase 8B : un refresh
   * signe fiche ET modèle en un seul appel atomique (§33). */
  private async signAllPaths(paths: string[]): Promise<Map<string, SignedUrlEntry>> {
    const entries = await Promise.all(
      paths.map(async (path): Promise<readonly [string, SignedUrlEntry]> => {
        const { data, error } = await this.gateway.createSignedMediaUrl(path, SIGNED_URL_TTL_SECONDS);
        if (error || !data) {
          throw new Error(`Signature URL échouée pour ${path} : ${error?.message ?? "réponse vide"}`);
        }
        return [path, { signedUrl: data, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 }];
      }),
    );
    return new Map(entries);
  }

  /** Bootstrap ET rejoue périodique passent par la même méthode — un
   * refresh est un snapshot ATOMIQUE couvrant fiche ET modèle (Phase 8B,
   * §33) : fetch des deux collections + validation Zod + règle anti-doublon
   * voice_note + signature de TOUTES les URLs (fiche + modèle) avant de
   * remplacer quoi que ce soit — la moindre étape invalide (une seule ligne,
   * fiche ou modèle, ou une seule signature) fait échouer TOUT le refresh,
   * jamais un résultat partiel silencieusement accepté (§14). En cas
   * d'échec, l'ancien snapshot en mémoire (les deux domaines) est conservé
   * tel quel (comme `CloudCollectionStore.refresh()`). */
  async refresh(): Promise<void> {
    try {
      const { data: ficheData, error: ficheError } = await this.gateway.listActiveMediaAssets(this.workshopId);
      if (ficheError) throw new Error(ficheError.message);
      const ficheRows = (ficheData ?? []).map((raw) => parseRowOrThrow(mediaAssetRowSchema, raw, "SupabaseMediaRepository"));
      this.assertAtMostOneVoiceNotePerFiche(ficheRows);
      // Validation eager de la cohérence domaine (pas seulement la forme
      // réseau) — une voice_note sans durée valide fait échouer tout le
      // refresh, jamais une fiche silencieusement dégradée à la première
      // lecture (§16).
      for (const row of ficheRows) if (row.type === "voice_note") mapVoiceNoteRowToDomain(row, "");

      const { data: modeleData, error: modeleError } = await this.gateway.listActiveModeleMedias(this.workshopId);
      if (modeleError) throw new Error(modeleError.message);
      const modeleRows = (modeleData ?? []).map((raw) => parseRowOrThrow(modeleMediaRowSchema, raw, "SupabaseMediaRepository"));

      const allPaths = [...ficheRows.map((r) => r.storage_path), ...modeleRows.map((r) => r.storage_path)];
      const signed = await this.signAllPaths(allPaths);

      this.mediaMap = new Map(ficheRows.map((r) => [r.id, r]));
      this.modeleMediaMap = new Map(modeleRows.map((r) => [r.id, r]));
      // REMPLACE le cache signé (pas un merge) : un refresh complet réussi
      // reflète le snapshot serveur COURANT — une entrée pour un média
      // absent de ce snapshot (supprimé/remplacé entre-temps) ne doit jamais
      // survivre, sinon `signedUrls` grossit indéfiniment et cesse d'être un
      // miroir fidèle des deux Map ci-dessus.
      this.signedUrls = signed;
      // Un média resynchronisé n'a plus besoin de son repli de session.
      for (const row of [...ficheRows, ...modeleRows]) if (this.signedUrls.has(row.storage_path)) this.sessionFallback.delete(row.id);
      this.epoch += 1;
      this.lastRefreshError = null;
      this.setStatus(READY_STATUS);
      this.notify();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.lastRefreshError = error;
      if (this.mediaMap.size === 0 && this.modeleMediaMap.size === 0) {
        this.setStatus({ status: "error", error });
        this.notify();
      }
      // Sinon : snapshot existant conservé tel quel, jamais de suppression
      // silencieuse du média (§29) ; `getLastRefreshError()` seul change.
    }
    this.scheduleUrlRefresh();
  }

  getLastRefreshError(): Error | null {
    return this.lastRefreshError;
  }

  /** `delayMs` par défaut = cadence nominale. Un échec de
   * `refreshSignedUrls()` reprogramme volontairement avec un délai COURT
   * (`SIGNED_URL_RETRY_SECONDS`) plutôt que d'attendre le prochain cycle
   * nominal (§8/§9) — toujours un seul timer actif (`clearTimeout` avant
   * tout nouvel armement). */
  private scheduleUrlRefresh(delayMs: number = NOMINAL_REFRESH_DELAY_MS): void {
    if (this.disposed) return;
    if (this.refreshTimerId !== null) clearTimeout(this.refreshTimerId);
    this.refreshTimerId = setTimeout(() => {
      void this.refreshSignedUrls();
    }, Math.max(0, delayMs));
  }

  /** Rafraîchissement PÉRIODIQUE des URLs (pas un refresh complet du
   * catalogue) — un échec ne doit jamais faire disparaître un média déjà
   * connu : l'ancienne URL (potentiellement expirée) reste en mémoire,
   * `getLastRefreshError()` porte l'erreur, jamais une suppression
   * silencieuse (§29). Ce retry concerne UNIQUEMENT `createSignedMediaUrl` —
   * jamais `uploadMediaObject`/`insertMediaAsset`/`softDeleteMediaAsset`/
   * `restoreMediaAsset`, qui ne sont jamais rejoués automatiquement (§13,
   * §21 inchangés). */
  private async refreshSignedUrls(): Promise<void> {
    if (this.disposed) return;
    // Couvre fiche ET modèle (Phase 8B) — même cache `signedUrls` partagé.
    const rows: { storage_path: string; id: string }[] = [...this.mediaMap.values(), ...this.modeleMediaMap.values()];
    if (rows.length === 0) {
      this.scheduleUrlRefresh();
      return;
    }
    let nextDelayMs = NOMINAL_REFRESH_DELAY_MS;
    try {
      const signed = await this.signAllPaths(rows.map((r) => r.storage_path));
      // REMPLACE (pas un merge) — même raison que dans `refresh()` : aucune
      // entrée pour une row absente de `mediaMap`/`modeleMediaMap` ne doit survivre.
      this.signedUrls = signed;
      for (const row of rows) if (this.signedUrls.has(row.storage_path)) this.sessionFallback.delete(row.id);
      this.lastRefreshError = null;
      this.epoch += 1;
      this.notify();
    } catch (err) {
      this.lastRefreshError = err instanceof Error ? err : new Error(String(err));
      nextDelayMs = SIGNED_URL_RETRY_SECONDS * 1000;
    } finally {
      this.scheduleUrlRefresh(nextDelayMs);
    }
  }

  /** Générique (fiche OU modèle) — les deux partagent `storage_path`/`id`. */
  private resolveDisplayUrl(row: { storage_path: string; id: string }): string {
    return this.signedUrls.get(row.storage_path)?.signedUrl ?? this.sessionFallback.get(row.id) ?? "";
  }

  private rowsForFiche(ficheId: string): MediaAssetRow[] {
    const rows: MediaAssetRow[] = [];
    for (const row of this.mediaMap.values()) if (row.fiche_id === ficheId) rows.push(row);
    return rows;
  }

  /** `listFichePhotos`/`getFicheVoiceNote`/`getFicheSignature` DOIVENT
   * renvoyer une référence STABLE tant que les médias d'une fiche donnée
   * n'ont pas réellement changé — sans quoi `useSyncExternalStore`
   * (`useFicheMedia`, `hooks.ts`) verrait un snapshot "différent" à CHAQUE
   * appel (un `.map()`/objet littéral reconstruit sans condition produit une
   * nouvelle référence à chaque fois, même quand rien n'a changé) et
   * provoquerait une boucle de rendu infinie — exactement le bug déjà
   * rencontré ailleurs dans ce projet (`EMPTY_FICHES`, `EMPTY_PHOTOS`).
   * Mémoïsé par fiche, invalidé uniquement quand `epoch` avance (bootstrap,
   * upload, suppression, remplacement, refresh d'URL signée — tous les
   * points qui l'incrémentent déjà). */
  private derivedCache = new Map<string, { epoch: number; photos: TissuPhoto[]; voiceNote: VoiceNote | null; signature: string | null }>();

  private getDerived(ficheId: string): { photos: TissuPhoto[]; voiceNote: VoiceNote | null; signature: string | null } {
    const cached = this.derivedCache.get(ficheId);
    if (cached && cached.epoch === this.epoch) return cached;

    const rows = this.rowsForFiche(ficheId);
    const photos = rows.filter((r) => r.type === "fabric_photo").map((r) => mapFabricPhotoRowToDomain(r, this.resolveDisplayUrl(r)));
    const voiceRow = rows.find((r) => r.type === "voice_note");
    const signatureRow = rows.find((r) => r.type === "signature");
    const voiceNote = voiceRow ? mapVoiceNoteRowToDomain(voiceRow, this.resolveDisplayUrl(voiceRow)) : null;
    const signature = signatureRow ? mapSignatureRowToDomain(signatureRow, this.resolveDisplayUrl(signatureRow)) : null;

    const derived = { epoch: this.epoch, photos, voiceNote, signature };
    this.derivedCache.set(ficheId, derived);
    return derived;
  }

  listFichePhotos(ficheId: string): TissuPhoto[] {
    return this.getDerived(ficheId).photos;
  }

  getFicheVoiceNote(ficheId: string): VoiceNote | null {
    return this.getDerived(ficheId).voiceNote;
  }

  getFicheSignature(ficheId: string): string | null {
    return this.getDerived(ficheId).signature;
  }

  /** §33 : une fiche inaccessible (inexistante, hors atelier, supprimée)
   * doit être détectée AVANT tout upload Storage — jamais après. */
  private async assertFicheAccessible(ficheId: string): Promise<void> {
    const { data, error } = await this.gateway.getFicheById(this.workshopId, ficheId);
    if (error || !data) {
      throw new Error(`SupabaseMediaRepository: fiche ${ficheId} inaccessible dans cet atelier — aucun média ajouté.`);
    }
    const row = parseRowOrThrow(ficheViewRowSchema, data, "SupabaseMediaRepository.assertFicheAccessible");
    if (row.deleted_at !== null) {
      throw new Error(`SupabaseMediaRepository: fiche ${ficheId} supprimée — aucun média ajouté.`);
    }
  }

  private async buildMetadata(type: FicheMediaType, dataUrl: string, blob: Blob, mimeType: string, metadataExtra: Record<string, Json>): Promise<Record<string, Json>> {
    const checksum = await sha256Hex(blob);
    const { codec } = normalizeMediaMime(mimeType);
    const metadata: Record<string, Json> = { checksum, ...metadataExtra };
    if (codec) metadata.codec = codec;
    if (type === "fabric_photo" || type === "signature") {
      try {
        const { width, height } = await readImageDimensions(dataUrl);
        metadata.width = width;
        metadata.height = height;
      } catch {
        // Dimensions indisponibles (rare) — non bloquant, le média reste utilisable sans elles.
      }
    }
    return metadata;
  }

  /** Ordre imposé (§20) : valider fiche → parser → calculer metadata →
   * générer path → upload Storage → INSERT `media_assets` → (signature
   * gérée par l'appelant, voir `commitRow`). Ne crée JAMAIS de ligne active
   * avant un upload réussi — l'inverse laisserait une ligne pointant vers un
   * objet absent. Aucun retry automatique (§21). */
  private async uploadAndInsertRow(ficheId: string, type: FicheMediaType, dataUrl: string, metadataExtra: Record<string, Json>): Promise<MediaAssetRow> {
    const parsed = parseDataUrl(dataUrl);
    const { bucketMime } = normalizeMediaMime(parsed.mimeType);
    if (!isAllowedMediaBucketMime(bucketMime)) {
      throw new Error(
        `SupabaseMediaRepository: type MIME "${bucketMime}" non autorisé (formats acceptés : ${ALLOWED_MEDIA_BUCKET_MIME_TYPES.join(", ")}).`,
      );
    }
    const metadata = await this.buildMetadata(type, dataUrl, parsed.blob, parsed.mimeType, metadataExtra);
    const path = buildMediaObjectPath(this.workshopId, ficheId, crypto.randomUUID());

    const { error: uploadError } = await this.gateway.uploadMediaObject(path, parsed.blob, bucketMime);
    if (uploadError) throw new Error(`SupabaseMediaRepository: upload échoué : ${uploadError.message}`);

    const { data, error: insertError } = await this.gateway.insertMediaAsset({
      workshop_id: this.workshopId,
      fiche_id: ficheId,
      type,
      storage_path: path,
      mime_type: bucketMime,
      size_bytes: parsed.sizeBytes,
      metadata,
    });
    if (insertError) {
      // Objet Storage potentiellement orphelin (invisible, jamais nettoyé
      // automatiquement ici — hors scope 8A) : jamais une seconde tentative
      // d'upload automatique (§21).
      throw new Error(`SupabaseMediaRepository: enregistrement du média échoué après upload : ${insertError.message}`);
    }
    const row = parseRowOrThrow(mediaAssetRowSchema, data, "SupabaseMediaRepository");
    if (row.type === "voice_note") mapVoiceNoteRowToDomain(row, ""); // valide AVANT de committer en mémoire
    return row;
  }

  /** Signe la nouvelle ligne et met à jour le snapshot mémoire. Un échec de
   * signature immédiatement après création n'efface jamais le média : repli
   * sur la data URL source pour CETTE session, un refresh périodique
   * retentera la signature — jamais un second upload automatique (§30). */
  private async commitRow(row: MediaAssetRow, sourceDataUrl: string): Promise<void> {
    this.mediaMap.set(row.id, row);
    try {
      const { data, error } = await this.gateway.createSignedMediaUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      if (error || !data) throw new Error(error?.message ?? "URL signée vide");
      this.signedUrls.set(row.storage_path, { signedUrl: data, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 });
    } catch {
      this.sessionFallback.set(row.id, sourceDataUrl);
    }
    this.epoch += 1;
    this.notify();
  }

  async addFichePhoto(ficheId: string, dataUrl: string): Promise<void> {
    await this.assertFicheAccessible(ficheId);
    const row = await this.uploadAndInsertRow(ficheId, "fabric_photo", dataUrl, {});
    await this.commitRow(row, dataUrl);
  }

  async removeFichePhoto(ficheId: string, photoId: string): Promise<void> {
    const row = this.mediaMap.get(photoId);
    if (!row || row.fiche_id !== ficheId || row.type !== "fabric_photo") return;
    const { error } = await this.gateway.softDeleteMediaAsset(this.workshopId, photoId);
    if (error) throw new Error(`SupabaseMediaRepository: suppression de la photo échouée : ${error.message}`);
    this.mediaMap.delete(photoId);
    this.sessionFallback.delete(photoId);
    this.signedUrls.delete(row.storage_path);
    this.epoch += 1;
    this.notify();
  }

  /** Remplacement vocal/signature (§31/§32) — au plus une ligne active à la
   * fois pour ces deux types. `value === null` : simple soft-delete, aucun
   * upload. Sinon, ORDRE imposé : upload nouveau objet → soft-delete
   * ancienne ligne → INSERT nouvelle ligne → signature. Si l'INSERT échoue
   * après le soft-delete, restauration BEST-EFFORT de l'ancienne ligne
   * (`restoreMediaAsset`) ; si la restauration échoue aussi, erreur factuelle
   * explicite. Jamais de suppression Storage physique de l'ancien objet. */
  private async replaceSingletonMedia(
    ficheId: string,
    type: Extract<FicheMediaType, "voice_note" | "signature">,
    input: { dataUrl: string; metadataExtra: Record<string, Json> } | null,
  ): Promise<void> {
    const existing = this.rowsForFiche(ficheId).find((r) => r.type === type);

    if (input === null) {
      if (!existing) return;
      const { error } = await this.gateway.softDeleteMediaAsset(this.workshopId, existing.id);
      if (error) throw new Error(`SupabaseMediaRepository: suppression échouée : ${error.message}`);
      this.mediaMap.delete(existing.id);
      this.sessionFallback.delete(existing.id);
      this.signedUrls.delete(existing.storage_path);
      this.epoch += 1;
      this.notify();
      return;
    }

    await this.assertFicheAccessible(ficheId);
    const parsed = parseDataUrl(input.dataUrl);
    const { bucketMime } = normalizeMediaMime(parsed.mimeType);
    if (!isAllowedMediaBucketMime(bucketMime)) {
      throw new Error(
        `SupabaseMediaRepository: type MIME "${bucketMime}" non autorisé (formats acceptés : ${ALLOWED_MEDIA_BUCKET_MIME_TYPES.join(", ")}).`,
      );
    }
    const metadata = await this.buildMetadata(type, input.dataUrl, parsed.blob, parsed.mimeType, input.metadataExtra);
    const path = buildMediaObjectPath(this.workshopId, ficheId, crypto.randomUUID());

    const { error: uploadError } = await this.gateway.uploadMediaObject(path, parsed.blob, bucketMime);
    if (uploadError) throw new Error(`SupabaseMediaRepository: upload échoué : ${uploadError.message}`);

    if (existing) {
      const { error: softDeleteError } = await this.gateway.softDeleteMediaAsset(this.workshopId, existing.id);
      if (softDeleteError) {
        throw new Error(
          `SupabaseMediaRepository: impossible de libérer l'ancien média (${existing.id}) avant remplacement — ` +
            `l'objet uploadé n'a pas été enregistré : ${softDeleteError.message}`,
        );
      }
    }

    const { data, error: insertError } = await this.gateway.insertMediaAsset({
      workshop_id: this.workshopId,
      fiche_id: ficheId,
      type,
      storage_path: path,
      mime_type: bucketMime,
      size_bytes: parsed.sizeBytes,
      metadata,
    });
    if (insertError) {
      if (existing) {
        const { error: restoreError } = await this.gateway.restoreMediaAsset(this.workshopId, existing.id);
        if (restoreError) {
          throw new Error(
            `SupabaseMediaRepository: remplacement échoué ET restauration de l'ancien média (${existing.id}) impossible — ` +
              `état média à rafraîchir manuellement. Cause initiale : ${insertError.message}`,
          );
        }
        // Restauration réussie : l'ancien média redevient actif, le snapshot
        // mémoire (jamais modifié pour `existing` jusqu'ici) reste correct.
      }
      throw new Error(`SupabaseMediaRepository: remplacement échoué à l'enregistrement : ${insertError.message}`);
    }

    const row = parseRowOrThrow(mediaAssetRowSchema, data, "SupabaseMediaRepository.replace");
    if (row.type === "voice_note") mapVoiceNoteRowToDomain(row, "");

    // L'ancienne entrée `signedUrls`/`sessionFallback` n'est nettoyée
    // QU'ICI, une fois l'INSERT du nouveau média confirmé — jamais avant
    // (voir le commentaire de tête) : si l'INSERT avait échoué et que la
    // restauration best-effort ci-dessus avait réussi, l'ancien média
    // redevient actif et son URL signée doit rester exploitable.
    if (existing) {
      this.mediaMap.delete(existing.id);
      this.sessionFallback.delete(existing.id);
      this.signedUrls.delete(existing.storage_path);
    }
    await this.commitRow(row, input.dataUrl);
  }

  async setFicheVoiceNote(ficheId: string, value: VoiceNote | null): Promise<void> {
    await this.replaceSingletonMedia(
      ficheId,
      "voice_note",
      value === null ? null : { dataUrl: value.url, metadataExtra: { duration_seconds: value.duration, recorded_at: value.recordedAt } },
    );
  }

  async setFicheSignature(ficheId: string, dataUrl: string | null): Promise<void> {
    await this.replaceSingletonMedia(ficheId, "signature", dataUrl === null ? null : { dataUrl, metadataExtra: {} });
  }

  // ── Médias MODÈLE — Phase 8B ────────────────────────────────────────────

  private rowsForModele(modeleId: string): ModeleMediaRow[] {
    const rows: ModeleMediaRow[] = [];
    for (const row of this.modeleMediaMap.values()) if (row.modele_id === modeleId) rows.push(row);
    return rows;
  }

  /** `position ASC`, tie-break déterministe `created_at` puis `id` (§35) —
   * deux positions égales ne sont PAS une corruption (aucune contrainte
   * UNIQUE en base), jamais traitées comme une erreur bloquante. */
  private sortModeleRows(rows: ModeleMediaRow[]): ModeleMediaRow[] {
    return [...rows].sort(
      (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
  }

  /** `max(position) + 1`, jamais `count` (correctif ciblé) — après une
   * suppression laissant des trous (ex. positions restantes 0, 3, 4), un
   * simple compte de lignes actives (`length` = 3) réattribuerait `3`, une
   * position déjà occupée par un média existant, faisant apparaître le
   * nouvel ajout AVANT lui dans le tri `position ASC`. Aucun média du kind
   * → `0`. Le tie-break (`position ASC`, `created_at`, `id`) reste inchangé
   * pour les données déjà en base (positions dupliquées possibles, jamais
   * une corruption) — ce correctif ne concerne que l'ALLOCATION des
   * nouveaux médias. */
  private nextModelePosition(modeleId: string, kind: ModeleMediaKind): number {
    const rows = this.rowsForModele(modeleId).filter((r) => r.kind === kind);
    if (rows.length === 0) return 0;
    let max = rows[0].position;
    for (const row of rows) if (row.position > max) max = row.position;
    return max + 1;
  }

  /** Même contrat de stabilité de référence que `getDerived()` (fiche) —
   * voir son commentaire de tête. Mémoïsé par modèle, invalidé uniquement
   * quand `epoch` avance. */
  private derivedModeleCache = new Map<string, { epoch: number; photos: TissuPhoto[]; patronPhotos: TissuPhoto[] }>();

  private getDerivedModele(modeleId: string): { photos: TissuPhoto[]; patronPhotos: TissuPhoto[] } {
    const cached = this.derivedModeleCache.get(modeleId);
    if (cached && cached.epoch === this.epoch) return cached;

    const rows = this.rowsForModele(modeleId);
    const photos = this.sortModeleRows(rows.filter((r) => r.kind === "photo")).map((r) => mapModeleMediaRowToDomain(r, this.resolveDisplayUrl(r)));
    const patronPhotos = this.sortModeleRows(rows.filter((r) => r.kind === "patron")).map((r) => mapModeleMediaRowToDomain(r, this.resolveDisplayUrl(r)));

    const derived = { epoch: this.epoch, photos, patronPhotos };
    this.derivedModeleCache.set(modeleId, derived);
    return derived;
  }

  listModelePhotos(modeleId: string): TissuPhoto[] {
    return this.getDerivedModele(modeleId).photos;
  }

  listModelePatronPhotos(modeleId: string): TissuPhoto[] {
    return this.getDerivedModele(modeleId).patronPhotos;
  }

  /** §25 : un modèle inaccessible (inexistant, hors atelier, soft-deleted)
   * doit être détecté AVANT tout upload Storage / toute copie — jamais après. */
  private async assertModeleAccessible(modeleId: string): Promise<void> {
    const { data, error } = await this.gateway.getModeleById(this.workshopId, modeleId);
    if (error || !data) {
      throw new Error(`SupabaseMediaRepository: modèle ${modeleId} inaccessible dans cet atelier — aucun média ajouté.`);
    }
    const row = parseRowOrThrow(modeleRowSchema, data, "SupabaseMediaRepository.assertModeleAccessible");
    if (row.deleted_at !== null) {
      throw new Error(`SupabaseMediaRepository: modèle ${modeleId} supprimé — aucun média ajouté.`);
    }
  }

  /** Signe la nouvelle ligne MODÈLE et met à jour le snapshot mémoire —
   * même logique que `commitRow()` (fiche), domaine séparé. */
  private async commitModeleRow(row: ModeleMediaRow, sourceDataUrl: string): Promise<void> {
    this.modeleMediaMap.set(row.id, row);
    try {
      const { data, error } = await this.gateway.createSignedMediaUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      if (error || !data) throw new Error(error?.message ?? "URL signée vide");
      this.signedUrls.set(row.storage_path, { signedUrl: data, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 });
    } catch {
      this.sessionFallback.set(row.id, sourceDataUrl);
    }
    this.epoch += 1;
    this.notify();
  }

  /** Ordre imposé (§36/§42), identique à `uploadAndInsertRow` (fiche) :
   * valider modèle → parser → MIME image STRICT (§38, plus restrictif que le
   * bucket global) → metadata → path modèle dédié → upload Storage → INSERT
   * `modele_medias` → signature (`commitModeleRow`). Aucun retry auto (§21). */
  private async uploadAndCommitModeleMedia(modeleId: string, kind: ModeleMediaKind, dataUrl: string): Promise<void> {
    await this.assertModeleAccessible(modeleId);
    const parsed = parseDataUrl(dataUrl);
    const { bucketMime } = normalizeMediaMime(parsed.mimeType);
    if (!isAllowedModeleMediaMime(bucketMime)) {
      throw new Error(
        `SupabaseMediaRepository: type MIME "${bucketMime}" non autorisé pour un média modèle ` +
          `(formats acceptés : ${ALLOWED_MODELE_MEDIA_MIME_TYPES.join(", ")}).`,
      );
    }
    const checksum = await sha256Hex(parsed.blob);
    const metadata: Record<string, Json> = { checksum };
    try {
      const { width, height } = await readImageDimensions(dataUrl);
      metadata.width = width;
      metadata.height = height;
    } catch {
      // Dimensions indisponibles (rare) — non bloquant.
    }
    const position = this.nextModelePosition(modeleId, kind);
    const path = buildModeleMediaObjectPath(this.workshopId, modeleId, crypto.randomUUID());

    const { error: uploadError } = await this.gateway.uploadMediaObject(path, parsed.blob, bucketMime);
    if (uploadError) throw new Error(`SupabaseMediaRepository: upload échoué : ${uploadError.message}`);

    const { data, error: insertError } = await this.gateway.insertModeleMedia({
      workshop_id: this.workshopId,
      modele_id: modeleId,
      kind,
      storage_path: path,
      mime_type: bucketMime,
      size_bytes: parsed.sizeBytes,
      position,
      metadata,
    });
    if (insertError) {
      // Objet Storage potentiellement orphelin — jamais une seconde
      // tentative d'upload automatique (§21, même règle que pour la fiche).
      throw new Error(`SupabaseMediaRepository: enregistrement du média modèle échoué après upload : ${insertError.message}`);
    }
    const row = parseRowOrThrow(modeleMediaRowSchema, data, "SupabaseMediaRepository");
    await this.commitModeleRow(row, dataUrl);
  }

  async addModelePhoto(modeleId: string, dataUrl: string): Promise<void> {
    await this.uploadAndCommitModeleMedia(modeleId, "photo", dataUrl);
  }

  async addModelePatronPhoto(modeleId: string, dataUrl: string): Promise<void> {
    await this.uploadAndCommitModeleMedia(modeleId, "patron", dataUrl);
  }

  /** GRANT Phase 4 : SELECT/INSERT/DELETE sur `modele_medias`, AUCUN UPDATE
   * (§6/§44) — détacher une photo/patron est donc un DELETE physique de la
   * LIGNE (jamais `deleted_at`), et jamais `storage.remove()` (§45) : le
   * bucket n'a aucune policy DELETE utilisateur, l'objet devient
   * simplement orphelin/inaccessible. */
  private async removeModeleMedia(modeleId: string, mediaId: string, kind: ModeleMediaKind): Promise<void> {
    const row = this.modeleMediaMap.get(mediaId);
    if (!row || row.modele_id !== modeleId || row.kind !== kind) return;
    const { error } = await this.gateway.deleteModeleMedia(this.workshopId, mediaId);
    if (error) throw new Error(`SupabaseMediaRepository: suppression du média modèle échouée : ${error.message}`);
    this.modeleMediaMap.delete(mediaId);
    this.sessionFallback.delete(mediaId);
    this.signedUrls.delete(row.storage_path);
    this.epoch += 1;
    this.notify();
  }

  async removeModelePhoto(modeleId: string, photoId: string): Promise<void> {
    await this.removeModeleMedia(modeleId, photoId, "photo");
  }

  async removeModelePatronPhoto(modeleId: string, photoId: string): Promise<void> {
    await this.removeModeleMedia(modeleId, photoId, "patron");
  }

  /** §47/§49 : copie les médias AUTORITATIFS (`modele_medias`, jamais
   * `Modele.photos[].dataUrl`) d'un modèle vers les photos tissu d'une
   * fiche — télécharge l'objet Storage source avec la session utilisateur
   * (`downloadMediaObject`, policy SELECT réelle) puis ré-uploade le MÊME
   * `Blob` vers un nouveau path fiche : AUCUN appel `parseDataUrl` sur une
   * URL signée HTTPS (§82). Photos puis patrons, dans cet ordre (§48),
   * deviennent tous deux `fabric_photo` (§49). Copie séquentielle et
   * factuelle (§51/§84) : un échec intermédiaire rejette la Promise sans
   * annuler les copies déjà réussies ni en retenter aucune. */
  async copyModeleMediaToFiche(modeleId: string, ficheId: string): Promise<void> {
    await this.assertModeleAccessible(modeleId);
    await this.assertFicheAccessible(ficheId);

    const photos = this.sortModeleRows(this.rowsForModele(modeleId).filter((r) => r.kind === "photo"));
    const patrons = this.sortModeleRows(this.rowsForModele(modeleId).filter((r) => r.kind === "patron"));

    for (const sourceRow of [...photos, ...patrons]) {
      const { data: blob, error: downloadError } = await this.gateway.downloadMediaObject(sourceRow.storage_path);
      if (downloadError || !blob) {
        throw new Error(
          `SupabaseMediaRepository: téléchargement du média modèle échoué (${sourceRow.storage_path}) : ${downloadError?.message ?? "réponse vide"}`,
        );
      }
      const destPath = buildMediaObjectPath(this.workshopId, ficheId, crypto.randomUUID());
      const { error: uploadError } = await this.gateway.uploadMediaObject(destPath, blob, sourceRow.mime_type);
      if (uploadError) throw new Error(`SupabaseMediaRepository: upload de la copie échoué : ${uploadError.message}`);

      const checksum = await sha256Hex(blob);
      const { data, error: insertError } = await this.gateway.insertMediaAsset({
        workshop_id: this.workshopId,
        fiche_id: ficheId,
        type: "fabric_photo",
        storage_path: destPath,
        mime_type: sourceRow.mime_type,
        size_bytes: blob.size,
        metadata: { checksum, copied_from_modele_media_id: sourceRow.id },
      });
      if (insertError) {
        throw new Error(`SupabaseMediaRepository: enregistrement de la copie échoué après upload : ${insertError.message}`);
      }
      const row = parseRowOrThrow(mediaAssetRowSchema, data, "SupabaseMediaRepository.copy");
      const fallbackDataUrl = await blobToDataUrl(blob);
      await this.commitRow(row, fallbackDataUrl);
    }
  }
}
