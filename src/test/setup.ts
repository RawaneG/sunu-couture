import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// `globals: true` n'est pas activé (tests important explicitement
// describe/it/expect) — l'auto-cleanup de Testing Library ne se déclenche
// donc pas seule : sans ceci, chaque render() s'accumule dans le même
// document jsdom d'un test à l'autre du même fichier.
afterEach(() => {
  cleanup();
});
