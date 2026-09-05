import { describe, expect, it, vi } from "vitest";
import { SupabaseMediaRepository } from "./SupabaseMediaRepository";
import type { SupabaseGateway } from "./gateway";

function ficheRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    workshop_id: "w1",
    carnet_id: "carnet-1",
    client_id: null,
    number: 5,
    page_number: 2,
    slot_number: 1,
    state: "active",
    status: "received",
    measurements: {},
    garment: "Boubou",
    description: null,
    fabric_notes: null,
    quantity: 1,
    due_date: null,
    total_price: 0,
    settled_at: null,
    version: 1,
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    is_late: false,
    ...overrides,
  };
}

function mediaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    workshop_id: "w1",
    fiche_id: "f1",
    type: "fabric_photo",
    storage_path: "workshops/w1/fiches/f1/file1",
    mime_type: "image/jpeg",
    size_bytes: 100,
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

function fakeGateway(overrides: Partial<SupabaseGateway> = {}): SupabaseGateway {
  return {
    listActiveClients: vi.fn(async () => ({ data: [], error: null })),
    insertClient: vi.fn(async () => ({ data: null, error: null })),
    softDeleteClients: vi.fn(async () => ({ data: null, error: null })),
    listCarnets: vi.fn(async () => ({ data: [], error: null })),
    listActiveFiches: vi.fn(async () => ({ data: [], error: null })),
    getFicheById: vi.fn(async () => ({ data: ficheRow(), error: null })),
    updateFiche: vi.fn(async () => ({ data: null, error: null })),
    softDeleteFiches: vi.fn(async () => ({ data: null, error: null })),
    createFicheFromDraft: vi.fn(async () => ({ data: null, error: null })),
    listActiveMediaAssets: vi.fn(async () => ({ data: [], error: null })),
    insertMediaAsset: vi.fn(async () => ({ data: mediaRow({ id: "m-new" }), error: null })),
    softDeleteMediaAsset: vi.fn(async () => ({ data: null, error: null })),
    restoreMediaAsset: vi.fn(async () => ({ data: null, error: null })),
    uploadMediaObject: vi.fn(async () => ({ data: null, error: null })),
    createSignedMediaUrl: vi.fn(async () => ({ data: "https://signed.example/x", error: null })),
    ...overrides,
  };
}

const JPEG_DATA_URL = "data:image/jpeg;base64,AAAA";
const PNG_DATA_URL = "data:image/png;base64,AAAA";
const WEBM_DATA_URL = "data:audio/webm;base64,AAAA";

describe("SupabaseMediaRepository — construction", () => {
  it("refuse un workshopId vide", () => {
    expect(() => new SupabaseMediaRepository({ gateway: fakeGateway(), workshopId: "" })).toThrow(/workshopId requis/);
  });
});

describe("SupabaseMediaRepository — hydratation (bootstrap)", () => {
  it("plusieurs photos + 1 voice + 1 signature : mappées correctement avec leurs URLs signées", async () => {
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({
        data: [
          mediaRow({ id: "p1", type: "fabric_photo", storage_path: "path-p1" }),
          mediaRow({ id: "p2", type: "fabric_photo", storage_path: "path-p2" }),
          mediaRow({ id: "v1", type: "voice_note", storage_path: "path-v1", metadata: { duration_seconds: 8, recorded_at: "2026-01-02T00:00:00.000Z" } }),
          mediaRow({ id: "s1", type: "signature", storage_path: "path-s1" }),
        ],
        error: null,
      })),
      createSignedMediaUrl: vi.fn(async (path: string) => ({ data: `https://signed.example/${path}`, error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    expect(media.getStatus()).toEqual({ status: "ready" });
    const photos = media.listFichePhotos("f1");
    expect(photos.map((p) => p.dataUrl).sort()).toEqual(["https://signed.example/path-p1", "https://signed.example/path-p2"]);
    expect(media.getFicheVoiceNote("f1")).toEqual({ url: "https://signed.example/path-v1", duration: 8, recordedAt: "2026-01-02T00:00:00.000Z" });
    expect(media.getFicheSignature("f1")).toBe("https://signed.example/path-s1");
  });

  it("ligne réseau invalide -> Repository en erreur, aucune donnée partielle acceptée", async () => {
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [{ id: "bad" }], error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    expect(media.getStatus().status).toBe("error");
    expect(media.listFichePhotos("f1")).toEqual([]);
  });

  it("plusieurs voice_note actives pour la même fiche -> erreur de cohérence (jamais la dernière prise arbitrairement)", async () => {
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({
        data: [
          mediaRow({ id: "v1", type: "voice_note", storage_path: "p1", metadata: { duration_seconds: 5 } }),
          mediaRow({ id: "v2", type: "voice_note", storage_path: "p2", metadata: { duration_seconds: 6 } }),
        ],
        error: null,
      })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    expect(media.getStatus().status).toBe("error");
    expect(media.getLastRefreshError()?.message).toMatch(/plusieurs voice_note/);
  });

  it("type='model_photo' inattendu dans media_assets -> rejeté, jamais mappé silencieusement", async () => {
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [mediaRow({ type: "model_photo" })], error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    expect(media.getStatus().status).toBe("error");
  });

  it("échec de signature pendant le bootstrap -> tout le lot échoue (atomique)", async () => {
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [mediaRow()], error: null })),
      createSignedMediaUrl: vi.fn(async () => ({ data: null, error: { message: "signing down" } })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    expect(media.getStatus().status).toBe("error");
    expect(media.listFichePhotos("f1")).toEqual([]);
  });

  it("aucune ligne active : ready avec collections vides", async () => {
    const media = new SupabaseMediaRepository({ gateway: fakeGateway(), workshopId: "w1" });
    await media.bootstrapped;

    expect(media.getStatus()).toEqual({ status: "ready" });
    expect(media.listFichePhotos("f1")).toEqual([]);
    expect(media.getFicheVoiceNote("f1")).toBeNull();
    expect(media.getFicheSignature("f1")).toBeNull();
  });
});

