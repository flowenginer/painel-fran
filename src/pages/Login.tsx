import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
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

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

const resetSchema = z.object({
  email: z.string().email("Email inválido"),
});

type LoginForm = z.infer<typeof loginSchema>;
type ResetForm = z.infer<typeof resetSchema>;

type View = "login" | "reset";

export function Login() {
  const { session, signIn, resetPassword, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<View>("login");
  const [serverError, setServerError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Se já está logado, redireciona pro dashboard
  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname ||
    "/dashboard";

  if (!authLoading && session) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Painel Fran</h1>
          <p className="text-sm text-muted-foreground">
            Stival Advogados — Gestão de devedores
          </p>
        </div>

        {view === "login" ? (
          <LoginForm
            signIn={signIn}
            navigate={navigate}
            from={from}
            serverError={serverError}
            setServerError={setServerError}
            goToReset={() => {
              setServerError(null);
              setView("reset");
            }}
          />
        ) : (
          <ResetForm
            resetPassword={resetPassword}
            resetSuccess={resetSuccess}
            setResetSuccess={setResetSuccess}
            serverError={serverError}
            setServerError={setServerError}
            goToLogin={() => {
              setResetSuccess(false);
              setServerError(null);
              setView("login");
            }}
          />
        )}
      </div>
    </div>
  );
}

interface LoginFormProps {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  navigate: ReturnType<typeof useNavigate>;
  from: string;
  serverError: string | null;
  setServerError: (v: string | null) => void;
  goToReset: () => void;
}

function LoginForm({
  signIn,
  navigate,
  from,
  serverError,
  setServerError,
  goToReset,
}: LoginFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    const { error } = await signIn(data.email, data.password);
    if (error) {
      setServerError(traduzErroAuth(error.message));
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>
          Use seu email e senha de administrador
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <button
                type="button"
                onClick={goToReset}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Esqueci minha senha
              </button>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          {serverError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive">{serverError}</p>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Entrando...
              </>
            ) : (
              "Entrar"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

interface ResetFormProps {
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  resetSuccess: boolean;
  setResetSuccess: (v: boolean) => void;
  serverError: string | null;
  setServerError: (v: string | null) => void;
  goToLogin: () => void;
}

function ResetForm({
  resetPassword,
  resetSuccess,
  setResetSuccess,
  serverError,
  setServerError,
  goToLogin,
}: ResetFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetForm) => {
    setServerError(null);
    const { error } = await resetPassword(data.email);
    if (error) {
      setServerError(traduzErroAuth(error.message));
      return;
    }
    setResetSuccess(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>
          Enviamos um link de recuperação para seu email
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          {resetSuccess ? (
            <div className="rounded-md border border-green-500/50 bg-green-500/10 px-3 py-3">
              <p className="text-sm text-green-500">
                Se este email está cadastrado, você receberá um link de
                recuperação em instantes.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {serverError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
                  <p className="text-xs text-destructive">{serverError}</p>
                </div>
              )}
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          {!resetSuccess && (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar link de recuperação"
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={goToLogin}
          >
            Voltar para o login
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/**
 * Traduz mensagens de erro comuns do Supabase Auth para português.
 */
function traduzErroAuth(mensagem: string): string {
  const mapa: Record<string, string> = {
    "Invalid login credentials": "Email ou senha incorretos",
    "Email not confirmed": "Email ainda não confirmado",
    "User not found": "Usuário não encontrado",
    "Too many requests": "Muitas tentativas. Tente novamente em alguns minutos",
  };

  for (const [en, pt] of Object.entries(mapa)) {
    if (mensagem.toLowerCase().includes(en.toLowerCase())) {
      return pt;
    }
  }

  return mensagem;
}
