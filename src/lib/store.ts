import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Client, Fiche, OrderStatus, VoiceNote, FicheChampKey, FicheChamp, TissuPhoto, Modele } from "./types";
import { ORDER_STEPS, FICHE_MESURE_KEYS, FICHE_INFO_KEYS } from "./types";
import { isOverdue } from "./format";
import { normalize } from "./search";
import { FICHES_PAR_CARNET } from "./entitlements";
export { isOverdue };

function uid(prefix: string): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Clé `localStorage` du store persisté — seule source de vérité pour tout
 * code qui doit lire le stockage brut en dehors du store lui-même (Phase 6A,
 * `legacyBackup.ts`). Ne JAMAIS dupliquer cette chaîne ailleurs. */
export const LEGACY_STORAGE_KEY = "sunu-couture";

/** Marque un id de modèle synthétisé par `migrateLegacyState()` faute d'id
 * legacy exploitable — jamais confondu avec un vrai id (`uid("m")` produit
 * toujours `m<horodatage>-<aléatoire>`, jamais ce préfixe). Utilisé par
 * `legacyPreview.ts` pour signaler l'anomalie plutôt que la masquer. */
export const LEGACY_SYNTHETIC_MODELE_ID_PREFIX = "legacy-modele-sans-id-";

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

// Exportées pour la Phase 6A (`legacyClassification.ts`) : une donnée n'est
// « démo » que si elle est identique, id ET champs, à l'un de ces enregistrements
// — jamais une heuristique approximative (§5.1.3, docs/refonte/02-PLAN-MIGRATION.md).
export const seedClients: Client[] = [
  { id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" },
  { id: "c2", name: "Modou Fall", phone: "76 233 90 17", photo: null, colorSeed: "terracotta" },
  { id: "c3", name: "Fatou Ndiaye", phone: "70 845 21 63", photo: null, colorSeed: "teal" },
  { id: "c4", name: "Ibrahima Sarr", phone: "78 190 55 42", photo: null, colorSeed: "grey" },
  { id: "c5", name: "Khady Sow", phone: "77 402 68 91", photo: null, colorSeed: "amber" },
];

function seedChamps(values: Partial<Record<FicheChampKey, string>>): Record<FicheChampKey, FicheChamp> {
  const champs = emptyFicheChamps();
  for (const [key, valeur] of Object.entries(values)) {
    champs[key as FicheChampKey] = { valeur: valeur ?? "", historique: [] };
  }
  return champs;
}

/** Comme `isOverdue()` (format.ts), mais paramétrée par l'instant de référence
 * au lieu de lire `Date.now()` — `buildSeedFiches()` doit être une fonction
 * PURE de `referenceDate` (Phase 6A, correction blocker « seed datée ») :
 * appelée deux fois avec la même date, elle doit produire EXACTEMENT le même
 * résultat, peu importe le jour réel où elle tourne. `isOverdue()` elle-même
 * reste inchangée et continue d'utiliser l'horloge réelle partout ailleurs
 * dans l'app (c'est le comportement voulu en dehors de la génération de seed). */
function isOverdueAt(iso: string | null, status: string, referenceInstant: Date): boolean {
  if (!iso || status === "livre") return false;
  const due = new Date(iso);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < referenceInstant.getTime();
}

/** Décalage (en jours, signé) entre le jour de référence (« aujourd'hui » au
 * moment où la seed est construite) et chaque champ daté de chaque fiche seed —
 * les mêmes valeurs que l'ancien tableau `nextDays(20, -4)` codait implicitement
 * dans ses index. Seule source de vérité pour reconstruire une seed passée
 * (`legacyClassification.ts`) : si le contenu des fiches seed change un jour,
 * mettre à jour ces décalages en même temps que `buildSeedFiches()` ci-dessous. */
export const SEED_FICHE_DAY_OFFSETS = {
  f1: { createdAt: -4, dueDate: 4 },
  f2: { createdAt: -4, dueDate: -2 },
  f3: { createdAt: -3, dueDate: 6, soldeLe: -3 },
  f4: { createdAt: -4, dueDate: -3 },
  f5: { createdAt: -2, dueDate: 10 },
  f6: { createdAt: -1, dueDate: 12 },
} as const satisfies Record<string, { createdAt: number; dueDate: number; soldeLe?: number }>;

/**
 * Construit le catalogue de fiches de démonstration, entièrement déterminé par
 * `referenceDate` (normalisée à minuit local, comme `nextDays()`) — aucune
 * lecture de l'horloge réelle à l'intérieur. Appelée avec `new Date()` à
 * l'initialisation du store (comportement historique inchangé) ET, à l'identique,
 * par `legacyClassification.ts` avec la date reconstruite d'une fiche legacy
 * pour vérifier si elle correspond exactement à SA seed d'origine — jamais à
 * une seed régénérée à la date du jour (Phase 6A, correction blocker).
 */
export function buildSeedFiches(referenceDate: Date): Fiche[] {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  const at = (offsetDays: number): string => {
    const d = new Date(start);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString();
  };
  const o = SEED_FICHE_DAY_OFFSETS;

  return [
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
      dueDate: at(o.f1.dueDate),
      soldeLe: null,
      signature: null,
      price: 25000,
      avance: 10000,
      garment: "Boubou · wax bleu",
      description: null,
      fabricColor: "#2d3a6b",
      status: "couture",
      late: isOverdueAt(at(o.f1.dueDate), "couture", start),
      createdAt: at(o.f1.createdAt),
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
      dueDate: at(o.f2.dueDate),
      soldeLe: null,
      signature: null,
      price: 45000,
      avance: 0,
      garment: "Costume · trois pièces",
      description: "Épaule 46, poitrine 102, longueur veste 78",
      fabricColor: "#8c8398",
      status: "couture",
      late: isOverdueAt(at(o.f2.dueDate), "couture", start),
      createdAt: at(o.f2.createdAt),
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
      dueDate: at(o.f3.dueDate),
      soldeLe: at(o.f3.soldeLe),
      signature: null,
      price: 20000,
      avance: 20000,
      garment: "Robe · lin blanc",
      description: null,
      fabricColor: "#faf3e6",
      status: "pret",
      late: isOverdueAt(at(o.f3.dueDate), "pret", start),
      createdAt: at(o.f3.createdAt),
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
      dueDate: at(o.f4.dueDate),
      soldeLe: null,
      signature: null,
      price: 30000,
      avance: 0,
      garment: "Ensemble · bazin gris",
      description: null,
      fabricColor: "#5b5468",
      status: "recu",
      late: isOverdueAt(at(o.f4.dueDate), "recu", start),
      createdAt: at(o.f4.createdAt),
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
      dueDate: at(o.f5.dueDate),
      soldeLe: null,
      signature: null,
      price: 85000,
      avance: 40000,
      garment: "Tenue de mariage",
      description: null,
      fabricColor: "#c98a2b",
      status: "couture",
      late: isOverdueAt(at(o.f5.dueDate), "couture", start),
      createdAt: at(o.f5.createdAt),
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
      dueDate: at(o.f6.dueDate),
      soldeLe: null,
      signature: null,
      price: 12000,
      avance: 0,
      garment: "Chemise · wax orange",
      description: null,
      fabricColor: "#b8502e",
      status: "recu",
      late: isOverdueAt(at(o.f6.dueDate), "recu", start),
      createdAt: at(o.f6.createdAt),
    },
  ];
}

