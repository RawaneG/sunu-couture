import { describe, expect, it } from "vitest";
import { buildLegacyPreview, overrideKey } from "./legacyPreview";
import { seedClients, seedFiches } from "./store";
import type { Client, Fiche } from "./types";

function realClient(overrides: Partial<Client> = {}): Client {
  return { id: "c-real-1", name: "Client réel", phone: "70 111 22 33", photo: null, colorSeed: "amber", ...overrides };
}

describe("buildLegacyPreview — counts", () => {
  it("counts demo seed items as ignored, not as to-import", () => {
    const report = buildLegacyPreview({ clients: [seedClients[0]], fiches: [seedFiches[0]], modeles: [] });
    expect(report.toImport).toEqual({ clients: 0, fiches: 0, modeles: 0 });
    expect(report.ignoredDemo).toBe(2);
  });

  it("counts real items as to-import", () => {
    const client = realClient();
    const report = buildLegacyPreview({ clients: [client], fiches: [], modeles: [] });
    expect(report.toImport.clients).toBe(1);
    expect(report.ignoredDemo).toBe(0);
  });

  it("separates anomalies without dropping them from the item list", () => {
    const blankClient = realClient({ id: "c-blank", name: "", phone: "" });
    const report = buildLegacyPreview({ clients: [blankClient], fiches: [], modeles: [] });
    expect(report.anomalyItems).toHaveLength(1);
    expect(report.items).toHaveLength(1); // still present, not removed
    expect(report.anomalyItems[0].anomalies.length).toBeGreaterThan(0);
  });
});

describe("buildLegacyPreview — manual override", () => {
  it("lets an operator override a detected origin, changing the counts", () => {
    const client = realClient();
    const overrides = { [overrideKey("client", client.id)]: "demo" as const };
    const report = buildLegacyPreview({ clients: [client], fiches: [], modeles: [] }, overrides);
    const item = report.items.find((i) => i.id === client.id)!;
    expect(item.detectedOrigin).toBe("reel");
    expect(item.origin).toBe("demo");
    expect(report.toImport.clients).toBe(0);
    expect(report.ignoredDemo).toBe(1);
  });

  it("does not mutate the original client/fiche objects when applying an override", () => {
    const client = realClient();
    const frozenSnapshot = JSON.stringify(client);
    const overrides = { [overrideKey("client", client.id)]: "demo" as const };
    buildLegacyPreview({ clients: [client], fiches: [], modeles: [] }, overrides);
    expect(JSON.stringify(client)).toBe(frozenSnapshot);
  });

  it("keeps detectedOrigin as the deterministic ground truth even when overridden", () => {
    const seedClient = seedClients[0];
    const overrides = { [overrideKey("client", seedClient.id)]: "reel" as const };
    const report = buildLegacyPreview({ clients: [seedClient], fiches: [], modeles: [] }, overrides);
    const item = report.items[0];
    expect(item.detectedOrigin).toBe("demo");
    expect(item.origin).toBe("reel");
  });
});

describe("buildLegacyPreview — fiche anomalies", () => {
  function fiche(overrides: Partial<Fiche> = {}): Fiche {
    return {
      id: "f-real-1", carnetNumero: 1, numero: 1, nom: "X", prenom: "Y", telephone: "70",
      clientId: null, champs: {} as Fiche["champs"], voiceNote: null, tissuPhotos: [],
      dueDate: null, soldeLe: null, signature: null, price: 1000, avance: 0,
      garment: "", description: null, fabricColor: "#000", status: "recu", late: false,
      createdAt: "2026-01-01T00:00:00.000Z", ...overrides,
    };
  }

  it("flags an unparseable dueDate as an anomaly without discarding the fiche", () => {
    const report = buildLegacyPreview({ clients: [], fiches: [fiche({ dueDate: "not-a-date" })], modeles: [] });
    expect(report.anomalyItems).toHaveLength(1);
    expect(report.items).toHaveLength(1);
  });

  it("does not flag a valid, parseable dueDate", () => {
    const report = buildLegacyPreview({ clients: [], fiches: [fiche({ dueDate: "2026-09-01T00:00:00.000Z" })], modeles: [] });
    expect(report.anomalyItems).toHaveLength(0);
  });
});
