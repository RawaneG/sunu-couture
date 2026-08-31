// Garde de route branchée sur toutes les routes métier dans App.tsx
// (ProtectedAppRoute) — UNIQUEMENT une garde d'INTERFACE : elle décide quel
// écran React s'affiche, elle ne remplace pas les GRANT et politiques RLS de
// la Phase 4, seule véritable barrière côté données. Sans elles, un appel
// direct à Supabase depuis un client modifié contournerait cet écran.
//
// Comportement :
//   - pendant la restauration de session → état de chargement accessible ;
//   - pas de session → redirection /connexion, route demandée conservée
//     (`location.state.from`) pour y revenir après connexion ;
//   - session mais pas d'atelier résolu → redirection /connexion/atelier ;
//   - session + atelier → rendu direct des enfants.
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { initializing, session, workshop } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-ink-soft">Chargement de ta session…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/connexion" replace state={{ from: location }} />;
  }

  if (!workshop) {
    return <Navigate to="/connexion/atelier" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
