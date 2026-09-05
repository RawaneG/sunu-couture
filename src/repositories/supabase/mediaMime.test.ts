import { describe, expect, it } from "vitest";
import { ALLOWED_MEDIA_BUCKET_MIME_TYPES, isAllowedMediaBucketMime, normalizeMediaMime } from "./mediaMime";

describe("normalizeMediaMime", () => {
  it("MIME sans paramètre reste inchangé, codec null", () => {
    expect(normalizeMediaMime("image/jpeg")).toEqual({ bucketMime: "image/jpeg", codec: null });
  });

  it("audio/webm;codecs=opus -> bucketMime=audio/webm, codec=opus (corr. R §27)", () => {
    expect(normalizeMediaMime("audio/webm;codecs=opus")).toEqual({ bucketMime: "audio/webm", codec: "opus" });
  });

  it("extrait le codec même entre guillemets", () => {
    expect(normalizeMediaMime('audio/ogg;codecs="opus"')).toEqual({ bucketMime: "audio/ogg", codec: "opus" });
  });
});

describe("isAllowedMediaBucketMime", () => {
  it("accepte exactement les 5 formats Phase 8A", () => {
    for (const mime of ALLOWED_MEDIA_BUCKET_MIME_TYPES) {
      expect(isAllowedMediaBucketMime(mime)).toBe(true);
    }
  });

  it("rejette un format hors liste (ex. video/mp4)", () => {
    expect(isAllowedMediaBucketMime("video/mp4")).toBe(false);
  });
});
