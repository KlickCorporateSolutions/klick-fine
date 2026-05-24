import { Outlet } from "react-router-dom";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Klick FINE</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Comparação inteligente de FINEs para intermediários de crédito
          </p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
