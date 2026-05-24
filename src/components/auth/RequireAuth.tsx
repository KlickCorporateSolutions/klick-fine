import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">A carregar…</p>
      </div>
    );
  }

  if (!user) {
    // Guarda destino para redirecionar após login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
