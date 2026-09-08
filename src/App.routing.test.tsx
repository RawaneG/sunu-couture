// Tests d'intégration du branchement RequireAuth sur les routes métier, et du
// pivot Gate Auth (téléphone + PIN, atelier invisible). Utilise le VRAI
// AuthProvider (pas un mock de useAuth) — seules les E/S externes (repository
// Auth PIN, appel provision-workshop) sont mockées — pour exercer la vraie
// mécanique de state/redirection de bout en bout.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import App from "./App";

/** Simule le bouton Back du NAVIGATEUR (jamais disponible autrement avec un
 * <MemoryRouter> nu) — `navigate(-1)` déclenche exactement la même navigation
 * de type POP qu'un vrai retour navigateur côté react-router (corr. Gate
 * Auth navigation §26/§38). Rendu en frère de <App/>, à l'intérieur du MÊME
 * <MemoryRouter> — un simple utilitaire de test, jamais un composant de
 * l'application. */
function BrowserBackTrigger() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      test-navigateur-back
    </button>
  );
}

const { mockGetSession, mockRegister, mockLogin, mockSubscribe, mockCallProvisionWorkshop, mockCreateRepositoryContainer, authState } = vi.hoisted(() => {
  const state: { session: { userId: string; phoneE164: string | null; expiresAt: number } | null; listeners: Array<(s: unknown) => void> } = {
    session: null,
    listeners: [],
  };
  return {
    authState: state,
    mockGetSession: vi.fn(async () => state.session),
    mockSubscribe: vi.fn((cb: (s: unknown) => void) => {
      state.listeners.push(cb);
      return () => {
        state.listeners = state.listeners.filter((l) => l !== cb);
      };
    }),
    mockRegister: vi.fn(async (phone: string) => {
      const session = { userId: `user-${phone}`, phoneE164: phone, expiresAt: 9999999999 };
      state.session = session;
      state.listeners.forEach((cb) => cb(session));
      return { session, error: null };
    }),
    mockLogin: vi.fn(async (phone: string, pin: string) => {
      if (pin !== "123456".slice(0, 4)) {
        return { session: null, error: { code: "invalid_credentials", message: "Numéro ou code incorrect." } };
      }
      const session = { userId: `user-${phone}`, phoneE164: phone, expiresAt: 9999999999 };
      state.session = session;
      state.listeners.forEach((cb) => cb(session));
      return { session, error: null };
    }),
    mockCallProvisionWorkshop: vi.fn(),
    mockCreateRepositoryContainer: vi.fn(),
  };
});

vi.mock("./lib/auth/SupabasePinAuthRepository", () => ({
  SupabasePinAuthRepository: vi.fn().mockImplementation(function mockRepoCtor(this: {
    getSession: typeof mockGetSession;
    subscribeToAuthChanges: typeof mockSubscribe;
    register: typeof mockRegister;
    login: typeof mockLogin;
    signOut: () => Promise<void>;
    signOutAllDevices: () => Promise<void>;
  }) {
    this.getSession = mockGetSession;
    this.subscribeToAuthChanges = mockSubscribe;
    this.register = mockRegister;
    this.login = mockLogin;
    this.signOut = vi.fn();
    this.signOutAllDevices = vi.fn();
  }),
}));

vi.mock("./lib/workshop/provisionWorkshop", () => ({
  callProvisionWorkshop: (...args: unknown[]) => mockCallProvisionWorkshop(...args),
}));

// `App.tsx` construit un `SupabaseGateway` (corr. Gate §9) pour la partie
// protégée — jamais utilisé ici puisque `VITE_BACKEND` reste "local" par
// défaut dans ces tests. Un stub évite d'exiger `VITE_SUPABASE_URL`/
// `VITE_SUPABASE_PUBLISHABLE_KEY` au chargement du module réel.
vi.mock("./lib/supabase/client", () => ({ supabase: {} }));

// Espionne `createRepositoryContainer()` (corr. Gate §23/§24) — sans changer
// son comportement réel (délègue à l'implémentation authentique) — pour
// prouver structurellement que le déplacement de `RepositoryProvider` sous
// `RequireAuth` règle le problème de bootstrap : aucun appel tant que
// session/atelier ne sont pas résolus, un appel avec le VRAI workshopId une
// fois la route protégée atteinte.
vi.mock("./repositories/RepositoryContainer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repositories/RepositoryContainer")>();
  return {
    ...actual,
    createRepositoryContainer: (options?: Parameters<typeof actual.createRepositoryContainer>[0]) => {
      mockCreateRepositoryContainer(options);
      return actual.createRepositoryContainer(options);
    },
  };
});

function renderAppAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.session = null;
  authState.listeners = [];
  localStorage.clear(); // jamais de numéro mémorisé d'un test précédent (ConnexionEntry)
});

