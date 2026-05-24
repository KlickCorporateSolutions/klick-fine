import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { createProcessWithClient } from "@/lib/api/processes";

const schema = z.object({
  clientName: z.string().min(2, "Mínimo 2 caracteres"),
  clientNif: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d{9}$/.test(v),
      "NIF deve ter exatamente 9 dígitos"
    ),
  clientEmail: z
    .string()
    .optional()
    .refine(
      (v) => !v || z.string().email().safeParse(v).success,
      "Email inválido"
    ),
  reference: z.string().optional(),
  finalidade: z.string().optional(),
  montantePretendido: z
    .string()
    .optional()
    .refine(
      (v) => !v || (!isNaN(Number(v)) && Number(v) > 0),
      "Montante deve ser um número positivo"
    ),
});

type FormValues = z.infer<typeof schema>;

const FINALIDADES = [
  "Aquisição HPP",
  "Aquisição secundária",
  "Construção",
  "Obras",
  "Transferência",
  "Multiopção",
] as const;

export default function NewProcess() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    if (!user || !currentOrganization) {
      toast.error("Sessão inválida");
      return;
    }

    setSubmitting(true);
    try {
      const process = await createProcessWithClient({
        organizationId: currentOrganization.id,
        userId: user.id,
        clientName: values.clientName,
        clientNif: values.clientNif || undefined,
        clientEmail: values.clientEmail || undefined,
        reference: values.reference || undefined,
        finalidade: values.finalidade || undefined,
        montantePretendido: values.montantePretendido
          ? Number(values.montantePretendido)
          : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["processes"] });
      toast.success("Processo criado", {
        description: "Agora podes carregar as FINEs.",
      });
      navigate(`/processes/${process.id}`, { replace: true });
    } catch (err) {
      toast.error("Falha a criar processo", {
        description: (err as Error).message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link to="/processes">
            <ArrowLeft className="h-4 w-4" />
            Voltar a processos
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Novo processo</h1>
        <p className="text-muted-foreground">
          Cria o processo de crédito. Depois carregas as FINEs dos bancos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do cliente</CardTitle>
          <CardDescription>
            O cliente fica isolado na tua agência — só os teus membros vêem.
          </CardDescription>
        </CardHeader>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clientName">Nome do cliente *</Label>
              <Input
                id="clientName"
                placeholder="Ex: Nélia Teles"
                {...register("clientName")}
                aria-invalid={!!errors.clientName}
              />
              {errors.clientName && (
                <p className="text-xs text-destructive">
                  {errors.clientName.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="clientNif">
                  NIF{" "}
                  <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="clientNif"
                  placeholder="123456789"
                  maxLength={9}
                  {...register("clientNif")}
                  aria-invalid={!!errors.clientNif}
                />
                {errors.clientNif && (
                  <p className="text-xs text-destructive">
                    {errors.clientNif.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientEmail">
                  Email{" "}
                  <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="clientEmail"
                  type="email"
                  placeholder="cliente@exemplo.pt"
                  {...register("clientEmail")}
                  aria-invalid={!!errors.clientEmail}
                />
                {errors.clientEmail && (
                  <p className="text-xs text-destructive">
                    {errors.clientEmail.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reference">
                  Referência{" "}
                  <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="reference"
                  placeholder="HPP Nélia 2026-05"
                  {...register("reference")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="finalidade">
                  Finalidade{" "}
                  <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <select
                  id="finalidade"
                  {...register("finalidade")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— escolher —</option>
                  {FINALIDADES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="montantePretendido">
                Montante pretendido (€){" "}
                <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="montantePretendido"
                type="number"
                step="1"
                min="0"
                placeholder="Ex: 150000"
                {...register("montantePretendido")}
                aria-invalid={!!errors.montantePretendido}
              />
              {errors.montantePretendido && (
                <p className="text-xs text-destructive">
                  {errors.montantePretendido.message}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button asChild type="button" variant="outline">
              <Link to="/processes">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "A criar…" : "Criar processo"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
