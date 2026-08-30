import type { ReactNode } from "react";
import BrandMark from "../ui/BrandMark";

// Layout dédié aux 3 écrans d'authentification (/connexion, /connexion/code,
// /connexion/atelier) — INDÉPENDANT de AppShell : aucune barre de navigation
// basse métier, aucune barre latérale métier, aucune icône de navigation sans
// libellé. Une seule carte centrée dans l'espace disponible, largeur maximale
// ~420px. Ne modifie et ne réutilise AUCUN composant d'écran métier existant
// (Sidebar/BottomNav restent intacts, simplement absents de cette arborescence).
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col text-ink font-sans">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="flex w-full flex-col items-center gap-6" style={{ maxWidth: 420 }}>
          {/* Repère de marque — statique, jamais un lien de navigation vers l'app métier. */}
          <div className="flex items-center gap-2.5" aria-hidden="true">
            <span className="glass-brand flex h-9 w-9 flex-none items-center justify-center rounded-xl">
              <BrandMark size={22} />
            </span>
            <span className="font-display italic font-bold text-lg leading-none text-ink">Tayoo</span>
          </div>

          <div className="w-full">{children}</div>
        </div>
      </main>
    </div>
  );
}
