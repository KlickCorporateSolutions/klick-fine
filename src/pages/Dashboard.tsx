import { Link } from "react-router-dom";
import { Plus, FileText, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProcesses } from "@/hooks/useProcesses";
import { useOrganization } from "@/hooks/useOrganization";
import { formatDate } from "@/lib/formatters";

export default function Dashboard() {
  const { currentOrganization } = useOrganization();
  const { data: processes } = useProcesses();

  const activeCount = processes?.filter((p) => p.status === "active").length ?? 0;
  const recentProcesses = (processes ?? []).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Bem-vindo a {currentOrganization?.name ?? "Klick FINE"}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Processos ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Total de processos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{processes?.length ?? 0}</p>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg">Novo processo</CardTitle>
            <CardDescription>Cria + carrega FINEs</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button asChild className="w-full">
              <Link to="/processes/new">
                <Plus className="h-4 w-4" />
                Criar
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Processos recentes</CardTitle>
            <CardDescription>Últimos 5 processos criados</CardDescription>
          </div>
          {processes && processes.length > 0 && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/processes">
                Ver todos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {recentProcesses.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Ainda não tens processos. Cria o primeiro em cima.
            </p>
          ) : (
            <ul className="divide-y">
              {recentProcesses.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {p.credit_client?.name ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.reference ?? p.finalidade ?? "—"} ·{" "}
                        {formatDate(p.created_at)}
                      </p>
                    </div>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/processes/${p.id}`}>Abrir</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
