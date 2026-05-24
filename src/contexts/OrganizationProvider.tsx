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

  const fetchMemberships = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("memberships")
      .select("*, organization:organizations(*)")
      .eq("user_id", user.id);

    if (error) {
      console.error("Erro a obter organizações:", error);
      setMemberships([]);
    } else {
      const rows = (data ?? []) as unknown as MembershipWithOrg[];
      setMemberships(rows);

      // Se não há current org guardada ou já não existe nas memberships, escolhe a primeira
      if (
        rows.length > 0 &&
        (!currentOrgId || !rows.find((m) => m.organization_id === currentOrgId))
      ) {
        const first = rows[0].organization_id;
        setCurrentOrgId(first);
        localStorage.setItem(STORAGE_KEY, first);
      }
    }
    setLoading(false);
  }, [user, currentOrgId]);

  useEffect(() => {
    void fetchMemberships();
  }, [fetchMemberships]);

  const switchOrganization = useCallback((organizationId: string) => {
    setCurrentOrgId(organizationId);
    localStorage.setItem(STORAGE_KEY, organizationId);
  }, []);

  const currentMembership =
    memberships.find((m) => m.organization_id === currentOrgId) ?? null;
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
