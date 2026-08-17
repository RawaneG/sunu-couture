// Business/pricing rules kept out of the carnet components on purpose, so a
// future formule (carnet payant, illimité, atelier) can change these without
// touching CarnetList/FicheDetail/store.ts.

export const FICHES_PAR_CARNET = 120;

/** During the pilot, nothing is gated — this is the single hook a future paywall would flip. */
export function peutCreerNouveauCarnet(_carnetsExistants: number): boolean {
  return true;
}
