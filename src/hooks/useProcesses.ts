import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { getProcess, listProcesses } from "@/lib/api/processes";

export function useProcesses() {
  const { currentOrganization } = useOrganization();
  return useQuery({
    queryKey: ["processes", currentOrganization?.id],
    queryFn: () => listProcesses(currentOrganization!.id),
    enabled: !!currentOrganization,
  });
}

export function useProcess(id: string | undefined) {
  return useQuery({
    queryKey: ["process", id],
    queryFn: () => getProcess(id!),
    enabled: !!id,
  });
}
