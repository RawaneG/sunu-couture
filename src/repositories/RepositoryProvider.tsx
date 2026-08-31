import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createRepositoryContainer, type RepositoryContainer } from "./RepositoryContainer";

const RepositoryContext = createContext<RepositoryContainer | null>(null);

interface RepositoryProviderProps {
  children: ReactNode;
  /** Point d'injection pour les tests (et les phases futures) : fournir un
   * conteneur — au besoin avec de faux repositories — remplace entièrement
   * l'implémentation par défaut sans toucher aux pages ni aux hooks. */
  repositories?: RepositoryContainer;
}

export function RepositoryProvider({ children, repositories }: RepositoryProviderProps) {
  const container = useMemo(() => repositories ?? createRepositoryContainer(), [repositories]);
  return <RepositoryContext.Provider value={container}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): RepositoryContainer {
  const container = useContext(RepositoryContext);
  if (!container) {
    throw new Error("useRepositories() doit être appelé sous <RepositoryProvider>.");
  }
  return container;
}
