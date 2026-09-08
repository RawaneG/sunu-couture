// Corr. bug Gate Preview mobile — `MobileBrandBar` (thème + déconnexion) doit
// vivre dans le shell protégé lui-même, jamais dans une page métier
// particulière : sinon les actions globales du compte disparaissent dès
// qu'on navigue hors de l'écran qui la portait (ici, l'Accueil/`CarnetList`).
//
// Note jsdom : `Sidebar` (desktop, `hidden lg:flex`) et `MobileBrandBar`
// (mobile, `lg:hidden`) sont TOUTES LES DEUX présentes dans le DOM en même
// temps — jsdom n'applique aucune media query, seul le CSS réel masquerait
// l'une des deux. Les deux portent un bouton « Se déconnecter » (texte
// visible côté Sidebar, `aria-label` côté MobileBrandBar) : c'est un
// comportement ATTENDU, pas une duplication. Les tests ci-dessous isolent
// donc explicitement le bouton HORS de la Sidebar (`<aside>`) pour prouver
// qu'il n'existe qu'UNE seule occurrence de la barre globale MOBILE.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext";
import AppShell from "./AppShell";

function fakeAuthValue(signOut: () => Promise<void>): AuthContextValue {
  return {
    status: "ready",
    session: { userId: "u1", phoneE164: "+221770000001", expiresAt: 9999999999 },
    user: { id: "u1", phoneE164: "+221770000001" },
    workshop: { id: "w1", name: "Espace test", ownerId: "u1", isDemo: false, createdAt: "", updatedAt: "" },
    error: null,
    register: async () => ({ ok: true }),
    login: async () => ({ ok: true }),
    signOut,
    signOutAllDevices: async () => {},
  };
}

function renderAppShell(children: React.ReactNode, signOut = vi.fn(async () => {})) {
  const utils = render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthContext.Provider value={fakeAuthValue(signOut)}>
        <AppShell>{children}</AppShell>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
  return { signOut, ...utils };
}

/** Boutons « Se déconnecter » situés HORS de la Sidebar desktop — ne
 * matche donc que la barre globale MOBILE (`MobileBrandBar`). */
function mobileSignOutButtons(): HTMLElement[] {
  const aside = document.querySelector("aside");
  return screen.getAllByRole("button", { name: "Se déconnecter" }).filter((btn) => !aside?.contains(btn));
}

describe("AppShell — porte désormais MobileBrandBar globalement (corr. bug Gate Preview mobile)", () => {
  it("MobileBrandBar (thème + déconnexion) est rendu par AppShell, quel que soit le contenu de la page", () => {
    renderAppShell(<p>Page métier quelconque</p>);
    expect(screen.getByText("Page métier quelconque")).toBeInTheDocument();
    expect(mobileSignOutButtons()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Changer de thème" })).toBeInTheDocument();
  });

  it("exactement UNE occurrence de la barre globale mobile — jamais de double rendu", () => {
    renderAppShell(<p>Contenu</p>);
    expect(mobileSignOutButtons()).toHaveLength(1);
  });

  it("les actions globales sont indépendantes de la page rendue à l'intérieur", () => {
    const { rerender, signOut } = renderAppShell(<p>Écran A</p>);
    expect(mobileSignOutButtons()).toHaveLength(1);

    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <AuthContext.Provider value={fakeAuthValue(signOut)}>
          <AppShell>
            <p>Écran B, complètement différent</p>
          </AppShell>
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Écran B, complètement différent")).toBeInTheDocument();
    expect(mobileSignOutButtons()).toHaveLength(1);
  });

  it("le bouton « Se déconnecter » de la barre globale mobile appelle bien le signOut() du contexte Auth existant, jamais un mécanisme parallèle", async () => {
    const signOut = vi.fn(async () => {});
    const user = userEvent.setup();
    renderAppShell(<p>Contenu</p>, signOut);

    const [mobileButton] = mobileSignOutButtons();
    await user.click(mobileButton);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
