import { useContext } from "react";
import { OrganizationContext } from "@/contexts/OrganizationProvider";

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error(
      "useOrganization deve ser usado dentro de <OrganizationProvider>"
    );
  }
  return ctx;
}
