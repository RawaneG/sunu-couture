import { Routes, Route } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import Dashboard from "./pages/Dashboard";
import OrdersLayout from "./pages/OrdersLayout";
import OrdersEmptyState from "./pages/OrdersEmptyState";
import OrderDetail from "./pages/OrderDetail";
import OrderNew from "./pages/OrderNew";
import ClientsLayout from "./pages/ClientsLayout";
import ClientsEmptyState from "./pages/ClientsEmptyState";
import ClientDetail from "./pages/ClientDetail";
import ClientNew from "./pages/ClientNew";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/commandes/nouvelle" element={<OrderNew />} />
        <Route path="/commandes" element={<OrdersLayout />}>
          <Route index element={<OrdersEmptyState />} />
          <Route path=":id" element={<OrderDetail />} />
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
