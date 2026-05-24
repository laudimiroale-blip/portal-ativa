import { useAuth } from "@/_core/hooks/useAuth";
import { PrioridadeBadge, ProdutoBadge, SlaAlertBadge, StatusBadge } from "@/components/AtivaBadges";
import AtivaDashboardLayout from "@/components/AtivaDashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  FileText,
  Filter,
  GripVertical,
  Kanban,
  Search,
  User,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

// ─── Mapeamento de Status para Colunas do Kanban ─────────────────────────────

interface KanbanColuna {
  id: string;
  label: string;
  descricao: string;
  statuses: string[];
  cor: string;
  corBorda: string;
  corHeader: string;
}

const KANBAN_COLUNAS: KanbanColuna[] = [
  {
    id: "triagem",
    label: "Triagem",
    descricao: "Operação criada · Aguardando documentos",
    statuses: ["Pré-cadastro", "Aguardando documentos", "Documentação parcial"],
    cor: "bg-zinc-500/10",
    corBorda: "border-zinc-500/30",
    corHeader: "text-zinc-400",
  },
  {
    id: "analise_documental_ia",
    label: "Análise Documental IA",
    descricao: "IA conferindo checklist · OCR · Classificação",
    statuses: ["Em análise IA", "Documentos ilegíveis", "Aguardando SCR"],
    cor: "bg-violet-500/10",
    corBorda: "border-violet-500/30",
    corHeader: "text-violet-400",
  },
  {
    id: "validacao_operacional",
    label: "Validação Operacional",
    descricao: "Revisão humana · Conferência final · Ajustes",
    statuses: ["Em validação humana", "Documentação completa"],
    cor: "bg-indigo-500/10",
    corBorda: "border-indigo-500/30",
    corHeader: "text-indigo-400",
  },
  {
    id: "avaliacao_garantia",
    label: "Avaliação da Garantia",
    descricao: "Análise do imóvel/veículo · Laudo · LTV · Ônus",
    statuses: ["Aguardando cliente"],
    cor: "bg-amber-500/10",
    corBorda: "border-amber-500/30",
    corHeader: "text-amber-400",
  },
  {
    id: "pronta_distribuicao",
    label: "Pronta p/ Distribuição",
    descricao: "Dossiê completo · Defesa pronta · SCR enviado",
    statuses: ["Pronta para distribuição"],
    cor: "bg-cyan-500/10",
    corBorda: "border-cyan-500/30",
    corHeader: "text-cyan-400",
  },
  {
    id: "distribuicao_bancaria",
    label: "Distribuição Bancária",
    descricao: "Enviada para IFs · Aguardando retorno",
    statuses: ["Em distribuição", "Distribuída"],
    cor: "bg-teal-500/10",
    corBorda: "border-teal-500/30",
    corHeader: "text-teal-400",
  },
  {
    id: "retorno_bancario",
    label: "Retorno Bancário",
    descricao: "Aprovado · Condicionado · Recusado · Pendência",
    statuses: ["Em retorno bancário"],
    cor: "bg-sky-500/10",
    corBorda: "border-sky-500/30",
    corHeader: "text-sky-400",
  },
  {
    id: "formalizacao",
    label: "Formalização",
    descricao: "Contrato · Assinatura · Cartório · Registro",
    statuses: ["Stand-by"],
    cor: "bg-orange-500/10",
    corBorda: "border-orange-500/30",
    corHeader: "text-orange-400",
  },
  {
    id: "liberacao",
    label: "Liberação",
    descricao: "TED/Pix · Operação concluída",
    statuses: ["Aprovada", "Reprovada", "Cancelada", "Arquivada"],
    cor: "bg-emerald-500/10",
    corBorda: "border-emerald-500/30",
    corHeader: "text-emerald-400",
  },
];

// Mapa reverso: status → id da coluna
const STATUS_PARA_COLUNA: Record<string, string> = {};
KANBAN_COLUNAS.forEach((col) => {
  col.statuses.forEach((s) => {
    STATUS_PARA_COLUNA[s] = col.id;
  });
});

