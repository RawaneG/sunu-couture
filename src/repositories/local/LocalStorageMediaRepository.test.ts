import { describe, expect, it, beforeEach } from "vitest";
import { useStore } from "../../lib/store";
import { LocalStorageFicheRepository } from "./LocalStorageFicheRepository";
import { LocalStorageMediaRepository } from "./LocalStorageMediaRepository";

beforeEach(() => {
  useStore.setState({ clients: [], fiches: [], modeles: [] });
});

describe("LocalStorageMediaRepository — photos (contrat historique)", () => {
  it("addFichePhoto()/listFichePhotos() : la photo ajoutée est immédiatement listée", async () => {
    const fiches = new LocalStorageFicheRepository();
    const media = new LocalStorageMediaRepository();
    const id = await fiches.add();

    await media.addFichePhoto(id, "data:image/jpeg;base64,AAAA");

    const photos = media.listFichePhotos(id);
    expect(photos).toHaveLength(1);
    expect(photos[0].dataUrl).toBe("data:image/jpeg;base64,AAAA");
  });

  it("removeFichePhoto() retire exactement la photo ciblée", async () => {
    const fiches = new LocalStorageFicheRepository();
    const media = new LocalStorageMediaRepository();
    const id = await fiches.add();
    await media.addFichePhoto(id, "data:image/jpeg;base64,AAAA");
    await media.addFichePhoto(id, "data:image/jpeg;base64,BBBB");
    const [first] = media.listFichePhotos(id);

    await media.removeFichePhoto(id, first.id);

    const remaining = media.listFichePhotos(id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].dataUrl).toBe("data:image/jpeg;base64,BBBB");
  });
});

describe("LocalStorageMediaRepository — voiceNote (Phase 8A, déplacé depuis FicheRepository.setInfo)", () => {
  it("getFicheVoiceNote() renvoie null par défaut", async () => {
    const fiches = new LocalStorageFicheRepository();
    const media = new LocalStorageMediaRepository();
    const id = await fiches.add();
    expect(media.getFicheVoiceNote(id)).toBeNull();
  });

  it("setFicheVoiceNote() écrit puis getFicheVoiceNote() le relit — même stockage store.setFicheInfo, aucun changement de format", async () => {
    const fiches = new LocalStorageFicheRepository();
    const media = new LocalStorageMediaRepository();
    const id = await fiches.add();
    const note = { url: "data:audio/webm;base64,AAAA", duration: 12, recordedAt: "2026-01-01T00:00:00.000Z" };

    await media.setFicheVoiceNote(id, note);

    expect(media.getFicheVoiceNote(id)).toEqual(note);
    // Vérifie que ça passe bien par la même fiche stockée (compat locale) :
    expect(fiches.get(id)?.voiceNote).toEqual(note);
  });

  it("setFicheVoiceNote(id, null) efface la note", async () => {
    const fiches = new LocalStorageFicheRepository();
    const media = new LocalStorageMediaRepository();
    const id = await fiches.add();
    await media.setFicheVoiceNote(id, { url: "data:audio/webm;base64,AAAA", duration: 3, recordedAt: "2026-01-01T00:00:00.000Z" });

    await media.setFicheVoiceNote(id, null);

    expect(media.getFicheVoiceNote(id)).toBeNull();
  });
});

describe("LocalStorageMediaRepository — signature (Phase 8A, déplacé depuis FicheRepository.setInfo)", () => {
  it("getFicheSignature() renvoie null par défaut", async () => {
    const fiches = new LocalStorageFicheRepository();
    const media = new LocalStorageMediaRepository();
    const id = await fiches.add();
    expect(media.getFicheSignature(id)).toBeNull();
  });

  it("setFicheSignature() écrit puis getFicheSignature() le relit", async () => {
    const fiches = new LocalStorageFicheRepository();
    const media = new LocalStorageMediaRepository();
    const id = await fiches.add();

    await media.setFicheSignature(id, "data:image/png;base64,AAAA");

    expect(media.getFicheSignature(id)).toBe("data:image/png;base64,AAAA");
    expect(fiches.get(id)?.signature).toBe("data:image/png;base64,AAAA");
  });

  it("setFicheSignature(id, null) efface la signature", async () => {
    const fiches = new LocalStorageFicheRepository();
    const media = new LocalStorageMediaRepository();
    const id = await fiches.add();
    await media.setFicheSignature(id, "data:image/png;base64,AAAA");

    await media.setFicheSignature(id, null);

    expect(media.getFicheSignature(id)).toBeNull();
  });
});

describe("LocalStorageMediaRepository — getStatus() absente (Phase 8A §6)", () => {
  it("n'implémente pas getStatus() — le contrat 'ready immédiat' vient de son absence, pas d'une valeur renvoyée", () => {
    const media = new LocalStorageMediaRepository();
    expect("getStatus" in media).toBe(false);
  });
});
