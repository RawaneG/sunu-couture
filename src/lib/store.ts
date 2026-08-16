import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Client, Order, OrderStatus, VoiceNote, FicheMesure, FicheChampKey, FicheChamp, TissuPhoto } from "./types";
import { ORDER_STEPS, FICHE_MESURE_KEYS, FICHE_INFO_KEYS } from "./types";
import { nextDays, isOverdue } from "./format";
export { isOverdue };

function uid(prefix: string): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyFicheChamps(): Record<FicheChampKey, FicheChamp> {
  const champs = {} as Record<FicheChampKey, FicheChamp>;
  for (const key of [...FICHE_MESURE_KEYS, ...FICHE_INFO_KEYS]) {
    champs[key] = { valeur: "", historique: [] };
  }
  return champs;
}

function ficheChamps(values: Partial<Record<FicheChampKey, string>>): Record<FicheChampKey, FicheChamp> {
  const champs = emptyFicheChamps();
  for (const [key, valeur] of Object.entries(values)) {
    champs[key as FicheChampKey] = { valeur: valeur ?? "", historique: [] };
  }
  return champs;
}

const seedFiches: FicheMesure[] = [
  {
    id: "f1",
    numero: 1,
    nom: "Diouf",
    prenom: "Awa",
    telephone: "77 512 44 08",
    voiceNote: null,
    champs: {
      ...ficheChamps({ E: "44", Cou: "38", P: "96", T: "78", M: "58", H: "104", nbrePagnes: "6", prix: "25000", avance: "10000" }),
      T: { valeur: "78", historique: ["76"] },
    },
    tissuPhotos: [],
    retraitLe: null,
    soldeLe: null,
    signature: null,
    createdAt: nextDays(1, 0)[0],
  },
];