// Status permitidos para mover via drag-and-drop (primeiro status de cada coluna destino)
const COLUNA_STATUS_PRINCIPAL: Record<string, string> = {
  triagem: "Aguardando documentos",
  analise_documental_ia: "Em análise IA",
  validacao_operacional: "Em validação humana",
  avaliacao_garantia: "Aguardando cliente",
  pronta_distribuicao: "Pronta para distribuição",
  distribuicao_bancaria: "Em distribuição",
  retorno_bancario: "Em retorno bancário",
  formalizacao: "Stand-by",
  liberacao: "Aprovada",
};

// ─── Componente Card do Kanban ────────────────────────────────────────────────

interface KanbanCardProps {
  op: any;
  isSlaAlert: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, opId: number) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

function KanbanCard({ op, isSlaAlert, isDragging, onDragStart, onDragEnd }: KanbanCardProps) {
  const valorFormatado = op.valorSolicitado
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
        Number(op.valorSolicitado)
      )
    : "—";

  const ultimaMovimentacao = op.ultimaMovimentacaoEm
    ? formatDistanceToNow(new Date(op.ultimaMovimentacaoEm), { locale: ptBR, addSuffix: true })
    : "—";

  // Calcular % de completude documental baseado no statusMacro
  const completude = useMemo(() => {
    const statusOrdem = [
      "Pré-cadastro", "Aguardando documentos", "Documentação parcial",
      "Documentos ilegíveis", "Aguardando SCR", "Documentação completa",
      "Em análise IA", "Em validação humana", "Pronta para distribuição",
      "Em distribuição", "Distribuída", "Em retorno bancário",
      "Aguardando cliente", "Aprovada", "Reprovada", "Cancelada", "Stand-by",
    ];
    const idx = statusOrdem.indexOf(op.statusMacro);
    if (idx < 0) return 0;
    return Math.round(((idx + 1) / statusOrdem.length) * 100);
  }, [op.statusMacro]);

  // Pendências baseadas no status
  const pendencias: string[] = useMemo(() => {
    const p: string[] = [];
    if (op.statusMacro === "Aguardando documentos") p.push("Docs pendentes");
    if (op.statusMacro === "Documentação parcial") p.push("Docs incompletos");
    if (op.statusMacro === "Documentos ilegíveis") p.push("Docs ilegíveis");
    if (op.statusMacro === "Aguardando SCR") p.push("SCR pendente");
    if (op.statusValidacaoIa === "Pendência encontrada") p.push("Pendência IA");
    if (isSlaAlert) p.push("SLA vencido");
    return p;
  }, [op.statusMacro, op.statusValidacaoIa, isSlaAlert]);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, op.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-lg border p-3 cursor-grab active:cursor-grabbing transition-all hover:border-primary/40 hover:shadow-md hover:shadow-black/20 select-none",
        isSlaAlert
          ? "bg-red-500/5 border-red-500/25 hover:border-red-500/40"
          : "bg-background/60 border-border"
      )}
    >
      {/* Linha 1: Código + Prioridade */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1">
          <GripVertical className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
          <Link href={`/operacoes/${op.id}`} onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] font-mono text-primary hover:underline">{op.codigoOperacao}</span>
          </Link>
        </div>
        <PrioridadeBadge prioridade={op.prioridade} />
      </div>

      {/* Linha 2: Nome do cliente */}
      <p className="text-xs font-semibold text-foreground truncate mb-1.5">{op.nomeCliente}</p>

      {/* Linha 3: Produto + Valor */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <ProdutoBadge produto={op.produto} />
        <span className="text-[10px] font-medium text-muted-foreground">{valorFormatado}</span>
      </div>

      {/* Linha 4: Status */}
      <div className="mb-1.5">
        <StatusBadge status={op.statusMacro} />
      </div>

      {/* Linha 5: Responsável operacional */}
      <div className="flex items-center gap-1 mb-1.5">
        <User className="w-2.5 h-2.5 text-primary/60 flex-shrink-0" />
        <span className="text-[10px] truncate">
          {op.responsavelOperacionalNome
            ? <span className="text-primary/70">{op.responsavelOperacionalNome}</span>
            : <span className="text-muted-foreground/40 italic">Sem responsável</span>}
        </span>
      </div>

      {/* Linha 6: Última movimentação */}
      <div className="flex items-center gap-1 mb-1.5 text-[10px] text-muted-foreground">
        <span className="opacity-60">Mov.:</span>
        <span>{ultimaMovimentacao}</span>
      </div>

      {/* Linha 7: Pendências */}
      <div className="flex flex-wrap gap-1 mb-1.5 min-h-[18px]">
        {pendencias.length > 0 ? (
          pendencias.map((p) => (
            <span
              key={p}
              className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25 font-medium"
            >
              {p}
            </span>
          ))
        ) : (
          <span className="text-[9px] text-muted-foreground/30 italic">Sem pendências</span>
        )}
      </div>

      {/* Linha 8: % Completude documental */}
      <div className="mt-1.5">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1">
            <FileText className="w-2.5 h-2.5 text-muted-foreground/50" />
            <span className="text-[9px] text-muted-foreground/70">Completude</span>
          </div>
          <span className="text-[9px] font-medium text-muted-foreground">{completude}%</span>
        </div>
        <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              completude >= 80 ? "bg-emerald-500" : completude >= 50 ? "bg-yellow-500" : "bg-red-500"
            )}
            style={{ width: `${completude}%` }}
          />
        </div>
      </div>

      {/* SLA Alert */}
      {isSlaAlert && <SlaAlertBadge label="SLA" className="mt-1.5" />}
    </div>
  );
}

