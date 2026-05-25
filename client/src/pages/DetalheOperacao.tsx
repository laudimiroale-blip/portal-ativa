import { useAuth } from "@/_core/hooks/useAuth";
import { PrioridadeBadge, ProdutoBadge, RascunhoBadge, SemaforoBadge, StatusBadge, StatusIaBadge } from "@/components/AtivaBadges";
import AtivaDashboardLayout from "@/components/AtivaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  History,
  Info,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

type Tab = "documentos" | "dados" | "ifs" | "historico" | "distribuicao";

interface Props {
  params: { id: string };
}

export default function DetalheOperacao({ params }: Props) {
  const { user } = useAuth();
  const isAdmin = (user as any)?.perfil === "admin";
  const operacaoId = Number(params.id);
  const [activeTab, setActiveTab] = useState<Tab>("documentos");

  // Modais admin
  const [modalArquivar, setModalArquivar] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(false);
  const [codigoConfirmacao, setCodigoConfirmacao] = useState("");
  const utils = trpc.useUtils();
  const [, navigate] = (useState("") as any);

  const arquivarMutation = trpc.operacoes.arquivar.useMutation({
    onSuccess: () => {
      toast.success("Operação arquivada.");
      setModalArquivar(false);
      utils.operacoes.obter.invalidate({ id: operacaoId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [modalDesarquivar, setModalDesarquivar] = useState(false);
  const desarquivarMutation = trpc.operacoes.desarquivar.useMutation({
    onSuccess: () => {
      toast.success("Operação restaurada.");
      setModalDesarquivar(false);
      utils.operacoes.obter.invalidate({ id: operacaoId });
    },
    onError: (e) => toast.error(e.message),
  });

  const excluirMutation = trpc.operacoes.excluir.useMutation({
    onSuccess: () => {
      toast.success("Operação excluída permanentemente.");
      window.location.href = "/operacoes";
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: operacao, isLoading, refetch } = trpc.operacoes.obter.useQuery({ id: operacaoId });

  const tabs = [
    { id: "documentos" as Tab, label: "Documentos", icon: FileText },
    { id: "dados" as Tab, label: "Dados", icon: Info },
    { id: "ifs" as Tab, label: "Instituições", icon: Building2 },
    { id: "historico" as Tab, label: "Histórico", icon: History },
    ...(isAdmin ? [{ id: "distribuicao" as Tab, label: "Distribuição", icon: Package }] : []),
  ];

  if (isLoading) {
    return (
      <AtivaDashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </AtivaDashboardLayout>
    );
  }

  if (!operacao) {
    return (
      <AtivaDashboardLayout>
        <div className="p-6 text-center text-muted-foreground">
          <p>Operação não encontrada.</p>
          <Link href="/operacoes" className="text-primary hover:underline mt-2 block">Voltar às operações</Link>
        </div>
      </AtivaDashboardLayout>
    );
  }

  return (
    <AtivaDashboardLayout>
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/operacoes" className="p-2 mt-0.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-primary font-bold text-lg">{operacao.codigoOperacao}</span>
                {operacao.statusRascunho && <RascunhoBadge />}
                <StatusBadge status={operacao.statusMacro} />
                <PrioridadeBadge prioridade={operacao.prioridade} />
              </div>
              <h1 className="text-xl font-bold text-foreground mt-1">{operacao.nomeCliente}</h1>
              <div className="flex items-center gap-3 mt-1">
                <ProdutoBadge produto={operacao.produto} />
                <span className="text-sm text-muted-foreground">
                  {Number(operacao.valorSolicitado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {operacao.prazo} meses
                </span>
                <StatusIaBadge status={operacao.statusValidacaoIa} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && operacao && operacao.statusMacro !== "Arquivada" && (
              <button
                onClick={() => setModalArquivar(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                title="Arquivar operação"
              >
                <Archive className="w-3.5 h-3.5" />
                Arquivar
              </button>
            )}
            {isAdmin && operacao && operacao.statusMacro === "Arquivada" && (
              <button
                onClick={() => setModalDesarquivar(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-green-500/30 text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-colors"
                title="Restaurar operação"
              >
                <ArchiveRestore className="w-3.5 h-3.5" />
                Restaurar
              </button>
            )}
            {isAdmin && operacao && (
              <button
                onClick={() => { setModalExcluir(true); setCodigoConfirmacao(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-destructive/30 text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors"
                title="Excluir permanentemente"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir
              </button>
            )}
            <button
              onClick={() => refetch()}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}

                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === "documentos" && <TabDocumentos operacaoId={operacaoId} isAdmin={isAdmin} userId={(user as any)?.id} />}
          {activeTab === "dados" && <TabDados operacao={operacao} isAdmin={isAdmin} onRefetch={refetch} userId={(user as any)?.id} />}
          {/* Aba Análise IA removida — defesa disponível na aba Dados */}
          {activeTab === "ifs" && <TabIFs operacaoId={operacaoId} isAdmin={isAdmin} userId={(user as any)?.id} produto={(operacao as any)?.produto} valorSolicitado={Number((operacao as any)?.valorSolicitado) || undefined} valorGarantia={Number((operacao as any)?.valorGarantia) || undefined} prazo={Number((operacao as any)?.prazo) || undefined} />}
          {activeTab === "historico" && <TabHistorico operacaoId={operacaoId} />}
          {activeTab === "distribuicao" && isAdmin && <TabDistribuicao operacaoId={operacaoId} operacao={operacao} />}
        </div>
      </div>

      {/* Modal Desarquivar */}
      {modalDesarquivar && operacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <ArchiveRestore className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Restaurar Operação</h3>
                <p className="text-xs text-muted-foreground">{operacao.codigoOperacao}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              A operação será restaurada para o status <strong className="text-foreground">Pré-cadastro</strong> e voltará a aparecer na listagem padrão.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setModalDesarquivar(false)}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => desarquivarMutation.mutate({ id: operacaoId })}
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
      {modalArquivar && operacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Archive className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Arquivar Operação</h3>
                <p className="text-xs text-muted-foreground">{operacao.codigoOperacao}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              A operação será movida para o status <strong className="text-foreground">Arquivada</strong> e ocultada da listagem padrão. Você pode visualizá-la ativando o filtro "Exibir arquivadas".
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setModalArquivar(false)}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => arquivarMutation.mutate({ id: operacaoId })}
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
      {modalExcluir && operacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Excluir Permanentemente</h3>
                <p className="text-xs text-muted-foreground">{operacao.codigoOperacao}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Esta ação é <strong className="text-destructive">irreversível</strong>. Todos os documentos, análises e histórico serão removidos permanentemente.
            </p>
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Digite o código ATV para confirmar: <strong className="text-foreground">{operacao.codigoOperacao}</strong>
              </label>
              <input
                type="text"
                value={codigoConfirmacao}
                onChange={(e) => setCodigoConfirmacao(e.target.value)}
                placeholder={operacao.codigoOperacao}
                className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-destructive/50"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setModalExcluir(false); setCodigoConfirmacao(""); }}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => excluirMutation.mutate({ id: operacaoId, codigoConfirmacao })}
                disabled={excluirMutation.isPending || codigoConfirmacao.trim().toUpperCase() !== operacao.codigoOperacao.trim().toUpperCase()}
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

// ─── Tab Documentos ───────────────────────────────────────────────────────────

function TabDocumentos({ operacaoId, isAdmin, userId }: { operacaoId: number; isAdmin: boolean; userId: number }) {
  const { data: docs, isLoading, refetch } = trpc.documentos.listar.useQuery({ operacaoId });
  const { data: complementares, refetch: refetchComp } = trpc.documentos.complementares.listar.useQuery({ operacaoId });
  const uploadMutation = trpc.documentos.upload.useMutation({
    onSuccess: () => { refetch(); toast.success("Documento enviado!"); },
    onError: (e) => toast.error("Erro no upload: " + e.message),
  });
  const atualizarEstadoMutation = trpc.documentos.atualizarEstado.useMutation({
    onSuccess: () => { refetch(); toast.success("Estado atualizado!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const uploadCompMutation = trpc.documentos.complementares.upload.useMutation({
    onSuccess: () => { refetchComp(); toast.success("Documento complementar enviado!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDocId, setUploadingDocId] = useState<number | null>(null);

  const handleFileUpload = async (file: File, docId?: number, nomeDoc?: string, categoria?: string) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 20MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      setUploadingDocId(docId ?? -1);
      try {
        await uploadMutation.mutateAsync({
          operacaoId,
          documentoId: docId,
          nomeDocumento: nomeDoc ?? file.name,
          categoria: categoria ?? "Geral",
          fileBase64: base64,
          fileName: file.name,
          mimeType: file.type,
        });
      } finally {
        setUploadingDocId(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const total = docs?.length ?? 0;
  const enviados = docs?.filter((d) => d.estado !== "Pendente").length ?? 0;
  const pct = total > 0 ? Math.round((enviados / total) * 100) : 0;

  const categorias = Array.from(new Set(docs?.map((d) => d.categoria) ?? []));

  return (
    <div className="space-y-5">
      {/* Progresso */}
      <div className="card-premium p-4 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Progresso do Checklist</span>
          <span className="text-sm font-bold text-primary">{pct}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={cn("h-2 rounded-full transition-all duration-500", pct === 100 ? "bg-emerald-500" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{enviados} de {total} documentos enviados</p>
        {pct === 100 && (
          <div className="mt-2 flex items-center gap-2 text-emerald-400 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Checklist completo — IA Documental disponível para análise
          </div>
        )}
      </div>

      {/* Documentos por categoria */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-muted/20 rounded-md animate-pulse" />)}
        </div>
      ) : (
        categorias.map((cat) => (
          <div key={cat} className="card-premium rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/20">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cat}</h3>
            </div>
            <div className="divide-y divide-border/50">
              {docs?.filter((d) => d.categoria === cat).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between px-4 py-3 hover:bg-accent/20 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <DocEstadoDot estado={doc.estado} />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{doc.nomeDocumento}</p>
                      {doc.versaoAtual > 1 && (
                        <p className="text-[10px] text-muted-foreground">v{doc.versaoAtual}</p>
                      )}
                      {doc.observacao && (
                        <p className="text-xs text-yellow-400 mt-0.5">{doc.observacao}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <DocEstadoBadge estado={doc.estado} />
                    {doc.arquivoUrl && (
                      <a href={doc.arquivoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        Ver
                      </a>
                    )}
                    <label className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded text-xs cursor-pointer transition-colors",
                      uploadingDocId === doc.id
                        ? "opacity-50 cursor-not-allowed"
                        : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                    )}>
                      {uploadingDocId === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      {doc.arquivoUrl ? "Reenviar" : "Enviar"}
                      <input
                        type="file"
                        className="hidden"
                        accept=".jpg,.jpeg,.png,.heic,.webp,.pdf"
                        disabled={uploadingDocId === doc.id}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, doc.id, doc.nomeDocumento, doc.categoria);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {isAdmin && (
                      <select
                        value={doc.estado}
                        onChange={(e) => atualizarEstadoMutation.mutate({ documentoId: doc.id, estado: e.target.value as any })}
                        className="text-xs bg-input border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary/50"
                      >
                        {["Pendente","Enviado","Em Análise","Validado","Aprovado","Reprovado","Pendência encontrada","Ilegível","Vencido","Reenviar"].map((e) => (
                          <option key={e} value={e}>{e}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Documentos Complementares */}
      <div className="card-premium rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documentos Complementares</h3>
          <label className="flex items-center gap-1 px-2.5 py-1 rounded text-xs cursor-pointer bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors">
            <Plus className="w-3 h-3" />
            Adicionar
            <input
              type="file"
              className="hidden"
              accept=".jpg,.jpeg,.png,.heic,.webp,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const base64 = (ev.target?.result as string).split(",")[1];
                  await uploadCompMutation.mutateAsync({
                    operacaoId,
                    nomeArquivo: file.name,
                    fileBase64: base64,
                    fileName: file.name,
                    mimeType: file.type,
                  });
                };
                reader.readAsDataURL(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {complementares?.length === 0 ? (
          <div className="px-4 py-6 text-center text-muted-foreground text-sm">Nenhum documento complementar.</div>
        ) : (
          <div className="divide-y divide-border/50">
            {complementares?.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-foreground">{doc.nomeArquivo}</span>
                <a href={doc.arquivoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Ver</a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab Dados ────────────────────────────────────────────────────────────────

function TabDados({ operacao, isAdmin, onRefetch, userId }: { operacao: any; isAdmin: boolean; onRefetch: () => void; userId: number }) {
  const utils = trpc.useUtils();
  const atualizarMutation = trpc.operacoes.atualizar.useMutation({
    onSuccess: () => { onRefetch(); toast.success("Status atualizado!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const { data: equipeInterna } = trpc.usuarios.listarAdminOperacional.useQuery(undefined, { enabled: isAdmin });

  const STATUS_OPTIONS = [
    "Pré-cadastro","Aguardando documentos","Documentação parcial","Documentos ilegíveis","Aguardando SCR",
    "Documentação completa","Em análise IA","Em validação humana","Pronta para distribuição","Em distribuição",
    "Distribuída","Em retorno bancário","Aguardando cliente","Aprovada","Reprovada","Cancelada","Stand-by",
  ];

  const field = (label: string, value: string | null | undefined) => (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm text-foreground font-medium">{value || "—"}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Status */}
      {isAdmin && (
        <div className="card-premium p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-foreground mb-3">Alterar Status</h3>
          <div className="flex items-center gap-3">
            <select
              defaultValue={operacao.statusMacro}
              onChange={(e) => atualizarMutation.mutate({ id: operacao.id, statusMacro: e.target.value })}
              className="flex-1 px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <StatusBadge status={operacao.statusMacro} />
          </div>
        </div>
      )}

      {/* Dados Pessoais */}
      <div className="card-premium p-5 rounded-lg">
        <h3 className="text-sm font-semibold text-foreground mb-4 border-b border-border pb-2">Dados do Tomador</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {field("Nome", operacao.nomeCliente)}
          {field("CPF", operacao.cpf)}
          {field("Estado Civil", operacao.estadoCivil)}
          {field("E-mail", operacao.emailTomador)}
          {field("Telefone", operacao.telefoneTomador)}
        </div>
        {operacao.nomeConjuge && (
          <>
            <h4 className="text-xs font-semibold text-muted-foreground mt-4 mb-3 border-t border-border pt-3">Cônjuge</h4>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {field("Nome", operacao.nomeConjuge)}
              {field("E-mail", operacao.emailConjuge)}
              {field("Telefone", operacao.telefoneConjuge)}
            </div>
          </>
        )}
      </div>

      {/* Dados Financeiros */}
      <div className="card-premium p-5 rounded-lg">
        <h3 className="text-sm font-semibold text-foreground mb-4 border-b border-border pb-2">Dados Financeiros</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {field("Produto", operacao.produto)}
          {field("Valor Solicitado", Number(operacao.valorSolicitado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))}
          {field("Prazo", `${operacao.prazo} meses`)}
          <div className="col-span-2 lg:col-span-3">
            {field("Finalidade", operacao.finalidade)}
          </div>
        </div>
      </div>

      {/* Observações */}
      {operacao.observacoesEstrategicas && (
        <div className="card-premium p-5 rounded-lg">
          <h3 className="text-sm font-semibold text-foreground mb-3 border-b border-border pb-2">Observações Estratégicas</h3>
          <p className="text-sm text-foreground whitespace-pre-wrap">{operacao.observacoesEstrategicas}</p>
        </div>
      )}

      {/* Responsável Operacional */}
      {isAdmin && (
        <div className="card-premium p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-foreground mb-3">Responsável Operacional</h3>
          <select
            value={operacao.responsavelOperacionalId ?? ""}
            onChange={(e) => atualizarMutation.mutate({ id: operacao.id, responsavelOperacionalId: e.target.value ? Number(e.target.value) : null })}
            className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
          >
            <option value="">Sem responsável definido</option>
            {(equipeInterna ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.perfil})</option>
            ))}
          </select>
        </div>
      )}

      {/* Metadados */}
      <div className="card-premium p-5 rounded-lg">
        <h3 className="text-sm font-semibold text-foreground mb-4 border-b border-border pb-2">Controle</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {field("Criado em", format(new Date(operacao.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR }))}
          {field("Última movimentação", formatDistanceToNow(new Date(operacao.ultimaMovimentacaoEm), { locale: ptBR, addSuffix: true }))}
          {field("Validação IA", operacao.statusValidacaoIa)}
        </div>
      </div>

      {/* Defesa de Crédito */}
      {(operacao.resumoInteligente || operacao.defesaComercial) && (
        <DefesaCreditoSection
          resumo={operacao.resumoInteligente}
          defesa={operacao.defesaComercial}
        />
      )}
    </div>
  );
}

function DefesaCreditoSection({ resumo, defesa }: { resumo?: string | null; defesa?: string | null }) {
  const [copiado, setCopiado] = useState<"resumo" | "defesa" | null>(null);

  const copiar = async (texto: string, campo: "resumo" | "defesa") => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(campo);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <div className="card-premium rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-violet-500/5 flex items-center gap-2">
        <Shield className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-semibold text-foreground">Defesa de Crédito</h3>
        <span className="text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full border border-violet-500/30 ml-auto">Somente leitura</span>
      </div>
      <div className="p-5 space-y-5">
        {resumo && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resumo Inteligente</p>
              <button
                onClick={() => copiar(resumo, "resumo")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/40 transition-colors"
              >
                {copiado === "resumo" ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Download className="w-3 h-3" />}
                {copiado === "resumo" ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <div className="bg-muted/20 rounded-lg p-4 border border-border/50">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{resumo}</p>
            </div>
          </div>
        )}
        {defesa && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Defesa Comercial</p>
              <button
                onClick={() => copiar(defesa, "defesa")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/40 transition-colors"
              >
                {copiado === "defesa" ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Download className="w-3 h-3" />}
                {copiado === "defesa" ? "Copiado!" : "Copiar defesa"}
              </button>
            </div>
            <div className="bg-violet-500/5 rounded-lg p-4 border border-violet-500/20">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{defesa}</p>
            </div>
          </div>
        )}
        {!resumo && !defesa && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma defesa de crédito gerada para esta operação.</p>
        )}
      </div>
    </div>
  );

}
// ─── Tab Análise IA ───────────────────────────────────────────────────────────

function TabAnaliseIA({ operacaoId, operacao, userId }: { operacaoId: number; operacao: any; userId: number }) {
  const { data: analises, isLoading, refetch } = trpc.ia.listar.useQuery({ operacaoId });
  const analisarDocMutation = trpc.ia.analisarDocumental.useMutation({
    onSuccess: () => { refetch(); toast.success("Análise documental concluída!"); },
    onError: (e) => toast.error("Erro na análise: " + e.message),
  });
  const gerarDefesaMutation = trpc.ia.gerarDefesa.useMutation({
    onSuccess: () => { refetch(); toast.success("Defesa comercial gerada!"); },
    onError: (e) => toast.error("Erro na geração: " + e.message),
  });

  const { data: docs } = trpc.documentos.listar.useQuery({ operacaoId });
  const totalDocs = docs?.length ?? 0;
  const enviadosDocs = docs?.filter((d) => d.estado !== "Pendente").length ?? 0;
  const checklistCompleto = totalDocs > 0 && enviadosDocs === totalDocs;

  const ultimaDocumental = analises?.find((a) => a.camada === "documental" && a.statusProcessamento === "concluido");
  const ultimaAnalista = analises?.find((a) => a.camada === "analista" && a.statusProcessamento === "concluido");

  return (
    <div className="space-y-5">
      {/* Aviso obrigatório */}
      <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-yellow-400">Aviso de Responsabilidade</p>
          <p className="text-xs text-yellow-400/80 mt-1">
            As análises geradas por IA são ferramentas de apoio operacional. A validação final, aprovação e responsabilidade sobre as operações permanecem integralmente com os analistas humanos da Ativa Soluções. Não utilize os resultados da IA como único critério de decisão.
          </p>
        </div>
      </div>

      {/* IA Documental */}
      <div className="card-premium p-5 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              IA Documental
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Validação automática dos documentos via OCR e LLM</p>
          </div>
          <button
            onClick={() => analisarDocMutation.mutate({ operacaoId })}
            disabled={!checklistCompleto || analisarDocMutation.isPending}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
              checklistCompleto && !analisarDocMutation.isPending
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {analisarDocMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
            {analisarDocMutation.isPending ? "Analisando..." : "Executar Análise"}
          </button>
        </div>

        {/* Aviso de responsabilidade */}
        <div className="flex items-start gap-2 p-3 bg-yellow-500/8 border border-yellow-500/20 rounded-md mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-yellow-400/80">
            A análise documental é gerada por IA e serve como auxílio. A validação final é responsabilidade exclusiva do analista humano.
          </p>
        </div>

        {!checklistCompleto && (
          <p className="text-xs text-muted-foreground mb-3">
            ⚠️ Checklist incompleto ({enviadosDocs}/{totalDocs} docs). Envie todos os documentos para habilitar a análise.
          </p>
        )}

        {ultimaDocumental && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Última análise: {formatDistanceToNow(new Date(ultimaDocumental.createdAt), { locale: ptBR, addSuffix: true })}
              {ultimaDocumental.tokensConsumidos && ` · ${ultimaDocumental.tokensConsumidos} tokens`}
            </p>
            {(() => {
              const resultado = ultimaDocumental.resultadoJson as any;
              const docsList = resultado?.documentos ?? [];
              return (
                <div className="space-y-2">
                  {docsList.map((d: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-muted/20 rounded-md">
                      <SemaforoBadge cor={d.semaforo} className="flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{d.nome}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{d.observacao}</p>
                        {d.dados_extraidos && Object.keys(d.dados_extraidos).length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {Object.entries(d.dados_extraidos).map(([k, v]) => (
                              <span key={k} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                                {k}: {String(v)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* IA Analista */}
      <div className="card-premium p-5 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Bot className="w-4 h-4 text-violet-400" />
              IA Analista — Defesa Comercial
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Gera defesa positiva para apresentação às IFs (máx. 2.000 chars)</p>
          </div>
          <button
            onClick={() => gerarDefesaMutation.mutate({ operacaoId })}
            disabled={gerarDefesaMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-400 border border-violet-500/30 hover:bg-violet-500/30 transition-colors disabled:opacity-50"
          >
            {gerarDefesaMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
            {gerarDefesaMutation.isPending ? "Gerando..." : "Gerar Defesa"}
          </button>
        </div>

        {ultimaAnalista && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Gerada {formatDistanceToNow(new Date(ultimaAnalista.createdAt), { locale: ptBR, addSuffix: true })}
              {ultimaAnalista.tokensConsumidos && ` · ${ultimaAnalista.tokensConsumidos} tokens`}
            </p>

            {Boolean(ultimaAnalista.resultadoJson) && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(ultimaAnalista.resultadoJson as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="bg-muted/20 rounded-md p-2.5">
                    <p className="text-[10px] text-muted-foreground capitalize">{k.replace(/_/g, " ")}</p>
                    <p className="text-xs font-medium text-foreground mt-0.5">{String(v)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Parte 2 — defesa textual */}
            {ultimaAnalista.resultadoTexto && (
              <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-4">
                <p className="text-xs font-semibold text-violet-400 mb-2">Defesa Comercial</p>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {ultimaAnalista.resultadoTexto.slice(0, 2000)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  {ultimaAnalista.resultadoTexto.length} / 2.000 caracteres
                </p>
              </div>
            )}

            {/* Aviso de responsabilidade (repetido junto à resposta) */}
            <div className="flex items-start gap-2 p-3 bg-yellow-500/8 border border-yellow-500/20 rounded-md">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-yellow-400/80">
                Esta defesa foi gerada por IA e deve ser revisada por um analista humano antes de ser utilizada. A responsabilidade pela operação é integralmente do analista responsável.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab IFs ──────────────────────────────────────────────────────────────────

function TabIFs({ operacaoId, isAdmin, userId, produto, valorSolicitado, valorGarantia, prazo }: { operacaoId: number; isAdmin: boolean; userId: number; produto?: string; valorSolicitado?: number; valorGarantia?: number; prazo?: number }) {
  const { data: ifs, isLoading, refetch } = trpc.ifs.listar.useQuery({ operacaoId });
  const utils = trpc.useUtils();
  const [pendenciarModal, setPendenciarModal] = useState(false);
  const [descricaoPendencia, setDescricaoPendencia] = useState("");
  const [pendenciando, setPendenciando] = useState(false);
  const atualizarOperacaoMutation = trpc.operacoes.atualizar.useMutation({
    onSuccess: () => utils.operacoes.obter.invalidate({ id: operacaoId }),
    onError: (e) => toast.error("Erro ao atualizar status: " + e.message),
  });
  const distribuirOperacao = () => {
    atualizarOperacaoMutation.mutate({
      id: operacaoId,
      statusMacro: "Em distribuição",
      motivo: "Operação distribuída para instituições financeiras.",
    });
    toast.success("Status atualizado para \"Em distribuição\"!");
  };
  const pendenciarOperacao = async () => {
    if (!descricaoPendencia.trim()) { toast.error("Descreva a pendência antes de confirmar."); return; }
    setPendenciando(true);
    try {
      await atualizarOperacaoMutation.mutateAsync({ id: operacaoId, statusMacro: "Aguardando cliente", motivo: descricaoPendencia.trim() });
      toast.success("Operação pendenciada! Status: Aguardando cliente.");
      setPendenciarModal(false);
      setDescricaoPendencia("");
    } catch { /* tratado no onError */ } finally { setPendenciando(false); }
  };
  // Calcular LTV estimado
  const ltv = valorSolicitado && valorGarantia && valorGarantia > 0
    ? Math.round((valorSolicitado / valorGarantia) * 100 * 10) / 10
    : undefined;
  // Motor bancário inteligente: filtrar IFs compatíveis por produto/LTV/valor/prazo
  const { data: ifsCompativeis } = trpc.ifCadastros.listarCompativeis.useQuery(
    { produto: produto ?? "", valorSolicitado, ltv, prazo },
    { enabled: isAdmin && !!produto }
  );
  // Fallback para lista simples quando produto não definido
  const { data: ifsAtivasFallback } = trpc.ifCadastros.listarAtivas.useQuery(
    undefined,
    { enabled: isAdmin && !produto }
  );
  const ifsAtivas = produto ? (ifsCompativeis ?? []) : (ifsAtivasFallback ?? []);
  const criarMutation = trpc.ifs.criar.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); setNovaIF({ ifCadastroId: 0, dataEnvio: "", prazoRetornoEstimado: "", proximaAcao: "" }); toast.success("IF adicionada e distribuição registrada!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const atualizarMutation = trpc.ifs.atualizar.useMutation({
    onSuccess: () => { refetch(); toast.success("IF atualizada!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const [showForm, setShowForm] = useState(false);
  const [novaIF, setNovaIF] = useState({ ifCadastroId: 0, dataEnvio: "", prazoRetornoEstimado: "", proximaAcao: "" });
  // Para distribuição em lote (Selecionar Todas)
  const [modoLote, setModoLote] = useState(false);
  const [selecionadas, setSelecionadas] = useState<number[]>([]);
  const [loteEnviando, setLoteEnviando] = useState(false);

  const STATUS_IF = ["Aguardando", "Em análise", "Aprovado", "Reprovado", "Stand-by"] as const;

  const toggleSelecionada = (id: number) =>
    setSelecionadas((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const selecionarTodas = () =>
    setSelecionadas((ifsAtivas ?? []).map((if_) => if_.id));

  const limparSelecao = () => setSelecionadas([]);

  const enviarLote = async () => {
    if (selecionadas.length === 0) return;
    setLoteEnviando(true);
    try {
      for (const ifCadastroId of selecionadas) {
        await criarMutation.mutateAsync({
          operacaoId,
          ifCadastroId,
          dataEnvio: novaIF.dataEnvio || undefined,
          prazoRetornoEstimado: novaIF.prazoRetornoEstimado || undefined,
          proximaAcao: novaIF.proximaAcao || undefined,
        });
      }
      toast.success(`${selecionadas.length} IF${selecionadas.length !== 1 ? "s" : ""} distribuída${selecionadas.length !== 1 ? "s" : ""} com sucesso!`);
      setShowForm(false);
      setModoLote(false);
      setSelecionadas([]);
    } catch {
      toast.error("Erro ao distribuir em lote.");
    } finally {
      setLoteEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={distribuirOperacao}
              disabled={atualizarOperacaoMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded-lg text-sm hover:bg-teal-500/20 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Distribuir
            </button>
            <button
              onClick={() => setPendenciarModal(true)}
              disabled={atualizarOperacaoMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-sm hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              <AlertTriangle className="w-4 h-4" />
              Pendenciar
            </button>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg text-sm hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Enviar para IF
          </button>
        </div>
      )}

      {/* Modal de Pendenciar */}
      {pendenciarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-foreground">Pendenciar Operação</h3>
                <p className="text-sm text-muted-foreground mt-1">Descreva o motivo da pendência. O status será atualizado e registrado no histórico.</p>
              </div>
            </div>
            <textarea
              className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500/50 min-h-[100px] resize-none"
              placeholder="Ex: Documentos da garantia incompletos, aguardando laudo de avaliação..."
              value={descricaoPendencia}
              onChange={(e) => setDescricaoPendencia(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setPendenciarModal(false); setDescricaoPendencia(""); }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={pendenciarOperacao}
                disabled={pendenciando || !descricaoPendencia.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-colors disabled:opacity-50"
              >
                {pendenciando ? "Pendenciando..." : "Confirmar Pendência"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="card-premium p-4 rounded-lg space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Enviar para Instituição Financeira</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Selecione uma IF parceira cadastrada. A distribuição será registrada automaticamente para rastreabilidade.</p>
            </div>
            {/* Botão alternar modo lote */}
            {(ifsAtivas ?? []).length > 1 && (
              <button
                onClick={() => { setModoLote((v) => !v); setSelecionadas([]); }}
                className={cn(
                  "flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors",
                  modoLote
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
                )}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {modoLote ? "Modo individual" : "Selecionar múltiplas"}
              </button>
            )}
          </div>

          {/* Aviso de filtro por produto + motor bancário */}
          {produto && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-primary/8 border border-primary/20">
              <Building2 className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-primary/80">
                Motor bancário ativo para <strong>{produto}</strong>.
                {ltv !== undefined && <> LTV estimado: <strong>{ltv}%</strong>.</>}
                {(ifsAtivas as any[]).filter((i: any) => i.compativel !== false).length === 0 ? (
                  <> Nenhuma IF compatível encontrada —{" "}
                    <Link href="/ifs" className="underline underline-offset-2 font-medium hover:text-primary transition-colors">
                      ajuste as condições na tela de IFs
                    </Link>.
                  </>
                ) : (
                  ` ${(ifsAtivas as any[]).filter((i: any) => i.compativel !== false).length} compatível${(ifsAtivas as any[]).filter((i: any) => i.compativel !== false).length !== 1 ? "is" : ""} · ${(ifsAtivas as any[]).filter((i: any) => i.compativel === false).length} incompatível${(ifsAtivas as any[]).filter((i: any) => i.compativel === false).length !== 1 ? "is" : ""}.`
                )}
              </p>
            </div>
          )}

          {/* Modo lote: lista de checkboxes com tags de taxa/prazo */}
          {modoLote ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{selecionadas.length} de {(ifsAtivas ?? []).length} selecionada{selecionadas.length !== 1 ? "s" : ""}</span>
                <div className="flex gap-2">
                  <button onClick={selecionarTodas} className="text-xs text-primary hover:underline">Selecionar todas</button>
                  <span className="text-muted-foreground text-xs">·</span>
                  <button onClick={limparSelecao} className="text-xs text-muted-foreground hover:text-foreground hover:underline">Limpar</button>
                </div>
              </div>
              <div className="rounded-lg border border-border overflow-hidden divide-y divide-border/40">
                {(ifsAtivas as any[]).map((if_: any) => {
                  const checked = selecionadas.includes(if_.id);
                  const taxa = if_.taxaMinima;
                  const prazoMax = if_.prazoMaximo;
                  const compativel = if_.compativel !== false; // undefined = sem motor (fallback)
                  const motivo = if_.motivoIncompatibilidade;
                  return (
                    <label
                      key={if_.id}
                      className={cn(
                        "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors select-none",
                        !compativel ? "opacity-60 bg-red-500/5" : checked ? "bg-primary/8" : "hover:bg-muted/30"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => compativel && toggleSelecionada(if_.id)}
                        disabled={!compativel}
                        className="accent-primary w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <span className={cn("text-sm", compativel ? "text-foreground" : "text-muted-foreground line-through")}>{if_.nome}</span>
                        {!compativel && motivo && (
                          <p className="text-[10px] text-red-400 mt-0.5 leading-tight">{motivo}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {compativel && (
                          <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">Compatível</span>
                        )}
                        {taxa && (
                          <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                            {Number(taxa).toFixed(2)}% a.m.
                          </span>
                        )}
                        {prazoMax && (
                          <span className="text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-full">
                            até {prazoMax}m
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Modo individual: select com tags de taxa/prazo abaixo */
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Instituição Financeira *</label>
                <select
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
                  value={novaIF.ifCadastroId || ""}
                  onChange={(e) => setNovaIF((p) => ({ ...p, ifCadastroId: Number(e.target.value) }))}
                >
                  <option value="">
                    {(ifsAtivas ?? []).length === 0 && produto
                      ? "Nenhuma IF disponível para este produto"
                      : "Selecione uma IF parceira..."}
                  </option>
                  {(ifsAtivas as any[]).map((if_: any) => (
                    <option key={if_.id} value={if_.id} disabled={if_.compativel === false}>
                      {if_.compativel === false ? `⚠ ${if_.nome} (incompatível)` : if_.nome}
                    </option>
                  ))}
                </select>
              </div>
              {/* Tags de taxa/prazo da IF selecionada */}
              {novaIF.ifCadastroId > 0 && (() => {
                const sel = (ifsAtivas ?? []).find((x) => x.id === novaIF.ifCadastroId);
                const taxa = sel ? (sel as any).taxaMinima : null;
                const prazo = sel ? (sel as any).prazoMaximo : null;
                if (!taxa && !prazo) return null;
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    {taxa && (
                      <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        Taxa mín.: {Number(taxa).toFixed(2)}% a.m.
                      </span>
                    )}
                    {prazo && (
                      <span className="text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                        Prazo máx.: {prazo} meses
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Campos comuns: data, prazo, próxima ação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data de Envio</label>
              <input type="date" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50" value={novaIF.dataEnvio} onChange={(e) => setNovaIF((p) => ({ ...p, dataEnvio: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prazo de Retorno Estimado</label>
              <input type="date" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50" value={novaIF.prazoRetornoEstimado} onChange={(e) => setNovaIF((p) => ({ ...p, prazoRetornoEstimado: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Próxima Ação</label>
              <input className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50" value={novaIF.proximaAcao} onChange={(e) => setNovaIF((p) => ({ ...p, proximaAcao: e.target.value }))} placeholder="Próximo passo..." />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowForm(false); setModoLote(false); setSelecionadas([]); }}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            {modoLote ? (
              <button
                onClick={enviarLote}
                disabled={selecionadas.length === 0 || loteEnviando}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loteEnviando ? "Enviando..." : `Distribuir para ${selecionadas.length} IF${selecionadas.length !== 1 ? "s" : ""}`}
              </button>
            ) : (
              <button
                onClick={() => criarMutation.mutate({ operacaoId, ifCadastroId: novaIF.ifCadastroId, dataEnvio: novaIF.dataEnvio || undefined, prazoRetornoEstimado: novaIF.prazoRetornoEstimado || undefined, proximaAcao: novaIF.proximaAcao || undefined })}
                disabled={!novaIF.ifCadastroId || criarMutation.isPending}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {criarMutation.isPending ? "Salvando..." : "Salvar e Registrar Distribuição"}
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-muted/20 rounded-md animate-pulse" />)}</div>
      ) : ifs?.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Nenhuma instituição financeira cadastrada.
        </div>
      ) : (
        <div className="space-y-3">
          {ifs?.map((if_) => {
            const prazoVencido = if_.prazoRetornoEstimado && new Date(if_.prazoRetornoEstimado) < new Date() && if_.status !== "Aprovado" && if_.status !== "Reprovado";
            return (
              <div key={if_.id} className={cn("card-premium p-4 rounded-lg", prazoVencido && "border-red-500/30")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-foreground">{if_.nomeInstituicao}</h4>
                      <IFStatusBadge status={if_.status} />
                      {prazoVencido && <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded-full">Prazo vencido</span>}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      {if_.dataEnvio && <span>Enviado: {format(new Date(if_.dataEnvio), "dd/MM/yyyy")}</span>}
                      {if_.prazoRetornoEstimado && <span className={prazoVencido ? "text-red-400" : ""}>Prazo: {format(new Date(if_.prazoRetornoEstimado), "dd/MM/yyyy")}</span>}
                      {if_.ultimaInteracao && <span>Última interação: {formatDistanceToNow(new Date(if_.ultimaInteracao), { locale: ptBR, addSuffix: true })}</span>}
                    </div>
                    {if_.proximaAcao && <p className="text-xs text-foreground mt-1.5">→ {if_.proximaAcao}</p>}
                    {if_.retorno && <p className="text-xs text-muted-foreground mt-1 italic">{if_.retorno}</p>}
                    {if_.motivoRecusa && <p className="text-xs text-red-400 mt-1">Recusa: {if_.motivoRecusa}</p>}
                  </div>
                  {isAdmin && (
                    <select
                      value={if_.status}
                      onChange={(e) => atualizarMutation.mutate({ id: if_.id, status: e.target.value as any })}
                      className="text-xs bg-input border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary/50"
                    >
                      {STATUS_IF.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab Histórico ────────────────────────────────────────────────────────────

function TabHistorico({ operacaoId }: { operacaoId: number }) {
  const { data: historico, isLoading } = trpc.historico.listar.useQuery({ operacaoId });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-muted/20 rounded-md animate-pulse" />)}</div>
      ) : historico?.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Nenhum histórico registrado.
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-3 pl-10">
            {historico?.map((h, i) => (
              <div key={h.id} className="relative">
                <div className="absolute -left-[26px] w-3 h-3 rounded-full bg-primary border-2 border-background" />
                <div className="card-premium p-3 rounded-lg">
                  <div className="flex items-center gap-2 flex-wrap">
                    {h.statusAnterior && (
                      <>
                        <StatusBadge status={h.statusAnterior} />
                        <span className="text-muted-foreground text-xs">→</span>
                      </>
                    )}
                    <StatusBadge status={h.statusNovo} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(h.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {(h as any).alteradoPorNome && (
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-primary/70 font-medium">{(h as any).alteradoPorNome}</span>
                      </div>
                    )}
                  </div>
                  {h.motivo && (
                    <div className="mt-1.5 px-2 py-1 bg-muted/30 rounded text-xs text-muted-foreground border-l-2 border-primary/30">
                      {h.motivo}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function DocEstadoDot({ estado }: { estado: string }) {
  const colors: Record<string, string> = {
    "Pendente": "bg-zinc-500",
    "Enviado": "bg-blue-400",
    "Em Análise": "bg-violet-400",
    "Aprovado": "bg-emerald-400",
    "Reprovado": "bg-red-400",
    "Ilegível": "bg-orange-400",
    "Vencido": "bg-yellow-400",
    "Reenviar": "bg-amber-400",
    "Validado": "bg-teal-400",
    "Pendência encontrada": "bg-rose-400",
  };
  return <span className={cn("w-2 h-2 rounded-full flex-shrink-0", colors[estado] ?? "bg-zinc-500")} />;
}

function DocEstadoBadge({ estado }: { estado: string }) {
  const classes: Record<string, string> = {
    "Pendente": "bg-zinc-700/50 text-zinc-400 border-zinc-600/30",
    "Enviado": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "Em Análise": "bg-violet-500/20 text-violet-400 border-violet-500/30",
    "Aprovado": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "Reprovado": "bg-red-500/20 text-red-400 border-red-500/30",
    "Ilegível": "bg-orange-500/20 text-orange-400 border-orange-500/30",
    "Vencido": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    "Reenviar": "bg-amber-500/20 text-amber-400 border-amber-500/30",
    "Validado": "bg-teal-500/20 text-teal-400 border-teal-500/30",
    "Pendência encontrada": "bg-rose-500/20 text-rose-400 border-rose-500/30",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap", classes[estado] ?? "bg-zinc-700/50 text-zinc-400 border-zinc-600/30")}>
      {estado}
    </span>
  );
}

function IFStatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    "Aguardando": "bg-zinc-700/50 text-zinc-400 border-zinc-600/30",
    "Em análise": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "Aprovado": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "Reprovado": "bg-red-500/20 text-red-400 border-red-500/30",
    "Stand-by": "bg-slate-500/20 text-slate-400 border-slate-500/30",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap", classes[status] ?? "bg-zinc-700/50 text-zinc-400 border-zinc-600/30")}>
      {status}
    </span>
  );
}

// ─── Tab Distribuição ─────────────────────────────────────────────────────────
function TabDistribuicao({ operacaoId, operacao }: { operacaoId: number; operacao: any }) {
  const utils = trpc.useUtils();
  const [etapa, setEtapa] = useState<string | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [pendenciasModal, setPendenciasModal] = useState<string[] | null>(null);

  const { data: exportacoes, refetch: refetchExportacoes } = trpc.distribuicao.listarExportacoes.useQuery({ operacaoId });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const previewMutation = trpc.distribuicao.gerarPdfPreview.useMutation({
    onSuccess: (data) => {
      setPreviewUrl(data.pdfUrl);
      setGerandoPreview(false);
    },
    onError: (err) => {
      setGerandoPreview(false);
      setPreviewOpen(false);
      toast.error("Erro ao gerar preview: " + err.message);
    },
  });
  const exportarMutation = trpc.distribuicao.exportarDossie.useMutation({
    onSuccess: (data) => {
      if (data.requerConfirmacao && data.pendencias.length > 0) {
        setPendenciasModal(data.pendencias);
        setExportando(false);
        setEtapa(null);
        setProgresso(0);
        return;
      }
      setEtapa("Pronto!");
      setProgresso(100);
      setTimeout(() => {
        setExportando(false);
        setEtapa(null);
        setProgresso(0);
        refetchExportacoes();
        if (data.zipUrl) {
          window.open(data.zipUrl, "_blank");
        }
        toast.success("Dossiê exportado com sucesso!");
      }, 1200);
    },
    onError: (err) => {
      setExportando(false);
      setEtapa(null);
      setProgresso(0);
      toast.error("Erro ao exportar: " + err.message);
    },
  });

  const ETAPAS = [
    "Coletando documentos...",
    "Renomeando arquivos...",
    "Gerando PDFs...",
    "Montando ZIP...",
    "Enviando para armazenamento...",
  ];

  async function iniciarExportacao(forcar = false) {
    setExportando(true);
    setProgresso(0);

    // Simular progresso visual enquanto o backend processa
    let step = 0;
    const interval = setInterval(() => {
      if (step < ETAPAS.length) {
        setEtapa(ETAPAS[step]);
        setProgresso(Math.round(((step + 1) / (ETAPAS.length + 1)) * 90));
        step++;
      }
    }, 900);

    try {
      await exportarMutation.mutateAsync({ operacaoId, forcarMesmoComPendencias: forcar });
    } finally {
      clearInterval(interval);
    }
  }

  const statusOperacao = (operacao as any)?.statusMacro;
  const prontaParaDistribuicao = statusOperacao === "Pronta para distribuição" || statusOperacao === "Em distribuição" || statusOperacao === "Distribuída";

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Exportar Dossiê</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gera um arquivo ZIP com todos os documentos organizados em pastas, PDF de resumo e defesa de crédito.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setPreviewOpen(true); setPreviewUrl(null); setGerandoPreview(true); previewMutation.mutate({ operacaoId }); }}
            disabled={exportando || gerandoPreview}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              "bg-card border border-border hover:border-amber-500/50 text-foreground",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            )}
          >
            {gerandoPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4 text-amber-400" />}
            {gerandoPreview ? "Gerando..." : "Preview PDF"}
          </button>
          <button
            onClick={() => iniciarExportacao(false)}
            disabled={exportando}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              "bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            )}
          >
            {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            {exportando ? "Exportando..." : "Exportar Operação"}
          </button>
        </div>
      </div>

      {/* Aviso se não está pronta */}
      {!prontaParaDistribuicao && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-300">
            Esta operação está com status <strong>{statusOperacao}</strong>. Recomenda-se exportar apenas operações com status "Pronta para distribuição" ou superior.
          </p>
        </div>
      )}

      {/* Barra de progresso — overlay de tela cheia */}
      {exportando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
            {/* Ícone animado */}
            <div className="flex justify-center">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-amber-500/20" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-amber-500 animate-spin" />
                <Package className="absolute inset-0 m-auto w-7 h-7 text-amber-400" />
              </div>
            </div>

            {/* Título e etapa atual */}
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">Gerando Dossiê...</p>
              <p className="text-sm text-amber-400 font-medium min-h-[20px] transition-all duration-300">
                {etapa || "Iniciando..."}
              </p>
            </div>

            {/* Barra de progresso */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progresso</span>
                <span className="text-amber-400 font-semibold">{progresso}%</span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            </div>

            {/* Etapas como stepper */}
            <div className="space-y-2">
              {ETAPAS.map((e, i) => {
                const limiar = Math.round(((i + 1) / (ETAPAS.length + 1)) * 90);
                const concluida = progresso > limiar;
                const atual = etapa === e;
                return (
                  <div key={e} className={cn("flex items-center gap-3 text-sm transition-all duration-300", concluida ? "opacity-100" : atual ? "opacity-100" : "opacity-40")}>
                    <div className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold border transition-all",
                      concluida ? "bg-amber-500 border-amber-500 text-black" : atual ? "border-amber-500 text-amber-400 animate-pulse" : "border-border text-muted-foreground"
                    )}>
                      {concluida ? "✓" : i + 1}
                    </div>
                    <span className={cn(concluida ? "text-foreground line-through decoration-amber-500/50" : atual ? "text-amber-300 font-medium" : "text-muted-foreground")}>
                      {e}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs text-muted-foreground">Por favor, aguarde. Isso pode levar alguns segundos.</p>
          </div>
        </div>
      )}

      {/* Estrutura do ZIP */}
      <div className="p-4 rounded-lg bg-card border border-border">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Estrutura do Dossiê</h4>
        <div className="space-y-1 text-sm font-mono">
          {[
            { pasta: "01_Defesa_de_Credito.pdf", desc: "Defesa gerada pela IA" },
            { pasta: "02_Resumo_da_Operacao.pdf", desc: "Dados completos da operação" },
            { pasta: "04_Documentos_Cliente/", desc: "RG, CPF, IRPF, renda..." },
            { pasta: "05_Documentos_Conjuge/", desc: "Documentos do cônjuge (se aplicável)" },
            { pasta: "06_Documentos_Garantia/", desc: "Matrícula, IPTU, fotos..." },
            { pasta: "07_Documentos_PJ/", desc: "Contrato social, balanço..." },
            { pasta: "08_Documentos_Complementares/", desc: "Outros anexos" },
          ].map(({ pasta, desc }) => (
            <div key={pasta} className="flex items-center gap-3 py-1 border-b border-border/50 last:border-0">
              <span className="text-primary/80 text-xs">{pasta}</span>
              <span className="text-muted-foreground text-xs ml-auto">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico de exportações */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Histórico de Exportações</h4>
        {!exportacoes || exportacoes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhuma exportação realizada ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {exportacoes.map((exp) => (
              <div key={exp.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                <div className={cn("w-2 h-2 rounded-full shrink-0", exp.status === "completa" ? "bg-emerald-500" : "bg-amber-500")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">
                      {exp.status === "completa" ? "Exportação completa" : "Exportação com pendências"}
                    </span>
                    <span className="text-muted-foreground text-xs">·</span>
                    <span className="text-muted-foreground text-xs">{exp.totalDocs} doc(s)</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {exp.nomeUsuario || "Sistema"} · {format(new Date(exp.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </div>
                  {Boolean(exp.pendencias && Array.isArray(exp.pendencias) && (exp.pendencias as unknown[]).length > 0) && (
                    <div className="text-xs text-amber-400 mt-1">
                      Pendências: {Array.isArray(exp.pendencias) ? (exp.pendencias as unknown[]).map(String).join(", ") : ""}
                    </div>
                  )}
                </div>
                {exp.zipUrl && (
                  <a
                    href={exp.zipUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Baixar
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Preview do PDF */}
      {previewOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col" style={{ height: '90vh' }}>
            {/* Header do modal */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-foreground text-sm">Preview do Dossiê</h3>
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30">PDF</span>
              </div>
              <div className="flex items-center gap-2">
                {previewUrl && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Abrir em nova aba
                  </a>
                )}
                <button
                  onClick={() => { setPreviewOpen(false); setPreviewUrl(null); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Corpo do modal */}
            <div className="flex-1 overflow-hidden relative">
              {!previewUrl ? (
                /* Loading state com skeleton */
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-muted/10">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-amber-500/20" />
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-amber-500 animate-spin" />
                    <FileText className="absolute inset-0 m-auto w-7 h-7 text-amber-400" />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium text-foreground">Gerando preview do PDF...</p>
                    <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos</p>
                  </div>
                  {/* Skeleton de linhas */}
                  <div className="w-64 space-y-2 mt-2">
                    {[80, 60, 90, 50, 75].map((w, i) => (
                      <div key={i} className="h-2.5 bg-muted/40 rounded-full animate-pulse" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                </div>
              ) : (
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0"
                  title="Preview do Dossiê"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de pendências */}
      {pendenciasModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-foreground">Documentos pendentes</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Os seguintes documentos ainda estão pendentes ou reprovados:
                </p>
              </div>
            </div>
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {pendenciasModal.map((p) => (
                <li key={p} className="flex items-center gap-2 text-sm text-amber-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Deseja exportar mesmo assim? O dossiê será marcado como "com pendências".
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendenciasModal(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setPendenciasModal(null);
                  iniciarExportacao(true);
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-colors"
              >
                Exportar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
