import { Navigate, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useStore } from "../lib/store";
import PageHeader from "../components/ui/PageHeader";
import FicheChampCell from "../components/ui/FicheChampCell";
import FabricPhotos from "../components/ui/FabricPhotos";
import SignaturePad from "../components/ui/SignaturePad";
import { IconTrash, IconX } from "../lib/icons";
import { haptic } from "../lib/haptics";
import { formatFullDate, toDateInputValue, fromDateInputValue } from "../lib/format";
import { FICHE_MESURE_KEYS, FICHE_MESURE_LABELS, FICHE_INFO_KEYS, FICHE_INFO_LABELS } from "../lib/types";

export default function FicheDetail() {
  const { id } = useParams();
  const fiches = useStore((s) => s.fiches);
  const setFicheInfo = useStore((s) => s.setFicheInfo);
  const setFicheChamp = useStore((s) => s.setFicheChamp);
  const strikeFicheChamp = useStore((s) => s.strikeFicheChamp);
  const addFicheTissuPhoto = useStore((s) => s.addFicheTissuPhoto);
  const removeFicheTissuPhoto = useStore((s) => s.removeFicheTissuPhoto);
  const deleteFiche = useStore((s) => s.deleteFiche);
  const navigate = useNavigate();

  const fiche = fiches.find((f) => f.id === id);

  if (!fiche) return <Navigate to="/carnet" replace />;

  function handleDelete() {
    if (!fiche) return;
    if (!window.confirm(`Supprimer la fiche n° ${fiche.numero} ?`)) return;
    haptic(16);
    deleteFiche(fiche.id);
    navigate("/carnet");
  }

  const deleteButton = (
    <button
      type="button"
      onClick={handleDelete}
      aria-label="Supprimer la fiche"
      className="glass-chip flex h-8 w-8 flex-none items-center justify-center rounded-full text-terracotta lg:h-10 lg:w-10"
    >
      <IconTrash size={15} />
    </button>
  );

  return (
    <div>
      <PageHeader title={`Fiche n° ${fiche.numero}`} backTo="/clients/carnet" actions={deleteButton} />

      <motion.div
        key={fiche.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="px-4 lg:px-10 py-4 lg:py-8 max-w-2xl lg:mx-auto"
      >
        <div className="glass-card rounded-2xl p-4 lg:rounded-3xl lg:shadow-soft lg:p-8">
          <h1 className="font-display italic font-bold text-2xl text-balance text-center">Fiche de mesure</h1>

          <div className="mt-5 flex flex-col gap-2">
            <NomField
              label="Nom"
              value={fiche.nom}
              onChange={(v) => setFicheInfo(fiche.id, { nom: v })}
            />
            <NomField
              label="Prénom"
              value={fiche.prenom}
              onChange={(v) => setFicheInfo(fiche.id, { prenom: v })}
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
                  numeric={key !== "tissusDeposes"}
                />
              ))}

              <FicheDateField
                label="Retrait le"
                value={fiche.retraitLe}
                onChange={(v) => setFicheInfo(fiche.id, { retraitLe: v })}
              />
              <FicheDateField
                label="Soldé le"
                value={fiche.soldeLe}
                onChange={(v) => setFicheInfo(fiche.id, { soldeLe: v })}
              />

              <div className="mt-4">
                <p className="mb-2 text-[13px] font-bold text-ink-soft">Photos du tissu</p>
                <FabricPhotos
                  photos={fiche.tissuPhotos}
                  onAdd={(dataUrl) => addFicheTissuPhoto(fiche.id, dataUrl)}
                  onRemove={(photoId) => removeFicheTissuPhoto(fiche.id, photoId)}
                />
              </div>

              <div className="mt-4">
                <p className="mb-2 text-[13px] font-bold text-ink-soft">Signature client</p>
                <SignaturePad
                  value={fiche.signature}
                  onChange={(dataUrl) => setFicheInfo(fiche.id, { signature: dataUrl })}
                />
              </div>
            </section>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function NomField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-baseline gap-2 border-b border-dotted border-line-strong py-2">
      <span className="flex-none text-[13px] font-bold text-ink-soft">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="min-w-0 flex-1 bg-transparent text-right text-[15px] font-extrabold outline-none placeholder:font-normal placeholder:text-ink-faint/40"
      />
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
    <label className="relative flex items-baseline gap-2 border-b border-dotted border-line-strong py-2.5">
      <span className="flex-none text-[13px] font-bold text-ink-soft">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <span className={clsx("text-[15px] font-extrabold tabular-nums", !value && "text-ink-faint/40 font-semibold")}>
          {value ? formatFullDate(value) : "jj / mm / aaaa"}
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
