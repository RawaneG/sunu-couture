import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import { IconCheck, IconAlert, IconDownload, IconShieldCheck, IconSquare, IconCheckSquare } from "../lib/icons";
import { haptic } from "../lib/haptics";
import { buildLegacyBackup, serializeLegacyBackup, verifyLegacyBackup, legacyBackupFileName, type BackupVerificationResult } from "../lib/legacyBackup";
import { saveLegacyBackupToIndexedDb, type LegacyIndexedDbOutcome } from "../lib/legacyIndexedDbBackup";
import { buildLegacyPreview, overrideKey, type LegacyOriginOverrides } from "../lib/legacyPreview";
import type { LegacyOrigin } from "../lib/legacyClassification";

// Phase 6A — assistant de sauvegarde/prévisualisation (docs/refonte/02-PLAN-MIGRATION.md
// §5.1, corrections A et G). AUCUNE écriture Supabase ici : lecture locale seule,
// fichier téléchargé, copie IndexedDB de secours, prévisualisation. L'import
// effectif (bouton « Importer ») est Phase 6B et reste désactivé sur cet écran.

function StepCard({
  number,
  title,
  done,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-2xl p-4 lg:rounded-3xl lg:p-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          className={
            "flex h-7 w-7 flex-none items-center justify-center rounded-full text-[13px] font-bold " +
            (done ? "bg-teal text-white" : "bg-surface-3 text-ink-faint")
          }
        >
          {done ? <IconCheck size={14} strokeWidth={2.4} /> : number}
        </span>
        <h2 className="text-[15px] font-bold text-ink">{title}</h2>
      </div>
      <div className="pl-10 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function VerificationBadge({ result }: { result: BackupVerificationResult }) {
  if (result.ok) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-teal-tint px-3 py-2.5 text-[13px] font-semibold text-teal">
        <IconShieldCheck size={16} />
        Sauvegarde vérifiée : {result.counts.clients} client(s), {result.counts.fiches} fiche(s), {result.counts.modeles} modèle(s)
        {result.legacyMediaCount > 0 ? `, ${result.legacyMediaCount} média(s)` : ""}.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-terracotta-tint px-3 py-2.5 text-[13px] font-semibold text-terracotta">
      <span className="flex items-center gap-2">
        <IconAlert size={16} />
        Vérification échouée — ne pas continuer.
      </span>
      {result.mismatches.map((m) => (
        <span key={m} className="font-normal pl-6">
          {m}
        </span>
      ))}
    </div>
  );
}

function IndexedDbBadge({ outcome }: { outcome: LegacyIndexedDbOutcome }) {
  if (outcome.status === "saved") {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-teal-tint px-3 py-2.5 text-[13px] font-semibold text-teal">
        <IconShieldCheck size={16} />
        Copie de secours enregistrée sur l'appareil.
      </p>
    );
  }
  if (outcome.status === "quota_exceeded") {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-terracotta-tint px-3 py-2.5 text-[13px] font-semibold text-terracotta">
        <IconAlert size={16} />
        Mémoire du téléphone pleine — libérez de l'espace, puis réessayez. Le fichier téléchargé reste votre sauvegarde principale.
      </p>
    );
  }
  if (outcome.status === "skipped_insufficient_quota") {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-terracotta-tint px-3 py-2.5 text-[13px] font-semibold text-terracotta">
        <IconAlert size={16} />
        Pas assez de place estimée sur l'appareil — copie de secours ignorée. Le fichier téléchargé reste votre sauvegarde principale.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-xl bg-surface-3 px-3 py-2.5 text-[13px] font-semibold text-ink-faint">
      <IconAlert size={16} />
      Copie de secours indisponible sur cet appareil. Le fichier téléchargé reste votre sauvegarde principale.
    </p>
  );
}

