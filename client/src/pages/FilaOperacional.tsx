import { useAuth } from "@/_core/hooks/useAuth";
import { PrioridadeBadge, ProdutoBadge, SlaAlertBadge, StatusBadge } from "@/components/AtivaBadges";
import AtivaDashboardLayout from "@/components/AtivaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, BarChart3, Clock, FolderOpen } from "lucide-react";
import { Link } from "wouter";

const FILA_GRUPOS = [
  { label: "Aguardando Documentos", statuses: ["Aguardando documentos", "Documentação parcial"] },
  { label: "Docs Ilegíveis", statuses: ["Documentos ilegíveis"] },
  { label: "Aguardando SCR", statuses: ["Aguardando SCR"] },
  { label: "Documentação Completa", statuses: ["Documentação completa"] },
  { label: "Em Análise IA", statuses: ["Em análise IA"] },
  { label: "Em Validação Humana", statuses: ["Em validação humana"] },
  { label: "Pronta para Distribuição", statuses: ["Pronta para distribuição"] },
  { label: "Em Distribuição / Retorno", statuses: ["Em distribuição", "Distribuída", "Em retorno bancário"] },
  { label: "Aguardando Cliente", statuses: ["Aguardando cliente"] },
  { label: "Finalizadas", statuses: ["Aprovada", "Reprovada", "Cancelada", "Stand-by"] },
];

export default function FilaOperacional() {
  const { user } = useAuth();
  const isAdmin = (user as any)?.perfil === "admin";

  const { data: operacoes, isLoading } = trpc.operacoes.listar.useQuery({});
  const { data: slaAlerts } = trpc.operacoes.slaAlerts.useQuery();

  if (!isAdmin) {
    return (
      <AtivaDashboardLayout>
        <div className="p-6 text-center text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Acesso restrito a administradores.</p>
        </div>
      </AtivaDashboardLayout>
    );
  }

  const slaIds = new Set(slaAlerts?.map((a) => a.id) ?? []);

  const grupos = FILA_GRUPOS.map((grupo) => ({
    ...grupo,
    operacoes: (operacoes ?? []).filter((op) => grupo.statuses.includes(op.statusMacro)),
  }));

  const urgentes = (operacoes ?? []).filter((op) => op.prioridade === "Urgente" || op.prioridade === "Alta");

  return (
    <AtivaDashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Fila Operacional
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Visão consolidada de todas as operações por etapa do fluxo
          </p>
        </div>

        {/* Alertas SLA */}
        {(slaAlerts?.length ?? 0) > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <h2 className="text-sm font-semibold text-red-400">
                {slaAlerts?.length} Alerta(s) de SLA — Operações sem movimentação
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {slaAlerts?.map((op) => (
                <Link key={op.id} href={`/operacoes/${op.id}`} className="flex items-center justify-between p-2.5 bg-red-500/5 border border-red-500/20 rounded-md hover:border-red-500/40 transition-colors">
                    <div>
                      <span className="text-xs font-mono text-red-400">{op.codigoOperacao}</span>
                      <p className="text-xs text-foreground mt-0.5 truncate max-w-[140px]">{op.nomeCliente}</p>
                    </div>
                    <SlaAlertBadge label={formatDistanceToNow(new Date(op.ultimaMovimentacaoEm), { locale: ptBR })} />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Urgentes / Alta prioridade */}
        {urgentes.length > 0 && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-semibold text-orange-400">Alta Prioridade</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {urgentes.map((op) => (
                <Link key={op.id} href={`/operacoes/${op.id}`} className="flex items-center justify-between p-2.5 bg-orange-500/5 border border-orange-500/20 rounded-md hover:border-orange-500/40 transition-colors">
                    <div>
                      <span className="text-xs font-mono text-orange-400">{op.codigoOperacao}</span>
                      <p className="text-xs text-foreground mt-0.5 truncate max-w-[140px]">{op.nomeCliente}</p>
                    </div>
                    <PrioridadeBadge prioridade={op.prioridade} />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Kanban por grupo */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-48 bg-muted/20 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {grupos.map((grupo) => (
              <div key={grupo.label} className="card-premium rounded-lg overflow-hidden">
                <div className="px-3 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-muted-foreground">{grupo.label}</h3>
                  <span className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full border border-primary/20">
                    {grupo.operacoes.length}
                  </span>
                </div>
                <div className="p-2 space-y-2 max-h-80 overflow-y-auto">
                  {grupo.operacoes.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-xs">Nenhuma operação</div>
                  ) : (
                    grupo.operacoes.map((op) => (
                      <Link key={op.id} href={`/operacoes/${op.id}`} className={cn(
                          "block p-2.5 rounded-md border transition-colors hover:border-primary/30",
                          slaIds.has(op.id)
                            ? "bg-red-500/5 border-red-500/20"
                            : "bg-background/50 border-border"
                        )}>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-mono text-primary">{op.codigoOperacao}</span>
                            <PrioridadeBadge prioridade={op.prioridade} />
                          </div>
                          <p className="text-xs font-medium text-foreground mt-1 truncate">{op.nomeCliente}</p>
                          <div className="flex items-center gap-1 mt-1.5">
                            <ProdutoBadge produto={op.produto} />
                          </div>
                          <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDistanceToNow(new Date(op.ultimaMovimentacaoEm), { locale: ptBR, addSuffix: true })}
                          </div>
                          {(op as any).responsavelOperacionalNome && (
                            <div className="mt-1 text-[10px] text-primary/70 truncate">
                              • {(op as any).responsavelOperacionalNome}
                            </div>
                          )}
                          {slaIds.has(op.id) && (
                            <SlaAlertBadge label="SLA" className="mt-1.5" />
                          )}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AtivaDashboardLayout>
  );
}
