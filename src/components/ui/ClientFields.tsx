import PhotoCapture from "./PhotoCapture";
import { formatSenegalLocalNumber } from "../../lib/phone";

export default function ClientFields({
  photo,
  onPhotoChange,
  name,
  onNameChange,
  phone,
  onPhoneChange,
  autoFocusName,
}: {
  photo: string | null;
  onPhotoChange: (url: string | null) => void;
  name: string;
  onNameChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  autoFocusName?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-faint">Photo</p>
        <PhotoCapture value={photo} onChange={onPhotoChange} crop shape="circle" label="Ajouter" />
      </div>

      <div>
        <label htmlFor="client-name" className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          Nom
        </label>
        <input
          id="client-name"
          autoFocus={autoFocusName}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Nom du client"
          className="glass-input w-full rounded-2xl px-4 py-3 text-sm font-semibold outline-none placeholder:text-ink-faint focus:bg-surface-3"
        />
      </div>

      <div>
        <label htmlFor="client-phone" className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          Téléphone
        </label>
        <input
          id="client-phone"
          value={phone}
          onChange={(e) => onPhoneChange(formatSenegalLocalNumber(e.target.value))}
          placeholder="77 000 00 00"
          inputMode="tel"
          className="glass-input w-full rounded-2xl px-4 py-3 text-sm font-semibold outline-none placeholder:text-ink-faint focus:bg-surface-3"
        />
      </div>
    </div>
  );
}
