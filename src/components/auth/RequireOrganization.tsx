import { Navigate, Outlet } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";

export function RequireOrganization() {
  const { currentOrganization, loading } = useOrganization();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          A carregar organização…
        </p>
      </div>
    );
  }

  if (!currentOrganization) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
