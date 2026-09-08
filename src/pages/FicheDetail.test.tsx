// Phase 11A — AvanceChampCell devient un ledger : taper ne doit jamais
// committer, seul un clic explicite sur "Ajouter" appelle
// `PaymentRepository.add()`, exactement une fois même en cas de double clic.
// Ces tests démontrent aussi que `PrixChampCell`/`ResteChampCell` restent
// fidèles à la balance autoritative (jamais un faux 0 F pendant le
// chargement, jamais un surpaiement tronqué à 0).
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { formatFCFA } from "../lib/format";
import type { Fiche, TissuPhoto, VoiceNote } from "../lib/types";
import { FICHE_MESURE_KEYS, FICHE_INFO_KEYS } from "../lib/types";
import type { FicheRepository, FicheInfoPatch, NewFicheInput } from "../repositories/FicheRepository";
import type { MediaRepository } from "../repositories/MediaRepository";
import type { AddPaymentInput, FicheBalance, Payment, PaymentRepository } from "../repositories/PaymentRepository";
import type { RepositoryStatus } from "../repositories/RepositoryStatus";
import { READY_STATUS } from "../repositories/RepositoryStatus";
import { createRepositoryContainerFor } from "../repositories/RepositoryContainer";
import { RepositoryProvider } from "../repositories/RepositoryProvider";
import FicheDetail from "./FicheDetail";

