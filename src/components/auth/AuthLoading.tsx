// État de chargement court après confirmation du PIN (corr. Gate Auth §54) —
// jamais un spinner indéfini sans texte : un message très simple, accessible
// (`role="status"`, annoncé aux lecteurs d'écran), le temps que le serveur
// termine register()/login(). Même style que l'état de chargement de
// RequireAuth (cohérence visuelle du parcours auth).
export default function AuthLoading({ text }: { text: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-semibold text-ink-soft">{text}</p>
    </div>
  );
}
