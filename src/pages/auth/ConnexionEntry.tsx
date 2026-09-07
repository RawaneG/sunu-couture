import Welcome from "./Welcome";
import PinLogin from "./PinLogin";
import { getRememberedPhone } from "../../lib/auth/rememberedPhone";

// Point d'entrée `/connexion` (corr. Gate Auth §6/§46) — un appareil déjà
// reconnu (numéro mémorisé localement) saute DIRECTEMENT à l'écran PIN
// « Bon retour », sans repasser par l'écran de bienvenue. `PinLogin` relit
// lui-même le numéro mémorisé (aucune prop nécessaire) — ce composant ne
// fait que choisir laquelle des deux vues monter.
export default function ConnexionEntry() {
  return getRememberedPhone() ? <PinLogin /> : <Welcome />;
}
