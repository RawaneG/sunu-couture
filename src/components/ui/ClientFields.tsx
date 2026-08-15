import PhotoCapture from "./PhotoCapture";

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
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Nom</p>
        <input
          autoFocus={autoFocusName}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Nom du client"
          className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm font-semibold outline-none placeholder:text-ink-faint focus:bg-surface-3"
        />
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Téléphone</p>
        <input
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="77 000 00 00"
          inputMode="tel"
          className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm font-semibold outline-none placeholder:text-ink-faint focus:bg-surface-3"
        />
      </div>
    </div>
  );
}
