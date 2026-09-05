// Choix du format d'enregistrement RÉELLEMENT supporté par le navigateur
// (Phase 8A, corr. R §25) — avant cette phase, `VoiceRecorder` forçait
// `audio/webm` sur le Blob final quel que soit le format effectivement
// produit par `MediaRecorder`, ce qui pouvait mentir sur le MIME réel
// (notamment Safari/iOS, qui ne supporte pas `audio/webm`). Ordre de
// préférence : conteneurs largement lisibles côté web en premier, avec un
// codec explicite quand `isTypeSupported` le distingue.
const PREFERRED_AUDIO_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];

/** `undefined` signifie « laisser `MediaRecorder` choisir son défaut » — un
 * navigateur sans aucun des types testés peut très bien en supporter un
 * autre non listé ici ; ce n'est pas une erreur, `MediaRecorder` fonctionne
 * quand même. Le MIME réellement utilisé est ensuite lu sur `recorder.
 * mimeType` (jamais supposé) — voir `VoiceRecorder.tsx`. */
export function pickSupportedAudioMimeType(
  isTypeSupported: (type: string) => boolean = (type) => MediaRecorder.isTypeSupported(type),
): string | undefined {
  return PREFERRED_AUDIO_MIME_TYPES.find((type) => {
    try {
      return isTypeSupported(type);
    } catch {
      return false;
    }
  });
}