const seedClients: Client[] = [
  { id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" },
  { id: "c2", name: "Modou Fall", phone: "76 233 90 17", photo: null, colorSeed: "terracotta" },
  { id: "c3", name: "Fatou Ndiaye", phone: "70 845 21 63", photo: null, colorSeed: "teal" },
  { id: "c4", name: "Ibrahima Sarr", phone: "78 190 55 42", photo: null, colorSeed: "grey" },
  { id: "c5", name: "Khady Sow", phone: "77 402 68 91", photo: null, colorSeed: "amber" },
];

const days = nextDays(20, -4);

const rawOrders: Omit<Order, "late">[] = [
  { id: "o1", clientId: "c1", garment: "Boubou · wax bleu", fabricColor: "#2d3a6b", photo: null, voiceNote: null, measurementsText: null, dueDateStart: null, dueDate: days[8], price: 25000, status: "couture", createdAt: days[0] },
  { id: "o2", clientId: "c2", garment: "Costume · trois pièces", fabricColor: "#8c8398", photo: null, voiceNote: null, measurementsText: "Épaule 46, poitrine 102, longueur veste 78", dueDateStart: null, dueDate: days[2], price: 45000, status: "couture", createdAt: days[0] },
  { id: "o3", clientId: "c3", garment: "Robe · lin blanc", fabricColor: "#faf3e6", photo: null, voiceNote: null, measurementsText: null, dueDateStart: null, dueDate: days[10], price: 20000, status: "pret", createdAt: days[1] },
  { id: "o4", clientId: "c4", garment: "Ensemble · bazin gris", fabricColor: "#5b5468", photo: null, voiceNote: null, measurementsText: null, dueDateStart: null, dueDate: days[1], price: 30000, status: "recu", createdAt: days[0] },
  { id: "o5", clientId: "c5", garment: "Tenue de mariage", fabricColor: "#c98a2b", photo: null, voiceNote: null, measurementsText: null, dueDateStart: days[12], dueDate: days[14], price: 85000, status: "couture", createdAt: days[2] },
  { id: "o6", clientId: "c1", garment: "Chemise · wax orange", fabricColor: "#b8502e", photo: null, voiceNote: null, measurementsText: null, dueDateStart: null, dueDate: days[16], price: 12000, status: "recu", createdAt: days[3] },
];
const seedOrders: Order[] = rawOrders.map((o) => ({ ...o, late: isOverdue(o.dueDate, o.status) }));

interface NewOrderInput {
  clientId?: string;
  clientName?: string;
  garment: string;
  fabricColor: string;
  photo: string | null;
  voiceNote: VoiceNote | null;
  measurementsText: string | null;
  dueDate: string;
  dueDateStart: string | null;
  price: number;
}

interface NewClientInput {
  name: string;
  phone: string;
  photo: string | null;
}

interface StoreState {
  clients: Client[];
  orders: Order[];
  fiches: FicheMesure[];
  addOrder: (input: NewOrderInput) => string;
  addClient: (input: NewClientInput) => string;
  setOrderStatus: (id: string, status: OrderStatus) => void;
  advanceOrder: (id: string) => void;
  setClientNote: (id: string, note: VoiceNote | null) => void;
  setClientText: (id: string, text: string | null) => void;
  getClient: (id: string) => Client | undefined;
  ordersForClient: (id: string) => Order[];
  addFiche: () => string;
  setFicheInfo: (
    id: string,
    patch: Partial<Pick<FicheMesure, "nom" | "prenom" | "telephone" | "voiceNote" | "retraitLe" | "soldeLe" | "signature">>
  ) => void;
  setFicheChamp: (id: string, key: FicheChampKey, valeur: string) => void;
  strikeFicheChamp: (id: string, key: FicheChampKey) => void;
  restoreFicheChamp: (id: string, key: FicheChampKey) => void;
  addFicheTissuPhoto: (id: string, dataUrl: string) => void;
  removeFicheTissuPhoto: (id: string, photoId: string) => void;
  deleteFiche: (id: string) => void;
}

function colorSeedFor(seedString: string): string {
  const palette = ["indigo", "terracotta", "teal", "grey", "amber"];
  const sum = seedString.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      clients: seedClients,
      orders: seedOrders,
      fiches: seedFiches,
      addOrder: (input) => {
        const id = `o${Date.now()}`;
        let clients = get().clients;
        let clientId = input.clientId;

        if (!clientId) {
          const name = (input.clientName ?? "").trim();
          const existing = clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
          if (existing) {
            clientId = existing.id;
          } else {
            const newClient: Client = {
              id: `c${Date.now()}`,
              name: name || "Client sans nom",
              phone: "",
              photo: input.photo,
              colorSeed: colorSeedFor(name || id),
            };
            clients = [newClient, ...clients];
            clientId = newClient.id;
          }
        }

        const order: Order = {
          id,
          clientId,
          garment: input.garment || "Commande",
          fabricColor: input.fabricColor,
          photo: input.photo,
          voiceNote: input.voiceNote,
          measurementsText: input.measurementsText,
          dueDate: input.dueDate,
          dueDateStart: input.dueDateStart,
          price: input.price,
          status: "recu",
          late: false,
          createdAt: new Date().toISOString(),
        };
        set({ clients, orders: [order, ...get().orders] });
        return id;
      },
      addClient: (input) => {
        const id = `c${Date.now()}`;
        const client: Client = {
          id,
          name: input.name.trim() || "Client sans nom",
          phone: input.phone.trim(),
          photo: input.photo,
          colorSeed: colorSeedFor(input.name || id),
        };
        set({ clients: [client, ...get().clients] });
        return id;
      },
      setOrderStatus: (id, status) =>
        set({
          orders: get().orders.map((o) =>
            o.id === id ? { ...o, status, late: isOverdue(o.dueDate, status) } : o
          ),
        }),
      advanceOrder: (id) => {
        const order = get().orders.find((o) => o.id === id);
        if (!order) return;
        const idx = ORDER_STEPS.indexOf(order.status);
        const next = ORDER_STEPS[Math.min(idx + 1, ORDER_STEPS.length - 1)];
        get().setOrderStatus(id, next);
      },
      setClientNote: (id, note) =>
        set({ clients: get().clients.map((c) => (c.id === id ? { ...c, measurementsNote: note } : c)) }),
      setClientText: (id, text) =>
        set({ clients: get().clients.map((c) => (c.id === id ? { ...c, measurementsText: text } : c)) }),
      getClient: (id) => get().clients.find((c) => c.id === id),
      ordersForClient: (id) => get().orders.filter((o) => o.clientId === id),
      addFiche: () => {
        const id = `f${Date.now()}`;
        const numero = get().fiches.reduce((max, f) => Math.max(max, f.numero), 0) + 1;
        const fiche: FicheMesure = {
          id,
          numero,
          nom: "",
          prenom: "",
          telephone: "",
          voiceNote: null,
          champs: emptyFicheChamps(),
          tissuPhotos: [],
          retraitLe: null,
          soldeLe: null,
          signature: null,
          createdAt: new Date().toISOString(),
        };
        set({ fiches: [fiche, ...get().fiches] });
        return id;
      },
      setFicheInfo: (id, patch) =>
        set({ fiches: get().fiches.map((f) => (f.id === id ? { ...f, ...patch } : f)) }),
      setFicheChamp: (id, key, valeur) =>
        set({
          fiches: get().fiches.map((f) => {
            if (f.id !== id) return f;
            const current = f.champs[key];
            if (current.valeur === valeur) return f;
            const historique = current.valeur.trim() ? [...current.historique, current.valeur] : current.historique;
            return { ...f, champs: { ...f.champs, [key]: { valeur, historique } } };
          }),
        }),
      strikeFicheChamp: (id, key) =>
        set({
          fiches: get().fiches.map((f) => {
            if (f.id !== id) return f;
            const current = f.champs[key];
            if (!current.valeur.trim()) return f;
            return { ...f, champs: { ...f.champs, [key]: { valeur: "", historique: [...current.historique, current.valeur] } } };
          }),
        }),
      restoreFicheChamp: (id, key) =>
        set({
          fiches: get().fiches.map((f) => {
            if (f.id !== id) return f;
            const current = f.champs[key];
            const last = current.historique[current.historique.length - 1];
            if (last === undefined) return f;
            return {
              ...f,
              champs: { ...f.champs, [key]: { valeur: last, historique: current.historique.slice(0, -1) } },
            };
          }),
        }),
      addFicheTissuPhoto: (id, dataUrl) =>
        set({
          fiches: get().fiches.map((f) =>
            f.id === id ? { ...f, tissuPhotos: [...(f.tissuPhotos ?? []), { id: uid("tp"), dataUrl }] } : f
          ),
        }),
      removeFicheTissuPhoto: (id, photoId) =>
        set({
          fiches: get().fiches.map((f) =>
            f.id === id ? { ...f, tissuPhotos: (f.tissuPhotos ?? []).filter((p) => p.id !== photoId) } : f
          ),
        }),
      deleteFiche: (id) => set({ fiches: get().fiches.filter((f) => f.id !== id) }),
    }),
    {
      name: "sunu-couture",
      version: 8,
      migrate: (persisted) => {
        const state = persisted as StoreState;
        const legacyToNew: Record<string, OrderStatus> = {
          recu: "recu",
          coupe: "couture",
          couture: "couture",
          essayage: "couture",
          pret: "pret",
          livre: "livre",
        };
        return {
          ...state,
          orders: (state.orders ?? []).map((o) => ({
            ...o,
            photo: null,
            voiceNote: null,
            status: legacyToNew[o.status] ?? "recu",
            measurementsText: o.measurementsText ?? null,
            dueDateStart: o.dueDateStart ?? null,
          })),
          clients: (state.clients ?? []).map((c) => ({
            ...c,
            photo: null,
            measurementsNote: null,
            measurementsText: c.measurementsText ?? null,
          })),
          fiches: (state.fiches ?? []).map((f) => ({
            ...f,
            telephone: f.telephone ?? "",
            voiceNote: f.voiceNote ?? null,
            tissuPhotos: ((f.tissuPhotos ?? []) as (string | TissuPhoto)[]).map((p) =>
              typeof p === "string" ? { id: uid("tp"), dataUrl: p } : p
            ),
          })),
        };
      },
      partialize: (state) => ({
        clients: state.clients.map((c) => ({ ...c, photo: null, measurementsNote: null })),
        orders: state.orders.map((o) => ({ ...o, photo: null, voiceNote: null })),
        fiches: state.fiches,
      }),
    }
  )
);
