// Garde de route branchée sur toutes les routes métier dans App.tsx
// (ProtectedAppRoute) — UNIQUEMENT une garde d'INTERFACE : elle décide quel
// écran React s'affiche, elle ne remplace pas les GRANT et politiques RLS de
// la Phase 4, seule véritable barrière côté données. Sans elles, un appel
// direct à Supabase depuis un client modifié contournerait cet écran.
//
// Comportement (états `AuthStatus`, corr. Gate Auth §38) :
//   - "initializing"/"provisioning" → état de chargement accessible ;
//   - "signed_out" → redirection /connexion, route demandée conservée
//     (`location.state.from`) pour y revenir après connexion ;
//   - "error" → atelier non résolu (hors ligne, erreur serveur) — message
//     simple, jamais un écran mort ni un blocage silencieux ;
//   - "ready" → rendu direct des enfants.
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { status, error } = useAuth();
  const location = useLocation();

  if (status === "initializing" || status === "provisioning") {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-ink-soft">Chargement de ta session…</p>
      </div>
    );
  }

  if (status === "signed_out") {
    return <Navigate to="/connexion" replace state={{ from: location }} />;
  }

  if (status === "error") {
    return (
      <div role="alert" aria-live="assertive" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-terracotta">{error ?? "Une erreur est survenue. Réessaie."}</p>
      </div>
    );
  }

  return <>{children}</>;
}
