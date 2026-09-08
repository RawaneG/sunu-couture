import { useState } from "react";
import clsx from "clsx";
import { IconX } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import { formatFCFA } from "../../lib/format";

/** Same row shape/typography/interaction as FicheChampCell — Prix/Avance/Reste sit in the
 * exact table position they occupy on the paper sheet. Prix is typed directly, like every
 * other champ. Avance (Phase 11A) devient un ledger : le tailleur ne remplace plus un
 * montant, il AJOUTE un versement — voir AvanceChampCell. Reste reste dérivé, jamais
 * modifiable directement. */

function MontantChampCell({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  function handleInput(raw: string) {
    const digits = raw.replace(/\D/g, "");
    onChange(digits ? Math.min(9999999, parseInt(digits, 10)) : 0);
  }
  return (
    <label className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-dotted border-line-strong py-2.5">
      <span className="flex-none text-[13px] font-bold text-ink-soft">{label}</span>
      <span className="flex min-w-22 flex-1 items-center justify-end gap-1.5">
        <input
          value={value ? formatFCFA(value) : ""}
          onChange={(e) => handleInput(e.target.value)}
          inputMode="numeric"
          placeholder="—"
          className="min-w-0 flex-1 bg-transparent text-right text-[15px] font-extrabold tabular-nums outline-none placeholder:font-normal placeholder:text-ink-faint/40"
        />
        {value > 0 && (
          <button
            type="button"
            onClick={() => {
              haptic();
              onChange(0);
            }}
            aria-label={`Effacer ${label.toLowerCase()}`}
            className="flex-none text-ink-faint/70 active:text-terracotta"
          >
            <IconX size={12} />
          </button>
        )}
      </span>
    </label>
  );
}

export function PrixChampCell({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <MontantChampCell label="Prix" value={value} onChange={onChange} />;
}

/** Aligné sur la contrainte réelle du ledger (`client_payments.amount > 0`,
 * entier) — voir `paymentAmountSchema`. */
function isValidPaymentAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount > 0;
}

/**
 * Phase 11A — remplace l'ancien champ "remplacer l'avance" par un ledger
 * minimal : "Total versé" (lecture seule, dérivé du Repository) + un champ de
 * saisie LOCAL pour le NOUVEAU montant + un bouton "Ajouter" qui commite
 * exactement UN versement (`PaymentRepository.add()`). Taper ne déclenche
 * jamais d'écriture réseau — seul le clic sur "Ajouter" le fait (§30/§31).
 */
export function AvanceChampCell({ totalVerse, onAdd }: { totalVerse: number; onAdd: (amount: number) => Promise<void> }) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = draft ? parseInt(draft, 10) : 0;
  const canSubmit = isValidPaymentAmount(amount) && !pending;

  function handleInput(raw: string) {
    const digits = raw.replace(/\D/g, "");
    setDraft(digits ? String(Math.min(9999999, parseInt(digits, 10))) : "");
  }

  async function handleAdd() {
    if (!canSubmit) return; // garde double-submit (§32)
    haptic(16);
    setPending(true);
    setError(null);
    try {
      await onAdd(amount);
      setDraft("");
    } catch {
      setError("Le versement n'a pas pu être enregistré. Réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-b border-dotted border-line-strong py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="flex-none text-[13px] font-bold text-ink-soft">Total versé</span>
        <span className="flex-1 text-right text-[15px] font-extrabold tabular-nums">{formatFCFA(totalVerse)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="sr-only" htmlFor="avance-nouveau-montant">
          Nouveau montant
        </label>
        <input
          id="avance-nouveau-montant"
          value={draft ? formatFCFA(Number(draft)) : ""}
          onChange={(e) => handleInput(e.target.value)}
          inputMode="numeric"
          placeholder="Nouveau montant"
          disabled={pending}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong/40 bg-surface px-3 py-2 text-right text-[14px] font-bold tabular-nums outline-none focus:border-indigo"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={!canSubmit}
          className="min-h-11 flex-none rounded-full bg-amber-tile px-3.5 py-2 text-[13px] font-bold text-[#2a1c04] shadow-soft active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
        >
          Ajouter
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-[12.5px] font-semibold text-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}

/** Phase 11A — `reste` reflète la vraie valeur (peut être négatif en cas de
 * surpaiement, `public.fiche_balances`) : plus jamais tronqué à 0
 * silencieusement. Un surpaiement reste visuellement distinct (libellé dédié)
 * sans fausser le montant affiché — l'UX détaillée du surpaiement appartient
 * à la Phase 11 complète. */
export function ResteChampCell({ reste }: { reste: number }) {
  const solde = reste <= 0;
  const surpaiement = reste < 0;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-dotted border-line-strong py-2.5">
      <span className="flex-none text-[13px] font-bold text-ink-soft">{surpaiement ? "Trop-perçu" : "Reste"}</span>
      <span className={clsx("flex-1 text-right text-[15px] font-extrabold tabular-nums", solde ? "text-teal" : "text-terracotta")}>
        {formatFCFA(Math.abs(reste))}
      </span>
    </div>
  );
}
