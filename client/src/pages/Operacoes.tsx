import { useAuth } from "@/_core/hooks/useAuth";
import { PrioridadeBadge, ProdutoBadge, RascunhoBadge, StatusBadge } from "@/components/AtivaBadges";
import AtivaDashboardLayout from "@/components/AtivaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Filter, FolderOpen, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

const STATUS_OPTIONS = [
  "Pré-cadastro", "Aguardando documentos", "Documentação parcial", "Documentação completa",
  "Em análise IA", "Em validação humana", "Pronta para distribuição", "Em distribuição",
  "Distribuída", "Em retorno bancário", "Aguardando cliente", "Aprovada", "Reprovada", "Cancelada", "Stand-by",
];

const PRODUTO_OPTIONS = ["Home Equity", "Auto Equity", "Rural Equity", "Imóvel em Construção"];
const PRIORIDADE_OPTIONS = ["Urgente", "Alta", "Normal", "Baixa"];

export default function Operacoes() {
  const { user } = useAuth();
  const isAdmin = (user as any)?.perfil === "admin";

  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [produtoFiltro, setProdutoFiltro] = useState("");
  const [prioridadeFiltro, setPrioridadeFiltro] = useState("");
  const [apenasMinhas, setApenasMinhas] = useState(!isAdmin);
  const [showFilters, setShowFilters] = useState(false);

  const { data: operacoes, isLoading } = trpc.operacoes.listar.useQuery({
    busca: busca || undefined,
    statusMacro: statusFiltro || undefined,
    produto: produtoFiltro || undefined,
    prioridade: prioridadeFiltro || undefined,
    apenasMinhas: !isAdmin ? true : apenasMinhas,
  });

  const hasFilters = !!(busca || statusFiltro || produtoFiltro || prioridadeFiltro);

  const clearFilters = () => {
    setBusca("");
    setStatusFiltro("");
    setProdutoFiltro("");
    setPrioridadeFiltro("");
  };

  return (
    <AtivaDashboardLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              Operações
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {isLoading ? "Carregando..." : `${operacoes?.length ?? 0} operação(ões) encontrada(s)`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                showFilters || hasFilters
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filtros
              {hasFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>
            <Link href="/operacoes/nova" className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" />
                Nova
            </Link>
          </div>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome, CPF ou código ATV..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
          />
          {busca && (
            <button onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filtros avançados */}
        {showFilters && (
          <div className="card-premium p-4 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <select
                  value={statusFiltro}
                  onChange={(e) => setStatusFiltro(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="">Todos os status</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Produto</label>
                <select
                  value={produtoFiltro}
                  onChange={(e) => setProdutoFiltro(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="">Todos os produtos</option>
                  {PRODUTO_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Prioridade</label>
                <select
                  value={prioridadeFiltro}
                  onChange={(e) => setPrioridadeFiltro(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="">Todas as prioridades</option>
                  {PRIORIDADE_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            {isAdmin && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={apenasMinhas}
                  onChange={(e) => setApenasMinhas(e.target.checked)}
                  className="rounded border-border"
                />
                Apenas minhas operações
              </label>
            )}
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-primary hover:underline flex items-center gap-1">
                <X className="w-3 h-3" />
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* Tabela */}
        <div className="card-premium rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-14 bg-muted/20 rounded-md animate-pulse" />
              ))}
            </div>
          ) : operacoes?.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma operação encontrada.</p>
              {hasFilters && (
                <button onClick={clearFilters} className="mt-2 text-xs text-primary hover:underline">
                  Limpar filtros
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Código</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Cliente</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Produto</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Valor</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Prioridade</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Última mov.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {operacoes?.map((op) => (
                    <tr key={op.id} className="hover:bg-accent/30 transition-colors cursor-pointer group">
                      <td className="px-4 py-3">
                        <Link href={`/operacoes/${op.id}`} className="flex items-center gap-2">
                            <span className="font-mono text-xs text-primary">{op.codigoOperacao}</span>
                            {op.statusRascunho && <RascunhoBadge />}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/operacoes/${op.id}`}>
                            <p className="font-medium text-foreground group-hover:text-primary transition-colors">{op.nomeCliente}</p>
                            <p className="text-xs text-muted-foreground">{op.cpf}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <ProdutoBadge produto={op.produto} />
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-foreground font-medium">
                          {Number(op.valorSolicitado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={op.statusMacro} />
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <PrioridadeBadge prioridade={op.prioridade} />
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(op.ultimaMovimentacaoEm), { locale: ptBR, addSuffix: true })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AtivaDashboardLayout>
  );
}
