import type { Fiche, FicheChampKey, OrderStatus } from "../lib/types";
import type { ObservableRepositoryStatus } from "./RepositoryStatus";

export interface NewFicheInput {
  clientId?: string | null;
  nom?: string;
  prenom?: string;
  telephone?: string;
  prefillChamps?: Partial<Record<FicheChampKey, string>>;
  /** Ajoutés en Phase 9A — informations CORE que le brouillon (`FicheNew`)
   * peut porter avant validation explicite. Volontairement PAS `voiceNote`/
   * `tissuPhotos`/`signature`/`avance` : ces domaines restent 8A/11A (corr. R). */
  garment?: string;
  description?: string;
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
 * elle-même (aucun consommateur actuel n'en a besoin séparément).
 *
 * Lectures synchrones, mutations asynchrones — voir `ClientRepository` pour
 * la justification (corr. R, Phase 7A). `add()` reste ici la porte du
 * comportement actuel (brouillon = fiche créée immédiatement) ; sa
 * correction métier (aucune fiche vide au tap) appartient à la Phase 9A, pas
 * à 7A — seule sa signature devient asynchrone dans cette phase. */
export interface FicheRepository extends ObservableRepositoryStatus {
  list(): Fiche[];
  get(id: string): Fiche | undefined;
  listByClient(clientId: string): Fiche[];
  add(input?: NewFicheInput): Promise<string>;
  setInfo(id: string, patch: FicheInfoPatch): Promise<void>;
  setChamp(id: string, key: FicheChampKey, valeur: string): Promise<void>;
  strikeChamp(id: string, key: FicheChampKey): Promise<void>;
  restoreChamp(id: string, key: FicheChampKey): Promise<void>;
  setStatus(id: string, status: OrderStatus): Promise<void>;
  advance(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  removeMany(ids: string[]): Promise<void>;
  subscribe(listener: () => void): () => void;
}
