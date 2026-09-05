import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRepositories } from "../repositories/RepositoryProvider";

/**
 * "Nouveau modèle" isn't a form screen — it creates the record and drops the
 * tailor straight into ModeleDetail's in-place editing, same as FicheNew.
 *
 * Comportement métier inchangé en Phase 7A — voir FicheNew.tsx pour la même
 * remarque (correction éventuelle hors périmètre 7A, seule la signature
 * asynchrone de `add()` est adaptée ici).
 */
export default function ModeleNew() {
  const { modeles: modeleRepository } = useRepositories();
  const navigate = useNavigate();
  const createdRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const id = await modeleRepository.add();
        if (!cancelled) navigate(`/catalogue/${id}`, { replace: true });
      } catch {
        if (!cancelled) setError("Le modèle n'a pas pu être créé. Réessaie.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modeleRepository, navigate]);

  if (error) {
    return (
      <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-terracotta">{error}</p>
      </div>
    );
  }

  return null;
}
