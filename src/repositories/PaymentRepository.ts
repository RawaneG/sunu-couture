/** `client_payments` (historique de versements, décision D6/Phase 11) n'existe
 * pas encore côté frontend : aujourd'hui, `Fiche.avance` est un UNIQUE
 * montant, remplacé en entier à chaque saisie (`AvanceChampCell`, comportement
 * actuel, conservé à l'identique). Cette interface expose donc une forme
 * compatible avec le futur historique (un tableau), tout en reflétant
 * honnêtement l'état actuel : au plus UN versement synthétique par fiche,
 * dérivé de `avance` — jamais un historique inventé. `setAmount` REMPLACE le
 * montant (pas un ajout à une liste), exactement comme aujourd'hui. */
export interface Payment {
  id: string;
  ficheId: string;
  amount: number;
}

export interface FicheBalance {
  price: number;
  paid: number;
  reste: number;
}

/** Lectures synchrones, mutation asynchrone (corr. R, Phase 7A) — voir
 * `ClientRepository`. Le passage de `setAmount()` (remplacement) à un
 * `add()` de type ledger honnête appartient à la Phase 11A, pas à 7A : seule
 * la signature de `setAmount()` change de forme ici, sa sémantique reste
 * identique (remplace `Fiche.avance`). */
export interface PaymentRepository {
  /** 0 ou 1 élément — voir note ci-dessus. */
  list(ficheId: string): Payment[];
  /** Remplace `Fiche.avance` (comportement actuel : un seul champ écrasé). */
  setAmount(ficheId: string, amount: number): Promise<void>;
  getBalance(ficheId: string): FicheBalance;
  subscribe(listener: () => void): () => void;
}
