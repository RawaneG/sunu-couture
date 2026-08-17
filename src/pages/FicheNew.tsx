import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";

/**
 * "Nouvelle fiche" isn't a form screen — it creates the record (next carnet
 * slot assigned) and drops the tailor straight into FicheDetail's in-place
 * editing, the same screen used to review any existing fiche.
 */
export default function FicheNew() {
  const addFiche = useStore((s) => s.addFiche);
  const navigate = useNavigate();
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    const id = addFiche();
    navigate(`/carnet/${id}`, { replace: true });
  }, [addFiche, navigate]);

  return null;
}
