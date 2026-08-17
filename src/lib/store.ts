import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Client, Fiche, OrderStatus, VoiceNote, FicheChampKey, FicheChamp, TissuPhoto } from "./types";
import { ORDER_STEPS, FICHE_MESURE_KEYS, FICHE_INFO_KEYS } from "./types";
import { nextDays, isOverdue } from "./format";
import { normalize } from "./search";
import { FICHES_PAR_CARNET } from "./entitlements";
export { isOverdue };

function uid(prefix: string): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** Reste à payer = prix total − avance. Jamais stocké, toujours recalculé. */
export function resteFor(fiche: Pick<Fiche, "price" | "avance">): number {
  return fiche.price - fiche.avance;
}

function emptyFicheChamps(): Record<FicheChampKey, FicheChamp> {
  const champs = {} as Record<FicheChampKey, FicheChamp>;
  for (const key of [...FICHE_MESURE_KEYS, ...FICHE_INFO_KEYS]) {
    champs[key] = { valeur: "", historique: [] };
  }
  return champs;
}

export function nextFicheSlot(fiches: Fiche[]): { carnetNumero: number; numero: number } {
  const activeCarnet = fiches.reduce((max, f) => Math.max(max, f.carnetNumero), 0) || 1;
  const maxInCarnet = fiches
    .filter((f) => f.carnetNumero === activeCarnet)
    .reduce((max, f) => Math.max(max, f.numero), 0);
  if (maxInCarnet >= FICHES_PAR_CARNET) {
    return { carnetNumero: activeCarnet + 1, numero: 1 };
  }
  return { carnetNumero: activeCarnet, numero: maxInCarnet + 1 };
}

