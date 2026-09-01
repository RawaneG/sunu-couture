import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useRepositories } from "../repositories/RepositoryProvider";

/**
 * "Nouvelle fiche" isn't a form screen — it creates the record (next carnet
 * slot assigned) and drops the tailor straight into FicheDetail's in-place
 * editing, the same screen used to review any existing fiche.
 */
export default function FicheNew() {
  const { fiches: ficheRepository } = useRepositories();
  const navigate = useNavigate();
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    const id = ficheRepository.add();
    navigate(`/carnet/${id}`, { replace: true });
  }, [ficheRepository, navigate]);

  return null;
}
