import { describe, expect, it } from "vitest";
import { mapFabricPhotoRowToDomain, mapSignatureRowToDomain, mapVoiceNoteRowToDomain } from "./media";
import type { MediaAssetRow } from "../schemas";

function row(overrides: Partial<MediaAssetRow> = {}): MediaAssetRow {
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

describe("mapFabricPhotoRowToDomain", () => {
  it("id de la ligne + URL signée fournie séparément", () => {
    expect(mapFabricPhotoRowToDomain(row(), "https://signed.example/x")).toEqual({
      id: "m1",
      dataUrl: "https://signed.example/x",
    });
  });
});

describe("mapSignatureRowToDomain", () => {
  it("renvoie directement l'URL signée", () => {
    expect(mapSignatureRowToDomain(row({ type: "signature" }), "https://signed.example/sig")).toBe("https://signed.example/sig");
  });
});

describe("mapVoiceNoteRowToDomain", () => {
  it("construit VoiceNote depuis metadata.duration_seconds/recorded_at", () => {
    const voiceRow = row({ type: "voice_note", metadata: { duration_seconds: 12, recorded_at: "2026-02-01T10:00:00.000Z" } });
    expect(mapVoiceNoteRowToDomain(voiceRow, "https://signed.example/voice")).toEqual({
      url: "https://signed.example/voice",
      duration: 12,
      recordedAt: "2026-02-01T10:00:00.000Z",
    });
  });

  it("recorded_at absent -> repli sur created_at de la ligne", () => {
    const voiceRow = row({ type: "voice_note", metadata: { duration_seconds: 5 }, created_at: "2026-03-01T00:00:00.000Z" });
    expect(mapVoiceNoteRowToDomain(voiceRow, "u").recordedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("duration_seconds manquant -> rejeté (jamais une durée inventée à 0, corr. R §16)", () => {
    const voiceRow = row({ type: "voice_note", metadata: {} });
    expect(() => mapVoiceNoteRowToDomain(voiceRow, "u")).toThrow(/duration_seconds/);
  });

  it("duration_seconds négatif -> rejeté", () => {
    const voiceRow = row({ type: "voice_note", metadata: { duration_seconds: -1 } });
    expect(() => mapVoiceNoteRowToDomain(voiceRow, "u")).toThrow(/duration_seconds/);
  });

  it("duration_seconds non numérique -> rejeté", () => {
    const voiceRow = row({ type: "voice_note", metadata: { duration_seconds: "12" } });
    expect(() => mapVoiceNoteRowToDomain(voiceRow, "u")).toThrow(/duration_seconds/);
  });
});
