// Parsing strict d'une data URL vers ses composants exploitables par Storage
// (Phase 8A, corr. R §23) — jamais une confiance dans un nom/suffixe de
// fichier : le MIME vient UNIQUEMENT du préfixe `data:<mime>;base64,`
// réellement fourni par le navigateur (compression image, MediaRecorder,
// canvas de signature).
export interface ParsedDataUrl {
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
}

// Le "meta" (tout ce qui précède la première virgule) peut porter PLUSIEURS
// paramètres séparés par `;` avant `;base64` (ex. `audio/webm;codecs=opus;
// base64`) — seul un suffixe `;base64` exact est un marqueur d'encodage,
// jamais confondu avec un paramètre MIME qui contiendrait le mot "base64".
const DATA_URL_PATTERN = /^data:([^,]*),([\s\S]*)$/;
const BASE64_SUFFIX = /;base64$/i;

export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    throw new Error("parseDataUrl : la chaîne fournie n'est pas une data URL valide (préfixe \"data:\" attendu).");
  }
  let meta = match[1];
  const payload = match[2];
  const isBase64 = BASE64_SUFFIX.test(meta);
  if (isBase64) meta = meta.slice(0, -";base64".length);
  const mimeType = meta || "application/octet-stream";

  let bytes: Uint8Array;
  if (isBase64) {
    const binary = atob(payload);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload));
  }

  return { blob: new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }), mimeType, sizeBytes: bytes.byteLength };
}

/** Checksum réel (SHA-256, `crypto.subtle`) — jamais un pseudo-checksum
 * (longueur, hash non cryptographique...) — corr. R §26 (metadata D7). */
export async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Dimensions réelles d'une image (photo tissu compressée ou signature PNG)
 * — décodée depuis sa propre data URL, jamais devinées depuis sa taille en
 * octets. Rejette explicitement une image qui ne charge pas (corr. R §26).
 * Un délai de garde (800 ms — un décodage depuis une data URL déjà en
 * mémoire est normalement quasi instantané) évite un blocage indéfini si ni
 * `onload` ni `onerror` ne se déclenche jamais (observé en environnement de
 * test jsdom pour une data URL invalide — jamais rencontré sur un vrai
 * navigateur, mais une protection légitime dans les deux cas : ces
 * dimensions ne sont qu'une métadonnée secondaire, jamais bloquante pour
 * l'upload lui-même, voir l'appelant dans `SupabaseMediaRepository`). */
export function readImageDimensions(dataUrl: string, timeoutMs = 800): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      reject(new Error("readImageDimensions : délai dépassé, dimensions indisponibles."));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("readImageDimensions : image invalide, dimensions indisponibles."));
    };
    img.src = dataUrl;
  });
}
