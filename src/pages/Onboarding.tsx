import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { slugify } from "@/lib/slug";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  name: z
    .string()
    .min(2, "Mínimo 2 caracteres")
    .max(80, "Máximo 80 caracteres"),
  bdpRegistryNumber: z.string().optional(),
  appName: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function Onboarding() {
  const { user } = useAuth();
  const { refresh, switchOrganization } = useOrganization();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const watchedName = watch("name") ?? "";
  const previewSlug = slugify(watchedName) || "<slug>";

  const onSubmit = async (values: FormValues) => {
    if (!user) {
      toast.error("Sessão expirada", { description: "Volta a entrar." });
      return;
    }

    setSubmitting(true);
    try {
      const baseSlug = slugify(values.name);

      // RPC SECURITY DEFINER: cria org + membership atomicamente
      // (resolve o problema RLS de não conseguir ler a org acabada de criar
      //  antes de a membership existir).
      const { data, error } = await supabase.rpc(
        "create_organization_with_owner",
        {
          org_name: values.name,
          org_slug: baseSlug,
          org_bdp_registry: values.bdpRegistryNumber || null,
          org_app_name: values.appName || null,
        }
      );

      if (error || !data) {
        toast.error("Falha a criar organização", {
          description: error?.message ?? "Sem dados na resposta",
        });
        return;
      }

      // Refresca contexto e ativa a nova org
      await refresh();
      switchOrganization(data.id);

      toast.success("Organização criada", {
        description: `Bem-vindo ao Klick FINE, ${values.name}!`,
      });
      navigate("/", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            Configura a tua agência
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cria o espaço da tua agência intermediária. Podes convidar membros
            depois.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Nova organização</CardTitle>
            <CardDescription>
              Os teus dados ficam isolados — só tu e os membros que convidares
              vêem os processos.
            </CardDescription>
          </CardHeader>
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da agência</Label>
                <Input
                  id="name"
                  placeholder="Ex: Ser Finance"
                  {...register("name")}
                  aria-invalid={!!errors.name}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">
                    {errors.name.message}
                  </p>
                )}
                {watchedName && (
                  <p className="text-xs text-muted-foreground">
                    URL: klick-fine.app/<span className="font-mono">{previewSlug}</span>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="bdpRegistryNumber">
                  Nº de registo BdP{" "}
                  <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="bdpRegistryNumber"
                  placeholder="Ex: 0001234"
                  {...register("bdpRegistryNumber")}
                />
                <p className="text-xs text-muted-foreground">
                  Banco de Portugal — número de intermediário de crédito
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="appName">
                  Nome a mostrar aos clientes{" "}
                  <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="appName"
                  placeholder="Ex: Comparador Ser Finance"
                  {...register("appName")}
                />
                <p className="text-xs text-muted-foreground">
                  Aparece no header da aplicação. Vazio = usa o nome da agência.
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "A criar…" : "Criar organização"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
