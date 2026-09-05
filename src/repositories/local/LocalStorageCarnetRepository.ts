import { nextFicheSlot, useStore } from "../../lib/store";
import type { Fiche } from "../../lib/types";
import type { CarnetRepository, CarnetSlot } from "../CarnetRepository";
import { subscribeToSlice } from "./subscribeToSlice";

interface CarnetCache {
  fiches: Fiche[];
  activeCarnetNumero: number;
  nextSlot: CarnetSlot;
}

export class LocalStorageCarnetRepository implements CarnetRepository {
  // Cache tenu par référence de `fiches` — garantit que `getNextSlot()` (un
  // objet) renvoie la MÊME référence tant que `fiches` n'a pas changé,
  // condition requise pour un instantané stable avec `useSyncExternalStore`
  // (sinon chaque rendu verrait un objet "différent" et boucleraiт).
  private cache: CarnetCache | null = null;

  private ensureCache(): CarnetCache {
    const fiches = useStore.getState().fiches;
    if (this.cache?.fiches === fiches) return this.cache;
    this.cache = {
      fiches,
      // Même formule que l'ancien `useMemo` de CarnetList.tsx — inchangée.
      activeCarnetNumero: fiches.reduce((max, f) => Math.max(max, f.carnetNumero), 0) || 1,
      nextSlot: nextFicheSlot(fiches),
    };
    return this.cache;
  }

  getActiveCarnetNumero(): number {
    return this.ensureCache().activeCarnetNumero;
  }

  getNextSlot(): CarnetSlot {
    return this.ensureCache().nextSlot;
  }

  getCarnetNumero(): number | undefined {
    // Pas de `carnet_id` séparé côté local — `Fiche.carnetNumero` est déjà
    // un champ direct de la fiche, jamais résolu via cette méthode.
    return undefined;
  }

  subscribe(listener: () => void): () => void {
    return subscribeToSlice("fiches", listener);
  }
}