// Calculée une seule fois, au chargement du module (= « maintenant » au tout
// premier lancement de l'app sur cet appareil) — comportement historique
// inchangé pour l'état initial du store. `legacyClassification.ts` ne
// compare JAMAIS une fiche legacy à CETTE constante (elle dérive de la date
// du jour où le module a été chargé) : elle reconstruit sa propre seed
// attendue via `buildSeedFiches()` + la date d'origine de la fiche.
export const seedFiches: Fiche[] = buildSeedFiches(new Date());

interface NewFicheInput {
  clientId?: string | null;
  nom?: string;
  prenom?: string;
  telephone?: string;
  prefillChamps?: Partial<Record<FicheChampKey, string>>;
  /** Phase 9A — voir `FicheRepository.NewFicheInput` (source de vérité). */
  garment?: string;
  description?: string;
}

interface NewClientInput {
  name: string;
  phone: string;
  photo: string | null;
}

type FicheInfoPatch = Partial<
  Pick<Fiche, "nom" | "prenom" | "telephone" | "clientId" | "garment" | "description" | "fabricColor" | "voiceNote" | "dueDate" | "price" | "avance" | "signature" | "soldeLe">
>;

export interface StoreState {
  clients: Client[];
  fiches: Fiche[];
  modeles: Modele[];
  addClient: (input: NewClientInput) => string;
  getClient: (id: string) => Client | undefined;
  fichesForClient: (id: string) => Fiche[];
  deleteClient: (id: string) => void;
  deleteClients: (ids: string[]) => void;
  addFiche: (input?: NewFicheInput) => string;
  setFicheInfo: (id: string, patch: FicheInfoPatch) => void;
  setFicheChamp: (id: string, key: FicheChampKey, valeur: string) => void;
  strikeFicheChamp: (id: string, key: FicheChampKey) => void;
  restoreFicheChamp: (id: string, key: FicheChampKey) => void;
  addFicheTissuPhoto: (id: string, dataUrl: string) => void;
  removeFicheTissuPhoto: (id: string, photoId: string) => void;
  setFicheStatus: (id: string, status: OrderStatus) => void;
  advanceFiche: (id: string) => void;
  deleteFiche: (id: string) => void;
  deleteFiches: (ids: string[]) => void;
  addModele: () => string;
  getModele: (id: string) => Modele | undefined;
  setModeleNom: (id: string, nom: string) => void;
  addModelePhoto: (id: string, dataUrl: string) => void;
  removeModelePhoto: (id: string, photoId: string) => void;
  addModelePatronPhoto: (id: string, dataUrl: string) => void;
  removeModelePatronPhoto: (id: string, photoId: string) => void;
  removeModele: (id: string) => void;
  removeModeles: (ids: string[]) => void;
}

