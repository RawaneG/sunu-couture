import { useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import PageHeader from "../components/ui/PageHeader";
import PhotoCapture from "../components/ui/PhotoCapture";
import MeasurementsInput from "../components/ui/MeasurementsInput";
import DueDatePicker from "../components/ui/DueDatePicker";
import PriceInput from "../components/ui/PriceInput";
import GarmentPicker from "../components/ui/GarmentPicker";
import ColorSwatchPicker from "../components/ui/ColorSwatchPicker";
import ClientPickerSheet from "../components/ui/ClientPickerSheet";
import Avatar from "../components/ui/Avatar";
import { IconCheck, IconUsers, IconChevronRight, IconX } from "../lib/icons";
import { nextDays } from "../lib/format";
import { detectDominantColor } from "../lib/color";
import { haptic } from "../lib/haptics";
import type { VoiceNote } from "../lib/types";

export default function OrderNew() {
  const navigate = useNavigate();
  const clients = useStore((s) => s.clients);
  const addOrder = useStore((s) => s.addOrder);

  const [clientId, setClientId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [garment, setGarment] = useState("");
  const [fabricColor, setFabricColor] = useState("#2d3a6b");
  const [colorDetected, setColorDetected] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(null);
  const [measurementsText, setMeasurementsText] = useState("");
  const [dueDate, setDueDate] = useState(nextDays(1, 3)[0]);
  const [dueDateStart, setDueDateStart] = useState<string | null>(null);
  const [price, setPrice] = useState(0);

  const selectedClient = clients.find((c) => c.id === clientId);
  const canSubmit = Boolean(garment.trim() && clientId);

  async function handlePhotoChange(url: string | null) {
    setPhoto(url);
    if (!url) {
      setColorDetected(false);
      return;
    }
    try {
      const hex = await detectDominantColor(url);
      setFabricColor(hex);
      setColorDetected(true);
    } catch {
      setColorDetected(false);
    }
  }

  function handleSubmit() {
    if (!canSubmit || !clientId) return;
    haptic(16);
    const id = addOrder({
      clientId,
      garment: garment.trim(),
      fabricColor,
      photo,
      voiceNote,
      measurementsText: measurementsText.trim() || null,
      dueDate,
      dueDateStart,
      price,
    });
    navigate(`/commandes/${id}`);
  }

  return (
    <div>
      <PageHeader title="Nouvelle commande" backTo="/commandes" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="px-4 lg:px-10 py-4 lg:py-8 max-w-3xl lg:max-w-5xl lg:mx-auto"
      >
        <div className="glass-card rounded-2xl p-4 lg:rounded-3xl lg:shadow-soft lg:p-10">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-7">
            <section className="min-w-0 flex flex-col gap-5">
              <Field label="Client">
                {selectedClient ? (
                  <div className="glass-chip flex items-center gap-3 rounded-2xl px-3.5 py-2.5">
                    <Avatar photo={selectedClient.photo} seed={selectedClient.colorSeed} size={42} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold">{selectedClient.name}</span>
                      <span className="block text-[11.5px] text-ink-faint tabular-nums">
                        {selectedClient.phone || "Numéro non renseigné"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="glass-input flex-none rounded-full px-3 py-1.5 text-[11.5px] font-bold text-indigo"
                    >
                      Changer
                    </button>
                    <button
                      type="button"
                      onClick={() => setClientId(null)}
                      className="glass-input flex h-8 w-8 flex-none items-center justify-center rounded-full text-ink-faint"
                      aria-label="Retirer le client"
                    >
                      <IconX size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="glass-chip flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-line-strong px-3.5 py-3 text-left hover:bg-surface-3 transition-colors"
                  >
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface-3 text-ink-faint">
                      <IconUsers size={16} />
                    </span>
                    <span className="flex-1 text-[13.5px] font-bold text-ink-soft">Choisir un client</span>
                    <IconChevronRight size={16} className="text-ink-faint" />
                  </button>
                )}
              </Field>

              <Field label="Vêtement">
                <GarmentPicker value={garment} onChange={setGarment} />
              </Field>

              <Field label="Photo">
                <PhotoCapture value={photo} onChange={handlePhotoChange} />
              </Field>

              <Field label="Couleur du tissu">
                <ColorSwatchPicker
                  value={fabricColor}
                  onChange={(hex) => {
                    setFabricColor(hex);
                    setColorDetected(false);
                  }}
                  detected={colorDetected}
                />
              </Field>
            </section>

            <section className="min-w-0 flex flex-col gap-5">
              <Field label="Mesures">
                <MeasurementsInput
                  voiceValue={voiceNote}
                  onVoiceChange={setVoiceNote}
                  textValue={measurementsText}
                  onTextChange={setMeasurementsText}
                />
              </Field>

              <Field label="Date de livraison">
                <DueDatePicker
                  dueDate={dueDate}
                  dueDateStart={dueDateStart}
                  onChange={(end, start) => {
                    setDueDate(end);
                    setDueDateStart(start);
                  }}
                />
              </Field>

              <Field label="Prix">
                <PriceInput value={price} onChange={setPrice} />
              </Field>

              <motion.button
                type="button"
                whileTap={canSubmit ? { scale: 0.97 } : undefined}
                disabled={!canSubmit}
                onClick={handleSubmit}
                className={clsx(
                  "mt-auto flex items-center justify-center gap-2 rounded-2xl px-4 py-4 font-bold text-white shadow-soft transition-colors",
                  canSubmit ? "bg-amber-tile text-[#2a1c04]" : "bg-surface-3 text-ink-faint"
                )}
              >
                <IconCheck size={18} strokeWidth={2} />
                Valider la commande
              </motion.button>
            </section>
          </div>
        </div>
      </motion.div>

      <ClientPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          setClientId(id);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</p>
      {children}
    </div>
  );
}