describe("SupabaseMediaRepository — addFichePhoto (upload)", () => {
  it("valide la fiche, uploade exactement 1 fois, insert exactement 1 ligne type=fabric_photo, notifie", async () => {
    const gateway = fakeGateway();
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;
    const listener = vi.fn();
    media.subscribe(listener);

    await media.addFichePhoto("f1", JPEG_DATA_URL);

    expect(gateway.getFicheById).toHaveBeenCalledWith("w1", "f1");
    expect(gateway.uploadMediaObject).toHaveBeenCalledTimes(1);
    expect(gateway.insertMediaAsset).toHaveBeenCalledTimes(1);
    const insertPayload = (gateway.insertMediaAsset as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload).toMatchObject({ workshop_id: "w1", fiche_id: "f1", type: "fabric_photo", mime_type: "image/jpeg" });
    expect(insertPayload.storage_path).toMatch(/^workshops\/w1\/fiches\/f1\//);
    expect(insertPayload.metadata.checksum).toBeTypeOf("string");
    expect(listener).toHaveBeenCalled();
    expect(media.listFichePhotos("f1").map((p) => p.id)).toContain("m-new");
  });

  it("fiche inaccessible -> rejette AVANT tout upload", async () => {
    const gateway = fakeGateway({ getFicheById: vi.fn(async () => ({ data: null, error: { message: "not found" } })) });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await expect(media.addFichePhoto("f-absente", JPEG_DATA_URL)).rejects.toThrow(/inaccessible/);
    expect(gateway.uploadMediaObject).not.toHaveBeenCalled();
  });

  it("fiche supprimée (deleted_at non nul) -> rejette AVANT tout upload", async () => {
    const gateway = fakeGateway({ getFicheById: vi.fn(async () => ({ data: ficheRow({ deleted_at: "2026-01-05T00:00:00.000Z" }), error: null })) });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await expect(media.addFichePhoto("f1", JPEG_DATA_URL)).rejects.toThrow(/supprimée/);
    expect(gateway.uploadMediaObject).not.toHaveBeenCalled();
  });

  it("MIME non autorisé -> rejeté avant tout appel réseau", async () => {
    const media = new SupabaseMediaRepository({ gateway: fakeGateway(), workshopId: "w1" });
    await media.bootstrapped;

    await expect(media.addFichePhoto("f1", "data:video/mp4;base64,AAAA")).rejects.toThrow(/non autorisé/);
  });

  it("succès DB + signature échouée -> repli sur la data URL source, aucun second upload, média considéré créé", async () => {
    const gateway = fakeGateway({ createSignedMediaUrl: vi.fn(async () => ({ data: null, error: { message: "signing down" } })) });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.addFichePhoto("f1", JPEG_DATA_URL);

    expect(gateway.uploadMediaObject).toHaveBeenCalledTimes(1);
    expect(gateway.insertMediaAsset).toHaveBeenCalledTimes(1);
    expect(media.listFichePhotos("f1")[0].dataUrl).toBe(JPEG_DATA_URL);
  });
});

describe("SupabaseMediaRepository — removeFichePhoto (suppression logique)", () => {
  it("soft-delete via le gateway, jamais de suppression Storage physique (aucune méthode de ce type n'existe dans le contrat)", async () => {
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [mediaRow({ id: "p1" })], error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.removeFichePhoto("f1", "p1");

    expect(gateway.softDeleteMediaAsset).toHaveBeenCalledWith("w1", "p1");
    expect(media.listFichePhotos("f1")).toEqual([]);
  });

  it("id inconnu -> no-op silencieux (rien à supprimer)", async () => {
    const gateway = fakeGateway();
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.removeFichePhoto("f1", "inconnu");
    expect(gateway.softDeleteMediaAsset).not.toHaveBeenCalled();
  });
});

describe("SupabaseMediaRepository — setFicheVoiceNote (création + remplacement)", () => {
  it("première note vocale : upload, insert type=voice_note avec duration_seconds/recorded_at/checksum", async () => {
    const gateway = fakeGateway({ insertMediaAsset: vi.fn(async () => ({ data: mediaRow({ id: "v-new", type: "voice_note", metadata: { duration_seconds: 9, recorded_at: "2026-01-03T00:00:00.000Z", checksum: "x" } }), error: null })) });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.setFicheVoiceNote("f1", { url: WEBM_DATA_URL, duration: 9, recordedAt: "2026-01-03T00:00:00.000Z" });

    const insertPayload = (gateway.insertMediaAsset as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload.type).toBe("voice_note");
    expect(insertPayload.metadata.duration_seconds).toBe(9);
    expect(insertPayload.metadata.recorded_at).toBe("2026-01-03T00:00:00.000Z");
    expect(insertPayload.metadata.checksum).toBeTypeOf("string");
    expect(media.getFicheVoiceNote("f1")?.duration).toBe(9);
  });

  it("remplacement : ordre upload -> soft-delete ancien -> insert nouveau", async () => {
    const callOrder: string[] = [];
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [mediaRow({ id: "v-old", type: "voice_note", storage_path: "old-path", metadata: { duration_seconds: 3 } })], error: null })),
      uploadMediaObject: vi.fn(async () => {
        callOrder.push("upload");
        return { data: null, error: null };
      }),
      softDeleteMediaAsset: vi.fn(async () => {
        callOrder.push("softDelete");
        return { data: null, error: null };
      }),
      insertMediaAsset: vi.fn(async () => {
        callOrder.push("insert");
        return { data: mediaRow({ id: "v-new", type: "voice_note", storage_path: "new-path", metadata: { duration_seconds: 9, recorded_at: "2026-01-03T00:00:00.000Z" } }), error: null };
      }),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.setFicheVoiceNote("f1", { url: WEBM_DATA_URL, duration: 9, recordedAt: "2026-01-03T00:00:00.000Z" });

    expect(callOrder).toEqual(["upload", "softDelete", "insert"]);
    expect(gateway.softDeleteMediaAsset).toHaveBeenCalledWith("w1", "v-old");
    expect(media.getFicheVoiceNote("f1")?.duration).toBe(9);
  });

  it("remplacement : INSERT échoué après soft-delete -> restauration best-effort de l'ancien", async () => {
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [mediaRow({ id: "v-old", type: "voice_note", storage_path: "old-path", metadata: { duration_seconds: 3 } })], error: null })),
      insertMediaAsset: vi.fn(async () => ({ data: null, error: { message: "insert failed" } })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await expect(media.setFicheVoiceNote("f1", { url: WEBM_DATA_URL, duration: 9, recordedAt: "2026-01-03T00:00:00.000Z" })).rejects.toThrow(
      /remplacement échoué/,
    );
    expect(gateway.restoreMediaAsset).toHaveBeenCalledWith("w1", "v-old");
  });

  it("remplacement : INSERT ET restauration échouent -> erreur factuelle explicite", async () => {
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [mediaRow({ id: "v-old", type: "voice_note", storage_path: "old-path", metadata: { duration_seconds: 3 } })], error: null })),
      insertMediaAsset: vi.fn(async () => ({ data: null, error: { message: "insert failed" } })),
      restoreMediaAsset: vi.fn(async () => ({ data: null, error: { message: "restore failed" } })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await expect(media.setFicheVoiceNote("f1", { url: WEBM_DATA_URL, duration: 9, recordedAt: "2026-01-03T00:00:00.000Z" })).rejects.toThrow(
      /rafraîchir manuellement/,
    );
  });

  it("value=null : soft-delete uniquement, aucun upload", async () => {
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [mediaRow({ id: "v1", type: "voice_note", metadata: { duration_seconds: 3 } })], error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.setFicheVoiceNote("f1", null);

    expect(gateway.uploadMediaObject).not.toHaveBeenCalled();
    expect(gateway.softDeleteMediaAsset).toHaveBeenCalledWith("w1", "v1");
    expect(media.getFicheVoiceNote("f1")).toBeNull();
  });
});

