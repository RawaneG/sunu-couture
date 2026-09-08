// Pavé PIN — composant contrôlé, réutilisé par CreatePinFlow/PinLogin
// (corr. Gate Auth §14). Deux surfaces d'entrée synchronisées sur le MÊME
// état :
//   - un `<input>` réel mais visuellement masqué (`sr-only`), pour le
//     clavier physique ET le clavier numérique mobile natif (mieux qu'un
//     pavé 100% décoratif : un vrai contrôle de formulaire, annoncé
//     correctement par les lecteurs d'écran) ;
//   - un pavé numérique VISIBLE, touches rondes façon bouton réel (grand
//     diamètre, relief `.glass-chip` + ombre portée) pour la saisie au
//     doigt — chaque touche reste un vrai `<button>` avec son propre
//     `aria-label`.
// PIN toujours exactement 4 chiffres (par défaut) — aucun caractère non
// numérique n'est jamais accepté (corr. Gate Auth §14).
import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import PinDots from "./PinDots";
import { IconBackspace } from "../../lib/icons";
import { haptic } from "../../lib/haptics";

interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Label accessible du champ cible (ex. "Choisis ton code"). */
  label: string;
  /** Déclenche une secousse légère (erreur) — respecte prefers-reduced-motion. */
  shake?: boolean;
}

const KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "backspace"],
];

const KEY_SIZE = 68;

export default function PinPad({ value, onChange, onComplete, length = 4, disabled, autoFocus, label, shake }: PinPadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();
  const completedRef = useRef(false);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (value.length === length && !completedRef.current) {
      completedRef.current = true;
      onComplete?.(value);
    }
    if (value.length < length) completedRef.current = false;
    // `onComplete` volontairement absent des deps : il change à chaque rendu
    // côté appelant (closure sur l'état local de la page) — seule la VALEUR
    // doit déclencher cet effet, jamais une identité de fonction instable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, length]);

  function appendDigit(d: string) {
    if (disabled || value.length >= length) return;
    haptic(8);
    onChange(value + d);
  }

  function backspace() {
    if (disabled || value.length === 0) return;
    haptic(8);
    onChange(value.slice(0, -1));
  }

  return (
    <motion.div
      animate={shake && !reducedMotion ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center gap-7"
    >
      {/* Champ réel — clavier physique + clavier numérique mobile natif. */}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        maxLength={length}
        autoComplete="off"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, length))}
        className="sr-only"
      />

      <PinDots length={length} filled={value.length} />

      {/* `tabIndex={-1}` : retiré de l'ordre de tabulation clavier (le champ
          réel ci-dessus reste l'unique cible clavier, pour ne jamais avoir
          deux façons concurrentes de taper au clavier) — mais PAS
          `aria-hidden` : ces boutons restent de vrais contrôles, explorables
          au toucher par un lecteur d'écran mobile (VoiceOver/TalkBack). */}
      <div role="group" aria-label="Pavé numérique" className="grid grid-cols-3 gap-4">
        {KEYPAD_ROWS.flat().map((key, i) => {
          if (key === "") return <div key={i} aria-hidden="true" style={{ width: KEY_SIZE, height: KEY_SIZE }} />;
          if (key === "backspace") {
            return (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                aria-label="Effacer le dernier chiffre"
                onClick={backspace}
                disabled={disabled || value.length === 0}
                style={{ width: KEY_SIZE, height: KEY_SIZE }}
                className="flex items-center justify-center rounded-full text-ink-soft transition-all duration-100 active:scale-90 disabled:opacity-30"
              >
                <IconBackspace size={24} />
              </button>
            );
          }
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onClick={() => appendDigit(key)}
              disabled={disabled}
              style={{
                width: KEY_SIZE,
                height: KEY_SIZE,
                boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.16), 0 10px 20px -12px rgba(36, 28, 52, 0.55), 0 1px 2px rgba(36, 28, 52, 0.12)",
              }}
              className="glass-chip flex items-center justify-center rounded-full text-2xl font-bold text-ink transition-all duration-100 active:scale-90 active:shadow-none disabled:opacity-30"
            >
              {key}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
