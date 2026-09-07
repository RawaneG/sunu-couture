import { useEffect, useMemo, type ReactNode } from "react";
import { Routes, Route, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import AuthLayout from "./components/layout/AuthLayout";
import OrdersLayout from "./pages/OrdersLayout";
import OrdersEmptyState from "./pages/OrdersEmptyState";
import ClientsLayout from "./pages/ClientsLayout";
import ClientsEmptyState from "./pages/ClientsEmptyState";
import ClientDetail from "./pages/ClientDetail";
import ClientNew from "./pages/ClientNew";
import CarnetList from "./pages/CarnetList";
import FicheDetail from "./pages/FicheDetail";
import FicheNew from "./pages/FicheNew";
import Catalogue from "./pages/Catalogue";
import ModeleNew from "./pages/ModeleNew";
import ModeleDetail from "./pages/ModeleDetail";
import LegacySauvegarde from "./pages/LegacySauvegarde";
import ConnexionEntry from "./pages/auth/ConnexionEntry";
import PhoneEntry from "./pages/auth/PhoneEntry";
import PinCreate from "./pages/auth/PinCreate";
import PinConfirm from "./pages/auth/PinConfirm";
import PinLogin from "./pages/auth/PinLogin";
import { AuthProvider } from "./lib/auth/AuthProvider";
import RequireAuth from "./lib/auth/RequireAuth";
import { RepositoryProvider } from "./repositories/RepositoryProvider";
// Seul endroit de ce fichier — et de toute l'application — qui importe le
// client Supabase concret ET `createSupabaseGateway()` en dehors de
// `src/lib/supabase/client.ts`/`gateway.ts` eux-mêmes (corr. Gate §6/§8/§9) :
// `RepositoryProvider`/`RepositoryContainer.ts` ne le font jamais, pour
// rester testables sans `VITE_SUPABASE_*`. Sûr ici : `AuthProvider` (toujours
// monté, plus haut) importe déjà transitivement ce même client pour l'auth
// téléphone/OTP (corr. R, Phase 7A §12) — aucune nouvelle exigence
// d'environnement n'est introduite par cet import.
import { supabase } from "./lib/supabase/client";
import { createSupabaseGateway } from "./repositories/supabase/gateway";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Kept so old bookmarks/links to a commande land on its fiche instead of a dead route.
function OrderToFicheRedirect() {
  const { id } = useParams();
  return <Navigate to={`/carnet/${id}`} replace />;
}

// Les 3 routes d'authentification vivent dans AuthLayout (pas AppShell) :
// aucune navigation métier, carte centrée — voir AuthLayout.tsx.
function AuthRoute() {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  );
}

// Construit le gateway Supabase UNE fois pour la partie protégée de l'arbre
// (corr. Gate §9) — jamais avant : ce composant n'est rendu QUE comme enfant
// de `RequireAuth`, donc seulement une fois session + atelier déjà garantis
// par celui-ci (corr. Gate §10/§11). `RepositoryProvider` retrouve lui-même
// `workshop.id` via le contexte Auth (`useOptionalAuth()`, déjà résolu à ce
// stade) — seul `supabaseGateway` doit transiter explicitement, car
// `RepositoryProvider` ne doit jamais importer `createSupabaseGateway()`/le
// client concret lui-même (corr. Gate §6). Backend `local` : ce gateway est
// construit mais jamais utilisé (`RepositoryContainer` l'ignore).
function ProtectedRepositoryProvider({ children }: { children: ReactNode }) {
  const gateway = useMemo(() => createSupabaseGateway(supabase), []);
  return <RepositoryProvider supabaseGateway={gateway}>{children}</RepositoryProvider>;
}

// Toutes les routes métier passent par RequireAuth : sans session -> /connexion,
// session sans atelier -> /connexion/atelier, sinon accès direct. RequireAuth
// est une garde D'INTERFACE uniquement — elle ne remplace pas les GRANT et
// politiques RLS de la Phase 4, seule véritable barrière côté données.
//
// `RepositoryProvider` vit ICI (sous `RequireAuth`), PAS au sommet de l'arbre
// (corr. Gate §10/§11) : au démarrage, avant restauration de session,
// `workshop` est `null` — un conteneur cloud construit à ce moment-là
// échouerait (ou pire, utiliserait un atelier faux). Les routes d'auth
// (/connexion, /connexion/code, /connexion/atelier) ne construisent donc
// aucun Repository métier.
function ProtectedAppRoute() {
  return (
    <RequireAuth>
      <ProtectedRepositoryProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </ProtectedRepositoryProvider>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ScrollToTop />
      <Routes>
        <Route element={<AuthRoute />}>
          <Route path="/connexion" element={<ConnexionEntry />} />
          <Route path="/connexion/numero" element={<PhoneEntry />} />
          <Route path="/connexion/creer-code" element={<PinCreate />} />
          <Route path="/connexion/confirmer-code" element={<PinConfirm />} />
          <Route path="/connexion/code" element={<PinLogin />} />
          {/* Ancienne étape "nom de l'atelier" (pivot Gate Auth : l'atelier est
              désormais créé automatiquement côté serveur, jamais demandé) —
              redirection de compatibilité pour d'anciens liens, jamais un
              écran mort. */}
          <Route path="/connexion/atelier" element={<Navigate to="/connexion" replace />} />
        </Route>

        <Route element={<ProtectedAppRoute />}>
          <Route path="/" element={<CarnetList />} />
          <Route path="/carnet" element={<Navigate to="/" replace />} />
          <Route path="/carnet/nouvelle" element={<FicheNew />} />
          <Route path="/carnet/:id" element={<FicheDetail />} />
          <Route path="/commandes/nouvelle" element={<FicheNew />} />
          <Route path="/catalogue/nouveau" element={<ModeleNew />} />
          <Route path="/catalogue/:id" element={<ModeleDetail />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/commandes" element={<OrdersLayout />}>
            <Route index element={<OrdersEmptyState />} />
            <Route path=":id" element={<OrderToFicheRedirect />} />
          </Route>
          {/* Phase 6A — outil de sauvegarde/prévisualisation avant migration cloud
              (docs/refonte/02-PLAN-MIGRATION.md §5). Pas d'entrée dans le BottomNav
              (4 icônes, usage quotidien) — c'est un outil ponctuel du porteur, pas
              un écran que le tailleur visite au jour le jour. */}
          <Route path="/sauvegarde" element={<LegacySauvegarde />} />
          <Route path="/clients/nouveau" element={<ClientNew />} />
          <Route path="/clients" element={<ClientsLayout />}>
            <Route index element={<ClientsEmptyState />} />
            <Route path=":id" element={<ClientDetail />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
