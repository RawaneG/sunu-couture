import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRepositories } from "../repositories/RepositoryProvider";

/**
 * "Nouvelle fiche" isn't a form screen — it creates the record (next carnet
 * slot assigned) and drops the tailor straight into FicheDetail's in-place
 * editing, the same screen used to review any existing fiche.
 *
 * Comportement métier inchangé en Phase 7A (création immédiate) — corrigé en
 * Phase 9A, pas ici. Seule la signature asynchrone de `add()` est adaptée :
 * une écriture réseau ne peut pas renvoyer un id de façon synchrone.
 */
export default function FicheNew() {
  const { fiches: ficheRepository } = useRepositories();
  const navigate = useNavigate();
  const createdRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const id = await ficheRepository.add();
        if (!cancelled) navigate(`/carnet/${id}`, { replace: true });
      } catch {
        if (!cancelled) setError("La fiche n'a pas pu être créée. Réessaie.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ficheRepository, navigate]);

  if (error) {
    return (
      <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-terracotta">{error}</p>
      </div>
    );
  }

  return null;
}
