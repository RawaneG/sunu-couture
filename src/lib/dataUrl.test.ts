import { describe, expect, it } from "vitest";
import { parseDataUrl, readImageDimensions, sha256Hex } from "./dataUrl";

describe("parseDataUrl", () => {
  it("extrait le MIME et décode le contenu base64", async () => {
    const dataUrl = "data:text/plain;base64," + btoa("hello");
    const { blob, mimeType, sizeBytes } = parseDataUrl(dataUrl);
    expect(mimeType).toBe("text/plain");
    expect(sizeBytes).toBe(5);
    expect(await blob.text()).toBe("hello");
  });

  it("préserve le MIME réel — jamais un MIME supposé/forcé (corr. R §23)", () => {
    const dataUrl = "data:audio/mp4;base64," + btoa("audio-bytes");
    expect(parseDataUrl(dataUrl).mimeType).toBe("audio/mp4");
  });

  it("préserve les paramètres MIME (ex. codecs) tels quels — normalisation faite ailleurs", () => {
    const dataUrl = "data:audio/webm;codecs=opus;base64," + btoa("x");
    expect(parseDataUrl(dataUrl).mimeType).toBe("audio/webm;codecs=opus");
  });

  it("rejette une chaîne qui n'est pas une data URL", () => {
    expect(() => parseDataUrl("https://example.com/photo.jpg")).toThrow(/data URL/);
  });

  it("MIME absent -> repli sur application/octet-stream", () => {
    const dataUrl = "data:;base64," + btoa("x");
    expect(parseDataUrl(dataUrl).mimeType).toBe("application/octet-stream");
  });
});

describe("sha256Hex", () => {
  it("calcule un vrai SHA-256 (pas un pseudo-checksum) — valeur connue pour une chaîne vide", async () => {
    const hash = await sha256Hex(new Blob([]));
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hash).toHaveLength(64);
  });

  it("des contenus différents produisent des checksums différents", async () => {
    const a = await sha256Hex(new Blob(["a"]));
    const b = await sha256Hex(new Blob(["b"]));
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });
});

describe("readImageDimensions", () => {
  it("une image qui ne se charge jamais (ni onload ni onerror) rejette après le délai de garde, jamais un blocage indéfini", async () => {
    await expect(readImageDimensions("data:image/jpeg;base64,AAAA", 50)).rejects.toThrow(/délai dépassé|invalide/);
  });
});