export default function LegacySauvegarde() {
  // Un unique instantané pris à l'ouverture de l'écran — pas recalculé à
  // chaque changement du store le temps que le tailleur suive le parcours.
  // C'est la SEULE source utilisée par le téléchargement, la vérification ET
  // la prévisualisation : comparer avec une lecture ultérieure du store
  // (useClients/useFiches/useModeles, retirées ici) comparerait deux instants
  // différents et produirait un faux `counts_mismatch` si les repositories
  // changent pendant que le tailleur suit le parcours (Phase 6A, correction
  // review « snapshot de vérification incohérent »).
  const [backup] = useState(() => buildLegacyBackup());
  const serialized = useMemo(() => serializeLegacyBackup(backup), [backup]);
  const fileName = useMemo(() => legacyBackupFileName(), []);

  const [downloaded, setDownloaded] = useState(false);
  const [verification, setVerification] = useState<BackupVerificationResult | null>(null);
  const [indexedDbState, setIndexedDbState] = useState<"idle" | "checking">("idle");
  const [indexedDbOutcome, setIndexedDbOutcome] = useState<LegacyIndexedDbOutcome | null>(null);
  const [overrides, setOverrides] = useState<LegacyOriginOverrides>({});

  const preview = useMemo(() => buildLegacyPreview(backup.normalized, overrides), [backup, overrides]);

  function handleDownload() {
    haptic(16);
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Révocation différée : selon le navigateur, le traitement du clic (et
    // donc le vrai démarrage du téléchargement) peut être asynchrone —
    // révoquer l'Object URL dans la même pile d'exécution que a.click() peut
    // l'interrompre. setTimeout(0) laisse le navigateur amorcer le
    // téléchargement avant qu'on libère l'URL (Phase 6A, correction review).
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setDownloaded(true);
  }

  function handleVerify() {
    haptic(8);
    // La comparaison porte entièrement sur CE snapshot (backup.normalized +
    // backup.rawStorageValue) — jamais sur un état plus récent du store ou un
    // nouveau localStorage.getItem() — voir legacyBackup.ts et la note sur
    // `backup` ci-dessus.
    setVerification(verifyLegacyBackup({ normalized: backup.normalized, rawStorageValue: backup.rawStorageValue }, serialized));
  }

  async function handleIndexedDbBackup() {
    haptic(8);
    setIndexedDbState("checking");
    // saveLegacyBackupToIndexedDb() ne lance jamais (toute erreur devient un
    // outcome "unavailable"/"quota_exceeded") — le try/finally est une défense
    // en profondeur : même si une future implémentation recommençait à
    // rejeter, l'écran ne resterait jamais bloqué sur "checking".
    try {
      const outcome = await saveLegacyBackupToIndexedDb(serialized);
      setIndexedDbOutcome(outcome);
    } finally {
      setIndexedDbState("idle");
    }
  }

  function toggleOrigin(kind: "client" | "fiche" | "modele", id: string, current: LegacyOrigin) {
    haptic(6);
    const next: LegacyOrigin = current === "reel" ? "demo" : "reel";
    setOverrides((prev) => ({ ...prev, [overrideKey(kind, id)]: next }));
  }

  const canVerify = downloaded;
  const canIndexedDb = verification?.ok === true;

  return (
    <div>
      <PageHeader title="Sauvegarde des données" backTo="/" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="px-4 lg:px-10 py-4 lg:py-8 max-w-2xl lg:mx-auto flex flex-col gap-4"
      >
        <p className="text-[13px] font-semibold text-ink-faint px-1">
          Cet écran prépare la future migration vers le cloud — aucune donnée n'est envoyée nulle part ici. Ceci
          n'est pas encore une migration.
        </p>

        <StepCard number={1} title="Analyse des données" done>
          <p className="text-[13px] font-semibold text-ink">
            {backup.counts.clients} client(s) · {backup.counts.fiches} fiche(s) · {backup.counts.modeles} modèle(s) trouvés sur cet appareil.
          </p>
          {backup.rawParseError && (
            <p className="flex items-center gap-2 rounded-xl bg-terracotta-tint px-3 py-2.5 text-[13px] font-semibold text-terracotta">
              <IconAlert size={16} />
              Certaines données n'ont pas pu être lues ({backup.rawParseError}). La sauvegarde continue avec ce qui est lisible.
            </p>
          )}
        </StepCard>

        <StepCard number={2} title="Télécharger la sauvegarde" done={downloaded}>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 rounded-2xl bg-amber-tile px-4 py-3.5 font-bold text-[#2a1c04] shadow-soft"
          >
            <IconDownload size={18} strokeWidth={2} />
            {downloaded ? "Télécharger à nouveau" : "Télécharger le fichier"} ({fileName})
          </motion.button>
        </StepCard>

        <StepCard number={3} title="Vérification de la sauvegarde" done={verification?.ok === true}>
          <motion.button
            type="button"
            whileTap={canVerify ? { scale: 0.97 } : undefined}
            disabled={!canVerify}
            onClick={handleVerify}
            className={
              "flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 font-bold shadow-soft transition-colors " +
              (canVerify ? "bg-amber-tile text-[#2a1c04]" : "bg-surface-3 text-ink-faint")
            }
          >
            <IconShieldCheck size={18} strokeWidth={2} />
            Vérifier la sauvegarde générée
          </motion.button>
          {!canVerify && <p className="text-[12px] font-semibold text-ink-faint">Téléchargez d'abord la sauvegarde (étape 2).</p>}
          {verification && <VerificationBadge result={verification} />}
        </StepCard>

        <StepCard number={4} title="Copie locale de secours" done={indexedDbOutcome?.status === "saved"}>
          <motion.button
            type="button"
            whileTap={canIndexedDb ? { scale: 0.97 } : undefined}
            disabled={!canIndexedDb || indexedDbState === "checking"}
            onClick={handleIndexedDbBackup}
            className={
              "flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 font-bold shadow-soft transition-colors " +
              (canIndexedDb ? "bg-amber-tile text-[#2a1c04]" : "bg-surface-3 text-ink-faint")
            }
          >
            <IconShieldCheck size={18} strokeWidth={2} />
            {indexedDbState === "checking" ? "Vérification de la place disponible…" : "Faire une copie de secours sur l'appareil"}
          </motion.button>
          {!canIndexedDb && <p className="text-[12px] font-semibold text-ink-faint">Vérifiez d'abord la sauvegarde (étape 3).</p>}
          {indexedDbOutcome && <IndexedDbBadge outcome={indexedDbOutcome} />}
        </StepCard>

        <StepCard number={5} title="Prévisualisation de la migration" done={false}>
          <p className="text-[13px] font-semibold text-ink">
            {preview.toImport.clients} client(s), {preview.toImport.fiches} fiche(s), {preview.toImport.modeles} modèle(s) seront
            importés. {preview.ignoredDemo} élément(s) de démonstration seront ignorés.
          </p>

          {preview.anomalyItems.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-terracotta-tint px-3 py-2.5 text-[13px] font-semibold text-terracotta">
              <span className="flex items-center gap-2">
                <IconAlert size={16} />
                {preview.anomalyItems.length} élément(s) à vérifier avant l'import (rien n'est supprimé) :
              </span>
              {preview.anomalyItems.map((item) => (
                <span key={item.kind + item.id} className="font-normal pl-6">
                  {item.label} — {item.anomalies.join(", ")}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <p className="text-[12px] font-semibold text-ink-faint px-1">
              Corrigez au besoin (Réel ↔ Démo) — n'affecte que la future migration, jamais les données d'origine.
            </p>
            <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
              {preview.items.map((item) => (
                <button
                  key={item.kind + item.id}
                  type="button"
                  onClick={() => toggleOrigin(item.kind, item.id, item.origin)}
                  className="flex items-center gap-2.5 rounded-xl bg-surface-3/50 px-3 py-2.5 text-left"
                >
                  {item.origin === "reel" ? (
                    <IconCheckSquare size={18} className="flex-none text-teal" />
                  ) : (
                    <IconSquare size={18} className="flex-none text-ink-faint" />
                  )}
                  <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-ink">{item.label}</span>
                  <span
                    className={
                      "flex-none rounded-full px-2 py-0.5 text-[11px] font-bold " +
                      (item.origin === "reel" ? "bg-teal-tint text-teal" : "bg-surface-3 text-ink-faint")
                    }
                  >
                    {item.origin === "reel" ? "Réel" : "Démo"}
                  </span>
                </button>
              ))}
              {preview.items.length === 0 && <p className="text-[13px] font-semibold text-ink-faint px-1">Aucune donnée trouvée sur cet appareil.</p>}
            </div>
          </div>

          <button
            type="button"
            disabled
            aria-disabled
            title="Non disponible en Phase 6A — la migration effective arrive en Phase 6B"
            className="flex items-center justify-center gap-2 rounded-2xl bg-surface-3 px-4 py-3.5 font-bold text-ink-faint cursor-not-allowed"
          >
            Importer maintenant — non disponible à cette étape
          </button>
        </StepCard>
      </motion.div>
    </div>
  );
}