describe("SupabaseMediaRepository — setFicheSignature", () => {
  it("création : upload + insert type=signature", async () => {
    const gateway = fakeGateway({ insertMediaAsset: vi.fn(async () => ({ data: mediaRow({ id: "s-new", type: "signature" }), error: null })) });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.setFicheSignature("f1", PNG_DATA_URL);

    const insertPayload = (gateway.insertMediaAsset as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload.type).toBe("signature");
    expect(media.getFicheSignature("f1")).not.toBeNull();
  });

  it("remplacement : une seule signature active à la fois (ordre upload -> soft-delete -> insert)", async () => {
    const callOrder: string[] = [];
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [mediaRow({ id: "s-old", type: "signature", storage_path: "old-sig" })], error: null })),
      uploadMediaObject: vi.fn(async () => (callOrder.push("upload"), { data: null, error: null })),
      softDeleteMediaAsset: vi.fn(async () => (callOrder.push("softDelete"), { data: null, error: null })),
      insertMediaAsset: vi.fn(async () => (callOrder.push("insert"), { data: mediaRow({ id: "s-new", type: "signature", storage_path: "new-sig" }), error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.setFicheSignature("f1", PNG_DATA_URL);

    expect(callOrder).toEqual(["upload", "softDelete", "insert"]);
    expect(gateway.softDeleteMediaAsset).toHaveBeenCalledWith("w1", "s-old");
  });

  it("value=null : soft-delete uniquement", async () => {
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [mediaRow({ id: "s1", type: "signature" })], error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.setFicheSignature("f1", null);

    expect(gateway.uploadMediaObject).not.toHaveBeenCalled();
    expect(gateway.softDeleteMediaAsset).toHaveBeenCalledWith("w1", "s1");
    expect(media.getFicheSignature("f1")).toBeNull();
  });
});

