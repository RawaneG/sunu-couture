import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import PageHeader from "../components/ui/PageHeader";
import ClientFields from "../components/ui/ClientFields";
import { IconCheck } from "../lib/icons";
import { haptic } from "../lib/haptics";

export default function ClientNew() {
  const navigate = useNavigate();
  const addClient = useStore((s) => s.addClient);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    haptic(16);
    const id = addClient({ name, phone, photo });
    navigate(`/clients/${id}`);
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
        <div className="lg:rounded-3xl lg:bg-surface lg:shadow-soft lg:p-10 flex flex-col gap-5">
          <ClientFields
            photo={photo}
            onPhotoChange={setPhoto}
            name={name}
            onNameChange={setName}
            phone={phone}
            onPhoneChange={setPhone}
            autoFocusName
          />

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
