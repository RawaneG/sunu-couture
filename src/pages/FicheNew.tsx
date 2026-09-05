import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useRepositories } from "../repositories/RepositoryProvider";
import { useClient, useFiches } from "../repositories/hooks";
import PageHeader from "../components/ui/PageHeader";
import FicheChampCell from "../components/ui/FicheChampCell";
import { IconCheck, IconPhone } from "../lib/icons";
import { haptic } from "../lib/haptics";
import { sanitizePhone } from "../lib/format";
import { FICHE_MESURE_KEYS, FICHE_MESURE_LABELS, FICHE_INFO_KEYS, FICHE_INFO_LABELS } from "../lib/types";
import type { FicheChampKey } from "../lib/types";
import { emptyFicheDraft, isMeaningfulFicheDraft, type FicheDraft } from "../lib/ficheDraft";

/**
 * « Nouvelle fiche » — Phase 9A (corr. R). Ce n'est plus un écran qui crée
 * puis redirige : il édite un BROUILLON 100 % local (`FicheDraft`, jamais une
 * `Fiche` persistée — pas de `numero`/`carnetNumero`) jusqu'à validation
 * explicite. Ouvrir cet écran, le remplir, ou même le quitter sans valider
 * ne crée AUCUNE fiche, AUCUN carnet, ne consomme AUCUN numéro — voir
 * `docs/refonte/03-DECISIONS.md` corr. L/R et `isMeaningfulFicheDraft()`.
 */
