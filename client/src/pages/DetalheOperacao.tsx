import { useAuth } from "@/_core/hooks/useAuth";
import { PrioridadeBadge, ProdutoBadge, RascunhoBadge, SemaforoBadge, StatusBadge, StatusIaBadge } from "@/components/AtivaBadges";
import AtivaDashboardLayout from "@/components/AtivaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

type Tab = "documentos" | "dados" | "ia" | "ifs" | "historico";

interface Props {
  params: { id: string };
}

export default function DetalheOperacao({ params }: Props) {
  const { user } = useAuth();
  const isAdmin = (user as any)?.perfil === "admin";
  const operacaoId = Number(params.id);
  const [activeTab, setActiveTab] = useState<Tab>("documentos");

  const { data: operacao, isLoading, refetch } = trpc.operacoes.obter.useQuery({ id: operacaoId });

  const tabs = [
    { id: "documentos" as Tab, label: "Documentos", icon: FileText },
    { id: "dados" as Tab, label: "Dados", icon: Info },
    ...(isAdmin ? [{ id: "ia" as Tab, label: "Análise IA", icon: Bot }] : []),
    { id: "ifs" as Tab, label: "Instituições", icon: Building2 },
    { id: "historico" as Tab, label: "Histórico", icon: History },
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
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
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
                  {tab.id === "ia" && (
                    <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full border border-primary/30">Admin</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === "documentos" && <TabDocumentos operacaoId={operacaoId} isAdmin={isAdmin} userId={(user as any)?.id} />}
          {activeTab === "dados" && <TabDados operacao={operacao} isAdmin={isAdmin} onRefetch={refetch} userId={(user as any)?.id} />}
          {activeTab === "ia" && isAdmin && <TabAnaliseIA operacaoId={operacaoId} operacao={operacao} userId={(user as any)?.id} />}
          {activeTab === "ifs" && <TabIFs operacaoId={operacaoId} isAdmin={isAdmin} userId={(user as any)?.id} />}
          {activeTab === "historico" && <TabHistorico operacaoId={operacaoId} />}
        </div>
      </div>
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
                        {["Pendente","Enviado","Em Análise","Aprovado","Reprovado","Ilegível","Vencido","Reenviar"].map((e) => (
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

  const STATUS_OPTIONS = [
    "Pré-cadastro","Aguardando documentos","Documentação parcial","Documentação completa",
    "Em análise IA","Em validação humana","Pronta para distribuição","Em distribuição",
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

      {/* Metadados */}
      <div className="card-premium p-5 rounded-lg">
        <h3 className="text-sm font-semibold text-foreground mb-4 border-b border-border pb-2">Controle</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {field("Criado em", format(new Date(operacao.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR }))}
          {field("Última movimentação", formatDistanceToNow(new Date(operacao.ultimaMovimentacaoEm), { locale: ptBR, addSuffix: true }))}
          {field("Validação IA", operacao.statusValidacaoIa)}
        </div>
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

function TabIFs({ operacaoId, isAdmin, userId }: { operacaoId: number; isAdmin: boolean; userId: number }) {
  const { data: ifs, isLoading, refetch } = trpc.ifs.listar.useQuery({ operacaoId });
  const criarMutation = trpc.ifs.criar.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); toast.success("IF adicionada!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const atualizarMutation = trpc.ifs.atualizar.useMutation({
    onSuccess: () => { refetch(); toast.success("IF atualizada!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const [showForm, setShowForm] = useState(false);
  const [novaIF, setNovaIF] = useState({ nomeInstituicao: "", dataEnvio: "", prazoRetornoEstimado: "", proximaAcao: "" });

  const STATUS_IF = ["Aguardando", "Em análise", "Aprovado", "Reprovado", "Stand-by"] as const;

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg text-sm hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar IF
          </button>
        </div>
      )}

      {showForm && (
        <div className="card-premium p-4 rounded-lg space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Nova Instituição Financeira</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome da IF *</label>
              <input
                className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
                value={novaIF.nomeInstituicao}
                onChange={(e) => setNovaIF((p) => ({ ...p, nomeInstituicao: e.target.value }))}
                placeholder="Ex: Banco do Brasil, Itaú..."
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data de Envio</label>
              <input type="date" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50" value={novaIF.dataEnvio} onChange={(e) => setNovaIF((p) => ({ ...p, dataEnvio: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prazo de Retorno Estimado</label>
              <input type="date" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50" value={novaIF.prazoRetornoEstimado} onChange={(e) => setNovaIF((p) => ({ ...p, prazoRetornoEstimado: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Próxima Ação</label>
              <input className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50" value={novaIF.proximaAcao} onChange={(e) => setNovaIF((p) => ({ ...p, proximaAcao: e.target.value }))} placeholder="Próximo passo..." />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent transition-colors">Cancelar</button>
            <button
              onClick={() => criarMutation.mutate({ operacaoId, ...novaIF })}
              disabled={!novaIF.nomeInstituicao || criarMutation.isPending}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {criarMutation.isPending ? "Salvando..." : "Salvar"}
            </button>
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
                  <div className="flex items-center gap-2 mt-1.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(h.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  {h.motivo && <p className="text-xs text-muted-foreground mt-1">{h.motivo}</p>}
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
