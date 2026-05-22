import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, ShieldAlert, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";

const PERFIL_LABELS: Record<string, string> = {
  admin: "Administrador",
  operacional: "Operacional",
  assessor: "Assessor",
};

export default function AtivarConvite() {
  // Ler token da query string
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";

  const [nome, setNome] = useState("");
  const [ativado, setAtivado] = useState(false);

  const { data: convite, isLoading: carregando, error: erroConvite } = trpc.usuarios.obterConvite.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  useEffect(() => {
    if (convite?.nome) setNome(convite.nome);
  }, [convite]);

  const ativar = trpc.usuarios.ativarConvite.useMutation({
    onSuccess: () => setAtivado(true),
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-2">Link inválido</h1>
          <p className="text-muted-foreground text-sm">Este link de convite não contém um token válido.</p>
        </div>
      </div>
    );
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (erroConvite) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-2">Convite inválido ou expirado</h1>
          <p className="text-muted-foreground text-sm mb-6">
            {(erroConvite as any)?.message ?? "Este link de convite não é mais válido. Solicite um novo convite ao administrador."}
          </p>
          <Link href="/" className="text-primary hover:underline text-sm">
            Voltar ao início
          </Link>
        </div>
      </div>
    );
  }

  if (ativado) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Conta ativada!</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Sua conta foi ativada com sucesso. Agora você pode fazer login no Portal Ativa com seu e-mail.
          </p>
          <div className="bg-[#111] border border-[#C9A84C]/20 rounded-lg p-4 mb-6 text-left">
            <p className="text-xs text-muted-foreground mb-1">E-mail de acesso</p>
            <p className="text-sm font-medium text-foreground">{convite?.email}</p>
            <p className="text-xs text-muted-foreground mt-2 mb-1">Perfil</p>
            <p className="text-sm font-medium text-[#C9A84C]">{PERFIL_LABELS[convite?.perfil ?? ""] ?? convite?.perfil}</p>
          </div>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] text-black font-semibold rounded-lg hover:bg-[#B8973B] transition-colors"
          >
            <UserCheck className="w-4 h-4" />
            Fazer Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/20 border border-[#C9A84C]/40 flex items-center justify-center">
              <span className="text-[#C9A84C] font-bold text-sm">A</span>
            </div>
            <span className="text-2xl font-bold text-foreground tracking-tight">ATIVA</span>
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Portal Operacional</p>
        </div>

        {/* Card */}
        <div className="bg-[#111] border border-[#C9A84C]/20 rounded-xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-[#C9A84C]/20 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Ativar Conta</h1>
              <p className="text-xs text-muted-foreground">Você foi convidado para o Portal Ativa</p>
            </div>
          </div>

          {/* Info do convite */}
          <div className="bg-[#0a0a0a] border border-[#333] rounded-lg p-3 mb-5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">E-mail</span>
              <span className="text-xs font-medium text-foreground">{convite?.email}</span>
            </div>
            <div className="flex justify-between items-center mt-1.5">
              <span className="text-xs text-muted-foreground">Perfil</span>
              <span className="text-xs font-medium text-[#C9A84C]">{PERFIL_LABELS[convite?.perfil ?? ""] ?? convite?.perfil}</span>
            </div>
          </div>

          {/* Formulário */}
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Como você quer ser chamado?</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#333] rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#C9A84C]/50 transition-colors"
              />
            </div>

            {ativar.error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                {ativar.error.message}
              </p>
            )}

            <button
              onClick={() => ativar.mutate({ token, nome: nome.trim() })}
              disabled={ativar.isPending || !nome.trim()}
              className="w-full py-2.5 bg-[#C9A84C] text-black font-semibold rounded-lg hover:bg-[#B8973B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {ativar.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ativando conta...
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  Ativar Minha Conta
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-4">
            Ao ativar, você confirma que recebeu este convite e concorda em acessar o Portal Ativa com as permissões atribuídas.
          </p>
        </div>
      </div>
    </div>
  );
}
