import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RepositoryProvider, useRepositories } from "./RepositoryProvider";
import { createRepositoryContainerFor, type RepositoryContainer } from "./RepositoryContainer";
import { AuthContext, type AuthContextValue } from "../lib/auth/AuthContext";
import type { SupabaseGateway } from "./supabase/gateway";

// Enregistre la séquence RÉELLE create/dispose du conteneur cloud — jamais un
// mock du comportement lui-même : `createRepositoryContainerFor("supabase",
// …)` (et le `dispose()` qu'elle retourne) restent les VRAIS, seul l'ORDRE des
// appels est observé (corr. lifecycle §9). `createRepositoryContainer()` (le
// chemin local) n'est jamais touché par ce mock.
const { events } = vi.hoisted(() => ({ events: [] as string[] }));

vi.mock("./RepositoryContainer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./RepositoryContainer")>();
  return {
    ...actual,
    createRepositoryContainerFor: (
      backend: Parameters<typeof actual.createRepositoryContainerFor>[0],
      options?: Parameters<typeof actual.createRepositoryContainerFor>[1],
    ) => {
      if (backend !== "supabase" || !options?.workshopId) {
        return actual.createRepositoryContainerFor(backend, options);
      }
      const workshopId = options.workshopId;
      events.push(`create:${workshopId}`);
      const container = actual.createRepositoryContainerFor(backend, options) as RepositoryContainer & { _workshopIdTag?: string };
      const realDispose = container.dispose?.bind(container);
      container.dispose = () => {
        events.push(`dispose:${workshopId}`);
        realDispose?.();
      };
      // Marqueur de test UNIQUEMENT — permet de vérifier qu'un container
      // jamais exposé sous le mauvais atelier (§10), sans dépendre du timing
      // exact du flush React.
      container._workshopIdTag = workshopId;
      return container;
    },
  };
});

function fakeGateway(): SupabaseGateway {
  return {
    listActiveClients: vi.fn(async () => ({ data: [], error: null })),
    insertClient: vi.fn(async () => ({ data: null, error: null })),
    softDeleteClients: vi.fn(async () => ({ data: null, error: null })),
    listCarnets: vi.fn(async () => ({ data: [], error: null })),
    listActiveFiches: vi.fn(async () => ({ data: [], error: null })),
    getFicheById: vi.fn(async () => ({ data: null, error: null })),
    updateFiche: vi.fn(async () => ({ data: null, error: null })),
    softDeleteFiches: vi.fn(async () => ({ data: null, error: null })),
    createFicheFromDraft: vi.fn(async () => ({ data: null, error: null })),
    listActiveMediaAssets: vi.fn(async () => ({ data: [], error: null })),
    insertMediaAsset: vi.fn(async () => ({ data: null, error: null })),
    softDeleteMediaAsset: vi.fn(async () => ({ data: null, error: null })),
    restoreMediaAsset: vi.fn(async () => ({ data: null, error: null })),
    uploadMediaObject: vi.fn(async () => ({ data: null, error: null })),
    createSignedMediaUrl: vi.fn(async () => ({ data: "https://example.test/signed", error: null })),
    downloadMediaObject: vi.fn(async () => ({ data: new Blob(), error: null })),
    listActiveModeles: vi.fn(async () => ({ data: [], error: null })),
    getModeleById: vi.fn(async () => ({ data: null, error: null })),
    insertModele: vi.fn(async () => ({ data: null, error: null })),
    updateModeleNom: vi.fn(async () => ({ data: null, error: null })),
    softDeleteModeles: vi.fn(async () => ({ data: null, error: null })),
    listActiveModeleMedias: vi.fn(async () => ({ data: [], error: null })),
    insertModeleMedia: vi.fn(async () => ({ data: null, error: null })),
    deleteModeleMedia: vi.fn(async () => ({ data: null, error: null })),
    listClientPayments: vi.fn(async () => ({ data: [], error: null })),
    listFicheBalances: vi.fn(async () => ({ data: [], error: null })),
    getFicheBalance: vi.fn(async () => ({ data: null, error: null })),
    insertClientPayment: vi.fn(async () => ({ data: null, error: null })),
  };
}

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

