// Corr. Jakob's Law §9/§10/§11/§54 — icône seule ne suffit jamais : le
// libellé reste visible en permanence, et la destination active se distingue
// par plus qu'une simple couleur (forme + texte en gras).
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BottomNav from "./BottomNav";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("expose exactement 4 destinations", () => {
    renderAt("/");
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("chaque destination affiche un libellé texte VISIBLE, pas seulement une icône", () => {
    renderAt("/");
    for (const label of ["Accueil", "Commandes", "Catalogue", "Clients"]) {
      expect(screen.getByText(label)).toBeVisible();
    }
  });

  it("la destination active est identifiable par plus qu'une couleur (forme + poids du texte)", () => {
    renderAt("/commandes");
    const active = screen.getByRole("link", { name: /commandes/i });
    const inactive = screen.getByRole("link", { name: /catalogue/i });

    // Forme : une pastille pleine (élément additionnel) derrière l'icône active.
    expect(active.querySelector('[class*="rounded-2xl"]')).not.toBeNull();
    // Texte : gras sur l'actif, semi-gras seulement sur l'inactif — un signal
    // distinct de la couleur, vérifiable même sans rendu de couleur réel en jsdom.
    expect(screen.getByText("Commandes").className).toMatch(/font-bold/);
    expect(screen.getByText("Catalogue").className).not.toMatch(/font-bold/);
    expect(inactive).not.toBe(active);
  });

  it("chaque destination respecte une cible tactile >= 44px (min-h-11)", () => {
    renderAt("/");
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toMatch(/min-h-11/);
    }
  });

  it("navigue vers chacune des 4 destinations attendues", () => {
    renderAt("/");
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/commandes", "/catalogue", "/clients"]);
  });

  // RÉGRESSION — `w-full` sur CHAQUE item flex (au lieu de `flex-1`) faisait
  // que les 4 destinations réclamaient chacune 100% de la largeur de la
  // barre : visuellement, seule la première ("Accueil") restait visible, les
  // 3 autres étaient repoussées hors de la zone visible. Un partage égal de
  // la largeur (`flex-1`) est requis, jamais une largeur fixe à 100%.
  it("les 4 destinations se partagent la largeur à parts égales (jamais w-full sur un item)", () => {
    renderAt("/");
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toMatch(/flex-1/);
      expect(link.className).not.toMatch(/\bw-full\b/);
    }
  });
});