describe("SupabaseMediaRepository — médias modèle (Phase 8B, non implémentés)", () => {
  it("listModelePhotos rejette explicitement — jamais une collection vide silencieuse", async () => {
    const media = new SupabaseMediaRepository({ gateway: fakeGateway(), workshopId: "w1" });
    await media.bootstrapped;
    expect(() => media.listModelePhotos("m1")).toThrow(/Phase 8B/);
  });

  it("addModelePhoto rejette explicitement", async () => {
    const media = new SupabaseMediaRepository({ gateway: fakeGateway(), workshopId: "w1" });
    await media.bootstrapped;
    await expect(media.addModelePhoto("m1", JPEG_DATA_URL)).rejects.toThrow(/Phase 8B/);
  });
});

describe("SupabaseMediaRepository — stabilité référentielle (régression : boucle infinie useSyncExternalStore)", () => {
  it("listFichePhotos()/getFicheVoiceNote()/getFicheSignature() renvoient la MÊME référence entre deux appels sans mutation", async () => {
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({
        data: [
          mediaRow({ id: "p1", type: "fabric_photo" }),
          mediaRow({ id: "v1", type: "voice_note", storage_path: "path-v1", metadata: { duration_seconds: 8 } }),
          mediaRow({ id: "s1", type: "signature", storage_path: "path-s1" }),
        ],
        error: null,
      })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    // Avant le correctif, chaque appel reconstruisait un nouveau tableau
    // (`.filter().map()`) et un nouvel objet VoiceNote — `useFicheMedia()`
    // (useSyncExternalStore) voyait alors un snapshot "différent" à chaque
    // vérification, ce qui déclenche "Maximum update depth exceeded" côté
    // React (observé réellement après suppression d'une fiche, mais latent
    // pour TOUTE fiche cloud, pas seulement après suppression).
    expect(media.listFichePhotos("f1")).toBe(media.listFichePhotos("f1"));
    expect(media.getFicheVoiceNote("f1")).toBe(media.getFicheVoiceNote("f1"));
    expect(media.getFicheSignature("f1")).toBe(media.getFicheSignature("f1"));
  });

  it("une fiche inconnue/sans média renvoie aussi une référence stable", async () => {
    const media = new SupabaseMediaRepository({ gateway: fakeGateway(), workshopId: "w1" });
    await media.bootstrapped;

    expect(media.listFichePhotos("f-inconnue")).toBe(media.listFichePhotos("f-inconnue"));
  });

  it("une mutation invalide bien le cache : la référence change après ajout d'une photo", async () => {
    const gateway = fakeGateway();
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    const before = media.listFichePhotos("f1");
    await media.addFichePhoto("f1", JPEG_DATA_URL);
    const after = media.listFichePhotos("f1");

    expect(after).not.toBe(before);
    // Mais redemander deux fois de suite APRÈS la mutation reste stable.
    expect(media.listFichePhotos("f1")).toBe(after);
  });
});
