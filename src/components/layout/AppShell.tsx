import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import MobileBrandBar from "./MobileBrandBar";

// `MobileBrandBar` (thème + déconnexion) vit ICI, au niveau du shell
// protégé — jamais dans une page métier — pour rester disponible sur TOUTE
// route authentifiée (corr. bug Gate Preview : elle ne se rendait que sur
// `CarnetList`/Accueil, disparaissant dès qu'on naviguait vers Clients/
// Commandes/Catalogue). `lg:hidden` (déjà sur le composant lui-même) la
// masque sur desktop, où la Sidebar porte déjà ces actions.
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh text-ink font-sans">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBrandBar />
        <main className="flex-1 pb-28 lg:pb-12">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
