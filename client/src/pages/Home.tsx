import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Shield } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const { isAuthenticated, loading, user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      const perfil = (user as any)?.perfil;
      if (perfil === "assessor") {
        navigate("/operacoes");
      } else {
        navigate("/dashboard");
      }
    }
  }, [isAuthenticated, loading, navigate, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(oklch(72% 0.12 80) 1px, transparent 1px), linear-gradient(90deg, oklch(72% 0.12 80) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-md">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mb-6 shadow-lg shadow-primary/10">
          <Shield className="w-8 h-8 text-primary" />
        </div>

        {/* Wordmark */}
        <div className="mb-2">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-gold-gradient">ATIVA</span>
          </h1>
          <p className="text-sm text-muted-foreground uppercase tracking-[0.3em] mt-1">Portal Operacional</p>
        </div>

        {/* Divider */}
        <div className="w-16 h-px bg-primary/30 my-6" />

        {/* Description */}
        <p className="text-muted-foreground text-sm leading-relaxed mb-8">
          Plataforma interna de originação e gestão de operações de crédito com garantia. Acesso restrito à equipe Ativa.
        </p>

        {/* CTA */}
        <a
          href={getLoginUrl()}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 active:scale-[0.97] transition-all duration-150 shadow-lg shadow-primary/20"
        >
          <Shield className="w-4 h-4" />
          Acessar Portal
        </a>

        {/* Footer */}
        <p className="text-muted-foreground/50 text-xs mt-8">
          © {new Date().getFullYear()} Ativa Soluções Financeiras · Uso interno
        </p>
      </div>
    </div>
  );
}
