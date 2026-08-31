import type { Fiche, FicheChampKey, OrderStatus } from "../lib/types";

export interface NewFicheInput {
  clientId?: string | null;
  nom?: string;
  prenom?: string;
  telephone?: string;
  prefillChamps?: Partial<Record<FicheChampKey, string>>;
}

export type FicheInfoPatch = Partial<
  Pick<
    Fiche,
    | "nom"
    | "prenom"
    | "telephone"
    | "clientId"
    | "garment"
    | "description"
    | "fabricColor"
    | "voiceNote"
    | "dueDate"
    | "price"
    | "avance"
    | "signature"
    | "soldeLe"
  >
>;

/** Fiches — enregistrement unique d'un travail (source de vérité, voir
 * `src/lib/types.ts`). La numérotation (`carnetNumero`/`numero`) reste gérée
 * ici pour l'instant (comme dans `store.ts` actuel) — `CarnetRepository`
 * n'expose que la LECTURE de l'état courant du carnet, jamais l'allocation
 * elle-même (aucun consommateur actuel n'en a besoin séparément). */
export interface FicheRepository {
  list(): Fiche[];
  get(id: string): Fiche | undefined;
  listByClient(clientId: string): Fiche[];
  add(input?: NewFicheInput): string;
  setInfo(id: string, patch: FicheInfoPatch): void;
  setChamp(id: string, key: FicheChampKey, valeur: string): void;
  strikeChamp(id: string, key: FicheChampKey): void;
  restoreChamp(id: string, key: FicheChampKey): void;
  setStatus(id: string, status: OrderStatus): void;
  advance(id: string): void;
  remove(id: string): void;
  removeMany(ids: string[]): void;
  subscribe(listener: () => void): () => void;
}
