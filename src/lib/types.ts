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
