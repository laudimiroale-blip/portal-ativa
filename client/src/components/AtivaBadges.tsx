import { cn } from "@/lib/utils";

// ─── Status Macro Badge ──────────────────────────────────────────────────────

const STATUS_CLASSES: Record<string, string> = {
  "Pré-cadastro": "bg-zinc-700/50 text-zinc-300 border-zinc-600/30",
  "Aguardando documentos": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "Documentação parcial": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Documentação completa": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Em análise IA": "bg-violet-500/20 text-violet-400 border-violet-500/30",
  "Em validação humana": "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  "Pronta para distribuição": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "Em distribuição": "bg-teal-500/20 text-teal-400 border-teal-500/30",
  "Distribuída": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Em retorno bancário": "bg-sky-500/20 text-sky-400 border-sky-500/30",
  "Aguardando cliente": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "Aprovada": "bg-emerald-500/25 text-emerald-300 border-emerald-500/40",
  "Reprovada": "bg-red-500/20 text-red-400 border-red-500/30",
  "Cancelada": "bg-zinc-600/30 text-zinc-400 border-zinc-600/30",
  "Stand-by": "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const classes = STATUS_CLASSES[status] || "bg-zinc-700/50 text-zinc-300 border-zinc-600/30";
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap",
      classes,
      className
    )}>
      {status}
    </span>
  );
}

// ─── Prioridade Badge ────────────────────────────────────────────────────────

const PRIORIDADE_CLASSES: Record<string, string> = {
  "Urgente": "bg-red-500/20 text-red-400 border-red-500/40",
  "Alta": "bg-orange-500/20 text-orange-400 border-orange-500/40",
  "Normal": "bg-blue-500/20 text-blue-400 border-blue-500/40",
  "Baixa": "bg-zinc-700/50 text-zinc-400 border-zinc-600/40",
};

interface PrioridadeBadgeProps {
  prioridade: string;
  className?: string;
}

export function PrioridadeBadge({ prioridade, className }: PrioridadeBadgeProps) {
  const classes = PRIORIDADE_CLASSES[prioridade] || "bg-zinc-700/50 text-zinc-400 border-zinc-600/40";
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap",
      classes,
      className
    )}>
      {prioridade}
    </span>
  );
}

// ─── Rascunho Badge ──────────────────────────────────────────────────────────

export function RascunhoBadge({ className }: { className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border",
      "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
      className
    )}>
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
      Rascunho
    </span>
  );
}

// ─── Produto Badge ───────────────────────────────────────────────────────────

const PRODUTO_CLASSES: Record<string, string> = {
  "Home Equity": "bg-primary/15 text-primary border-primary/30",
  "Auto Equity": "bg-sky-500/20 text-sky-400 border-sky-500/30",
  "Rural Equity": "bg-green-500/20 text-green-400 border-green-500/30",
  "Imóvel em Construção": "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

interface ProdutoBadgeProps {
  produto: string;
  className?: string;
}

export function ProdutoBadge({ produto, className }: ProdutoBadgeProps) {
  const classes = PRODUTO_CLASSES[produto] || "bg-zinc-700/50 text-zinc-300 border-zinc-600/30";
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap",
      classes,
      className
    )}>
      {produto}
    </span>
  );
}

// ─── Semáforo IA ─────────────────────────────────────────────────────────────

interface SemaforoProps {
  cor: "verde" | "amarelo" | "vermelho";
  label?: string;
  className?: string;
}

const SEMAFORO_CLASSES = {
  verde: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  amarelo: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  vermelho: "bg-red-500/20 text-red-400 border-red-500/30",
};

const SEMAFORO_DOT = {
  verde: "bg-emerald-400",
  amarelo: "bg-yellow-400",
  vermelho: "bg-red-400",
};

export function SemaforoBadge({ cor, label, className }: SemaforoProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border",
      SEMAFORO_CLASSES[cor],
      className
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", SEMAFORO_DOT[cor])} />
      {label || cor.charAt(0).toUpperCase() + cor.slice(1)}
    </span>
  );
}

// ─── Status Validação IA ─────────────────────────────────────────────────────

const STATUS_IA_CLASSES: Record<string, string> = {
  "Não analisado": "bg-zinc-700/50 text-zinc-400 border-zinc-600/30",
  "Em análise": "bg-violet-500/20 text-violet-400 border-violet-500/30",
  "Validado": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Pendência encontrada": "bg-red-500/20 text-red-400 border-red-500/30",
};

interface StatusIaBadgeProps {
  status: string;
  className?: string;
}

export function StatusIaBadge({ status, className }: StatusIaBadgeProps) {
  const classes = STATUS_IA_CLASSES[status] || "bg-zinc-700/50 text-zinc-400 border-zinc-600/30";
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap",
      classes,
      className
    )}>
      {status}
    </span>
  );
}

// ─── SLA Alert Badge ─────────────────────────────────────────────────────────

interface SlaAlertProps {
  label: string;
  className?: string;
}

export function SlaAlertBadge({ label, className }: SlaAlertProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border sla-alert",
      "bg-red-500/20 text-red-400 border-red-500/40",
      className
    )}>
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
      {label}
    </span>
  );
}
