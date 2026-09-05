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
// Médias MODÈLE (`listModelePhotos`/...) : PAS implémentés ici (Phase 8B) —
// voir `modeleUnsupported()`. Ce Repository n'est branché nulle part dans
// `RepositoryContainer` (voir `createPhase8ACloudRepositories.ts`).
import type { TissuPhoto, VoiceNote } from "../../lib/types";
import type { Json } from "../../lib/supabase/database.types";
import type { MediaRepository } from "../MediaRepository";
import type { RepositoryStatus } from "../RepositoryStatus";
import { READY_STATUS } from "../RepositoryStatus";
import { parseDataUrl, readImageDimensions, sha256Hex } from "../../lib/dataUrl";
import { ALLOWED_MEDIA_BUCKET_MIME_TYPES, isAllowedMediaBucketMime, normalizeMediaMime } from "./mediaMime";
import { buildMediaObjectPath } from "./mediaPath";
import { mapFabricPhotoRowToDomain, mapSignatureRowToDomain, mapVoiceNoteRowToDomain } from "./mappers/media";
import { ficheViewRowSchema, mediaAssetRowSchema, parseRowOrThrow, type FicheMediaType, type MediaAssetRow } from "./schemas";
import type { SupabaseGateway } from "./gateway";

/** ≤ 300 s (§28) — bucket privé, jamais `getPublicUrl()`. */
export const SIGNED_URL_TTL_SECONDS = 300;
/** Rafraîchit avant expiration plutôt que de laisser un média inutilisable
 * en cours de consultation d'une fiche (§29). */