describe("Protection des routes métier (RequireAuth branché, pivot Gate Auth PIN)", () => {
  it("accès direct à une route métier SANS session -> redirection vers /connexion (Welcome, aucun numéro mémorisé)", async () => {
    renderAppAt("/clients/nouveau");
    await waitFor(() => expect(screen.getByText(/bienvenue sur tayoo/i)).toBeInTheDocument());
    expect(screen.queryByText(/nouveau client/i)).not.toBeInTheDocument();
  });

  it("session existante AVEC atelier -> accès direct à la route métier demandée", async () => {
    authState.session = { userId: "u-with-ws", phoneE164: "+221770000002", expiresAt: 9999999999 };
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "workshop", workshop: { id: "w1", name: "Espace u-with-ws" } });
    renderAppAt("/clients/nouveau");
    // Timeout généreux : ce parcours traverse plusieurs écrans + résolutions
    // async (register/login + sonde d'atelier) — sous forte charge parallèle
    // (suite complète, ~60 fichiers), le délai par défaut (1000ms) peut être
    // trop court sans que la logique elle-même soit en cause.
    await waitFor(() => expect(screen.getByPlaceholderText("Nom du client")).toBeInTheDocument(), { timeout: 5000 });
    // Un seul appel de sonde (name: null) au chargement — jamais de re-création.
    expect(mockCallProvisionWorkshop).toHaveBeenCalledTimes(1);
    expect(mockCallProvisionWorkshop).toHaveBeenCalledWith(null);
  });

  it("parcours complet INSCRIPTION : route protégée -> connexion -> numéro -> PIN -> confirmation -> retour à la route d'origine", async () => {
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "workshop", workshop: { id: "w2", name: "Espace test" } });
    const user = userEvent.setup();
    renderAppAt("/clients/nouveau");

    // 1) redirigé vers /connexion (Welcome, route d'origine mémorisée)
    await waitFor(() => expect(screen.getByRole("button", { name: "Commencer" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Commencer" }));

    // 2) écran numéro
    await waitFor(() => expect(screen.getByLabelText("Numéro de téléphone")).toBeInTheDocument());
    await user.type(screen.getByLabelText("Numéro de téléphone"), "77 000 00 01");
    await user.click(screen.getByRole("button", { name: "Continuer" }));

    // 3) écran création PIN — champ réel visuellement masqué (sr-only) : le
    // clavier physique/mobile fonctionne en réalité via `fireEvent.change`
    // (comme testé isolément dans PinPad.test.tsx) ; `userEvent.type` évalue
    // la visibilité CSS et refuse d'interagir avec un élément `sr-only`.
    await waitFor(() => expect(screen.getByText("Choisis ton code")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });

    // 4) écran confirmation PIN
    await waitFor(() => expect(screen.getByText("Encore une fois")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    // 5) de retour sur /clients/nouveau (route initialement demandée), pas l'accueil
    // Timeout généreux : ce parcours traverse plusieurs écrans + résolutions
    // async (register/login + sonde d'atelier) — sous forte charge parallèle
    // (suite complète, ~60 fichiers), le délai par défaut (1000ms) peut être
    // trop court sans que la logique elle-même soit en cause.
    await waitFor(() => expect(screen.getByPlaceholderText("Nom du client")).toBeInTheDocument(), { timeout: 5000 });
    expect(mockRegister).toHaveBeenCalledWith("+221770000001", "1234");
  });

  it("parcours CONNEXION : PIN correct -> accès direct à la route protégée", async () => {
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "workshop", workshop: { id: "w3", name: "Espace test" } });
    const user = userEvent.setup();
    renderAppAt("/clients/nouveau");

    await waitFor(() => expect(screen.getByText(/j'ai déjà un code/i)).toBeInTheDocument());
    await user.click(screen.getByText(/j'ai déjà un code/i));

    await waitFor(() => expect(screen.getByLabelText("Numéro de téléphone")).toBeInTheDocument());
    await user.type(screen.getByLabelText("Numéro de téléphone"), "77 000 00 09");
    await user.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() => expect(screen.getByLabelText("Entre ton code")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Entre ton code"), { target: { value: "1234" } });

    // Timeout généreux : ce parcours traverse plusieurs écrans + résolutions
    // async (register/login + sonde d'atelier) — sous forte charge parallèle
    // (suite complète, ~60 fichiers), le délai par défaut (1000ms) peut être
    // trop court sans que la logique elle-même soit en cause.
    await waitFor(() => expect(screen.getByPlaceholderText("Nom du client")).toBeInTheDocument(), { timeout: 5000 });
    expect(mockLogin).toHaveBeenCalledWith("+221770000009", "1234");
  });

  it("aucune navigation métier (Sidebar/BottomNav) sur les écrans d'authentification", async () => {
    renderAppAt("/connexion");
    await waitFor(() => expect(screen.getByText(/bienvenue sur tayoo/i)).toBeInTheDocument());
    for (const label of ["Accueil", "Commandes", "Catalogue"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("aucun champ ni bouton masqué (aria-hidden) sur l'écran de bienvenue", async () => {
    renderAppAt("/connexion");
    const button = await screen.findByRole("button", { name: "Commencer" });
    expect(button).not.toHaveAttribute("aria-hidden");
    expect(button).not.toHaveAttribute("hidden");
    await waitFor(() => expect(button).toBeVisible());
  });

  it("route d'auth (/connexion, session/atelier absents) -> aucun conteneur de repositories métier construit (corr. Gate §23)", async () => {
    renderAppAt("/connexion");
    await waitFor(() => expect(screen.getByText(/bienvenue sur tayoo/i)).toBeInTheDocument());
    expect(mockCreateRepositoryContainer).not.toHaveBeenCalled();
  });

  it("route protégée avec session + atelier résolu -> RepositoryProvider monté, conteneur construit avec le VRAI workshopId (corr. Gate §24)", async () => {
    authState.session = { userId: "u-with-ws2", phoneE164: "+221770000004", expiresAt: 9999999999 };
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "workshop", workshop: { id: "w1", name: "Espace u-with-ws2" } });
    renderAppAt("/clients/nouveau");
    // Timeout généreux : ce parcours traverse plusieurs écrans + résolutions
    // async (register/login + sonde d'atelier) — sous forte charge parallèle
    // (suite complète, ~60 fichiers), le délai par défaut (1000ms) peut être
    // trop court sans que la logique elle-même soit en cause.
    await waitFor(() => expect(screen.getByPlaceholderText("Nom du client")).toBeInTheDocument(), { timeout: 5000 });
    expect(mockCreateRepositoryContainer).toHaveBeenCalledWith(expect.objectContaining({ workshopId: "w1" }));
  });
});

describe("Navigation Auth — aucune impasse, Retour déterministe (corr. Gate Auth navigation §17/§19/§33)", () => {
  it("Welcome -> Numéro (inscription) -> Retour -> Welcome", async () => {
    const user = userEvent.setup();
    renderAppAt("/connexion");
    await user.click(await screen.findByRole("button", { name: "Commencer" }));
    await screen.findByLabelText("Numéro de téléphone");

    await user.click(screen.getByRole("button", { name: "Retour" }));
    await waitFor(() => expect(screen.getByText(/bienvenue sur tayoo/i)).toBeInTheDocument());
  });

  it("Numéro -> CreatePinFlow (création) -> Retour -> Numéro préremplit le numéro déjà saisi", async () => {
    const user = userEvent.setup();
    renderAppAt("/connexion");
    await user.click(await screen.findByRole("button", { name: "Commencer" }));
    await user.type(await screen.findByLabelText("Numéro de téléphone"), "77 000 00 01");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await screen.findByText("Choisis ton code");

    await user.click(screen.getByRole("button", { name: "Retour" }));
    const input = await screen.findByLabelText("Numéro de téléphone");
    expect(input).toHaveValue("77 000 00 01");
  });

  it("CreatePinFlow création -> confirmation -> Retour -> revient à l'étape création (même route, PIN jamais dans history.state)", async () => {
    const user = userEvent.setup();
    renderAppAt("/connexion");
    await user.click(await screen.findByRole("button", { name: "Commencer" }));
    await user.type(await screen.findByLabelText("Numéro de téléphone"), "77 000 00 01");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await screen.findByText("Choisis ton code");
    fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });
    await screen.findByText("Encore une fois");

    expect(JSON.stringify(window.history.state ?? {})).not.toContain("1234");

    await user.click(screen.getByRole("button", { name: "Retour" }));
    expect(await screen.findByText("Choisis ton code")).toBeInTheDocument();
  });

  it("Welcome -> J'ai déjà un code -> Numéro -> PinLogin -> Retour -> Numéro préremplit le numéro déjà saisi", async () => {
    const user = userEvent.setup();
    renderAppAt("/connexion");
    await user.click(await screen.findByText(/j'ai déjà un code/i));
    await user.type(await screen.findByLabelText("Numéro de téléphone"), "77 000 00 09");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await screen.findByLabelText("Entre ton code");

    await user.click(screen.getByRole("button", { name: "Retour" }));
    const input = await screen.findByLabelText("Numéro de téléphone");
    expect(input).toHaveValue("77 000 00 09");
  });
});

describe("Impasse d'inscription observée pendant le Gate (corr. Gate Auth handoff §12/§13/§14/§30/§35/§36)", () => {
  it("phone_in_use -> état d'action, 'Entrer mon code' mène à PinLogin avec le numéro connu, AUCUN second register()", async () => {
    mockRegister.mockImplementationOnce(async () => ({ session: null, error: { code: "phone_in_use", message: "Ce numéro est déjà utilisé. Choisis « J'ai déjà un code »." } }) as unknown as Awaited<ReturnType<typeof mockRegister>>);
    mockLogin.mockResolvedValue({ session: { userId: "u-existing", phoneE164: "+221770000001", expiresAt: 9999999999 }, error: null });
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "workshop", workshop: { id: "w-existing", name: "Espace test" } });
    const user = userEvent.setup();
    renderAppAt("/connexion");

    await user.click(await screen.findByRole("button", { name: "Commencer" }));
    await user.type(await screen.findByLabelText("Numéro de téléphone"), "77 000 00 01");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    fireEvent.change(await screen.findByLabelText("Choisis ton code"), { target: { value: "1234" } });
    await screen.findByText("Encore une fois");
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    await screen.findByText("Ce numéro a déjà un code");
    await user.click(screen.getByRole("button", { name: "Entrer mon code" }));

    fireEvent.change(await screen.findByLabelText("Entre ton code"), { target: { value: "1234" } });
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith("+221770000001", "1234"));
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it("register() réussit serveur mais setSession() échoue (session_activation_failed) -> 'Ton code a bien été créé', jamais 'Connexion impossible. Réessaie.', jamais un second register()", async () => {
    mockRegister.mockImplementationOnce(async () => ({ session: null, error: { code: "session_activation_failed", message: "Connexion impossible. Réessaie." } }) as unknown as Awaited<ReturnType<typeof mockRegister>>);
    mockLogin.mockResolvedValue({ session: { userId: "u-recovered", phoneE164: "+221770000002", expiresAt: 9999999999 }, error: null });
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "workshop", workshop: { id: "w-recovered", name: "Espace test" } });
    const user = userEvent.setup();
    renderAppAt("/connexion");

    await user.click(await screen.findByRole("button", { name: "Commencer" }));
    await user.type(await screen.findByLabelText("Numéro de téléphone"), "77 000 00 02");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    fireEvent.change(await screen.findByLabelText("Choisis ton code"), { target: { value: "1234" } });
    await screen.findByText("Encore une fois");
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    expect(await screen.findByText("Ton code a bien été créé")).toBeInTheDocument();
    expect(screen.queryByText("Connexion impossible. Réessaie.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Entrer mon code" }));
    fireEvent.change(await screen.findByLabelText("Entre ton code"), { target: { value: "1234" } });
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith("+221770000002", "1234"));
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });
});

describe("Back navigateur après authentification (corr. Gate Auth navigation §25/§26/§27/§38)", () => {
  it("session déjà 'ready' -> Back vers un écran /connexion/* -> replace IMMÉDIAT vers l'app, jamais un register()/login() rejoué", async () => {
    authState.session = { userId: "u-back", phoneE164: "+221770000005", expiresAt: 9999999999 };
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "workshop", workshop: { id: "w-back", name: "Espace test" } });

    render(
      <MemoryRouter initialEntries={["/connexion", "/connexion/numero", "/clients/nouveau"]} initialIndex={2}>
        <App />
        <BrowserBackTrigger />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByPlaceholderText("Nom du client")).toBeInTheDocument(), { timeout: 5000 });

    fireEvent.click(screen.getByRole("button", { name: "test-navigateur-back" }));

    // Jamais l'écran numéro (route d'auth) — la garde AuthPublicRoute doit
    // immédiatement rediriger en `replace` vers l'app dès que status="ready".
    await waitFor(() => expect(screen.queryByLabelText("Numéro de téléphone")).not.toBeInTheDocument());
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();
  });
});

describe("Appareil déjà reconnu — numéro mémorisé localement (corr. Gate Auth §6/§46)", () => {
  it("un numéro mémorisé fait sauter /connexion directement à l'écran PIN 'Bon retour'", async () => {
    localStorage.setItem("tayoo:last-phone", "+221770000009");
    renderAppAt("/connexion");
    await waitFor(() => expect(screen.getByText("Bon retour")).toBeInTheDocument());
    expect(screen.queryByText(/bienvenue sur tayoo/i)).not.toBeInTheDocument();
  });

  it("'Ce n'est pas mon numéro' efface la mémoire et revient à l'écran numéro", async () => {
    localStorage.setItem("tayoo:last-phone", "+221770000009");
    const user = userEvent.setup();
    renderAppAt("/connexion");
    await waitFor(() => expect(screen.getByText("Bon retour")).toBeInTheDocument());

    await user.click(screen.getByText(/ce n'est pas mon numéro/i));
    await waitFor(() => expect(screen.getByLabelText("Numéro de téléphone")).toBeInTheDocument());
    expect(localStorage.getItem("tayoo:last-phone")).toBeNull();
  });
});