// ─── Componente Coluna do Kanban ──────────────────────────────────────────────

interface KanbanColunaProps {
  coluna: KanbanColuna;
  operacoes: any[];
  slaIds: Set<number>;
  isDragOver: boolean;
  draggingId: number | null;
  onDragStart: (e: React.DragEvent, opId: number) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent, colunaId: string) => void;
  onDrop: (e: React.DragEvent, colunaId: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
}

function KanbanColunaComponent({
  coluna,
  operacoes,
  slaIds,
  isDragOver,
  draggingId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onDragLeave,
}: KanbanColunaProps) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border transition-all min-w-[260px] w-[260px] flex-shrink-0",
        coluna.corBorda,
        isDragOver ? "ring-2 ring-primary/40 bg-primary/5 scale-[1.01]" : coluna.cor
      )}
      onDragOver={(e) => onDragOver(e, coluna.id)}
      onDrop={(e) => onDrop(e, coluna.id)}
      onDragLeave={onDragLeave}
    >
      {/* Header da coluna */}
      <div className={cn("px-3 py-2.5 border-b flex items-center justify-between", coluna.corBorda)}>
        <div>
          <h3 className={cn("text-xs font-bold", coluna.corHeader)}>{coluna.label}</h3>
          <p className="text-[9px] text-muted-foreground/60 mt-0.5 leading-tight">{coluna.descricao}</p>
        </div>
        <span
          className={cn(
            "text-xs font-bold px-2 py-0.5 rounded-full border",
            operacoes.length > 0
              ? "bg-primary/15 text-primary border-primary/25"
              : "bg-muted/30 text-muted-foreground border-border"
          )}
        >
          {operacoes.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)] min-h-[120px]">
        {operacoes.length === 0 ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center h-20 rounded-lg border border-dashed transition-all",
              isDragOver ? "border-primary/40 bg-primary/5" : "border-border/40"
            )}
          >
            <span className="text-[10px] text-muted-foreground/40">
              {isDragOver ? "Soltar aqui" : "Vazio"}
            </span>
          </div>
        ) : (
          operacoes.map((op) => (
            <KanbanCard
              key={op.id}
              op={op}
              isSlaAlert={slaIds.has(op.id)}
              isDragging={draggingId === op.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function FilaOperacional() {
  const { user } = useAuth();
  const isAdmin = (user as any)?.perfil === "admin" || (user as any)?.perfil === "operacional";

  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroProduto, setFiltroProduto] = useState<string>("todos");
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>("todas");
  const [filtroConsultor, setFiltroConsultor] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Drag-and-drop
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverColuna, setDragOverColuna] = useState<string | null>(null);

  // Modal de confirmação de movimentação
  const [modalMovimento, setModalMovimento] = useState<{ opId: number; novoStatus: string; nomeCliente: string } | null>(null);
  const [motivoMovimento, setMotivoMovimento] = useState("");

  const utils = trpc.useUtils();
  const atualizarMutation = trpc.operacoes.atualizar.useMutation({
    onSuccess: () => {
      utils.operacoes.listar.invalidate();
      toast.success("Status atualizado com sucesso");
    },
    onError: (err) => {
      toast.error("Erro ao mover operação: " + err.message);
    },
  });

  const { data: operacoesRaw, isLoading } = trpc.operacoes.listar.useQuery(
    {
      busca: busca || undefined,
      produto: filtroProduto !== "todos" ? filtroProduto : undefined,
      prioridade: filtroPrioridade !== "todas" ? filtroPrioridade : undefined,
      assessorId: filtroConsultor !== "todos" ? Number(filtroConsultor) : undefined,
      statusMacro: filtroStatus !== "todos" ? filtroStatus : undefined,
    },
    { refetchInterval: 30000 }
  );

  const { data: slaAlerts } = trpc.operacoes.slaAlerts.useQuery();
  const { data: usuarios } = trpc.usuarios.listar.useQuery();

  const slaIds = useMemo(() => new Set(slaAlerts?.map((a) => a.id) ?? []), [slaAlerts]);

  // Busca local em tempo real (oculta cards sem remover das colunas)
  const [buscaLocal, setBuscaLocal] = useState("");
  const termoBuscaLocal = buscaLocal.toLowerCase().trim();

  // Agrupar operações por coluna
  const colunas = useMemo(() => {
    const ops = operacoesRaw ?? [];
    return KANBAN_COLUNAS.map((col) => ({
      ...col,
      operacoes: ops.filter((op) => {
        if (!col.statuses.includes(op.statusMacro)) return false;
        if (!termoBuscaLocal) return true;
        const nome = (op.nomeCliente ?? "").toLowerCase();
        const codigo = (op.codigoOperacao ?? "").toLowerCase();
        return nome.includes(termoBuscaLocal) || codigo.includes(termoBuscaLocal);
      }),
    }));
  }, [operacoesRaw, termoBuscaLocal]);

  // Drag-and-drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, opId: number) => {
    setDraggingId(opId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(opId));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverColuna(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colunaId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColuna(colunaId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Só limpa se saiu do container da coluna (não de um filho)
    const relatedTarget = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDragOverColuna(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, colunaId: string) => {
      e.preventDefault();
      const opId = Number(e.dataTransfer.getData("text/plain"));
      if (!opId || !draggingId) return;

      const novoStatus = COLUNA_STATUS_PRINCIPAL[colunaId];
      if (!novoStatus) {
        toast.error("Coluna sem status mapeado");
        setDraggingId(null);
        setDragOverColuna(null);
        return;
      }

      // Verificar se já está na coluna correta
      const op = operacoesRaw?.find((o) => o.id === opId);
      if (op && STATUS_PARA_COLUNA[op.statusMacro] === colunaId) {
        setDraggingId(null);
        setDragOverColuna(null);
        return;
      }

      // Abrir modal de confirmação com motivo opcional
      setModalMovimento({ opId, novoStatus, nomeCliente: op?.nomeCliente ?? "" });
      setMotivoMovimento("");
      setDraggingId(null);
      setDragOverColuna(null);
    },
    [draggingId, operacoesRaw, atualizarMutation]
  );

  const confirmarMovimento = () => {
    if (!modalMovimento) return;
    atualizarMutation.mutate({
      id: modalMovimento.opId,
      statusMacro: modalMovimento.novoStatus,
      motivo: motivoMovimento.trim() || undefined,
    });
    setModalMovimento(null);
    setMotivoMovimento("");
  };

  const limparFiltros = () => {
    setBusca("");
    setBuscaLocal("");
    setFiltroProduto("todos");
    setFiltroPrioridade("todas");
    setFiltroConsultor("todos");
    setFiltroStatus("todos");
  };

  const temFiltrosAtivos =
    busca || buscaLocal || filtroProduto !== "todos" || filtroPrioridade !== "todas" || filtroConsultor !== "todos" || filtroStatus !== "todos";

  const totalOperacoes = operacoesRaw?.length ?? 0;

  if (!isAdmin) {
    return (
      <AtivaDashboardLayout>
        <div className="p-6 text-center text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Acesso restrito a administradores e operacionais.</p>
        </div>
      </AtivaDashboardLayout>
    );
  }

  return (
    <AtivaDashboardLayout>
      <div className="p-4 flex flex-col gap-4 h-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Kanban className="w-5 h-5 text-primary" />
              Fila Operacional
            </h1>
            <p className="text-muted-foreground text-xs mt-0.5">
              Esteira operacional de crédito com garantia · {totalOperacoes} operações
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Busca em tempo real — filtra cards localmente por nome ou código ATV */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60" />
              <Input
                placeholder="Buscar por nome ou código ATV..."
                value={buscaLocal}
                onChange={(e) => setBuscaLocal(e.target.value)}
                className="pl-8 h-8 text-xs w-64 bg-background/60 border-primary/20 focus:border-primary/50"
              />
              {buscaLocal && (
                <button
                  onClick={() => setBuscaLocal("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title="Limpar busca"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Toggle filtros */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMostrarFiltros(!mostrarFiltros)}
              className={cn("h-8 gap-1.5 text-xs", mostrarFiltros && "border-primary/40 text-primary")}
            >
              <Filter className="w-3.5 h-3.5" />
              Filtros
              {temFiltrosAtivos && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Button>

            {temFiltrosAtivos && (
              <Button variant="ghost" size="sm" onClick={limparFiltros} className="h-8 gap-1 text-xs text-muted-foreground">
                <X className="w-3 h-3" />
                Limpar
              </Button>
            )}
          </div>
        </div>

        {/* Painel de filtros */}
        {mostrarFiltros && (
          <div className="flex flex-wrap gap-3 p-3 bg-muted/20 rounded-lg border border-border">
            {/* Filtro por consultor */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Consultor</label>
              <Select value={filtroConsultor} onValueChange={setFiltroConsultor}>
                <SelectTrigger className="h-7 text-xs w-40 bg-background/60">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(usuarios ?? [])
                    .filter((u: any) => u.perfil === "assessor")
                    .map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name ?? u.email ?? `Usuário ${u.id}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por produto */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Produto</label>
              <Select value={filtroProduto} onValueChange={setFiltroProduto}>
                <SelectTrigger className="h-7 text-xs w-44 bg-background/60">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os produtos</SelectItem>
                  <SelectItem value="Home Equity">Home Equity</SelectItem>
                  <SelectItem value="Auto Equity">Auto Equity</SelectItem>
                  <SelectItem value="Rural Equity">Rural Equity</SelectItem>
                  <SelectItem value="Imóvel em Construção">Imóvel em Construção</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por prioridade */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Prioridade</label>
              <Select value={filtroPrioridade} onValueChange={setFiltroPrioridade}>
                <SelectTrigger className="h-7 text-xs w-36 bg-background/60">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="Urgente">Urgente</SelectItem>
                  <SelectItem value="Alta">Alta</SelectItem>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por status */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Status</label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="h-7 text-xs w-52 bg-background/60">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="Pré-cadastro">Pré-cadastro</SelectItem>
                  <SelectItem value="Aguardando documentos">Aguardando documentos</SelectItem>
                  <SelectItem value="Documentação parcial">Documentação parcial</SelectItem>
                  <SelectItem value="Documentos ilegíveis">Documentos ilegíveis</SelectItem>
                  <SelectItem value="Aguardando SCR">Aguardando SCR</SelectItem>
                  <SelectItem value="Documentação completa">Documentação completa</SelectItem>
                  <SelectItem value="Em análise IA">Em análise IA</SelectItem>
                  <SelectItem value="Em validação humana">Em validação humana</SelectItem>
                  <SelectItem value="Pronta para distribuição">Pronta para distribuição</SelectItem>
                  <SelectItem value="Em distribuição">Em distribuição</SelectItem>
                  <SelectItem value="Distribuída">Distribuída</SelectItem>
                  <SelectItem value="Em retorno bancário">Em retorno bancário</SelectItem>
                  <SelectItem value="Aguardando cliente">Aguardando cliente</SelectItem>
                  <SelectItem value="Aprovada">Aprovada</SelectItem>
                  <SelectItem value="Reprovada">Reprovada</SelectItem>
                  <SelectItem value="Cancelada">Cancelada</SelectItem>
                  <SelectItem value="Stand-by">Stand-by</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Alertas SLA */}
        {(slaAlerts?.length ?? 0) > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <h2 className="text-xs font-semibold text-red-400">
                {slaAlerts?.length} Alerta(s) de SLA — Operações sem movimentação
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {slaAlerts?.slice(0, 6).map((op) => (
                <Link
                  key={op.id}
                  href={`/operacoes/${op.id}`}
                  className="flex items-center gap-2 px-2 py-1 bg-red-500/5 border border-red-500/20 rounded-md hover:border-red-500/40 transition-colors"
                >
                  <span className="text-[10px] font-mono text-red-400">{op.codigoOperacao}</span>
                  <SlaAlertBadge
                    label={formatDistanceToNow(new Date(op.ultimaMovimentacaoEm), { locale: ptBR })}
                  />
                </Link>
              ))}
              {(slaAlerts?.length ?? 0) > 6 && (
                <span className="text-[10px] text-red-400/70 self-center">
                  +{(slaAlerts?.length ?? 0) - 6} mais
                </span>
              )}
            </div>
          </div>
        )}

        {/* Kanban Board */}
        {isLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="min-w-[260px] w-[260px] h-64 bg-muted/20 rounded-xl animate-pulse flex-shrink-0" />
            ))}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4 flex-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--border)) transparent' }}>
            {colunas.map((col) => (
              <KanbanColunaComponent
                key={col.id}
                coluna={col}
                operacoes={col.operacoes}
                slaIds={slaIds}
                isDragOver={dragOverColuna === col.id}
                draggingId={draggingId}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragLeave={handleDragLeave}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal de Confirmação de Movimentação */}
      <Dialog open={!!modalMovimento} onOpenChange={(open) => { if (!open) { setModalMovimento(null); setMotivoMovimento(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Confirmar Movimentação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted/30 rounded-lg text-xs">
              <p className="text-muted-foreground mb-1">Operação:</p>
              <p className="font-medium text-foreground">{modalMovimento?.nomeCliente}</p>
              <p className="text-muted-foreground mt-2 mb-1">Novo status:</p>
              <p className="font-semibold text-primary">{modalMovimento?.novoStatus}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Motivo da movimentação <span className="opacity-50">(opcional)</span></Label>
              <Textarea
                placeholder="Ex: Documentos validados, cliente confirmou envio..."
                value={motivoMovimento}
                onChange={(e) => setMotivoMovimento(e.target.value)}
                className="text-xs min-h-[80px] resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setModalMovimento(null); setMotivoMovimento(""); }}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmarMovimento} disabled={atualizarMutation.isPending}>
              {atualizarMutation.isPending ? "Movendo..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AtivaDashboardLayout>
  );
}
