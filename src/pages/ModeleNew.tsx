import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useRepositories } from "../repositories/RepositoryProvider";

/**
 * "Nouveau modèle" isn't a form screen — it creates the record and drops the
 * tailor straight into ModeleDetail's in-place editing, same as FicheNew.
 */
export default function ModeleNew() {
  const { modeles: modeleRepository } = useRepositories();
  const navigate = useNavigate();
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    const id = modeleRepository.add();
    navigate(`/catalogue/${id}`, { replace: true });
  }, [modeleRepository, navigate]);

  return null;
}