const seedClients: Client[] = [
  { id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" },
  { id: "c2", name: "Modou Fall", phone: "76 233 90 17", photo: null, colorSeed: "terracotta" },
  { id: "c3", name: "Fatou Ndiaye", phone: "70 845 21 63", photo: null, colorSeed: "teal" },
  { id: "c4", name: "Ibrahima Sarr", phone: "78 190 55 42", photo: null, colorSeed: "grey" },
  { id: "c5", name: "Khady Sow", phone: "77 402 68 91", photo: null, colorSeed: "amber" },
];

const days = nextDays(20, -4);

function seedChamps(values: Partial<Record<FicheChampKey, string>>): Record<FicheChampKey, FicheChamp> {
  const champs = emptyFicheChamps();
  for (const [key, valeur] of Object.entries(values)) {
    champs[key as FicheChampKey] = { valeur: valeur ?? "", historique: [] };
  }
  return champs;
}

const seedFiches: Fiche[] = [
  {
    id: "f1",
    carnetNumero: 1,
    numero: 1,
    nom: "Diouf",
    prenom: "Awa",
    telephone: "77 512 44 08",
    clientId: "c1",
    champs: { ...seedChamps({ E: "44", Cou: "38", P: "96", T: "78", M: "58", H: "104", nbrePagnes: "6" }), T: { valeur: "78", historique: ["76"] } },
    voiceNote: null,
    tissuPhotos: [],
    dueDate: days[8],
    soldeLe: null,
    signature: null,
    price: 25000,
    avance: 10000,
    garment: "Boubou · wax bleu",
    description: null,
    fabricColor: "#2d3a6b",
    status: "couture",
    late: false,
    cancelledAt: null,
    createdAt: days[0],
  },
  {
    id: "f2",
    carnetNumero: 1,
    numero: 2,
    nom: "Fall",
    prenom: "Modou",
    telephone: "76 233 90 17",
    clientId: "c2",
    champs: emptyFicheChamps(),
    voiceNote: null,
    tissuPhotos: [],
    dueDate: days[2],
    soldeLe: null,
    signature: null,
    price: 45000,
    avance: 0,
    garment: "Costume · trois pièces",
    description: "Épaule 46, poitrine 102, longueur veste 78",
    fabricColor: "#8c8398",
    status: "couture",
    late: isOverdue(days[2], "couture"),
    cancelledAt: null,
    createdAt: days[0],
  },
  {
    id: "f3",
    carnetNumero: 1,
    numero: 3,
    nom: "Ndiaye",
    prenom: "Fatou",
    telephone: "70 845 21 63",
    clientId: "c3",
    champs: emptyFicheChamps(),
    voiceNote: null,
    tissuPhotos: [],
    dueDate: days[10],
    soldeLe: days[1],
    signature: null,
    price: 20000,
    avance: 20000,
    garment: "Robe · lin blanc",
    description: null,
    fabricColor: "#faf3e6",
    status: "pret",
    late: false,
    cancelledAt: null,
    createdAt: days[1],
  },
  {
    id: "f4",
    carnetNumero: 1,
    numero: 4,
    nom: "Sarr",
    prenom: "Ibrahima",
    telephone: "78 190 55 42",
    clientId: "c4",
    champs: emptyFicheChamps(),
    voiceNote: null,
    tissuPhotos: [],
    dueDate: days[1],
    soldeLe: null,
    signature: null,
    price: 30000,
    avance: 0,
    garment: "Ensemble · bazin gris",
    description: null,
    fabricColor: "#5b5468",
    status: "recu",
    late: isOverdue(days[1], "recu"),
    cancelledAt: null,
    createdAt: days[0],
  },
  {
    id: "f5",
    carnetNumero: 1,
    numero: 5,
    nom: "Sow",
    prenom: "Khady",
    telephone: "77 402 68 91",
    clientId: "c5",
    champs: emptyFicheChamps(),
    voiceNote: null,
    tissuPhotos: [],
    dueDate: days[14],
    soldeLe: null,
    signature: null,
    price: 85000,
    avance: 40000,
    garment: "Tenue de mariage",
    description: null,
    fabricColor: "#c98a2b",
    status: "couture",
    late: false,
    cancelledAt: null,
    createdAt: days[2],
  },
  {
    id: "f6",
    carnetNumero: 1,
    numero: 6,
    nom: "Diouf",
    prenom: "Awa",
    telephone: "77 512 44 08",
    clientId: "c1",
    champs: emptyFicheChamps(),
    voiceNote: null,
    tissuPhotos: [],
    dueDate: days[16],
    soldeLe: null,
    signature: null,
    price: 12000,
    avance: 0,
    garment: "Chemise · wax orange",
    description: null,
    fabricColor: "#b8502e",
    status: "recu",
    late: false,
    cancelledAt: null,
    createdAt: days[3],
  },
];

interface NewFicheInput {
  clientId?: string | null;
  nom?: string;
  prenom?: string;
  telephone?: string;
  prefillChamps?: Partial<Record<FicheChampKey, string>>;
}

interface NewClientInput {
  name: string;
  phone: string;
  photo: string | null;
}

type FicheInfoPatch = Partial<
  Pick<Fiche, "nom" | "prenom" | "telephone" | "clientId" | "garment" | "description" | "fabricColor" | "voiceNote" | "dueDate" | "price" | "avance" | "signature" | "soldeLe">
>;

interface StoreState {
  clients: Client[];
  fiches: Fiche[];
  addClient: (input: NewClientInput) => string;
  getClient: (id: string) => Client | undefined;
  fichesForClient: (id: string) => Fiche[];
  addFiche: (input?: NewFicheInput) => string;
  setFicheInfo: (id: string, patch: FicheInfoPatch) => void;
  setFicheChamp: (id: string, key: FicheChampKey, valeur: string) => void;
  strikeFicheChamp: (id: string, key: FicheChampKey) => void;
  restoreFicheChamp: (id: string, key: FicheChampKey) => void;
  addFicheTissuPhoto: (id: string, dataUrl: string) => void;
  removeFicheTissuPhoto: (id: string, photoId: string) => void;
  setFicheStatus: (id: string, status: OrderStatus) => void;
  advanceFiche: (id: string) => void;
  cancelFiche: (id: string) => void;
  restoreFiche: (id: string) => void;
}

function colorSeedFor(seedString: string): string {
  const palette = ["indigo", "terracotta", "teal", "grey", "amber"];
  const sum = seedString.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

/** Upgrades a v8-or-earlier persisted store (separate clients/orders/fiches) to the unified v9 Fiche model. Exported standalone so the migration's business rules can be tested without going through the persist middleware. */
export function migrateLegacyState(persisted: unknown): { clients: Client[]; fiches: Fiche[] } {
  const state = (persisted ?? {}) as {
    clients?: (Client & { measurementsNote?: VoiceNote | null; measurementsText?: string | null })[];
    orders?: {
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
      status: string;
      createdAt: string;
    }[];
    fiches?: {
      id: string;
      numero: number;
      nom?: string;
      prenom?: string;
      telephone?: string;
      voiceNote?: VoiceNote | null;
      champs?: Record<string, FicheChamp>;
      tissuPhotos?: TissuPhoto[];
      retraitLe?: string | null;
      soldeLe?: string | null;
      signature?: string | null;
      createdAt: string;
    }[];
  };

  const legacyToNewStatus: Record<string, OrderStatus> = {
    recu: "recu", coupe: "couture", couture: "couture", essayage: "couture", pret: "pret", livre: "livre",
  };

  const clients = (state.clients ?? []).map((c) => ({
    id: c.id, name: c.name, phone: c.phone, photo: null, colorSeed: c.colorSeed,
  }));
  const legacyClientNotes = new Map(
    (state.clients ?? [])
      .filter((c) => c.measurementsNote || c.measurementsText)
      .map((c) => [c.id, { note: c.measurementsNote ?? null, text: c.measurementsText ?? null }])
  );

  function findClientId(nom: string, prenom: string, telephone: string): string | null {
    const phoneDigits = normalizePhone(telephone);
    const nameKey = normalize(`${prenom} ${nom}`);
    const existing =
      (phoneDigits ? clients.find((c) => normalizePhone(c.phone) === phoneDigits) : undefined) ??
      (nameKey.trim() ? clients.find((c) => normalize(c.name) === nameKey) : undefined);
    return existing?.id ?? null;
  }

  const fiches: Fiche[] = [];

  // Legacy fiches already carry their own nom/prenom/telephone written by the
  // tailor — kept verbatim, exactly like the paper. clientId is only a bonus
  // link when a matching registered client can be found, never a requirement.
  for (const f of state.fiches ?? []) {
    // A fiche already shaped like the current model (has carnetNumero) only needs
    // normalizing — re-deriving it from champs.prix/champs.avance below would wipe
    // out its real price/avance/dueDate, since those aren't champs anymore.
    const maybeUnified = f as unknown as Partial<Fiche> & { payments?: { montant: number }[] };
    if (typeof maybeUnified.carnetNumero === "number") {
      const champs = emptyFicheChamps();
      for (const key of [...FICHE_MESURE_KEYS, ...FICHE_INFO_KEYS]) {
        if (maybeUnified.champs?.[key]) champs[key] = maybeUnified.champs[key];
      }
      const dueDate = typeof maybeUnified.dueDate === "string" ? maybeUnified.dueDate : null;
      const status = maybeUnified.status ?? "recu";
      fiches.push({
        id: maybeUnified.id!,
        carnetNumero: maybeUnified.carnetNumero,
        numero: maybeUnified.numero!,
        nom: maybeUnified.nom ?? "",
        prenom: maybeUnified.prenom ?? "",
        telephone: maybeUnified.telephone ?? "",
        clientId: maybeUnified.clientId ?? null,
        champs,
        voiceNote: maybeUnified.voiceNote ?? null,
        tissuPhotos: maybeUnified.tissuPhotos ?? [],
        dueDate,
        soldeLe: maybeUnified.soldeLe ?? null,
        signature: maybeUnified.signature ?? null,
        price: typeof maybeUnified.price === "number" ? maybeUnified.price : 0,
        avance:
          typeof maybeUnified.avance === "number"
            ? maybeUnified.avance
            : (maybeUnified.payments ?? []).reduce((sum, p) => sum + (p.montant || 0), 0),
        garment: maybeUnified.garment ?? "",
        description: maybeUnified.description ?? null,
        fabricColor: maybeUnified.fabricColor ?? "#2d3a6b",
        status,
        late: isOverdue(dueDate, status),
        cancelledAt: maybeUnified.cancelledAt ?? null,
        createdAt: maybeUnified.createdAt!,
      });
      continue;
    }

    const legacyChamps = (f.champs ?? {}) as Record<string, FicheChamp>;
    const champs = emptyFicheChamps();
    for (const key of [...FICHE_MESURE_KEYS, ...FICHE_INFO_KEYS]) {
      if (legacyChamps[key]) champs[key] = legacyChamps[key];
    }
    const prix = parseInt((legacyChamps.prix?.valeur ?? "").replace(/\D/g, ""), 10) || 0;
    const avance = parseInt((legacyChamps.avance?.valeur ?? "").replace(/\D/g, ""), 10) || 0;
    const nom = f.nom ?? "";
    const prenom = f.prenom ?? "";
    const telephone = f.telephone ?? "";
    const dueDate = f.retraitLe ?? null;
    fiches.push({
      id: f.id,
      carnetNumero: 1,
      numero: f.numero,
      nom,
      prenom,
      telephone,
      clientId: findClientId(nom, prenom, telephone),
      champs,
      voiceNote: f.voiceNote ?? null,
      tissuPhotos: f.tissuPhotos ?? [],
      dueDate,
      soldeLe: f.soldeLe ?? null,
      signature: f.signature ?? null,
      price: prix,
      avance,
      garment: "",
      description: null,
      fabricColor: "#2d3a6b",
      status: "recu",
      late: isOverdue(dueDate, "recu"),
      cancelledAt: null,
      createdAt: f.createdAt,
    });
  }

  // Legacy orders had no nom/prenom/telephone of their own — always linked
  // through a client — so the paper-style identity fields are filled from that
  // client's record instead of being left blank.
  for (const o of state.orders ?? []) {
    const slot = nextFicheSlot(fiches);
    const status = legacyToNewStatus[o.status] ?? "recu";
    const client = clients.find((c) => c.id === o.clientId);
    fiches.push({
      id: o.id,
      carnetNumero: slot.carnetNumero,
      numero: slot.numero,
      nom: client?.name ?? "",
      prenom: "",
      telephone: client?.phone ?? "",
      clientId: o.clientId,
      champs: emptyFicheChamps(),
      voiceNote: null,
      tissuPhotos: [],
      dueDate: o.dueDate,
      soldeLe: null,
      signature: null,
      price: o.price ?? 0,
      avance: 0,
      garment: o.garment,
      description: o.measurementsText ?? null,
      fabricColor: o.fabricColor || "#2d3a6b",
      status,
      late: isOverdue(o.dueDate, status),
      cancelledAt: null,
      createdAt: o.createdAt,
    });
  }

  // Fold any leftover client-level mesures/vocal into that client's most recent
  // fiche, if it doesn't already have its own — nothing is silently discarded.
  for (const [clientId, legacy] of legacyClientNotes) {
    const clientFiches = fiches.filter((f) => f.clientId === clientId).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    const target = clientFiches[0];
    if (!target) continue;
    if (legacy.note && !target.voiceNote) target.voiceNote = legacy.note;
    if (legacy.text && !target.description) target.description = legacy.text;
  }

  return { clients, fiches };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      clients: seedClients,
      fiches: seedFiches,

      addClient: (input) => {
        const id = uid("c");
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

      getClient: (id) => get().clients.find((c) => c.id === id),
      fichesForClient: (id) => get().fiches.filter((f) => f.clientId === id),

      addFiche: (input) => {
        const id = uid("f");
        const fiches = get().fiches;
        const { carnetNumero, numero } = nextFicheSlot(fiches);
        const champs = emptyFicheChamps();
        if (input?.prefillChamps) {
          for (const [key, valeur] of Object.entries(input.prefillChamps)) {
            champs[key as FicheChampKey] = { valeur: valeur ?? "", historique: [] };
          }
        }
        const fiche: Fiche = {
          id,
          carnetNumero,
          numero,
          nom: input?.nom ?? "",
          prenom: input?.prenom ?? "",
          telephone: input?.telephone ?? "",
          clientId: input?.clientId ?? null,
          champs,
          voiceNote: null,
          tissuPhotos: [],
          dueDate: null,
          soldeLe: null,
          signature: null,
          price: 0,
          avance: 0,
          garment: "",
          description: null,
          fabricColor: "#2d3a6b",
          status: "recu",
          late: false,
          cancelledAt: null,
          createdAt: new Date().toISOString(),
        };
        set({ fiches: [fiche, ...fiches] });
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
            f.id === id ? { ...f, tissuPhotos: [...f.tissuPhotos, { id: uid("tp"), dataUrl }] } : f
          ),
        }),
      removeFicheTissuPhoto: (id, photoId) =>
        set({
          fiches: get().fiches.map((f) =>
            f.id === id ? { ...f, tissuPhotos: f.tissuPhotos.filter((p) => p.id !== photoId) } : f
          ),
        }),

      setFicheStatus: (id, status) =>
        set({
          fiches: get().fiches.map((f) => (f.id === id ? { ...f, status, late: isOverdue(f.dueDate, status) } : f)),
        }),
      advanceFiche: (id) => {
        const fiche = get().fiches.find((f) => f.id === id);
        if (!fiche) return;
        const idx = ORDER_STEPS.indexOf(fiche.status);
        const next = ORDER_STEPS[Math.min(idx + 1, ORDER_STEPS.length - 1)];
        get().setFicheStatus(id, next);
      },

      cancelFiche: (id) =>
        set({ fiches: get().fiches.map((f) => (f.id === id ? { ...f, cancelledAt: new Date().toISOString() } : f)) }),
      restoreFiche: (id) =>
        set({ fiches: get().fiches.map((f) => (f.id === id ? { ...f, cancelledAt: null } : f)) }),
    }),
    {
      name: "sunu-couture",
      // Bump whenever the persisted Fiche shape changes, even mid-development —
      // otherwise browsers with an already-matching version number skip migrate
      // entirely and keep loading stale fields (e.g. avance undefined → NaN reste).
      version: 10,
      migrate: migrateLegacyState,
      partialize: (state) => ({
        clients: state.clients.map((c) => ({ ...c, photo: null })),
        fiches: state.fiches,
      }),
    }
  )
);
