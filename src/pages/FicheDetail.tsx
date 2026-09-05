import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useFiche, useClient } from "../repositories/hooks";
import { useRepositories } from "../repositories/RepositoryProvider";
import PageHeader from "../components/ui/PageHeader";
import VoiceRecorder from "../components/ui/VoiceRecorder";
import FicheChampCell from "../components/ui/FicheChampCell";
import { PrixChampCell, AvanceChampCell, ResteChampCell } from "../components/ui/FichePaiementCells";
import FabricPhotos from "../components/ui/FabricPhotos";
import ModelePickerSheet from "../components/ui/ModelePickerSheet";
import SignaturePad from "../components/ui/SignaturePad";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { IconTrash, IconX, IconPhone } from "../lib/icons";
import { haptic } from "../lib/haptics";
import { formatFullDateWithYear, toDateInputValue, fromDateInputValue, sanitizePhone } from "../lib/format";
import { detectDominantColor } from "../lib/color";
import { FICHE_MESURE_KEYS, FICHE_MESURE_LABELS, FICHE_INFO_KEYS, FICHE_INFO_LABELS } from "../lib/types";
import type { Modele, FicheChampKey } from "../lib/types";
import type { FicheInfoPatch } from "../repositories/FicheRepository";

export default function FicheDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { fiches: ficheRepository, media: mediaRepository, payments: paymentRepository } = useRepositories();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const ficheState = useFiche(id ?? "");
  // `useClient` ne peut pas être appelé conditionnellement (règle des Hooks) —
  // une chaîne vide ne correspond à aucun id, comportement identique à avant.
  // `loading`/`error` dégradent silencieusement vers "pas de client" ici :
  // c'est un affichage secondaire (téléphone de secours), jamais une
  // redirection — seule l'absence de la FICHE elle-même en déclenche une,
  // et seulement une fois l'hydratation terminée (voir plus bas).
  const clientState = useClient(ficheState.status === "ready" ? (ficheState.data?.clientId ?? "") : "");
  const client = clientState.status === "ready" ? clientState.data : undefined;

  if (ficheState.status === "loading") {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-ink-soft">Chargement de la fiche…</p>
      </div>
    );
  }
  if (ficheState.status === "error") {
    return (
      <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-terracotta">
          La fiche n'a pas pu être chargée. Vérifie ta connexion et réessaie.
        </p>
      </div>
    );
  }
  // Ici, et seulement ici (status === "ready"), `undefined` signifie
  // réellement "introuvable" — jamais pendant un chargement en cours.
  const fiche = ficheState.data;
  if (!fiche) return <Navigate to="/" replace />;

  const phoneDigits = (fiche.telephone || client?.phone || "").replace(/\s/g, "");

  // Écritures fiche — la mutation Zustand locale reste immédiate ; l'échec
  // (réseau, validation) est surfacé sans jamais devenir un rejet non géré.
  // Expressions `const` (pas des déclarations `function`) : nécessaire pour
  // que TypeScript conserve le rétrécissement de `fiche` (non-`undefined`,
  // vérifié juste au-dessus) à l'intérieur de ces fermetures.
  const writeFicheInfo = (patch: FicheInfoPatch) => {
    ficheRepository.setInfo(fiche.id, patch).catch(() => {
      setWriteError("Une modification n'a pas pu être enregistrée. Réessaie.");
    });
  };
  const writeFicheChamp = (key: FicheChampKey, valeur: string) => {
    ficheRepository.setChamp(fiche.id, key, valeur).catch(() => {
      setWriteError("Une modification n'a pas pu être enregistrée. Réessaie.");
    });
  };
  const writeStrikeChamp = (key: FicheChampKey) => {
    ficheRepository.strikeChamp(fiche.id, key).catch(() => {
      setWriteError("Une modification n'a pas pu être enregistrée. Réessaie.");
    });
  };
  const writeRestoreChamp = (key: FicheChampKey) => {
    ficheRepository.restoreChamp(fiche.id, key).catch(() => {
      setWriteError("Une modification n'a pas pu être enregistrée. Réessaie.");
    });
  };

  const handleDelete = async () => {
    haptic(16);
    try {
      await ficheRepository.remove(fiche.id);
      navigate("/", { replace: true });
    } catch {
      setWriteError("La suppression a échoué. Réessaie.");
    }
  };

  const handleAddPhoto = async (dataUrl: string) => {
    const isFirstPhoto = fiche.tissuPhotos.length === 0;
    try {
      await mediaRepository.addFichePhoto(fiche.id, dataUrl);
    } catch {
      setWriteError("La photo n'a pas pu être ajoutée. Réessaie.");
      return;
    }
    if (isFirstPhoto) {
      try {
        const hex = await detectDominantColor(dataUrl);
        writeFicheInfo({ fabricColor: hex });
      } catch {
        // couleur non détectée automatiquement — le tailleur peut toujours l'ajuster
      }
    }
  };

  const handleRemovePhoto = (photoId: string) => {
    mediaRepository.removeFichePhoto(fiche.id, photoId).catch(() => {
      setWriteError("La suppression de la photo a échoué. Réessaie.");
    });
  };

  const handlePickModele = async (modele: Modele) => {
    haptic(16);
    const photos = [...modele.photos, ...modele.patronPhotos];
    try {
      for (const photo of photos) await mediaRepository.addFichePhoto(fiche.id, photo.dataUrl);
    } catch {
      setWriteError("Certaines photos n'ont pas pu être ajoutées. Réessaie.");
    }
    setCatalogueOpen(false);
  };

  const headerActions = (
    <>
      {phoneDigits && (
        <a
          href={`tel:${phoneDigits}`}
          onClick={() => haptic(12)}
          aria-label="Appeler le client"
          className="glass-chip flex h-8 w-8 flex-none items-center justify-center rounded-full text-teal shadow-soft ring-1 ring-line-strong/40 lg:h-10 lg:w-10"
        >
          <IconPhone size={14} />
        </a>
      )}
      <button
        type="button"
        onClick={() => {
          haptic();
          setConfirmDeleteOpen(true);
        }}
        aria-label="Supprimer la fiche"
        className="glass-chip flex h-8 w-8 flex-none items-center justify-center rounded-full text-terracotta shadow-soft ring-1 ring-line-strong/40 lg:h-10 lg:w-10"
      >
        <IconTrash size={15} />
      </button>
    </>
  );

  return (
    <div>
      <PageHeader title={`Fiche n° ${fiche.numero}`} backTo="/" actions={headerActions} />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Supprimer la fiche n° ${fiche.numero} ?`}
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDeleteOpen(false)}
      />

      {writeError && (
        <p role="alert" className="px-4 pt-2 text-[13px] font-semibold text-terracotta lg:px-10">
          {writeError}
        </p>
      )}

      <motion.div
        key={fiche.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="px-4 lg:px-10 py-4 lg:py-8 max-w-2xl lg:mx-auto"
      >
        {/* Fiche de mesure — réplique fidèle du carnet papier : mêmes champs, même ordre. */}
        <div className="glass-card rounded-2xl p-4 lg:rounded-3xl lg:shadow-soft lg:p-8">
          <h1 className="font-display italic font-bold text-2xl text-balance text-center">Fiche de mesure</h1>
          <p className="mt-1 text-center text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Carnet n° {fiche.carnetNumero}
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <NomField label="Nom" value={fiche.nom} onChange={(v) => writeFicheInfo({ nom: v })} />
            <NomField label="Prénom" value={fiche.prenom} onChange={(v) => writeFicheInfo({ prenom: v })} />
            <TelephoneField value={fiche.telephone} onChange={(v) => writeFicheInfo({ telephone: v })} />
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[13px] font-bold text-ink-soft">Note vocale</p>
            <VoiceRecorder
              value={fiche.voiceNote}
              onChange={(v) => writeFicheInfo({ voiceNote: v })}
              label="cette fiche"
              persist
            />
          </div>

          <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
            <section className="flex flex-col">
              {FICHE_MESURE_KEYS.map((key) => (
                <FicheChampCell
                  key={key}
                  label={FICHE_MESURE_LABELS[key]}
                  champ={fiche.champs[key]}
                  onChange={(v) => writeFicheChamp(key, v)}
                  onStrike={() => writeStrikeChamp(key)}
                  onRestore={() => writeRestoreChamp(key)}
                />
              ))}
            </section>

            <section className="mt-4 flex flex-col sm:mt-0">
              {FICHE_INFO_KEYS.map((key) => (
                <FicheChampCell
                  key={key}
                  label={FICHE_INFO_LABELS[key]}
                  champ={fiche.champs[key]}
                  onChange={(v) => writeFicheChamp(key, v)}
                  onStrike={() => writeStrikeChamp(key)}
                  onRestore={() => writeRestoreChamp(key)}
                />
              ))}

              <PrixChampCell value={fiche.price} onChange={(price) => writeFicheInfo({ price })} />
              <AvanceChampCell value={fiche.avance} onChange={(avance) => writeFicheInfo({ avance })} />
              <ResteChampCell reste={paymentRepository.getBalance(fiche.id).reste} />

              <FicheDateField label="Retrait le" value={fiche.dueDate} onChange={(v) => writeFicheInfo({ dueDate: v })} />
              <FicheDateField label="Soldé le" value={fiche.soldeLe} onChange={(v) => writeFicheInfo({ soldeLe: v })} />

              <div className="mt-4">
                <p className="mb-2 text-[13px] font-bold text-ink-soft">Photos du tissu</p>
                <FabricPhotos
                  photos={fiche.tissuPhotos}
                  onAdd={handleAddPhoto}
                  onRemove={handleRemovePhoto}
                  onPickCatalogue={() => setCatalogueOpen(true)}
                />
              </div>

              <div className="mt-4">
                <p className="mb-2 text-[13px] font-bold text-ink-soft">Signature client</p>
                <SignaturePad value={fiche.signature} onChange={(dataUrl) => writeFicheInfo({ signature: dataUrl })} />
              </div>
            </section>
          </div>
        </div>

      </motion.div>

      {catalogueOpen && <ModelePickerSheet onSelect={handlePickModele} onClose={() => setCatalogueOpen(false)} />}
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

function FicheDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  return (
    <label className="relative flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-dotted border-line-strong py-2.5">
      <span className="flex-none text-[13px] font-bold text-ink-soft">{label}</span>
      <span className="flex min-w-22 flex-1 items-center justify-end gap-1.5">
        <span className={clsx("text-[15px] font-extrabold tabular-nums", !value && "text-ink-faint/40 font-semibold")}>
          {value ? formatFullDateWithYear(value) : "jj / mm / aaaa"}
        </span>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              haptic();
              onChange(null);
            }}
            aria-label={`Effacer ${label}`}
            className="flex-none text-ink-faint/70 active:text-terracotta"
          >
            <IconX size={12} />
          </button>
        )}
      </span>
      <input
        type="date"
        value={value ? toDateInputValue(value) : ""}
        onChange={(e) => onChange(e.target.value ? fromDateInputValue(e.target.value) : null)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={label}
      />
    </label>
  );
}