/** Rendu enfant réel : expose le conteneur ET l'atelier COURANT du contexte,
 * pour vérifier — à chaque rendu où il apparaît réellement à l'écran — que le
 * conteneur exposé correspond TOUJOURS à l'atelier courant (§10), jamais
 * l'ancien conteneur sous un nouveau contexte. */
function Probe() {
  const container = useRepositories() as RepositoryContainer & { _workshopIdTag?: string };
  return <div data-testid="probe">{container._workshopIdTag ?? "local"}</div>;
}

beforeEach(() => {
  events.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RepositoryProvider — injection de test (corr. Gate §12, inchangé)", () => {
  it("un conteneur injecté via `repositories` est utilisé tel quel, jamais disposé au démontage", () => {
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
    expect(events).toHaveLength(0); // aucun conteneur cloud construit quand `repositories` est fourni

    unmount();
    expect(disposeSpy).not.toHaveBeenCalled();
  });
});

describe("RepositoryProvider — lifecycle du conteneur cloud (corr. lifecycle §3/§7/§9/§10)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BACKEND", "supabase");
  });

  it("aucun conteneur cloud créé tant que l'atelier n'est pas résolu (session/workshop absents)", () => {
    render(
      <AuthContext.Provider value={fakeAuthValue(null)}>
        <RepositoryProvider supabaseGateway={fakeGateway()}>
          <Probe />
        </RepositoryProvider>
      </AuthContext.Provider>,
    );
    expect(events).toHaveLength(0);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
  });

  it("atelier w1 : crée exactement 1 conteneur, jamais pendant le render (visible une fois prêt)", async () => {
    render(
      <AuthContext.Provider value={fakeAuthValue("w1")}>
        <RepositoryProvider supabaseGateway={fakeGateway()}>
          <Probe />
        </RepositoryProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("w1"));
    expect(events).toEqual(["create:w1"]);
  });

  it("changement d'atelier w1 -> w2 : ordre EXACT create:w1, dispose:w1, create:w2 — jamais create:w2 avant dispose:w1", async () => {
    const { rerender } = render(
      <AuthContext.Provider value={fakeAuthValue("w1")}>
        <RepositoryProvider supabaseGateway={fakeGateway()}>
          <Probe />
        </RepositoryProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("w1"));

    rerender(
      <AuthContext.Provider value={fakeAuthValue("w2")}>
        <RepositoryProvider supabaseGateway={fakeGateway()}>
          <Probe />
        </RepositoryProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("w2"));

    expect(events).toEqual(["create:w1", "dispose:w1", "create:w2"]);
  });

  it("pendant/après la transition d'atelier, le conteneur exposé aux enfants correspond TOUJOURS à l'atelier du contexte courant (jamais w1 exposé sous w2)", async () => {
    const { rerender } = render(
      <AuthContext.Provider value={fakeAuthValue("w1")}>
        <RepositoryProvider supabaseGateway={fakeGateway()}>
          <Probe />
        </RepositoryProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("w1"));

    rerender(
      <AuthContext.Provider value={fakeAuthValue("w2")}>
        <RepositoryProvider supabaseGateway={fakeGateway()}>
          <Probe />
        </RepositoryProvider>
      </AuthContext.Provider>,
    );

    // Ni pendant ni après la transition l'ancien tag "w1" ne doit apparaître
    // à l'écran une fois le contexte passé à w2 — soit rien n'est affiché
    // (chargement), soit "w2" exactement, jamais "w1".
    expect(screen.queryByText("w1")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("w2"));
    expect(screen.queryByText("w1")).not.toBeInTheDocument();
  });

  it("démontage : dispose le conteneur courant exactement une fois", async () => {
    const { unmount } = render(
      <AuthContext.Provider value={fakeAuthValue("w1")}>
        <RepositoryProvider supabaseGateway={fakeGateway()}>
          <Probe />
        </RepositoryProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("w1"));

    unmount();
    expect(events).toEqual(["create:w1", "dispose:w1"]);
  });
});
