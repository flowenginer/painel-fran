import { useContext } from "react";
import { AuthContext } from "@/contexts/AuthContext";

/**
 * Hook para consumir o AuthContext.
 * Lança erro se usado fora do AuthProvider.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return context;
}