function makeFiche(overrides: Partial<Fiche> = {}): Fiche {
  const champs = Object.fromEntries([...FICHE_MESURE_KEYS, ...FICHE_INFO_KEYS].map((key) => [key, { valeur: "", historique: [] }])) as unknown as Fiche["champs"];
  return {
    id: "f1",
    carnetNumero: 1,
    numero: 1,
    nom: "Diouf",
    prenom: "Awa",
    telephone: "77 512 44 08",
    clientId: null,
    champs,
    voiceNote: null,
    tissuPhotos: [],
    dueDate: null,
    soldeLe: null,
    signature: null,
    price: 10000,
    avance: 0,
    garment: "Boubou",
    description: null,
    fabricColor: "",
    status: "recu",
    late: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

class FakeFicheRepository implements FicheRepository {
  private fiche: Fiche;
  private listeners = new Set<() => void>();
  readonly setInfoCalls: FicheInfoPatch[] = [];
  setInfoImpl: (patch: FicheInfoPatch) => Promise<void>;

  constructor(fiche: Fiche, setInfoImpl?: (patch: FicheInfoPatch) => Promise<void>) {
    this.fiche = fiche;
    this.setInfoImpl =
      setInfoImpl ??
      (async (patch) => {
        this.fiche = { ...this.fiche, ...patch };
        this.notify();
      });
  }
  list(): Fiche[] {
    return [this.fiche];
  }
  get(id: string): Fiche | undefined {
    return id === this.fiche.id ? this.fiche : undefined;
  }
  listByClient(): Fiche[] {
    return [];
  }
  async add(_input?: NewFicheInput): Promise<string> {
    throw new Error("non utilisé dans ces tests");
  }
  async setInfo(_id: string, patch: FicheInfoPatch): Promise<void> {
    this.setInfoCalls.push(patch);
    await this.setInfoImpl(patch);
  }
  async setChamp(): Promise<void> {}
  async strikeChamp(): Promise<void> {}
  async restoreChamp(): Promise<void> {}
  async setStatus(): Promise<void> {}
  async advance(): Promise<void> {}
  async remove(): Promise<void> {}
  async removeMany(): Promise<void> {}
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
}

const EMPTY_PHOTOS: TissuPhoto[] = [];
class FakeMediaRepository implements MediaRepository {
  listFichePhotos(): TissuPhoto[] {
    return EMPTY_PHOTOS;
  }
  async addFichePhoto(): Promise<void> {}
  async removeFichePhoto(): Promise<void> {}
  getFicheVoiceNote(): VoiceNote | null {
    return null;
  }
  async setFicheVoiceNote(): Promise<void> {}
  getFicheSignature(): string | null {
    return null;
  }
  async setFicheSignature(): Promise<void> {}
  listModelePhotos(): TissuPhoto[] {
    return EMPTY_PHOTOS;
  }
  async addModelePhoto(): Promise<void> {}
  async removeModelePhoto(): Promise<void> {}
  listModelePatronPhotos(): TissuPhoto[] {
    return EMPTY_PHOTOS;
  }
  async addModelePatronPhoto(): Promise<void> {}
  async removeModelePatronPhoto(): Promise<void> {}
  async copyModeleMediaToFiche(): Promise<void> {}
  subscribe(): () => void {
    return () => {};
  }
}

const EMPTY_PAYMENTS: Payment[] = [];
const ZERO_BALANCE: FicheBalance = { price: 0, paid: 0, reste: 0 };

class FakePaymentRepository implements PaymentRepository {
  private listeners = new Set<() => void>();
  private status: RepositoryStatus = READY_STATUS;
  private paymentsMap = new Map<string, Payment[]>();
  private balances = new Map<string, FicheBalance>();
  private lastBalanceRefreshError: Error | null = null;
  readonly addCalls: AddPaymentInput[] = [];
  addImpl: (input: AddPaymentInput) => Promise<Payment>;
  hasCloudCapabilities: boolean;

  constructor(options: { balance?: FicheBalance; status?: RepositoryStatus; hasCloudCapabilities?: boolean; addImpl?: (input: AddPaymentInput) => Promise<Payment> } = {}) {
    this.status = options.status ?? READY_STATUS;
    this.hasCloudCapabilities = options.hasCloudCapabilities ?? true;
    if (options.balance) this.balances.set("f1", options.balance);
    this.addImpl =
      options.addImpl ??
      (async (input) => {
        const payment: Payment = { id: `p${Math.random()}`, ficheId: input.ficheId, amount: input.amount, paidAt: null, method: null, note: null, recordedAt: "x" };
        const current = this.paymentsMap.get(input.ficheId) ?? [];
        this.paymentsMap.set(input.ficheId, [...current, payment]);
        const prevBalance = this.balances.get(input.ficheId) ?? ZERO_BALANCE;
        this.balances.set(input.ficheId, { ...prevBalance, paid: prevBalance.paid + input.amount, reste: prevBalance.reste - input.amount });
        this.notify();
        return payment;
      });
  }
  list(ficheId: string): Payment[] {
    return this.paymentsMap.get(ficheId) ?? EMPTY_PAYMENTS;
  }
  getBalance(ficheId: string): FicheBalance {
    return this.balances.get(ficheId) ?? ZERO_BALANCE;
  }
  getStatus(): RepositoryStatus {
    return this.status;
  }
  setStatus(status: RepositoryStatus) {
    this.status = status;
    this.notify();
  }
  setBalance(ficheId: string, balance: FicheBalance) {
    this.balances.set(ficheId, balance);
    this.notify();
  }
  async add(input: AddPaymentInput): Promise<Payment> {
    this.addCalls.push(input);
    return this.addImpl(input);
  }
  getLastBalanceRefreshError(): Error | null {
    return this.hasCloudCapabilities ? this.lastBalanceRefreshError : null;
  }
  setLastBalanceRefreshError(error: Error | null) {
    this.lastBalanceRefreshError = error;
  }
  async refreshBalance(_ficheId: string): Promise<void> {}
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
}

function renderFicheDetail(fiches: FicheRepository, payments: PaymentRepository, media: MediaRepository = new FakeMediaRepository()) {
  const container = { ...createRepositoryContainerFor("local"), fiches, media, payments };
  return render(
    <RepositoryProvider repositories={container}>
      <MemoryRouter initialEntries={["/carnet/f1"]}>
        <Routes>
          <Route path="/" element={<p>Retour au carnet</p>} />
          <Route path="/carnet/:id" element={<FicheDetail />} />
        </Routes>
      </MemoryRouter>
    </RepositoryProvider>,
  );
}

/** `FabricPhotos` a lui aussi un bouton "Ajouter" (photo) sur la même page —
 * on scope la recherche au conteneur direct du champ "Nouveau montant" pour
 * cibler sans ambiguïté le bouton de `AvanceChampCell`. */
function getAvanceAjouterButton(): HTMLElement {
  const input = screen.getByLabelText("Nouveau montant");
  return within(input.closest("div")!).getByRole("button", { name: "Ajouter" });
}

describe("FicheDetail — AvanceChampCell (ledger, Phase 11A)", () => {
  it("A. taper un montant ne commit rien avant le clic sur Ajouter", async () => {
    const user = userEvent.setup();
    const fiches = new FakeFicheRepository(makeFiche());
    const payments = new FakePaymentRepository({ balance: { price: 10000, paid: 0, reste: 10000 } });
    renderFicheDetail(fiches, payments);

    await user.type(await screen.findByLabelText("Nouveau montant"), "5000");

    expect(payments.addCalls).toHaveLength(0);
  });

  it("B. clic sur Ajouter -> add() appelé EXACTEMENT une fois, avec le bon montant", async () => {
    const user = userEvent.setup();
    const fiches = new FakeFicheRepository(makeFiche());
    const payments = new FakePaymentRepository({ balance: { price: 10000, paid: 0, reste: 10000 } });
    renderFicheDetail(fiches, payments);

    fireEvent.change(await screen.findByLabelText("Nouveau montant"), { target: { value: "5000" } });
    await user.click(getAvanceAjouterButton());

    await waitFor(() => expect(payments.addCalls).toHaveLength(1));
    expect(payments.addCalls[0]).toMatchObject({ ficheId: "f1", amount: 5000 });
  });

  it("C. double clic rapide -> un seul add()", async () => {
    const user = userEvent.setup();
    const fiches = new FakeFicheRepository(makeFiche());
    const payments = new FakePaymentRepository({ balance: { price: 10000, paid: 0, reste: 10000 } });
    renderFicheDetail(fiches, payments);

    fireEvent.change(await screen.findByLabelText("Nouveau montant"), { target: { value: "5000" } });
    const button = getAvanceAjouterButton();
    await user.dblClick(button);

    await waitFor(() => expect(payments.addCalls.length).toBeGreaterThan(0));
    expect(payments.addCalls).toHaveLength(1);
  });

  it("D. succès : le draft est vidé, Total versé et Reste s'actualisent depuis le Repository", async () => {
    const user = userEvent.setup();
    const fiches = new FakeFicheRepository(makeFiche());
    const payments = new FakePaymentRepository({ balance: { price: 10000, paid: 0, reste: 10000 } });
    renderFicheDetail(fiches, payments);

    const input = await screen.findByLabelText("Nouveau montant");
    // 3000 (pas 5000) pour que "Total versé" (3 000) et "Reste" (7 000)
    // restent des valeurs DISTINCTES à l'écran — 10000-5000 aurait produit
    // deux "5 000" ambigus pour la requête ci-dessous.
    fireEvent.change(input, { target: { value: "3000" } });
    await user.click(getAvanceAjouterButton());

    await waitFor(() => expect(input).toHaveValue(""));
    expect(await screen.findByText("3 000")).toBeInTheDocument(); // Total versé actualisé
    expect(screen.getByText("7 000")).toBeInTheDocument(); // Reste actualisé
  });

  it("E. INSERT rejeté : le draft est conservé, message d'erreur visible", async () => {
    const user = userEvent.setup();
    const fiches = new FakeFicheRepository(makeFiche());
    const payments = new FakePaymentRepository({
      balance: { price: 10000, paid: 0, reste: 10000 },
      addImpl: async () => {
        throw new Error("refus RLS");
      },
    });
    renderFicheDetail(fiches, payments);

    const input = await screen.findByLabelText("Nouveau montant");
    fireEvent.change(input, { target: { value: "5000" } });
    await user.click(getAvanceAjouterButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(/n'a pas pu être enregistré/i);
    expect(input).toHaveValue(formatFCFA(5000)); // valeur RÉELLE de l'input — comparaison exacte, pas de normalisation RTL ici
  });

  it("F. loading : n'affiche jamais 'Total versé 0 F' / 'Reste 0 F' comme si c'était une donnée réelle", async () => {
    const fiches = new FakeFicheRepository(makeFiche());
    const payments = new FakePaymentRepository({ status: { status: "loading" } });
    renderFicheDetail(fiches, payments);

    expect(await screen.findByText("Chargement du solde…")).toBeInTheDocument();
    expect(screen.queryByText("Total versé")).not.toBeInTheDocument();
    expect(screen.queryByText("Reste")).not.toBeInTheDocument();
  });

  it("G. error : état erreur contrôlé affiché", async () => {
    const fiches = new FakeFicheRepository(makeFiche());
    const payments = new FakePaymentRepository({ status: { status: "error", error: new Error("hors ligne") } });
    renderFicheDetail(fiches, payments);

    expect(await screen.findByRole("alert")).toHaveTextContent(/solde n'a pas pu être chargé/i);
  });
});

describe("FicheDetail — surpaiement (§36) et frontière post-INSERT (§35)", () => {
  it("reste négatif affiché fidèlement (jamais tronqué à 0), libellé 'Trop-perçu'", async () => {
    const fiches = new FakeFicheRepository(makeFiche());
    const payments = new FakePaymentRepository({ balance: { price: 10000, paid: 12000, reste: -2000 } });
    renderFicheDetail(fiches, payments);

    expect(await screen.findByText("Trop-perçu")).toBeInTheDocument();
    expect(screen.getByText("2 000")).toBeInTheDocument();
  });

  it("INSERT réussi + refresh balance échoué -> message DISTINCT, jamais 'le versement n'a pas été ajouté'", async () => {
    const user = userEvent.setup();
    const fiches = new FakeFicheRepository(makeFiche());
    const payments = new FakePaymentRepository({ balance: { price: 10000, paid: 0, reste: 10000 } });
    renderFicheDetail(fiches, payments);

    // Simule : l'INSERT réussit (via addImpl par défaut) mais le refresh de
    // balance qui suit a échoué — signalé via getLastBalanceRefreshError().
    payments.setLastBalanceRefreshError(new Error("balance refresh down"));

    fireEvent.change(await screen.findByLabelText("Nouveau montant"), { target: { value: "5000" } });
    await user.click(getAvanceAjouterButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Versement enregistré. Le solde n'a pas pu être actualisé.");
    expect(alert).not.toHaveTextContent(/n'a pas été ajouté/i);
    expect(payments.addCalls).toHaveLength(1); // le versement EST bien enregistré
  });
});

describe("FicheDetail — prix serveur confirmé -> balance resynchronisée sans recalcul local (§28/§47)", () => {
  it("price 10 000→12 000 confirmé : reste passe de 6 000 à 8 000 via un VRAI refresh balance, jamais 12000-4000 calculé au composant", async () => {
    const fiches = new FakeFicheRepository(makeFiche({ price: 10000 }));
    const payments = new FakePaymentRepository({ balance: { price: 10000, paid: 4000, reste: 6000 } });
    let refreshBalanceCalls = 0;
    payments.refreshBalance = async (ficheId: string) => {
      refreshBalanceCalls += 1;
      // Simule la vraie réponse serveur (vue fiche_balances) après le changement de prix.
      payments.setBalance(ficheId, { price: 12000, paid: 4000, reste: 8000 });
    };
    renderFicheDetail(fiches, payments);

    expect(await screen.findByText("6 000")).toBeInTheDocument();

    const prixInput = screen.getByLabelText("Prix") as HTMLInputElement;
    fireEvent.change(prixInput, { target: { value: "12000" } });

    await waitFor(() => expect(refreshBalanceCalls).toBeGreaterThan(0));
    expect(await screen.findByText("8 000")).toBeInTheDocument();
  });
});

// Corr. Jakob's Law §14/§53 — Accueil/Commandes → fiche → Retour, déterministe.
describe("FicheDetail — Retour", () => {
  it("Retour -> / (jamais navigate(-1))", async () => {
    const user = userEvent.setup();
    const fiches = new FakeFicheRepository(makeFiche());
    const payments = new FakePaymentRepository({ balance: { price: 10000, paid: 0, reste: 10000 } });
    renderFicheDetail(fiches, payments);

    await user.click(await screen.findByRole("link", { name: "Retour" }));
    expect(await screen.findByText("Retour au carnet")).toBeInTheDocument();
  });
});
