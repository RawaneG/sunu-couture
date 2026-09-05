import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useRepositories } from "../repositories/RepositoryProvider";
import PageHeader from "../components/ui/PageHeader";
import ClientFields from "../components/ui/ClientFields";
import { IconCheck } from "../lib/icons";
import { haptic } from "../lib/haptics";

export default function ClientNew() {
  const navigate = useNavigate();
  const { clients: clientRepository } = useRepositories();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    haptic(16);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const id = await clientRepository.add({ name, phone, photo });
      navigate(`/clients/${id}`);
    } catch {
      setSubmitError("Le client n'a pas pu être enregistré. Réessaie.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Nouveau client" backTo="/clients" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="px-4 lg:px-10 py-4 lg:py-8 max-w-md lg:mx-auto"
      >
        <div className="glass-card rounded-2xl p-4 lg:rounded-3xl lg:shadow-soft lg:p-10 flex flex-col gap-5">
          <ClientFields
            photo={photo}
            onPhotoChange={setPhoto}
            name={name}
            onNameChange={setName}
            phone={phone}
            onPhoneChange={setPhone}
            autoFocusName
          />

          {submitError && (
            <p role="alert" className="text-[13px] font-semibold text-terracotta">
              {submitError}
            </p>
          )}

          <motion.button
            type="button"
            whileTap={canSubmit ? { scale: 0.97 } : undefined}
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={
              "mt-2 flex items-center justify-center gap-2 rounded-2xl px-4 py-4 font-bold shadow-soft transition-colors " +
              (canSubmit ? "bg-amber-tile text-[#2a1c04]" : "bg-surface-3 text-ink-faint")
            }
          >
            <IconCheck size={18} strokeWidth={2} />
            Ajouter le client
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
