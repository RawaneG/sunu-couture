import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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

function modeleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mod1",
    workshop_id: "w1",
    nom: "Robe wax",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

function modeleMediaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mm1",
    workshop_id: "w1",
    modele_id: "mod1",
    kind: "photo",
    storage_path: "workshops/w1/modeles/mod1/file1",
    mime_type: "image/jpeg",
    size_bytes: 100,
    position: 0,
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
    downloadMediaObject: vi.fn(async () => ({ data: new Blob(["x"]), error: null })),
    listActiveModeles: vi.fn(async () => ({ data: [], error: null })),
    getModeleById: vi.fn(async () => ({ data: modeleRow(), error: null })),
    insertModele: vi.fn(async () => ({ data: null, error: null })),
    updateModeleNom: vi.fn(async () => ({ data: null, error: null })),
    softDeleteModeles: vi.fn(async () => ({ data: null, error: null })),
    listActiveModeleMedias: vi.fn(async () => ({ data: [], error: null })),
    insertModeleMedia: vi.fn(async () => ({ data: modeleMediaRow({ id: "mm-new" }), error: null })),
    deleteModeleMedia: vi.fn(async () => ({ data: null, error: null })),
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

  it("un refresh complet REMPLACE le cache signé (pas un merge) : un média disparu du snapshot serveur n'est plus listé ni resignable", async () => {
    let call = 0;
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return {
            data: [mediaRow({ id: "p1", storage_path: "path-p1" }), mediaRow({ id: "p2", storage_path: "path-p2" })],
            error: null,
          };
        }
        // Snapshot serveur suivant : p2 a disparu (supprimé/remplacé ailleurs).
        return { data: [mediaRow({ id: "p1", storage_path: "path-p1" })], error: null };
      }),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;
    expect(media.listFichePhotos("f1").map((p) => p.id).sort()).toEqual(["p1", "p2"]);

    await media.refresh();

    // p2 n'existe plus dans le snapshot mémoire : aucune méthode publique ne
    // peut plus jamais exposer son ancienne URL signée. La seule façon dont
    // une entrée orpheline pourrait autrement fuiter est le cache interne
    // `signedUrls` — remplacé (jamais fusionné) par ce correctif, voir le
    // commentaire de tête de `refresh()`.
    expect(media.listFichePhotos("f1").map((p) => p.id)).toEqual(["p1"]);
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

  it("remplacement : INSERT échoué après soft-delete -> restauration best-effort de l'ancien, qui reste UTILISABLE (URL signée conservée)", async () => {
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [mediaRow({ id: "v-old", type: "voice_note", storage_path: "old-path", metadata: { duration_seconds: 3 } })], error: null })),
      insertMediaAsset: vi.fn(async () => ({ data: null, error: { message: "insert failed" } })),
      createSignedMediaUrl: vi.fn(async () => ({ data: "https://signed.example/old-path", error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;
    const before = media.getFicheVoiceNote("f1");

    await expect(media.setFicheVoiceNote("f1", { url: WEBM_DATA_URL, duration: 9, recordedAt: "2026-01-03T00:00:00.000Z" })).rejects.toThrow(
      /remplacement échoué/,
    );
    expect(gateway.restoreMediaAsset).toHaveBeenCalledWith("w1", "v-old");

    // La compensation ayant réussi côté serveur, l'ancien média n'a JAMAIS
    // été retiré du snapshot mémoire ni de son URL signée (nettoyage
    // seulement APRÈS un INSERT confirmé, jamais avant) — il reste donc
    // exactement utilisable, avec sa MÊME URL, sans nouvel appel de signature.
    expect(media.getFicheVoiceNote("f1")).toEqual(before);
    expect(gateway.createSignedMediaUrl).toHaveBeenCalledTimes(1); // uniquement le bootstrap
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

describe("SupabaseMediaRepository — médias modèle (Phase 8B)", () => {
  it("addModelePhoto : assert modèle, 1 upload, 1 insert kind=photo, bon workshop/modele_id/MIME/size/path, 1 signature", async () => {
    const gateway = fakeGateway({
      insertModeleMedia: vi.fn(async () => ({ data: modeleMediaRow({ id: "mm-new", kind: "photo" }), error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.addModelePhoto("mod1", JPEG_DATA_URL);

    expect(gateway.getModeleById).toHaveBeenCalledWith("w1", "mod1");
    expect(gateway.uploadMediaObject).toHaveBeenCalledTimes(1);
    const [path, , contentType] = (gateway.uploadMediaObject as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toMatch(/^workshops\/w1\/modeles\/mod1\//);
    expect(contentType).toBe("image/jpeg");
    expect(gateway.insertModeleMedia).toHaveBeenCalledTimes(1);
    const insertPayload = (gateway.insertModeleMedia as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload).toMatchObject({ workshop_id: "w1", modele_id: "mod1", kind: "photo", position: 0 });
    expect(gateway.createSignedMediaUrl).toHaveBeenCalledTimes(1);
    expect(media.listModelePhotos("mod1")).toHaveLength(1);
  });

  it("addModelePatronPhoto : kind=patron", async () => {
    const gateway = fakeGateway({
      insertModeleMedia: vi.fn(async () => ({ data: modeleMediaRow({ id: "mm-new", kind: "patron" }), error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.addModelePatronPhoto("mod1", PNG_DATA_URL);

    const insertPayload = (gateway.insertModeleMedia as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload).toMatchObject({ kind: "patron" });
    expect(media.listModelePatronPhotos("mod1")).toHaveLength(1);
    expect(media.listModelePhotos("mod1")).toHaveLength(0);
  });

  it("addModelePhoto : position suivante = nombre de lignes déjà actives du même kind", async () => {
    const gateway = fakeGateway({
      listActiveModeleMedias: vi.fn(async () => ({
        data: [modeleMediaRow({ id: "mm-a", kind: "photo", position: 0 }), modeleMediaRow({ id: "mm-b", kind: "photo", position: 1 })],
        error: null,
      })),
      insertModeleMedia: vi.fn(async () => ({ data: modeleMediaRow({ id: "mm-c", kind: "photo", position: 2 }), error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.addModelePhoto("mod1", JPEG_DATA_URL);

    const insertPayload = (gateway.insertModeleMedia as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertPayload.position).toBe(2);
  });

  it("addModelePhoto : MIME audio refusé AVANT tout upload (§38 — plus restrictif que le bucket fiche)", async () => {
    const gateway = fakeGateway();
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await expect(media.addModelePhoto("mod1", WEBM_DATA_URL)).rejects.toThrow(/non autorisé/);
    expect(gateway.uploadMediaObject).not.toHaveBeenCalled();
    expect(gateway.insertModeleMedia).not.toHaveBeenCalled();
  });

  it("addModelePhoto : modèle inaccessible (autre atelier/soft-deleted) → aucun upload", async () => {
    const gateway = fakeGateway({ getModeleById: vi.fn(async () => ({ data: null, error: { message: "not found" } })) });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await expect(media.addModelePhoto("mod-absent", JPEG_DATA_URL)).rejects.toThrow(/inaccessible/);
    expect(gateway.uploadMediaObject).not.toHaveBeenCalled();
  });

  it("addModelePhoto : signature échouée après création → repli data URL de session, pas de duplicate", async () => {
    const gateway = fakeGateway({
      insertModeleMedia: vi.fn(async () => ({ data: modeleMediaRow({ id: "mm-new", kind: "photo" }), error: null })),
      createSignedMediaUrl: vi.fn(async () => ({ data: null, error: { message: "signing down" } })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.addModelePhoto("mod1", JPEG_DATA_URL);

    expect(gateway.uploadMediaObject).toHaveBeenCalledTimes(1);
    expect(gateway.insertModeleMedia).toHaveBeenCalledTimes(1);
    expect(media.listModelePhotos("mod1")[0].dataUrl).toBe(JPEG_DATA_URL);
  });

  it("listModelePhotos/listModelePatronPhotos : tri position ASC, tie-break created_at puis id — deux positions égales ne sont PAS une corruption", async () => {
    const gateway = fakeGateway({
      listActiveModeleMedias: vi.fn(async () => ({
        data: [
          modeleMediaRow({ id: "z", kind: "photo", position: 0, created_at: "2026-01-01T00:00:01.000Z" }),
          modeleMediaRow({ id: "a", kind: "photo", position: 0, created_at: "2026-01-01T00:00:00.000Z" }),
          modeleMediaRow({ id: "p1", kind: "patron", position: 1 }),
          modeleMediaRow({ id: "p0", kind: "patron", position: 0 }),
        ],
        error: null,
      })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    expect(media.listModelePhotos("mod1").map((p) => p.id)).toEqual(["a", "z"]);
    expect(media.listModelePatronPhotos("mod1").map((p) => p.id)).toEqual(["p0", "p1"]);
  });

  it("row modele_medias invalide (kind inattendu) → refresh entier refusé atomiquement", async () => {
    const gateway = fakeGateway({
      listActiveModeleMedias: vi.fn(async () => ({ data: [modeleMediaRow({ kind: "invalide" })], error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    expect(media.getStatus().status).toBe("error");
    expect(media.listModelePhotos("mod1")).toEqual([]);
  });

  it("removeModelePhoto/removeModelePatronPhoto : DELETE physique de la ligne, jamais storage.remove (aucun tel appel n'existe dans le gateway)", async () => {
    const gateway = fakeGateway({
      listActiveModeleMedias: vi.fn(async () => ({ data: [modeleMediaRow({ id: "mm1", kind: "photo" })], error: null })),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await media.removeModelePhoto("mod1", "mm1");

    expect(gateway.deleteModeleMedia).toHaveBeenCalledWith("w1", "mm1");
    expect(media.listModelePhotos("mod1")).toHaveLength(0);
  });

  describe("copyModeleMediaToFiche", () => {
    function copyGateway(overrides: Partial<SupabaseGateway> = {}) {
      return fakeGateway({
        listActiveModeleMedias: vi.fn(async () => ({
          data: [modeleMediaRow({ id: "p1", kind: "photo", position: 0 }), modeleMediaRow({ id: "pp1", kind: "patron", position: 0 })],
          error: null,
        })),
        downloadMediaObject: vi.fn(async () => ({ data: new Blob(["bytes"], { type: "image/jpeg" }), error: null })),
        insertMediaAsset: vi.fn(async () => ({ data: mediaRow({ id: "copy-new" }), error: null })),
        ...overrides,
      });
    }

    it("télécharge chaque source (session utilisateur), ré-uploade vers la fiche, insère fabric_photo pour photo ET patron, jamais parseDataUrl sur une URL signée", async () => {
      const gateway = copyGateway();
      const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
      await media.bootstrapped;

      await media.copyModeleMediaToFiche("mod1", "f1");

      expect(gateway.downloadMediaObject).toHaveBeenCalledTimes(2);
      expect(gateway.downloadMediaObject).toHaveBeenNthCalledWith(1, "workshops/w1/modeles/mod1/file1");
      expect(gateway.uploadMediaObject).toHaveBeenCalledTimes(2);
      expect(gateway.insertMediaAsset).toHaveBeenCalledTimes(2);
      for (const call of (gateway.insertMediaAsset as ReturnType<typeof vi.fn>).mock.calls) {
        expect(call[0]).toMatchObject({ type: "fabric_photo", fiche_id: "f1", workshop_id: "w1" });
        expect(call[0].storage_path).toMatch(/^workshops\/w1\/fiches\/f1\//);
      }
    });

    it("modèle inaccessible → 0 download/upload/insert", async () => {
      const gateway = copyGateway({ getModeleById: vi.fn(async () => ({ data: null, error: { message: "not found" } })) });
      const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
      await media.bootstrapped;

      await expect(media.copyModeleMediaToFiche("mod-absent", "f1")).rejects.toThrow(/inaccessible/);
      expect(gateway.downloadMediaObject).not.toHaveBeenCalled();
      expect(gateway.uploadMediaObject).not.toHaveBeenCalled();
      expect(gateway.insertMediaAsset).not.toHaveBeenCalled();
    });

    it("fiche inaccessible → 0 upload", async () => {
      const gateway = copyGateway({ getFicheById: vi.fn(async () => ({ data: null, error: { message: "not found" } })) });
      const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
      await media.bootstrapped;

      await expect(media.copyModeleMediaToFiche("mod1", "f-absente")).rejects.toThrow(/inaccessible/);
      expect(gateway.uploadMediaObject).not.toHaveBeenCalled();
    });

    it("échec intermédiaire (2ᵉ item) : le 1er reste créé, la Promise rejette, aucun retry, pas de duplicate du 1er", async () => {
      const uploadMediaObject = vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: "upload down" } });
      const gateway = copyGateway({ uploadMediaObject });
      const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
      await media.bootstrapped;

      await expect(media.copyModeleMediaToFiche("mod1", "f1")).rejects.toThrow(/upload de la copie échoué/);

      expect(uploadMediaObject).toHaveBeenCalledTimes(2); // pas de 3ᵉ tentative / retry
      expect(gateway.insertMediaAsset).toHaveBeenCalledTimes(1); // le 1er est resté créé
    });
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

describe("SupabaseMediaRepository — retry court après échec du rafraîchissement d'URL signée (§8/§9)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("échec du refresh signé à la cadence nominale (240s) -> retry à 30s (pas 240s) -> succès -> retour à la cadence nominale", async () => {
    let signCall = 0;
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [mediaRow({ id: "p1" })], error: null })),
      createSignedMediaUrl: vi.fn(async () => {
        signCall += 1;
        if (signCall === 1) return { data: "https://signed.example/initial", error: null }; // bootstrap
        if (signCall === 2) return { data: null, error: { message: "signing down" } }; // cycle nominal (240s) — échoue
        return { data: "https://signed.example/renewed", error: null }; // retry (30s après l'échec) — réussit
      }),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;
    expect(media.listFichePhotos("f1")[0].dataUrl).toBe("https://signed.example/initial");

    // Cycle nominal : 240s (SIGNED_URL_TTL_SECONDS - REFRESH_MARGIN_SECONDS).
    await vi.advanceTimersByTimeAsync(240_000);
    expect(signCall).toBe(2);
    expect(media.getLastRefreshError()).not.toBeNull();
    // Ancienne URL conservée — jamais supprimée sur un échec de refresh (§29).
    expect(media.listFichePhotos("f1")[0].dataUrl).toBe("https://signed.example/initial");

    // 29s après l'échec : encore aucune nouvelle tentative.
    await vi.advanceTimersByTimeAsync(29_000);
    expect(signCall).toBe(2);

    // +1s (30s pile après l'échec) : nouvelle tentative de signature.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(signCall).toBe(3);
    expect(media.getLastRefreshError()).toBeNull();
    expect(media.listFichePhotos("f1")[0].dataUrl).toBe("https://signed.example/renewed");

    // Retour à la cadence nominale : rien avant encore 239s (240s - 1s déjà écoulée).
    await vi.advanceTimersByTimeAsync(239_000);
    expect(signCall).toBe(3);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(signCall).toBe(4);

    media.dispose();
  });

  it("un seul timer actif à la fois — dispose() annule tout retry programmé", async () => {
    // Bootstrap RÉUSSI (au moins une ligne signée) pour que le refresh
    // périodique soit réellement programmé, puis échec du cycle suivant.
    let signCall = 0;
    const gateway = fakeGateway({
      listActiveMediaAssets: vi.fn(async () => ({ data: [mediaRow({ id: "p1" })], error: null })),
      createSignedMediaUrl: vi.fn(async () => {
        signCall += 1;
        if (signCall === 1) return { data: "https://signed.example/x", error: null };
        return { data: null, error: { message: "down" } };
      }),
    });
    const media = new SupabaseMediaRepository({ gateway, workshopId: "w1" });
    await media.bootstrapped;

    await vi.advanceTimersByTimeAsync(240_000); // échoue, programme un retry à 30s
    expect(signCall).toBe(2);

    media.dispose();

    // Après dispose(), aucun retry ne doit plus jamais se déclencher, même
    // après le délai de retry ET plusieurs cycles nominaux.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(signCall).toBe(2);
  });
});