const REFRESH_MARGIN_SECONDS = 60;

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

  /** Signe TOUTES les lignes d'un lot — une seule signature échouée fait
   * échouer le lot entier (§14/§28), jamais un résultat partiel. */
  private async signAll(rows: MediaAssetRow[]): Promise<Map<string, SignedUrlEntry>> {
    const entries = await Promise.all(
      rows.map(async (row): Promise<readonly [string, SignedUrlEntry]> => {
        const { data, error } = await this.gateway.createSignedMediaUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
        if (error || !data) {
          throw new Error(`Signature URL échouée pour ${row.storage_path} : ${error?.message ?? "réponse vide"}`);
        }
        return [row.storage_path, { signedUrl: data, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 }];
      }),
    );
    return new Map(entries);
  }

  /** Bootstrap ET rejoue périodique passent par la même méthode — un
   * refresh est un snapshot atomique (fetch + validation Zod + règle
   * anti-doublon voice_note + signature de toutes les URLs) : la moindre
   * étape invalide fait échouer TOUT le refresh, jamais un résultat partiel
   * silencieusement accepté (§14). En cas d'échec, l'ancien snapshot en
   * mémoire est conservé tel quel (comme `CloudCollectionStore.refresh()`). */
  async refresh(): Promise<void> {
    try {
      const { data, error } = await this.gateway.listActiveMediaAssets(this.workshopId);
      if (error) throw new Error(error.message);
      const rows = (data ?? []).map((raw) => parseRowOrThrow(mediaAssetRowSchema, raw, "SupabaseMediaRepository"));
      this.assertAtMostOneVoiceNotePerFiche(rows);
      // Validation eager de la cohérence domaine (pas seulement la forme
      // réseau) — une voice_note sans durée valide fait échouer tout le
      // refresh, jamais une fiche silencieusement dégradée à la première
      // lecture (§16).
      for (const row of rows) if (row.type === "voice_note") mapVoiceNoteRowToDomain(row, "");
      const signed = await this.signAll(rows);

      this.mediaMap = new Map(rows.map((r) => [r.id, r]));
      for (const [path, entry] of signed) this.signedUrls.set(path, entry);
      // Un média resynchronisé n'a plus besoin de son repli de session.
      for (const row of rows) if (this.signedUrls.has(row.storage_path)) this.sessionFallback.delete(row.id);
      this.epoch += 1;
      this.lastRefreshError = null;
      this.setStatus(READY_STATUS);
      this.notify();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.lastRefreshError = error;
      if (this.mediaMap.size === 0) {
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

  private scheduleUrlRefresh(): void {
    if (this.disposed) return;
    if (this.refreshTimerId !== null) clearTimeout(this.refreshTimerId);
    const delayMs = Math.max(0, (SIGNED_URL_TTL_SECONDS - REFRESH_MARGIN_SECONDS) * 1000);
    this.refreshTimerId = setTimeout(() => {
      void this.refreshSignedUrls();
    }, delayMs);
  }

  /** Rafraîchissement PÉRIODIQUE des URLs (pas un refresh complet du
   * catalogue) — un échec ne doit jamais faire disparaître un média déjà
   * connu : l'ancienne URL (potentiellement expirée) reste en mémoire,
   * `getLastRefreshError()` porte l'erreur, jamais une suppression
   * silencieuse (§29). */
  private async refreshSignedUrls(): Promise<void> {
    if (this.disposed) return;
    const rows = [...this.mediaMap.values()];
    if (rows.length === 0) {
      this.scheduleUrlRefresh();
      return;
    }
    try {
      const signed = await this.signAll(rows);
      for (const [path, entry] of signed) this.signedUrls.set(path, entry);
      for (const row of rows) if (this.signedUrls.has(row.storage_path)) this.sessionFallback.delete(row.id);
      this.lastRefreshError = null;
      this.epoch += 1;
      this.notify();
    } catch (err) {
      this.lastRefreshError = err instanceof Error ? err : new Error(String(err));
    } finally {
      this.scheduleUrlRefresh();
    }
  }

  private resolveDisplayUrl(row: MediaAssetRow): string {
    return this.signedUrls.get(row.storage_path)?.signedUrl ?? this.sessionFallback.get(row.id) ?? "";
  }

  private rowsForFiche(ficheId: string): MediaAssetRow[] {
    const rows: MediaAssetRow[] = [];
    for (const row of this.mediaMap.values()) if (row.fiche_id === ficheId) rows.push(row);
    return rows;
  }

  listFichePhotos(ficheId: string): TissuPhoto[] {
    return this.rowsForFiche(ficheId)
      .filter((r) => r.type === "fabric_photo")
      .map((r) => mapFabricPhotoRowToDomain(r, this.resolveDisplayUrl(r)));
  }

  getFicheVoiceNote(ficheId: string): VoiceNote | null {
    const row = this.rowsForFiche(ficheId).find((r) => r.type === "voice_note");
    return row ? mapVoiceNoteRowToDomain(row, this.resolveDisplayUrl(row)) : null;
  }

  getFicheSignature(ficheId: string): string | null {
    const row = this.rowsForFiche(ficheId).find((r) => r.type === "signature");
    return row ? mapSignatureRowToDomain(row, this.resolveDisplayUrl(row)) : null;
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

    if (existing) this.mediaMap.delete(existing.id);
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

  // ── Médias MODÈLE — Phase 8B, PAS implémentés ici (§41). Ce Repository
  // n'est branché nulle part dans `RepositoryContainer` (§42) : un rejet
  // explicite est préférable à une collection vide qui laisserait croire à
  // une vérité cloud "aucun modèle n'a de photo".
  private modeleUnsupported(method: string): never {
    throw new Error(
      `SupabaseMediaRepository.${method}: médias modèle non implémentés avant la Phase 8B — ` +
        "ce Repository ne couvre que les médias FICHE (Phase 8A).",
    );
  }
  listModelePhotos(_modeleId: string): TissuPhoto[] {
    return this.modeleUnsupported("listModelePhotos");
  }
  async addModelePhoto(_modeleId: string, _dataUrl: string): Promise<void> {
    this.modeleUnsupported("addModelePhoto");
  }
  async removeModelePhoto(_modeleId: string, _photoId: string): Promise<void> {
    this.modeleUnsupported("removeModelePhoto");
  }
  listModelePatronPhotos(_modeleId: string): TissuPhoto[] {
    return this.modeleUnsupported("listModelePatronPhotos");
  }
  async addModelePatronPhoto(_modeleId: string, _dataUrl: string): Promise<void> {
    this.modeleUnsupported("addModelePatronPhoto");
  }
  async removeModelePatronPhoto(_modeleId: string, _photoId: string): Promise<void> {
    this.modeleUnsupported("removeModelePatronPhoto");
  }
}
