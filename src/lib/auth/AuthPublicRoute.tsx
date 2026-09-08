// Garde symétrique de `RequireAuth` (corr. Gate Auth navigation §25/§26/§27) —
// empêche un utilisateur DÉJÀ authentifié (session + atelier résolus) de
// revisiter les écrans publics /connexion/* : sans elle, le bouton Back du
// navigateur après une connexion réussie ramène sur "Confirme ton code" ou
// "Entre ton code", et resoumettre déclenche un second `register()`/`login()`
// inutile (impasse UX observée pendant le Gate, corr. §26).
//
// Règles (corr. §25) :
//   - "initializing"/"provisioning" -> état de chargement (bref, jamais un
//     écran mort) ;
//   - "signed_out" -> rend les écrans d'auth normalement ;
//   - "ready" (session ET atelier résolus) -> redirection IMMÉDIATE en
//     `replace` (jamais un `push`, corr. §27 : pas de boucle d'historique)
//     vers `location.state.from` s'il existe et n'est pas lui-même une route
//     d'auth, sinon "/".
//   - "error" (session valide, atelier non résolu) -> laisse passer : rester
//     bloqué sur un écran d'auth sans jamais pouvoir revenir serait pire
//     qu'un message d'erreur déjà géré par ailleurs (RequireAuth) une fois la
//     route protégée retentée.
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Location } from "react-router-dom";
import { useAuth } from "./AuthProvider";

function isAuthRoute(pathname: string): boolean {
  return pathname === "/connexion" || pathname.startsWith("/connexion/");
}

export default function AuthPublicRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "initializing" || status === "provisioning") {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-ink-soft">Chargement de ta session…</p>
      </div>
    );
  }

  if (status === "ready") {
    const from = (location.state as { from?: Location } | null)?.from;
    const destination = from?.pathname && !isAuthRoute(from.pathname) ? `${from.pathname}${from.search ?? ""}` : "/";
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
}
