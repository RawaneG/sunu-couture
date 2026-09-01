import { useEffect } from "react";
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
import PhoneEntry from "./pages/auth/PhoneEntry";
import OtpVerify from "./pages/auth/OtpVerify";
import WorkshopName from "./pages/auth/WorkshopName";
import { AuthProvider } from "./lib/auth/AuthProvider";
import RequireAuth from "./lib/auth/RequireAuth";
import { RepositoryProvider } from "./repositories/RepositoryProvider";

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

// Toutes les routes métier passent par RequireAuth : sans session -> /connexion,
// session sans atelier -> /connexion/atelier, sinon accès direct. RequireAuth
// est une garde D'INTERFACE uniquement — elle ne remplace pas les GRANT et
// politiques RLS de la Phase 4, seule véritable barrière côté données.
function ProtectedAppRoute() {
  return (
    <RequireAuth>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <RepositoryProvider>
      <AuthProvider>
        <ScrollToTop />
        <Routes>
          <Route element={<AuthRoute />}>
            <Route path="/connexion" element={<PhoneEntry />} />
            <Route path="/connexion/code" element={<OtpVerify />} />
            <Route path="/connexion/atelier" element={<WorkshopName />} />
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
            <Route path="/clients/nouveau" element={<ClientNew />} />
            <Route path="/clients" element={<ClientsLayout />}>
              <Route index element={<ClientsEmptyState />} />
              <Route path=":id" element={<ClientDetail />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </RepositoryProvider>
  );
}
