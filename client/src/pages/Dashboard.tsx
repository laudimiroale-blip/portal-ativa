import { useAuth } from "@/_core/hooks/useAuth";
import React from "react";
import { PrioridadeBadge, RascunhoBadge, SlaAlertBadge, StatusBadge } from "@/components/AtivaBadges";
import AtivaDashboardLayout from "@/components/AtivaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  TrendingUp,
  Users,
} from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = (user as any)?.perfil === "admin";

  return (
    <AtivaDashboardLayout>
      {isAdmin ? <DashboardAdmin /> : <DashboardAssessor />}
    </AtivaDashboardLayout>
  );
}

// ─── Dashboard Admin ──────────────────────────────────────────────────────────

function DashboardAdmin() {
  const { user } = useAuth();
  const { data: metricas, isLoading: loadingMetricas } = trpc.operacoes.metricas.useQuery();
  const { data: slaAlerts } = trpc.operacoes.slaAlerts.useQuery();
  const { data: operacoes, isLoading: loadingOps } = trpc.operacoes.listar.useQuery({});
  const { data: metricasConsultores, isLoading: loadingConsultores } = trpc.operacoes.metricasPorConsultor.useQuery();

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  const statusCounts = operacoes?.reduce((acc: Record<string, number>, op) => {
    acc[op.statusMacro] = (acc[op.statusMacro] || 0) + 1;
    return acc;
  }, {}) ?? {};

  return (
    <div className="p-6 space-y-6">
      {/* Header — sem botão Nova Operação (Dashboard é visão executiva) */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {saudacao}, <span className="text-primary">{user?.name?.split(" ")[0] ?? "Renata"}</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visão executiva do Portal Ativa — {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Métricas gerais */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total"
          value={loadingMetricas ? "—" : String(metricas?.total ?? 0)}
          icon={FolderOpen}
          color="primary"
        />
        <MetricCard
          title="Em Análise"
          value={loadingMetricas ? "—" : String(metricas?.emAnalise ?? 0)}
          icon={BarChart3}
          color="violet"
        />
        <MetricCard
          title="Aprovadas"
          value={loadingMetricas ? "—" : String(metricas?.aprovadas ?? 0)}
          icon={CheckCircle2}
          color="emerald"
        />
        <MetricCard
          title="Pendentes"
          value={loadingMetricas ? "—" : String(metricas?.pendentes ?? 0)}
          icon={AlertTriangle}
          color="yellow"
        />
        <MetricCard
          title="Rascunhos"
          value={loadingMetricas ? "—" : String(metricas?.rascunhos ?? 0)}
          icon={FileText}
          color="zinc"
        />
      </div>

      {/* Alertas SLA */}
      {(slaAlerts?.length ?? 0) > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold text-red-400">Alertas de SLA — Operações Paradas</h2>
          </div>
          <div className="space-y-2">
            {slaAlerts?.slice(0, 5).map((op) => (
              <Link key={op.id} href={`/operacoes/${op.id}`} className="flex items-center justify-between p-3 bg-red-500/5 border border-red-500/20 rounded-md hover:border-red-500/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-red-400">{op.codigoOperacao}</span>
                    <span className="text-sm text-foreground">{op.nomeCliente}</span>
                    <StatusBadge status={op.statusMacro} />
                  </div>
                  <div className="flex items-center gap-2">
                    <SlaAlertBadge label={`Parado há ${formatDistanceToNow(new Date(op.ultimaMovimentacaoEm), { locale: ptBR })}`} />
                    <PrioridadeBadge prioridade={op.prioridade} />
                  </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Visão por Consultor + Distribuição por Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Visão por Consultor */}
        <div className="card-premium p-5 rounded-lg">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Produtividade por Consultor
          </h2>
          {loadingConsultores ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 bg-muted/30 rounded-md animate-pulse" />
              ))}
            </div>
          ) : (metricasConsultores?.length ?? 0) === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhum consultor com operações ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {metricasConsultores?.map((c) => (
                <div key={c.assessorId} className="p-3 bg-muted/20 border border-border/40 rounded-lg hover:border-primary/30 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">{c.nomeAssessor}</span>
                    <span className="text-xs text-muted-foreground">{c.total} operações</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.emAnalise > 0 && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">
                        {c.emAnalise} em análise
                      </span>
                    )}
                    {c.aprovadas > 0 && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                        {c.aprovadas} aprovada{c.aprovadas > 1 ? "s" : ""}
                      </span>
                    )}
                    {c.rascunhos > 0 && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-700/30 text-zinc-400 border border-zinc-600/25">
                        {c.rascunhos} rascunho{c.rascunhos > 1 ? "s" : ""}
                      </span>
                    )}
                    {c.pendentes > 0 && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">
                        {c.pendentes} pendente{c.pendentes > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Distribuição por Status */}
        <div className="card-premium p-5 rounded-lg">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Distribuição por Status
          </h2>
          <div className="space-y-2">
            {Object.entries(statusCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 8)
              .map(([status, count]) => {
                const total = metricas?.total ?? 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={status} className="flex items-center gap-3">
                    <StatusBadge status={status} className="w-44 justify-center" />
                    <div className="flex-1 bg-muted rounded-full h-1.5">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Operações Recentes */}
      <div className="card-premium p-5 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Movimentações Recentes
          </h2>
          <Link href="/operacoes" className="text-xs text-primary hover:underline">Ver todas</Link>
        </div>
        <div className="space-y-2">
          {loadingOps ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted/30 rounded-md animate-pulse" />
            ))
          ) : (
            operacoes?.slice(0, 6).map((op) => (
              <Link key={op.id} href={`/operacoes/${op.id}`} className="flex items-center justify-between p-2.5 rounded-md hover:bg-accent/50 transition-colors group">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[11px] font-mono text-muted-foreground flex-shrink-0">{op.codigoOperacao}</span>
                    <span className="text-sm text-foreground truncate">{op.nomeCliente}</span>
                    {op.statusRascunho && <RascunhoBadge />}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={op.statusMacro} />
                  </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Assessor ───────────────────────────────────────────────────────

function DashboardAssessor() {
  const { user } = useAuth();
  const { data: operacoes, isLoading } = trpc.operacoes.listar.useQuery({ apenasMinhas: true });

  const pendentes = operacoes?.filter(
    (op) => op.statusMacro === "Aguardando documentos" || op.statusMacro === "Documentação parcial"
  ) ?? [];

  const rascunhos = operacoes?.filter((op) => op.statusRascunho) ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Olá, <span className="text-primary">{user?.name?.split(" ")[0] ?? "Assessor"}</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Sua carteira de operações</p>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Minha Carteira"
          value={isLoading ? "—" : String(operacoes?.length ?? 0)}
          icon={FolderOpen}
          color="primary"
        />
        <MetricCard
          title="Pendências"
          value={isLoading ? "—" : String(pendentes.length)}
          icon={AlertTriangle}
          color="yellow"
        />
        <MetricCard
          title="Rascunhos"
          value={isLoading ? "—" : String(rascunhos.length)}
          icon={FileText}
          color="zinc"
        />
      </div>

      {/* Pendências */}
      {pendentes.length > 0 && (
        <div className="card-premium p-5 rounded-lg">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            Pendências de Documentação
          </h2>
          <div className="space-y-2">
            {pendentes.map((op) => (
              <Link key={op.id} href={`/operacoes/${op.id}`} className="flex items-center justify-between p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-md hover:border-yellow-500/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground">{op.codigoOperacao}</span>
                    <span className="text-sm text-foreground">{op.nomeCliente}</span>
                  </div>
                  <StatusBadge status={op.statusMacro} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Todas as operações */}
      <div className="card-premium p-5 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-primary" />
            Minhas Operações
          </h2>
          <Link href="/operacoes" className="text-xs text-primary hover:underline">Ver todas</Link>
        </div>
        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted/30 rounded-md animate-pulse" />
            ))
          ) : operacoes?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhuma operação encontrada.
              <Link href="/operacoes/nova" className="block mt-2 text-primary hover:underline">Criar primeira operação</Link>
            </div>
          ) : (
            operacoes?.slice(0, 8).map((op) => (
              <Link key={op.id} href={`/operacoes/${op.id}`} className="flex items-center justify-between p-2.5 rounded-md hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[11px] font-mono text-muted-foreground flex-shrink-0">{op.codigoOperacao}</span>
                    <span className="text-sm text-foreground truncate">{op.nomeCliente}</span>
                    {op.statusRascunho && <RascunhoBadge />}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <PrioridadeBadge prioridade={op.prioridade} />
                    <StatusBadge status={op.statusMacro} />
                  </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: "primary" | "emerald" | "violet" | "yellow" | "zinc";
}

const colorMap = {
  primary: "text-primary bg-primary/15 border-primary/25",
  emerald: "text-emerald-400 bg-emerald-500/15 border-emerald-500/25",
  violet: "text-violet-400 bg-violet-500/15 border-violet-500/25",
  yellow: "text-yellow-400 bg-yellow-500/15 border-yellow-500/25",
  zinc: "text-zinc-400 bg-zinc-700/30 border-zinc-600/25",
};

function MetricCard({ title, value, icon: Icon, color }: MetricCardProps) {
  return (
    <div className="card-premium p-4 rounded-lg">
      <div className="flex items-center gap-3">
        <div className={cn("w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0", colorMap[color])}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{title}</p>
        </div>
      </div>
    </div>
  );
}
