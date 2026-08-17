export type OrderStatus = "recu" | "couture" | "pret" | "livre";

export const ORDER_STEPS: OrderStatus[] = ["recu", "couture", "pret", "livre"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  recu: "Reçue",
  couture: "En couture",
  pret: "Prête",
  livre: "Livrée",
};

export const STATUS_DESCRIPTION: Record<OrderStatus, string> = {
  recu: "Enregistrée, la couture n'a pas commencé.",
  couture: "Le tailleur travaille dessus en ce moment.",
  pret: "Terminée, prête à être récupérée.",
  livre: "Remise au client.",
};

export const STATUS_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  couture: "Démarrer la couture",
  pret: "Marquer comme prête",
  livre: "Marquer comme livrée",
};

export interface VoiceNote {
  url: string;
  duration: number;
  recordedAt: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  photo: string | null;
  colorSeed: string;
}

// Carnet de mesures — a faithful digital replica of the paper "fiche de mesure"
// booklet tailors already use, for tailors who can't read. Order and labels
// match the physical sheet exactly. A fiche is the single record of one job:
// client, measurements, garment, photos, voice note, pickup, and payment.
export const FICHE_MESURE_KEYS = [
  "E", "Cou", "P", "T", "M", "C", "H", "F", "G", "TM", "LR", "LP", "LJ",
] as const;
export type FicheMesureKey = (typeof FICHE_MESURE_KEYS)[number];

export const FICHE_MESURE_LABELS: Record<FicheMesureKey, string> = {
  E: "E", Cou: "Cou", P: "P", T: "T", M: "M", C: "C", H: "H", F: "F", G: "G",
  TM: "T.M", LR: "L.R", LP: "L.P", LJ: "L.J",
};

// prix/avance/reste used to live here as free-text champs the tailor had to
// recompute by hand — prix/avance are now plain numbers on Fiche and reste is
// always derived via resteFor(), never typed in or recalculated by hand.
export const FICHE_INFO_KEYS = ["nbrePagnes", "tissusDeposes"] as const;
export type FicheInfoKey = (typeof FICHE_INFO_KEYS)[number];

export const FICHE_INFO_LABELS: Record<FicheInfoKey, string> = {
  nbrePagnes: "Nbre de pagnes",
  tissusDeposes: "Tissus déposés",
};

export type FicheChampKey = FicheMesureKey | FicheInfoKey;

export interface FicheChamp {
  valeur: string;
  /** Previous values the tailor crossed out, oldest → newest, kept visible like on paper. */
  historique: string[];
}

export interface TissuPhoto {
  id: string;
  dataUrl: string;
}

export interface Fiche {
  id: string;
  carnetNumero: number; // which physical carnet (1, 2, 3…) this fiche belongs to
  numero: number; // 1..120 within its carnet — stable forever, never reassigned

  // Written exactly as on paper — free text, always present, never blocked on
  // picking a client. clientId is a separate, optional link layered on top (see
  // below) so old customers can be found again without changing what this row is.
  nom: string;
  prenom: string;
  telephone: string;
  clientId: string | null;

  champs: Record<FicheChampKey, FicheChamp>;
  voiceNote: VoiceNote | null;
  tissuPhotos: TissuPhoto[];

  dueDate: string | null; // never pre-filled — blank until the tailor sets it, like on paper
  soldeLe: string | null;
  signature: string | null;

  price: number;
  avance: number; // one line, like on paper — reste is always price − avance, never edited directly

  // Compléments — not on the paper sheet, kept visually and structurally separate
  // from the fields above so the fiche still reads like the booklet the tailor knows.
  garment: string;
  description: string | null;
  fabricColor: string;
  status: OrderStatus;
  late: boolean;

  cancelledAt: string | null;
  createdAt: string;
}
