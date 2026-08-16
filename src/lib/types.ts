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
  measurementsNote?: VoiceNote | null;
  measurementsText?: string | null;
}

export interface Order {
  id: string;
  clientId: string;
  garment: string;
  fabricColor: string;
  photo: string | null;
  voiceNote: VoiceNote | null;
  measurementsText: string | null;
  dueDate: string;
  dueDateStart: string | null;
  price: number;
  status: OrderStatus;
  late: boolean;
  createdAt: string;
}

// Carnet de mesures — a faithful digital replica of the paper "fiche de mesure"
// booklet tailors already use, for tailors who can't read. Order and labels
// match the physical sheet exactly; nothing here is linked to Client/Order.
export const FICHE_MESURE_KEYS = [
  "E", "Cou", "P", "T", "M", "C", "H", "F", "G", "TM", "LR", "LP", "LJ",
] as const;
export type FicheMesureKey = (typeof FICHE_MESURE_KEYS)[number];

export const FICHE_MESURE_LABELS: Record<FicheMesureKey, string> = {
  E: "E", Cou: "Cou", P: "P", T: "T", M: "M", C: "C", H: "H", F: "F", G: "G",
  TM: "T.M", LR: "L.R", LP: "L.P", LJ: "L.J",
};

export const FICHE_INFO_KEYS = ["nbrePagnes", "tissusDeposes", "prix", "avance", "reste"] as const;
export type FicheInfoKey = (typeof FICHE_INFO_KEYS)[number];

export const FICHE_INFO_LABELS: Record<FicheInfoKey, string> = {
  nbrePagnes: "Nbre de pagnes",
  tissusDeposes: "Tissus déposés",
  prix: "Prix",
  avance: "Avance",
  reste: "Reste",
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

export interface FicheMesure {
  id: string;
  numero: number;
  nom: string;
  prenom: string;
  champs: Record<FicheChampKey, FicheChamp>;
  tissuPhotos: TissuPhoto[];
  retraitLe: string | null;
  soldeLe: string | null;
  signature: string | null;
  createdAt: string;
}
