import { Link } from "react-router-dom";
import { Plus, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProcesses } from "@/hooks/useProcesses";
import { formatDate } from "@/lib/formatters";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "outline" }> = {
  active: { label: "Ativo", variant: "default" },
  won: { label: "Ganho", variant: "success" },
  lost: { label: "Perdido", variant: "destructive" },
  archived: { label: "Arquivado", variant: "outline" },
};

export default function ProcessesList() {
  const { data: processes, isLoading, error } = useProcesses();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Processos</h1>
          <p className="text-muted-foreground">
            Todos os processos de crédito da tua agência
          </p>
        </div>
        <Button asChild>
          <Link to="/processes/new">
            <Plus className="h-4 w-4" />
            Novo processo
          </Link>
        </Button>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            A carregar processos…
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <div>
              <p className="font-medium">Erro a carregar processos</p>
              <p className="text-sm">{(error as Error).message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {processes && processes.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sem processos ainda</CardTitle>
            <CardDescription>
              Cria o teu primeiro processo para começares a comparar FINEs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/processes/new">
                <Plus className="h-4 w-4" />
                Criar primeiro processo
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {processes && processes.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead>Finalidade</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {processes.map((p) => {
                const status = statusLabels[p.status] ?? statusLabels.active;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.credit_client?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.finalidade ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(p.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/processes/${p.id}`}>
                          <FileText className="h-4 w-4" />
                          Abrir
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
