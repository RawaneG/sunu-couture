// Phase 6A — prévisualisation chiffrée (docs/refonte/02-PLAN-MIGRATION.md §5.1.4).
// Structure volontairement réutilisable telle quelle par la Phase 6B (import
// effectif) — ce module ne fait ni lecture ni écriture, seulement du calcul pur
// sur des données déjà normalisées.
import type { Client, Fiche } from "./types";
import { classifyClientOrigin, classifyFicheOrigin, classifyModeleOrigin, type LegacyOrigin } from "./legacyClassification";
import type { LegacyNormalizedData } from "./legacyBackup";

export type LegacyItemKind = "client" | "fiche" | "modele";

export interface LegacyPreviewItem {
  kind: LegacyItemKind;
  id: string;
  label: string;
  /** Résultat de la règle déterministe — ne change jamais après coup. */
  detectedOrigin: LegacyOrigin;
  /** `detectedOrigin`, ajusté par une éventuelle correction manuelle — c'est
   * cette valeur qui compte pour la prévisualisation/future migration. */
  origin: LegacyOrigin;
  /** Non vide ⇒ affiché séparément (§7) — jamais supprimé silencieusement. */
  anomalies: string[];
}

export interface LegacyPreviewReport {
  generatedAt: string;
  items: LegacyPreviewItem[];
  toImport: { clients: number; fiches: number; modeles: number };
  ignoredDemo: number;
  anomalyItems: LegacyPreviewItem[];
}

/** Clé stable identifiant une ligne pour la table de corrections manuelles. */
export type LegacyOriginOverrides = Record<string, LegacyOrigin>;

export function overrideKey(kind: LegacyItemKind, id: string): string {
  return `${kind}:${id}`;
}

function ficheLabel(f: Fiche): string {
  const name = [f.prenom, f.nom].filter((s) => s.trim()).join(" ").trim();
  return `Fiche n°${f.numero}${name ? " — " + name : ""}`;
}

function clientAnomalies(c: Client): string[] {
  const anomalies: string[] = [];
  if (!c.name.trim() && !c.phone.trim()) anomalies.push("Aucun nom ni téléphone — client non identifiable");
  return anomalies;
}

function ficheAnomalies(f: Fiche): string[] {
  const anomalies: string[] = [];
  if (f.dueDate !== null && Number.isNaN(Date.parse(f.dueDate))) anomalies.push("Date de retrait illisible");
  if (f.price < 0) anomalies.push("Prix négatif");
  if (f.avance < 0) anomalies.push("Avance négative");
  return anomalies;
}

/**
 * Construit le rapport de prévisualisation à partir des données déjà
 * normalisées (`migrateLegacyState()`/`buildLegacyBackup().normalized`) et
 * d'éventuelles corrections manuelles de classification. Ne modifie jamais
 * `data` — une correction n'est qu'un choix d'affichage/import futur.
 */
export function buildLegacyPreview(
  data: LegacyNormalizedData,
  overrides: LegacyOriginOverrides = {},
  now: Date = new Date(),
): LegacyPreviewReport {
  const items: LegacyPreviewItem[] = [];

  for (const c of data.clients) {
    const detectedOrigin = classifyClientOrigin(c);
    items.push({
      kind: "client",
      id: c.id,
      label: c.name.trim() || "Client sans nom",
      detectedOrigin,
      origin: overrides[overrideKey("client", c.id)] ?? detectedOrigin,
      anomalies: clientAnomalies(c),
    });
  }
  for (const f of data.fiches) {
    const detectedOrigin = classifyFicheOrigin(f);
    items.push({
      kind: "fiche",
      id: f.id,
      label: ficheLabel(f),
      detectedOrigin,
      origin: overrides[overrideKey("fiche", f.id)] ?? detectedOrigin,
      anomalies: ficheAnomalies(f),
    });
  }
  for (const m of data.modeles) {
    const detectedOrigin = classifyModeleOrigin(m);
    items.push({
      kind: "modele",
      id: m.id,
      label: m.nom.trim() || "Modèle sans nom",
      detectedOrigin,
      origin: overrides[overrideKey("modele", m.id)] ?? detectedOrigin,
      anomalies: [],
    });
  }

  const toImport = {
    clients: items.filter((i) => i.kind === "client" && i.origin === "reel").length,
    fiches: items.filter((i) => i.kind === "fiche" && i.origin === "reel").length,
    modeles: items.filter((i) => i.kind === "modele" && i.origin === "reel").length,
  };
  const ignoredDemo = items.filter((i) => i.origin === "demo").length;
  const anomalyItems = items.filter((i) => i.anomalies.length > 0);

  return { generatedAt: now.toISOString(), items, toImport, ignoredDemo, anomalyItems };
}