/** Exportée (Phase 7A, corr. R) : un `SupabaseClientRepository` a besoin de
 * la MÊME formule déterministe pour un client cloud dont `metadata.color_seed`
 * est absent — jamais une couleur aléatoire, jamais persistée en retour. */
export function colorSeedFor(seedString: string): string {
  const palette = ["indigo", "terracotta", "teal", "grey", "amber"];
  const sum = seedString.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

/** Upgrades a v8-or-earlier persisted store (separate clients/orders/fiches) to the unified v9 Fiche model. Exported standalone so the migration's business rules can be tested without going through the persist middleware.
 *
 * `modeles` was folded in additively for Phase 6A (`legacyBackup.ts`) — no
 * legacy version of the store ever wrote it in a different shape than today's
 * `Modele[]`, so it only needs defaulting/shape-guarding, never rewriting like
 * clients/orders/fiches above. */
export function migrateLegacyState(persisted: unknown): { clients: Client[]; fiches: Fiche[]; modeles: Modele[] } {
  const state = (persisted ?? {}) as {
    clients?: (Client & { measurementsNote?: VoiceNote | null; measurementsText?: string | null })[];
    modeles?: Partial<Modele>[];
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

  // Defensive shape-guarding only — no legacy version stored modeles under a
  // different shape, so unlike clients/fiches above this never needs field
  // remapping, only defaulting for a persisted file older than the feature.
  //
  // `state` comes from `unknown` (a real persisted payload can be anything) —
  // `state.modeles` being present and truthy does NOT mean it's an array
  // (Phase 6A, correction review « state.modeles peut ne pas être un
  // tableau ») : `{}`, `"corrupted"`, `42`… would all make `.map()` throw
  // below. `Array.isArray()` is a genuine RUNTIME guard, not just a TS
  // annotation — the `as` cast on `state` above gives no protection here.
  // A non-array `modeles` isn't signalled as a distinct anomaly to the
  // tailor (that would mean threading a new anomalies channel through
  // `migrateLegacyState()` just for this one top-level shape, well beyond
  // what's needed) — it's simply treated as "no modeles readable", exactly
  // like `modeles` being absent.
  const legacyModeles: Partial<Modele>[] = Array.isArray(state.modeles) ? state.modeles : [];

  // A modele with no `id` NEVER gets a random uid() here (Phase 6A, correction
  // blocker « aucune identité aléatoire silencieuse ») : the same malformed
  // payload must produce the exact same analysis every time it's re-read, and
  // a random id would also masquerade as a real legacy identifier. Instead it
  // gets a deterministic, clearly-marked placeholder — index-based, so two
  // analyses of the same (unchanged) payload always agree — that
  // `legacyPreview.ts` recognizes and surfaces as an anomaly rather than
  // silently treating it as if it were a genuine legacy id.
  const modeles: Modele[] = legacyModeles.map((raw, index) => {
    // Same reasoning at element level — `legacyModeles[i]` can itself be
    // `null`/a string/a number inside an otherwise-array `modeles` (e.g.
    // `modeles: [null, "x"]`) ; falling back to `{}` keeps every field below
    // going through its own explicit default instead of reading a property
    // off a non-object and throwing.
    const m: Partial<Modele> = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
      id: typeof m.id === "string" && m.id.length > 0 ? m.id : `${LEGACY_SYNTHETIC_MODELE_ID_PREFIX}${index}`,
      nom: typeof m.nom === "string" ? m.nom : "",
      photos: Array.isArray(m.photos) ? m.photos : [],
      patronPhotos: Array.isArray(m.patronPhotos) ? m.patronPhotos : [],
      createdAt: typeof m.createdAt === "string" ? m.createdAt : new Date(0).toISOString(),
    };
  });

  return { clients, fiches, modeles };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      clients: seedClients,
      fiches: seedFiches,
      modeles: [],

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
      // Deleting a client never touches their fiches — each fiche carries its own
      // nom/prenom/telephone written like on paper, clientId is just a bonus link.
      deleteClient: (id) =>
        set({
          clients: get().clients.filter((c) => c.id !== id),
          fiches: get().fiches.map((f) => (f.clientId === id ? { ...f, clientId: null } : f)),
        }),
      deleteClients: (ids) => {
        const idSet = new Set(ids);
        set({
          clients: get().clients.filter((c) => !idSet.has(c.id)),
          fiches: get().fiches.map((f) => (f.clientId && idSet.has(f.clientId) ? { ...f, clientId: null } : f)),
        });
      },

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
          garment: input?.garment ?? "",
          description: input?.description ?? null,
          fabricColor: "#2d3a6b",
          status: "recu",
          late: false,
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

      deleteFiche: (id) => set({ fiches: get().fiches.filter((f) => f.id !== id) }),
      deleteFiches: (ids) => {
        const idSet = new Set(ids);
        set({ fiches: get().fiches.filter((f) => !idSet.has(f.id)) });
      },

      addModele: () => {
        const id = uid("m");
        const modele: Modele = { id, nom: "", photos: [], patronPhotos: [], createdAt: new Date().toISOString() };
        set({ modeles: [modele, ...get().modeles] });
        return id;
      },
      getModele: (id) => get().modeles.find((m) => m.id === id),
      setModeleNom: (id, nom) =>
        set({ modeles: get().modeles.map((m) => (m.id === id ? { ...m, nom } : m)) }),
      addModelePhoto: (id, dataUrl) =>
        set({
          modeles: get().modeles.map((m) =>
            m.id === id ? { ...m, photos: [...m.photos, { id: uid("mp"), dataUrl }] } : m
          ),
        }),
      removeModelePhoto: (id, photoId) =>
        set({
          modeles: get().modeles.map((m) =>
            m.id === id ? { ...m, photos: m.photos.filter((p) => p.id !== photoId) } : m
          ),
        }),
      addModelePatronPhoto: (id, dataUrl) =>
        set({
          modeles: get().modeles.map((m) =>
            m.id === id ? { ...m, patronPhotos: [...m.patronPhotos, { id: uid("pp"), dataUrl }] } : m
          ),
        }),
      removeModelePatronPhoto: (id, photoId) =>
        set({
          modeles: get().modeles.map((m) =>
            m.id === id ? { ...m, patronPhotos: m.patronPhotos.filter((p) => p.id !== photoId) } : m
          ),
        }),
      removeModele: (id) => set({ modeles: get().modeles.filter((m) => m.id !== id) }),
      removeModeles: (ids) => {
        const idSet = new Set(ids);
        set({ modeles: get().modeles.filter((m) => !idSet.has(m.id)) });
      },
    }),
    {
      name: "sunu-couture",
      // Bump whenever the persisted Fiche shape changes, even mid-development —
      // otherwise browsers with an already-matching version number skip migrate
      // entirely and keep loading stale fields (e.g. avance undefined → NaN reste).
      version: 12,
      migrate: migrateLegacyState,
      partialize: (state) => ({
        clients: state.clients.map((c) => ({ ...c, photo: null })),
        fiches: state.fiches,
        modeles: state.modeles,
      }),
    }
  )
);
