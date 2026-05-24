import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthProvider";
import { OrganizationProvider } from "@/contexts/OrganizationProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireOrganization } from "@/components/auth/RequireOrganization";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <OrganizationProvider>
            <Routes>
              {/* Rotas públicas (auth) */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
              </Route>

              {/* Autenticado mas ainda sem organização */}
              <Route element={<RequireAuth />}>
                <Route path="/onboarding" element={<Onboarding />} />

                {/* Autenticado COM organização */}
                <Route element={<RequireOrganization />}>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<Dashboard />} />
                  </Route>
                </Route>
              </Route>

              {/* Fallbacks */}
              <Route path="/index.html" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
