import { describe, expect, it } from "vitest";
import { pickSupportedAudioMimeType } from "./audioRecording";

describe("pickSupportedAudioMimeType", () => {
  it("choisit le premier type de la liste de préférence réellement supporté", () => {
    const supported = new Set(["audio/mp4", "audio/ogg"]);
    const result = pickSupportedAudioMimeType((type) => supported.has(type));
    expect(result).toBe("audio/mp4");
  });

  it("préfère audio/webm;codecs=opus quand il est supporté", () => {
    const result = pickSupportedAudioMimeType(() => true);
    expect(result).toBe("audio/webm;codecs=opus");
  });

  it("renvoie undefined si aucun format testé n'est supporté — jamais un mensonge", () => {
    const result = pickSupportedAudioMimeType(() => false);
    expect(result).toBeUndefined();
  });

  it("un isTypeSupported qui lève une exception est traité comme non supporté, sans propager l'erreur", () => {
    const result = pickSupportedAudioMimeType(() => {
      throw new Error("boom");
    });
    expect(result).toBeUndefined();
  });
});
