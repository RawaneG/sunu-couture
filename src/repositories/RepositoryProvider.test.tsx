import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { RepositoryProvider, useRepositories } from "./RepositoryProvider";
import { createRepositoryContainerFor, type RepositoryContainer } from "./RepositoryContainer";
import { AuthContext, type AuthContextValue } from "../lib/auth/AuthContext";

// `createRepositoryContainer()` (utilisé en interne par `RepositoryProvider`
// quand `repositories` n'est PAS injecté) est remplacé par une fabrique
// contrôlable — un nouveau faux conteneur, avec son propre spy `dispose()`,
// à chaque appel. `createRepositoryContainerFor()` (utilisé directement par
// certains tests ci-dessous pour fabriquer un conteneur RÉEL à injecter) reste
// l'implémentation authentique.
const { mockCreateRepositoryContainer, containers } = vi.hoisted(() => {
  const list: Array<{ workshopId: string | undefined; dispose: () => void }> = [];
  return {
    containers: list,
    mockCreateRepositoryContainer: vi.fn(),
  };
});

vi.mock("./RepositoryContainer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./RepositoryContainer")>();
  return {
    ...actual,
    createRepositoryContainer: (options?: { workshopId?: string }) => {
      mockCreateRepositoryContainer(options);
      const dispose = vi.fn();
      const container = { ...actual.createRepositoryContainerFor("local"), dispose };
      containers.push({ workshopId: options?.workshopId, dispose });
      return container;
    },
  };
});

function fakeAuthValue(workshopId: string | null): AuthContextValue {
  return {
    initializing: false,
    session: workshopId ? { userId: "u1", phoneE164: null, expiresAt: 9999999999 } : null,
    user: workshopId ? { id: "u1", phoneE164: null } : null,
    workshop: workshopId
      ? { id: workshopId, name: "Atelier Test", ownerId: "u1", isDemo: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }
      : null,
    provisionWorkshop: vi.fn(),
    signOut: vi.fn(),
    signOutAllDevices: vi.fn(),
  };
}

function Probe() {
  useRepositories();
  return null;
}

beforeEach(() => {
  containers.length = 0;
  mockCreateRepositoryContainer.mockClear();
});

describe("RepositoryProvider — injection de test (corr. Gate §12/§14)", () => {
  it("un conteneur injecté via `repositories` est utilisé tel quel, jamais remplacé — et jamais disposé au démontage", () => {
    const container: RepositoryContainer = createRepositoryContainerFor("local");
    const disposeSpy = vi.fn();
    container.dispose = disposeSpy;

    const { unmount } = render(
      <AuthContext.Provider value={fakeAuthValue("w1")}>
        <RepositoryProvider repositories={container}>
          <Probe />
        </RepositoryProvider>
      </AuthContext.Provider>,
    );
    // Aucun conteneur interne construit quand `repositories` est fourni.
    expect(mockCreateRepositoryContainer).not.toHaveBeenCalled();

    unmount();
    expect(disposeSpy).not.toHaveBeenCalled();
  });
});

describe("RepositoryProvider — lifecycle / dispose du conteneur auto-créé (corr. Gate §13/§25)", () => {
  it("dispose le conteneur qu'il a lui-même créé exactement une fois au démontage", () => {
    const { unmount } = render(
      <AuthContext.Provider value={fakeAuthValue("w1")}>
        <RepositoryProvider>
          <Probe />
        </RepositoryProvider>
      </AuthContext.Provider>,
    );
    expect(containers).toHaveLength(1);
    expect(containers[0].workshopId).toBe("w1");
    expect(containers[0].dispose).not.toHaveBeenCalled();

    unmount();
    expect(containers[0].dispose).toHaveBeenCalledTimes(1);
  });

  it("changement d'atelier (w1 -> w2) : dispose l'ancien conteneur AVANT de construire le nouveau, aucun mélange runtime", () => {
    const { rerender, unmount } = render(
      <AuthContext.Provider value={fakeAuthValue("w1")}>
        <RepositoryProvider>
          <Probe />
        </RepositoryProvider>
      </AuthContext.Provider>,
    );
    expect(containers).toHaveLength(1);
    const container1 = containers[0];
    expect(container1.workshopId).toBe("w1");
    expect(container1.dispose).not.toHaveBeenCalled();

    rerender(
      <AuthContext.Provider value={fakeAuthValue("w2")}>
        <RepositoryProvider>
          <Probe />
        </RepositoryProvider>
      </AuthContext.Provider>,
    );

    // Le conteneur w1 a été disposé, un SEUL nouveau conteneur w2 a été créé
    // (jamais les deux lots vivants simultanément).
    expect(container1.dispose).toHaveBeenCalledTimes(1);
    expect(containers).toHaveLength(2);
    const container2 = containers[1];
    expect(container2.workshopId).toBe("w2");
    expect(container2.dispose).not.toHaveBeenCalled();

    unmount();
    expect(container2.dispose).toHaveBeenCalledTimes(1);
    // L'ancien conteneur n'est jamais re-disposé une seconde fois au démontage final.
    expect(container1.dispose).toHaveBeenCalledTimes(1);
  });
});
