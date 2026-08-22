import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";

/**
 * "Nouveau modèle" isn't a form screen — it creates the record and drops the
 * tailor straight into ModeleDetail's in-place editing, same as FicheNew.
 */
export default function ModeleNew() {
  const addModele = useStore((s) => s.addModele);
  const navigate = useNavigate();
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    const id = addModele();
    navigate(`/catalogue/${id}`, { replace: true });
  }, [addModele, navigate]);

  return null;
}
