import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useStore, resteFor } from "../lib/store";
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
import type { Modele } from "../lib/types";

export default function FicheDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fiches = useStore((s) => s.fiches);
  const clients = useStore((s) => s.clients);
  const setFicheInfo = useStore((s) => s.setFicheInfo);
  const setFicheChamp = useStore((s) => s.setFicheChamp);
  const strikeFicheChamp = useStore((s) => s.strikeFicheChamp);
  const restoreFicheChamp = useStore((s) => s.restoreFicheChamp);
  const addFicheTissuPhoto = useStore((s) => s.addFicheTissuPhoto);
  const removeFicheTissuPhoto = useStore((s) => s.removeFicheTissuPhoto);
  const deleteFiche = useStore((s) => s.deleteFiche);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);

  const fiche = fiches.find((f) => f.id === id);
  if (!fiche) return <Navigate to="/" replace />;

  const client = fiche.clientId ? clients.find((c) => c.id === fiche.clientId) : undefined;
  const phoneDigits = (fiche.telephone || client?.phone || "").replace(/\s/g, "");

  function handleDelete() {
    if (!fiche) return;
    haptic(16);
    deleteFiche(fiche.id);
    navigate("/", { replace: true });
  }

  async function handleAddPhoto(dataUrl: string) {
    if (!fiche) return;
    const isFirstPhoto = fiche.tissuPhotos.length === 0;
    addFicheTissuPhoto(fiche.id, dataUrl);
    if (isFirstPhoto) {
      try {
        const hex = await detectDominantColor(dataUrl);
        setFicheInfo(fiche.id, { fabricColor: hex });
      } catch {
        // couleur non détectée automatiquement — le tailleur peut toujours l'ajuster
      }
    }
  }

  function handlePickModele(modele: Modele) {
    if (!fiche) return;
    haptic(16);
    const photos = [...modele.photos, ...modele.patronPhotos];
    for (const photo of photos) addFicheTissuPhoto(fiche.id, photo.dataUrl);
    setCatalogueOpen(false);
  }

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
            <NomField label="Nom" value={fiche.nom} onChange={(v) => setFicheInfo(fiche.id, { nom: v })} />
            <NomField label="Prénom" value={fiche.prenom} onChange={(v) => setFicheInfo(fiche.id, { prenom: v })} />
            <TelephoneField value={fiche.telephone} onChange={(v) => setFicheInfo(fiche.id, { telephone: v })} />
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[13px] font-bold text-ink-soft">Note vocale</p>
            <VoiceRecorder
              value={fiche.voiceNote}
              onChange={(v) => setFicheInfo(fiche.id, { voiceNote: v })}
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
                  onChange={(v) => setFicheChamp(fiche.id, key, v)}
                  onStrike={() => strikeFicheChamp(fiche.id, key)}
                  onRestore={() => restoreFicheChamp(fiche.id, key)}
                />
              ))}
            </section>

            <section className="mt-4 flex flex-col sm:mt-0">
              {FICHE_INFO_KEYS.map((key) => (
                <FicheChampCell
                  key={key}
                  label={FICHE_INFO_LABELS[key]}
                  champ={fiche.champs[key]}
                  onChange={(v) => setFicheChamp(fiche.id, key, v)}
                  onStrike={() => strikeFicheChamp(fiche.id, key)}
                  onRestore={() => restoreFicheChamp(fiche.id, key)}
                />
              ))}

              <PrixChampCell value={fiche.price} onChange={(price) => setFicheInfo(fiche.id, { price })} />
              <AvanceChampCell value={fiche.avance} onChange={(avance) => setFicheInfo(fiche.id, { avance })} />
              <ResteChampCell reste={resteFor(fiche)} />

              <FicheDateField label="Retrait le" value={fiche.dueDate} onChange={(v) => setFicheInfo(fiche.id, { dueDate: v })} />
              <FicheDateField label="Soldé le" value={fiche.soldeLe} onChange={(v) => setFicheInfo(fiche.id, { soldeLe: v })} />

              <div className="mt-4">
                <p className="mb-2 text-[13px] font-bold text-ink-soft">Photos du tissu</p>
                <FabricPhotos
                  photos={fiche.tissuPhotos}
                  onAdd={handleAddPhoto}
                  onRemove={(photoId) => removeFicheTissuPhoto(fiche.id, photoId)}
                  onPickCatalogue={() => setCatalogueOpen(true)}
                />
              </div>

              <div className="mt-4">
                <p className="mb-2 text-[13px] font-bold text-ink-soft">Signature client</p>
                <SignaturePad value={fiche.signature} onChange={(dataUrl) => setFicheInfo(fiche.id, { signature: dataUrl })} />
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
