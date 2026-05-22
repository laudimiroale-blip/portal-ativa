import { useAuth } from "@/_core/hooks/useAuth";
import { PrioridadeBadge, ProdutoBadge, RascunhoBadge, StatusBadge } from "@/components/AtivaBadges";
import AtivaDashboardLayout from "@/components/AtivaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Archive, ArchiveRestore, Filter, FolderOpen, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  "Pré-cadastro", "Aguardando documentos", "Documentação parcial", "Documentos ilegíveis", "Aguardando SCR",
  "Documentação completa", "Em análise IA", "Em validação humana", "Pronta para distribuição", "Em distribuição",
  "Distribuída", "Em retorno bancário", "Aguardando cliente", "Aprovada", "Reprovada", "Cancelada", "Stand-by", "Arquivada",
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
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);

  // Modais de ação admin
  const [modalArquivar, setModalArquivar] = useState<{ id: number; codigo: string } | null>(null);
  const [modalExcluir, setModalExcluir] = useState<{ id: number; codigo: string } | null>(null);
  const [codigoConfirmacao, setCodigoConfirmacao] = useState("");

  const utils = trpc.useUtils();

  const arquivarMutation = trpc.operacoes.arquivar.useMutation({
    onSuccess: () => {
      toast.success("Operação arquivada com sucesso.");
      setModalArquivar(null);
      utils.operacoes.listar.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [modalDesarquivar, setModalDesarquivar] = useState<{ id: number; codigo: string } | null>(null);
  const desarquivarMutation = trpc.operacoes.desarquivar.useMutation({
    onSuccess: () => {
      toast.success("Operação restaurada com sucesso.");
      setModalDesarquivar(null);
      utils.operacoes.listar.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const excluirMutation = trpc.operacoes.excluir.useMutation({
    onSuccess: () => {
      toast.success("Operação excluída permanentemente.");
      setModalExcluir(null);
      setCodigoConfirmacao("");
      utils.operacoes.listar.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: operacoesRaw, isLoading } = trpc.operacoes.listar.useQuery({
    busca: busca || undefined,
    statusMacro: statusFiltro || undefined,
    produto: produtoFiltro || undefined,
    prioridade: prioridadeFiltro || undefined,
    apenasMinhas: !isAdmin ? true : apenasMinhas,
  });

  // Filtrar arquivadas: por padrão ocultar, a menos que filtro explícito ou toggle ativo
  const operacoes = useMemo(() => {
    if (!operacoesRaw) return [];
    if (mostrarArquivadas || statusFiltro === "Arquivada") return operacoesRaw;
    return operacoesRaw.filter((op: any) => op.statusMacro !== "Arquivada");
  }, [operacoesRaw, mostrarArquivadas, statusFiltro]);

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
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={apenasMinhas}
                    onChange={(e) => setApenasMinhas(e.target.checked)}
                    className="rounded border-border"
                  />
                  Apenas minhas operações
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mostrarArquivadas}
                    onChange={(e) => setMostrarArquivadas(e.target.checked)}
                    className="rounded border-border"
                  />
                  <Archive className="w-3.5 h-3.5" />
                  Exibir arquivadas
                </label>
              </div>
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
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Responsável</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden 2xl:table-cell">Última mov.</th>
                    {isAdmin && <th className="px-4 py-3 w-20" />}
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
                        {(op as any).responsavelOperacionalNome ? (
                          <span className="text-xs text-foreground">{(op as any).responsavelOperacionalNome}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden 2xl:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(op.ultimaMovimentacaoEm), { locale: ptBR, addSuffix: true })}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {op.statusMacro !== "Arquivada" ? (
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setModalArquivar({ id: op.id, codigo: op.codigoOperacao }); }}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                                title="Arquivar"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setModalDesarquivar({ id: op.id, codigo: op.codigoOperacao }); }}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-green-400 hover:bg-green-400/10 transition-colors"
                                title="Desarquivar"
                              >
                                <ArchiveRestore className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setModalExcluir({ id: op.id, codigo: op.codigoOperacao }); setCodigoConfirmacao(""); }}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Excluir permanentemente"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Desarquivar */}
      {modalDesarquivar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <ArchiveRestore className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Restaurar Operação</h3>
                <p className="text-xs text-muted-foreground">{modalDesarquivar.codigo}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              A operação será restaurada para o status <strong className="text-foreground">Pré-cadastro</strong> e voltará a aparecer na listagem padrão.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setModalDesarquivar(null)}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => desarquivarMutation.mutate({ id: modalDesarquivar.id })}
                disabled={desarquivarMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors disabled:opacity-50"
              >
                {desarquivarMutation.isPending ? "Restaurando..." : "Restaurar Operação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Arquivar */}
      {modalArquivar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Archive className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Arquivar Operação</h3>
                <p className="text-xs text-muted-foreground">{modalArquivar.codigo}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              A operação será movida para o status <strong className="text-foreground">Arquivada</strong> e ocultada da listagem padrão. Você pode visualizá-la ativando o filtro "Exibir arquivadas".
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setModalArquivar(null)}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => arquivarMutation.mutate({ id: modalArquivar.id })}
                disabled={arquivarMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
              >
                {arquivarMutation.isPending ? "Arquivando..." : "Arquivar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Excluir */}
      {modalExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Excluir Permanentemente</h3>
                <p className="text-xs text-muted-foreground">{modalExcluir.codigo}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Esta ação é <strong className="text-destructive">irreversível</strong>. Todos os documentos, análises e histórico serão removidos permanentemente.
            </p>
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Digite o código ATV para confirmar: <strong className="text-foreground">{modalExcluir.codigo}</strong>
              </label>
              <input
                type="text"
                value={codigoConfirmacao}
                onChange={(e) => setCodigoConfirmacao(e.target.value)}
                placeholder={modalExcluir.codigo}
                className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-destructive/50"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setModalExcluir(null); setCodigoConfirmacao(""); }}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => excluirMutation.mutate({ id: modalExcluir.id, codigoConfirmacao })}
                disabled={excluirMutation.isPending || codigoConfirmacao.trim().toUpperCase() !== modalExcluir.codigo.trim().toUpperCase()}
                className="px-4 py-2 rounded-lg text-sm bg-destructive/20 text-destructive border border-destructive/30 hover:bg-destructive/30 transition-colors disabled:opacity-40"
              >
                {excluirMutation.isPending ? "Excluindo..." : "Excluir Permanentemente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AtivaDashboardLayout>
  );
}
