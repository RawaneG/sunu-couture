import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRepositoryContainer, createRepositoryContainerFor, type RepositoryContainer } from "./RepositoryContainer";
// Import depuis `AuthContext.ts` (PAS `AuthProvider.tsx`) : ce dernier
// importe `SupabasePhoneOtpAuthRepository` → le client Supabase réel, qui
// lève au chargement du module sans `VITE_SUPABASE_*` — une chaîne que ce
// fichier, monté par de nombreux tests sans `<AuthProvider>` ni mock
// Supabase, ne doit jamais tirer (corr. R, Phase 7A §12).
import { useOptionalAuth } from "../lib/auth/AuthContext";
import { currentBackend } from "../lib/backend";
// Import TYPE UNIQUEMENT — voir `RepositoryContainer.ts` : `supabaseGateway`
// est un objet déjà construit fourni par l'appelant réel (aujourd'hui
// `ProtectedRepositoryProvider` dans `App.tsx`, seul endroit qui importe
// `createSupabaseGateway()`/le singleton `src/lib/supabase/client.ts`, corr.
// Gate §6/§9) — jamais importé ni construit ici.
import type { SupabaseGateway } from "./supabase/gateway";

const RepositoryContext = createContext<RepositoryContainer | null>(null);

interface RepositoryProviderProps {
  children: ReactNode;
  /** Point d'injection pour les tests (et les phases futures) : fournir un
   * conteneur — au besoin avec de faux repositories — remplace entièrement
   * l'implémentation par défaut sans toucher aux pages ni aux hooks. Un
   * conteneur injecté n'est JAMAIS disposé par ce Provider (corr. Gate §14) —
   * son cycle de vie appartient à l'appelant (généralement un test), qui l'a
   * construit lui-même. */
  repositories?: RepositoryContainer;
  /** Gateway Supabase déjà construit (voir `createSupabaseGateway()`) —
   * ignoré si `repositories` est injecté, et ignoré par le backend `local`.
   * Obligatoire pour que le backend `supabase` construise quoi que ce soit
   * (corr. Gate §6/§20) — jamais construit PAR ce fichier lui-même. */
  supabaseGateway?: SupabaseGateway;
}

/** Doit être monté SOUS `<AuthProvider>` — et, pour le backend `supabase`,
 * sous `<RequireAuth>` (corr. Gate §10/§11) : au démarrage, avant restauration
 * de session, `workshop` est `null` et un conteneur cloud ne doit jamais être
 * tenté avec un atelier absent.
 *
 * Trois chemins bien séparés (corr. lifecycle §6) — chacun son propre
 * composant, jamais un hook appelé conditionnellement dans un seul gros
 * composant :
 *   - `repositories` injecté (tests) -> utilisé TEL QUEL, jamais disposé ici.
 *   - backend `local` -> `LocalRepositoryProvider`, synchrone (aucun timer/
 *     fetch cloud à gérer, §5) — comportement inchangé depuis toujours.
 *   - backend `supabase` -> `CloudRepositoryProvider`, qui possède un
 *     lifecycle React explicite (§3/§7) : la construction d'un conteneur
 *     cloud (bootstraps async, timers, `CloudCollectionStore`) ne doit
 *     JAMAIS avoir lieu pendant le render — seulement dans un effect, avec
 *     dispose de l'ancien AVANT création du nouveau lors d'un changement
 *     d'atelier (jamais les deux lots vivants simultanément). */
export function RepositoryProvider({ children, repositories, supabaseGateway }: RepositoryProviderProps) {
  if (repositories) {
    return <RepositoryContext.Provider value={repositories}>{children}</RepositoryContext.Provider>;
  }
  if (currentBackend() === "supabase") {
    return <CloudRepositoryProvider supabaseGateway={supabaseGateway}>{children}</CloudRepositoryProvider>;
  }
  return <LocalRepositoryProvider>{children}</LocalRepositoryProvider>;
}

/** Backend `local` : aucun timer, aucun fetch réseau, aucun `CloudCollectionStore`
 * — la construction reste synchrone, dans `useMemo`, exactement comme avant
 * ce correctif (corr. lifecycle §5). `workshopId` est transmis pour
 * compatibilité (`createRepositoryContainer()` l'ignore de toute façon pour
 * ce backend) mais n'a aucune incidence fonctionnelle ici. */
function LocalRepositoryProvider({ children }: { children: ReactNode }) {
  const workshopId = useOptionalAuth()?.workshop?.id;
  const container = useMemo(() => createRepositoryContainer({ workshopId }), [workshopId]);
  return <RepositoryContext.Provider value={container}>{children}</RepositoryContext.Provider>;
}

interface OwnedCloudContainer {
  workshopId: string;
  gateway: SupabaseGateway;
  container: RepositoryContainer;
}

/** Backend `supabase` : le conteneur cloud (timers, abonnements,
 * `CloudCollectionStore`) est créé et détruit UNIQUEMENT dans l'effect
 * ci-dessous — jamais pendant le render (corr. lifecycle §3). Lors d'un
 * changement d'atelier, React exécute le cleanup de l'effet PRÉCÉDENT (dispose
 * de l'ancien conteneur) avant d'exécuter le nouvel effet (création du
 * nouveau) — l'ordre `dispose(w1) → create(w2)` est donc garanti par React
 * lui-même, jamais l'inverse (corr. lifecycle §9). Le rendu ne considère
 * `owned` comme utilisable que s'il correspond EXACTEMENT à l'atelier et au
 * gateway COURANTS (§7/§10) : pendant la fenêtre entre "l'atelier a changé"
 * et "le nouveau conteneur est prêt", l'ANCIEN conteneur n'est jamais exposé
 * — un état de chargement minimal et accessible est affiché à la place
 * (§8), jamais un faux conteneur local ni les données de l'atelier
 * précédent. */
function CloudRepositoryProvider({ children, supabaseGateway }: { children: ReactNode; supabaseGateway?: SupabaseGateway }) {
  const workshopId = useOptionalAuth()?.workshop?.id;
  const [owned, setOwned] = useState<OwnedCloudContainer | null>(null);

  useEffect(() => {
    // `workshopId`/`supabaseGateway` absents : dans l'app réelle, ce composant
    // n'est monté que sous `RequireAuth` (workshop garanti) avec un gateway
    // toujours fourni par `ProtectedRepositoryProvider` (App.tsx) — ce garde-fou
    // est purement défensif (jamais un throw ici : voir `RepositoryContainer.
    // createRepositoryContainerFor("supabase", …)`, inchangé, pour l'échec
    // explicite testé indépendamment, corr. Gate §7/§20/§21).
    if (!workshopId || !supabaseGateway) return;
    const container = createRepositoryContainerFor("supabase", { workshopId, supabaseGateway });
    setOwned({ workshopId, gateway: supabaseGateway, container });
    return () => {
      container.dispose?.();
    };
  }, [workshopId, supabaseGateway]);

  const ready = owned !== null && owned.workshopId === workshopId && owned.gateway === supabaseGateway;
  if (!ready) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-ink-soft">Chargement de tes données…</p>
      </div>
    );
  }

  return <RepositoryContext.Provider value={owned.container}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): RepositoryContainer {
  const container = useContext(RepositoryContext);
  if (!container) {
    throw new Error("useRepositories() doit être appelé sous <RepositoryProvider>.");
  }
  return container;
}
