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
    const baseSlug = slugify(values.name);
    // Tenta com slug base; se conflito, adiciona sufixo aleatório curto
    let slug = baseSlug;
    let attempt = 0;

    while (attempt < 3) {
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: values.name,
          slug,
          bdp_registry_number: values.bdpRegistryNumber || null,
          branding_app_name: values.appName || null,
        })
        .select()
        .single();

      if (orgError) {
        // 23505 = unique violation (slug duplicado)
        if (orgError.code === "23505" && attempt < 2) {
          slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
          attempt++;
          continue;
        }
        toast.error("Falha a criar organização", {
          description: orgError.message,
        });
        setSubmitting(false);
        return;
      }

      // Cria membership como owner
      const { error: memberError } = await supabase.from("memberships").insert({
        user_id: user.id,
        organization_id: org.id,
        role: "owner",
      });

      if (memberError) {
        toast.error("Falha a associar conta à organização", {
          description: memberError.message,
        });
        setSubmitting(false);
        return;
      }

      // Refresca contexto e muda para a nova org
      await refresh();
      switchOrganization(org.id);

      toast.success("Organização criada", {
        description: `Bem-vindo ao Klick FINE, ${values.name}!`,
      });
      navigate("/", { replace: true });
      return;
    }

    setSubmitting(false);
    toast.error("Não foi possível criar organização após várias tentativas");
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
