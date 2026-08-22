import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
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

export default function App() {
  return (
    <AppShell>
      <ScrollToTop />
      <Routes>
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
      </Routes>
    </AppShell>
  );
}