export default function FicheNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // `?client=<id>` (pas un objet client sérialisé dans l'URL) : survit à un
  // reload, le contexte client est reconstruit depuis le Repository.
  const clientId = searchParams.get("client");
  const { fiches: ficheRepository } = useRepositories();
  const allFiches = useFiches();
  const clientState = useClient(clientId ?? "");

  const [draft, setDraft] = useState<FicheDraft>(emptyFicheDraft);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Évite de reprérremplir à chaque rerender une fois le client résolu — le
  // tailleur peut ensuite librement modifier/effacer les champs prérempils.
  const prefilledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!clientId || clientState.status !== "ready" || prefilledRef.current === clientId) return;
    const client = clientState.data;
    if (!client) return;
    prefilledRef.current = clientId;
    // Même logique de préremplissage que l'ancien `ClientDetail.handleNewFiche` :
    // dernières mesures connues du client, nom/prénom/téléphone déduits de
    // `Client.name` (aucune heuristique nouvelle — comportement conservé).
    const lastFiche = allFiches
      .filter((f) => f.clientId === clientId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    const [prenom, ...rest] = client.name.trim().split(/\s+/);
    setDraft((current) => {
      const champs = { ...current.champs };
      if (lastFiche) {
        for (const key of Object.keys(champs) as FicheChampKey[]) {
          champs[key] = { valeur: lastFiche.champs[key]?.valeur ?? "", historique: [] };
        }
      }
      return { ...current, clientId, prenom: prenom ?? "", nom: rest.join(" "), telephone: client.phone, champs };
    });
  }, [clientId, clientState, allFiches]);

  const meaningful = useMemo(() => isMeaningfulFicheDraft(draft), [draft]);

  function setChampValeur(key: FicheChampKey, valeur: string) {
    setDraft((d) => ({ ...d, champs: { ...d.champs, [key]: { ...d.champs[key], valeur } } }));
  }
  // Historique tenu localement pour l'expérience de saisie (le tailleur peut
  // rayer/restaurer une valeur pendant qu'il remplit le brouillon) — mais une
  // fiche NOUVELLEMENT créée démarre toujours avec un historique vide : rayer
  // une valeur pas encore enregistrée n'est pas une "correction" au sens du
  // carnet papier, juste une saisie pas encore validée (voir `handleCreate`,
  // qui n'envoie que `valeur` via `prefillChamps`, jamais `historique`).
  function strikeChamp(key: FicheChampKey) {
    setDraft((d) => {
      const current = d.champs[key];
      if (!current.valeur.trim()) return d;
      return { ...d, champs: { ...d.champs, [key]: { valeur: "", historique: [...current.historique, current.valeur] } } };
    });
  }
  function restoreChamp(key: FicheChampKey) {
    setDraft((d) => {
      const current = d.champs[key];
      const last = current.historique.at(-1);
      if (last === undefined) return d;
      return { ...d, champs: { ...d.champs, [key]: { valeur: last, historique: current.historique.slice(0, -1) } } };
    });
  }

  async function handleCreate() {
    if (creating) return;
    if (!isMeaningfulFicheDraft(draft)) {
      haptic();
      setError("Ajoute au moins un nom, un téléphone, une mesure, un vêtement ou une description avant de créer la fiche.");
      return;
    }
    haptic(16);
    setCreating(true);
    setError(null);
    try {
      const id = await ficheRepository.add({
        clientId: draft.clientId,
        nom: draft.nom,
        prenom: draft.prenom,
        telephone: draft.telephone,
        garment: draft.garment,
        description: draft.description,
        prefillChamps: Object.fromEntries(
          (Object.keys(draft.champs) as FicheChampKey[]).map((key) => [key, draft.champs[key].valeur]),
        ),
      });
      navigate(`/carnet/${id}`, { replace: true });
    } catch {
      setError("La fiche n'a pas pu être créée. Le brouillon est conservé — réessaie.");
      setCreating(false);
    }
  }

  const headerActions = (
    <button
      type="button"
      onClick={() => void handleCreate()}
      disabled={creating}
      aria-label="Créer la fiche"
      className="glass-chip flex h-8 w-8 flex-none items-center justify-center rounded-full text-teal shadow-soft ring-1 ring-line-strong/40 disabled:opacity-40 lg:h-10 lg:w-10"
    >
      <IconCheck size={16} />
    </button>
  );

  return (
    <div>
      <PageHeader title="Nouvelle fiche" backTo="/" actions={headerActions} />

      {error && (
        <p role="alert" className="px-4 pt-2 text-[13px] font-semibold text-terracotta lg:px-10">
          {error}
        </p>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="px-4 lg:px-10 py-4 lg:py-8 max-w-2xl lg:mx-auto"
      >
        <div className="glass-card rounded-2xl p-4 lg:rounded-3xl lg:shadow-soft lg:p-8">
          <h1 className="font-display italic font-bold text-2xl text-balance text-center">Fiche de mesure</h1>
          <p className="mt-1 text-center text-[11px] font-bold uppercase tracking-wide text-ink-faint">Brouillon — pas encore enregistrée</p>

          <div className="mt-5 flex flex-col gap-2">
            <NomField label="Nom" value={draft.nom} onChange={(v) => setDraft((d) => ({ ...d, nom: v }))} />
            <NomField label="Prénom" value={draft.prenom} onChange={(v) => setDraft((d) => ({ ...d, prenom: v }))} />
            <TelephoneField value={draft.telephone} onChange={(v) => setDraft((d) => ({ ...d, telephone: v }))} />
          </div>

          <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
            <section className="flex flex-col">
              {FICHE_MESURE_KEYS.map((key) => (
                <FicheChampCell
                  key={key}
                  label={FICHE_MESURE_LABELS[key]}
                  champ={draft.champs[key]}
                  onChange={(v) => setChampValeur(key, v)}
                  onStrike={() => strikeChamp(key)}
                  onRestore={() => restoreChamp(key)}
                />
              ))}
            </section>

            <section className="mt-4 flex flex-col sm:mt-0">
              {FICHE_INFO_KEYS.map((key) => (
                <FicheChampCell
                  key={key}
                  label={FICHE_INFO_LABELS[key]}
                  champ={draft.champs[key]}
                  onChange={(v) => setChampValeur(key, v)}
                  onStrike={() => strikeChamp(key)}
                  onRestore={() => restoreChamp(key)}
                />
              ))}

              <NomField label="Vêtement" value={draft.garment} onChange={(v) => setDraft((d) => ({ ...d, garment: v }))} />
              <NomField label="Description" value={draft.description} onChange={(v) => setDraft((d) => ({ ...d, description: v }))} />
            </section>
          </div>
        </div>

        <motion.button
          type="button"
          whileTap={!creating ? { scale: 0.97 } : undefined}
          disabled={creating}
          onClick={() => void handleCreate()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-tile px-4 py-3.5 font-bold text-[#2a1c04] shadow-soft disabled:opacity-50"
        >
          <IconCheck size={17} strokeWidth={2} />
          {creating ? "Création…" : "Créer la fiche"}
        </motion.button>
        {!meaningful && (
          <p className="mt-2 text-center text-[12px] text-ink-faint">
            Ajoute une information pour activer la création.
          </p>
        )}
      </motion.div>
    </div>
  );
}

function NomField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-dotted border-line-strong py-2">
      <span className="flex-none text-[13px] font-bold text-ink-soft">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="min-w-22 flex-1 bg-transparent text-right text-[15px] font-extrabold outline-none placeholder:font-normal placeholder:text-ink-faint/40"
      />
    </label>
  );
}

function TelephoneField({ value = "", onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const digits = value.replace(/\s/g, "");
  return (
    <label className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-dotted border-line-strong py-2">
      <span className="flex-none text-[13px] font-bold text-ink-soft">Téléphone</span>
      <span className="flex min-w-22 flex-1 items-center justify-end gap-2">
        <input
          value={value}
          onChange={(e) => onChange(sanitizePhone(e.target.value))}
          type="tel"
          inputMode="numeric"
          placeholder="77 000 00 00"
          className="min-w-0 flex-1 bg-transparent text-right text-[15px] font-extrabold tabular-nums outline-none placeholder:font-normal placeholder:text-ink-faint/40"
        />
        {digits && (
          <a
            href={`tel:${digits}`}
            aria-label={`Appeler le ${value}`}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-teal text-white active:scale-90 transition-transform"
          >
            <IconPhone size={12} />
          </a>
        )}
      </span>
    </label>
  );
}
