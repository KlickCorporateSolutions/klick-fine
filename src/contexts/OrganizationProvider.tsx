import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/types/database";

export type Organization = Tables<"organizations">;
export type MembershipWithOrg = Tables<"memberships"> & {
  organization: Organization;
};

type OrganizationContextValue = {
  organizations: MembershipWithOrg[];
  currentOrganization: Organization | null;
  currentMembership: MembershipWithOrg | null;
  loading: boolean;
  switchOrganization: (organizationId: string) => void;
  refresh: () => Promise<void>;
};

export const OrganizationContext = createContext<
  OrganizationContextValue | undefined
>(undefined);

const STORAGE_KEY = "klick-fine:current-org-id";

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<MembershipWithOrg[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(() => {
    return typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null;
  });
  const [loading, setLoading] = useState(true);

  // userId estável (string) — evita re-fetch quando supabase-js troca de
  // referência do user object (ex: TOKEN_REFRESHED) sem mudar o user.id real.
  const userId = user?.id ?? null;

  const fetchMemberships = useCallback(async () => {
    if (!userId) {
      setMemberships([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("memberships")
      .select("*, organization:organizations(*)")
      .eq("user_id", userId);

    if (error) {
      console.error("Erro a obter organizações:", error);
      setMemberships([]);
    } else {
      const rows = (data ?? []) as unknown as MembershipWithOrg[];
      setMemberships(rows);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchMemberships();
  }, [fetchMemberships]);

  // Auto-selecionar primeira org se não há current ou a current já não é membership válida.
  // Separado de fetchMemberships para evitar re-fetch ao trocar de org.
  useEffect(() => {
    if (memberships.length === 0) return;
    const stillValid =
      currentOrgId && memberships.find((m) => m.organization_id === currentOrgId);
    if (!stillValid) {
      const first = memberships[0].organization_id;
      setCurrentOrgId(first);
      localStorage.setItem(STORAGE_KEY, first);
    }
  }, [memberships, currentOrgId]);

  const switchOrganization = useCallback((organizationId: string) => {
    setCurrentOrgId(organizationId);
    localStorage.setItem(STORAGE_KEY, organizationId);
  }, []);

  // Computação SÍNCRONA com fallback à 1ª membership:
  //   - Se currentOrgId aponta para uma membership válida → usar essa
  //   - Senão (currentOrgId vazio, stale, ou não bate) → cair na primeira membership
  // Evita race condition onde RequireOrganization redirecionava para /onboarding
  // antes do useEffect de auto-select ter chance de atualizar o currentOrgId.
  const currentMembership =
    memberships.find((m) => m.organization_id === currentOrgId) ??
    memberships[0] ??
    null;
  const currentOrganization = currentMembership?.organization ?? null;

  return (
    <OrganizationContext.Provider
      value={{
        organizations: memberships,
        currentOrganization,
        currentMembership,
        loading,
        switchOrganization,
        refresh: fetchMemberships,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}
