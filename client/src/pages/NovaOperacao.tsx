import AtivaDashboardLayout from "@/components/AtivaDashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  Edit3,
  Eye,
  FileText,
  FolderOpen,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Shield,
  Upload,
  User,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Etapa = 1 | 2 | 3 | 4 | 5;

interface DadosCliente {
  nomeCliente: string;
  telefoneTomador: string;
  emailTomador: string;
}

interface DadosOperacao {
  produto: "Home Equity" | "Auto Equity" | "Rural Equity" | "Imóvel em Construção";
  valorSolicitado: string;
  valorGarantia: string;
  tipoGarantiaDescricao: string;
  prazo: number;
  finalidade: string;
  contextoOperacao: string;
  responsavelOperacionalId?: number;
}

interface ArquivoLocal {
  id: string;
  file: File;
  status: "pendente" | "enviando" | "enviado" | "erro";
  erro?: string;
}

export default function NovaOperacao() {
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [operacaoId, setOperacaoId] = useState<number | null>(null);
  const [codigoOperacao, setCodigoOperacao] = useState<string>("");
  const [dadosCliente, setDadosCliente] = useState<Partial<DadosCliente>>({});
  const [dadosOperacao, setDadosOperacao] = useState<Partial<DadosOperacao>>({});

  const etapas = [
    { id: 1, label: "Dados do Cliente", icon: User },
    { id: 2, label: "Dados da Operação", icon: ClipboardList },
    { id: 3, label: "Documentos", icon: FileText },
    { id: 4, label: "Resumo + Defesa", icon: Bot },
    { id: 5, label: "SCR / Enviar", icon: Send },
  ];

  return (
    <AtivaDashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Nova Operação</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {codigoOperacao ? (
              <span className="font-mono text-primary">{codigoOperacao}</span>
            ) : (
              "Preencha as etapas para cadastrar a operação"
            )}
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-2">
          {etapas.map((e, idx) => {
            const Icon = e.icon;
            const isActive = etapa === e.id;
            const isDone = etapa > e.id;
            return (
              <React.Fragment key={e.id}>
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0",
                    isActive && "bg-primary/15 text-primary border border-primary/30",
                    isDone && "text-emerald-400",
                    !isActive && !isDone && "text-muted-foreground"
                  )}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  )}
                  <span className="hidden sm:inline">{e.label}</span>
                  <span className="sm:hidden">{e.id}</span>
                </div>
                {idx < etapas.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-border flex-shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="card-premium rounded-lg p-6">
          {etapa === 1 && (
            <Etapa1DadosCliente
              dados={dadosCliente}
              onChange={setDadosCliente}
              onNext={() => setEtapa(2)}
            />
          )}
          {etapa === 2 && (
            <Etapa2DadosOperacao
              dados={dadosOperacao}
              onChange={setDadosOperacao}
              dadosCliente={dadosCliente}
              onBack={() => setEtapa(1)}
              onNext={(codigo, opId) => {
                setCodigoOperacao(codigo);
                setOperacaoId(opId);
                setEtapa(3);
              }}
            />
          )}
          {etapa === 3 && codigoOperacao && (
            <Etapa3Documentos
              codigoOperacao={codigoOperacao}
              operacaoId={operacaoId ?? 0}
              produto={dadosOperacao.produto!}
              onBack={() => setEtapa(2)}
              onNext={() => setEtapa(4)}
            />
          )}
          {etapa === 4 && codigoOperacao && (
            <Etapa4ResumoDefesa
              codigoOperacao={codigoOperacao}
              operacaoId={operacaoId ?? 0}
              dadosOperacao={dadosOperacao}
              onBack={() => setEtapa(3)}
              onNext={() => setEtapa(5)}
            />
          )}
          {etapa === 5 && codigoOperacao && (
            <Etapa5ScrEnviar
              codigoOperacao={codigoOperacao}
              operacaoId={operacaoId ?? 0}
              nomeCliente={dadosCliente.nomeCliente ?? ""}
              telefoneTomador={dadosCliente.telefoneTomador ?? ""}
              emailTomador={dadosCliente.emailTomador ?? ""}
            />
          )}
        </div>
      </div>
    </AtivaDashboardLayout>
  );
}

// ─── Etapa 1: Dados do Cliente ────────────────────────────────────────────────

function Etapa1DadosCliente({
  dados,
  onChange,
  onNext,
}: {
  dados: Partial<DadosCliente>;
  onChange: (d: Partial<DadosCliente>) => void;
  onNext: () => void;
}) {
  const [erros, setErros] = useState<Record<string, string>>({});

  const set = (field: keyof DadosCliente, value: string) => {
    onChange({ ...dados, [field]: value });
    if (erros[field]) setErros((e) => ({ ...e, [field]: "" }));
  };

  const validar = () => {
    const e: Record<string, string> = {};
    if (!dados.nomeCliente?.trim() || dados.nomeCliente.trim().length < 2) e.nomeCliente = "Nome obrigatório (mínimo 2 caracteres)";
    if (!dados.telefoneTomador?.trim() || dados.telefoneTomador.replace(/\D/g, "").length < 10) e.telefoneTomador = "Telefone inválido";
    if (!dados.emailTomador?.includes("@")) e.emailTomador = "E-mail inválido";
    setErros(e);
    return Object.keys(e).length === 0;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Dados do Cliente</h2>
        <p className="text-sm text-muted-foreground">
          Apenas as informações básicas de contato. CPF, estado civil e demais dados serão extraídos automaticamente pela IA na Etapa 4.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <FieldInput
          label="Nome Completo *"
          value={dados.nomeCliente ?? ""}
          onChange={(v) => set("nomeCliente", v)}
          placeholder="Nome completo do tomador"
          error={erros.nomeCliente}
        />
        <FieldInput
          label="Telefone / WhatsApp *"
          value={dados.telefoneTomador ?? ""}
          onChange={(v) => {
            const digits = v.replace(/\D/g, "").slice(0, 11);
            const formatted = digits.length <= 10
              ? digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3")
              : digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
            set("telefoneTomador", formatted);
          }}
          placeholder="(11) 99999-9999"
          error={erros.telefoneTomador}
        />
        <FieldInput
          label="E-mail *"
          value={dados.emailTomador ?? ""}
          onChange={(v) => set("emailTomador", v)}
          placeholder="email@exemplo.com"
          error={erros.emailTomador}
          type="email"
        />
      </div>

      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
        <p className="text-xs text-primary/80 flex items-start gap-2">
          <Bot className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          CPF, RG, data de nascimento, estado civil e dados do cônjuge serão extraídos automaticamente pela IA a partir dos documentos enviados na Etapa 3.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => validar() && onNext()} className="btn-primary gap-2">
          Próxima Etapa
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Etapa 2: Dados da Operação ───────────────────────────────────────────────

function Etapa2DadosOperacao({
  dados,
  onChange,
  dadosCliente,
  onBack,
  onNext,
}: {
  dados: Partial<DadosOperacao>;
  onChange: (d: Partial<DadosOperacao>) => void;
  dadosCliente: Partial<DadosCliente>;
  onBack: () => void;
  onNext: (codigo: string, opId: number) => void;
}) {
  const [erros, setErros] = useState<Record<string, string>>({});
  const criarMutation = trpc.operacoes.criar.useMutation();
  const { data: equipeInterna } = trpc.usuarios.listarAdminOperacional.useQuery();
  const [, navigate] = useLocation();

  const set = (field: keyof DadosOperacao, value: any) => {
    onChange({ ...dados, [field]: value });
    if (erros[field]) setErros((e) => ({ ...e, [field]: "" }));
  };

  const validar = () => {
    const e: Record<string, string> = {};
    if (!dados.produto) e.produto = "Produto obrigatório";
    if (!dados.valorSolicitado?.trim()) e.valorSolicitado = "Valor obrigatório";
    if (!dados.valorGarantia?.trim()) e.valorGarantia = "Valor da garantia obrigatório";
    if (!dados.tipoGarantiaDescricao?.trim()) e.tipoGarantiaDescricao = "Tipo de garantia obrigatório";
    if (!dados.prazo || dados.prazo < 1) e.prazo = "Prazo obrigatório";
    if (!dados.finalidade?.trim()) e.finalidade = "Finalidade obrigatória";
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (rascunho: boolean) => {
    if (!validar()) return;
    try {
      const result = await criarMutation.mutateAsync({
        nomeCliente: dadosCliente.nomeCliente!,
        emailTomador: dadosCliente.emailTomador!,
        telefoneTomador: dadosCliente.telefoneTomador!,
        produto: dados.produto!,
        valorSolicitado: dados.valorSolicitado!,
        valorGarantia: dados.valorGarantia,
        tipoGarantiaDescricao: dados.tipoGarantiaDescricao,
        prazo: dados.prazo!,
        finalidade: dados.finalidade!,
        contextoOperacao: dados.contextoOperacao,
        statusRascunho: rascunho,
        etapaAtual: rascunho ? 2 : 3,
        responsavelOperacionalId: dados.responsavelOperacionalId,
      });
      toast.success(`Operação ${result.codigoOperacao} criada!`);
      if (rascunho) {
        navigate("/operacoes");
      } else {
        onNext(result.codigoOperacao, 0);
      }
    } catch (err: any) {
      // Log técnico apenas no console
      console.error("[NovaOperacao] Erro ao criar:", err);
      // Mensagem amigável ao usuário
      const msg = err?.data?.code === "UNAUTHORIZED"
        ? "Sessão expirada. Faça login novamente."
        : err?.data?.code === "FORBIDDEN"
        ? "Você não tem permissão para criar operações."
        : err?.data?.code === "BAD_REQUEST"
        ? "Dados inválidos. Verifique os campos e tente novamente."
        : "Não foi possível salvar a operação. Tente novamente em instantes.";
      toast.error(msg);
    }
  };

  // Normaliza valor monetário para cálculo de LTV (suporta 1.000.000,00 e 1000000)
  const parseLTV = (v?: string): number => {
    if (!v) return 0;
    const clean = v.replace(/[^\d.,]/g, "");
    if (clean.includes(",")) return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
    const parts = clean.split(".");
    if (parts.length > 2) return parseFloat(parts.join("")) || 0;
    return parseFloat(clean) || 0;
  };

  const ltv = dados.valorSolicitado && dados.valorGarantia && parseLTV(dados.valorGarantia) > 0
    ? ((parseLTV(dados.valorSolicitado) / parseLTV(dados.valorGarantia)) * 100).toFixed(1)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Dados da Operação</h2>
        <p className="text-sm text-muted-foreground">Produto, valores e finalidade do crédito</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Produto *</Label>
          <Select value={dados.produto ?? ""} onValueChange={(v) => set("produto", v)}>
            <SelectTrigger className={cn("bg-background/50", erros.produto && "border-red-500")}>
              <SelectValue placeholder="Selecione o produto" />
            </SelectTrigger>
            <SelectContent>
              {["Home Equity", "Auto Equity", "Rural Equity", "Imóvel em Construção"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {erros.produto && <p className="text-xs text-red-400">{erros.produto}</p>}
        </div>

        <FieldInput
          label="Valor Solicitado (R$) *"
          value={dados.valorSolicitado ?? ""}
          onChange={(v) => set("valorSolicitado", v.replace(/[^\d.,]/g, ""))}
          placeholder="Ex: 250000"
          error={erros.valorSolicitado}
        />

        <FieldInput
          label="Valor Aproximado da Garantia (R$) *"
          value={dados.valorGarantia ?? ""}
          onChange={(v) => set("valorGarantia", v.replace(/[^\d.,]/g, ""))}
          placeholder="Ex: 500000"
          error={erros.valorGarantia}
        />

        <FieldInput
          label="Tipo de Garantia *"
          value={dados.tipoGarantiaDescricao ?? ""}
          onChange={(v) => set("tipoGarantiaDescricao", v)}
          placeholder="Ex: Imóvel residencial, Veículo, Fazenda..."
          error={erros.tipoGarantiaDescricao}
        />

        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Prazo (meses) *</Label>
          <Input
            type="number"
            min={1}
            max={360}
            value={dados.prazo ?? ""}
            onChange={(e) => set("prazo", Number(e.target.value))}
            placeholder="Ex: 240"
            className={cn("bg-background/50", erros.prazo && "border-red-500")}
          />
          {erros.prazo && <p className="text-xs text-red-400">{erros.prazo}</p>}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Finalidade *</Label>
          <Input
            value={dados.finalidade ?? ""}
            onChange={(e) => set("finalidade", e.target.value)}
            placeholder="Ex: Capital de giro, reforma, quitação de dívidas..."
            className={cn("bg-background/50", erros.finalidade && "border-red-500")}
          />
          {erros.finalidade && <p className="text-xs text-red-400">{erros.finalidade}</p>}
        </div>
      </div>

      {ltv && (
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center gap-3">
          <Shield className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="text-sm">
            <span className="text-muted-foreground">LTV estimado: </span>
            <span className="font-semibold text-primary">{ltv}%</span>
            <span className="text-muted-foreground ml-2 text-xs">(valor solicitado ÷ valor da garantia)</span>
          </div>
        </div>
      )}

      {/* Responsável Operacional — visível apenas para admin/operacional */}
      {equipeInterna && equipeInterna.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Responsável Operacional</Label>
          <Select
            value={dados.responsavelOperacionalId ? String(dados.responsavelOperacionalId) : ""}
            onValueChange={(v) => set("responsavelOperacionalId", v && v !== "unassigned" ? Number(v) : undefined)}
          >
            <SelectTrigger className="bg-background/50">
              <SelectValue placeholder="Selecione o responsável interno..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Sem responsável definido</SelectItem>
              {equipeInterna.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name} <span className="text-muted-foreground text-xs ml-1 capitalize">({u.perfil})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-sm text-muted-foreground">
          Contexto da Operação
          <span className="ml-2 text-xs text-muted-foreground/60">(resumo da conversa com o cliente — usado pela IA para gerar a defesa)</span>
        </Label>
        <Textarea
          value={dados.contextoOperacao ?? ""}
          onChange={(e) => set("contextoOperacao", e.target.value)}
          placeholder="Descreva o perfil do cliente, histórico, motivação, pontos positivos que devem ser destacados na análise. Quanto mais detalhes, melhor a defesa gerada pela IA."
          className="bg-background/50 min-h-[100px] resize-none"
          rows={4}
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => handleSubmit(true)}
            disabled={criarMutation.isPending}
            className="gap-2 text-muted-foreground"
          >
            {criarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Salvar Rascunho
          </Button>
          <Button
            onClick={() => handleSubmit(false)}
            disabled={criarMutation.isPending}
            className="btn-primary gap-2"
          >
            {criarMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Criar e Continuar
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Etapa 3: Documentos ──────────────────────────────────────────────────────

function Etapa3Documentos({
  codigoOperacao,
  operacaoId: operacaoIdProp,
  produto,
  onBack,
  onNext,
}: {
  codigoOperacao: string;
  operacaoId: number;
  produto: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const { data: ops } = trpc.operacoes.listar.useQuery({ busca: codigoOperacao });
  const operacaoId = ops?.find((o) => o.codigoOperacao === codigoOperacao)?.id ?? operacaoIdProp;

  const { data: documentos, refetch } = trpc.documentos.listar.useQuery(
    { operacaoId: operacaoId! },
    { enabled: !!operacaoId }
  );
  const uploadMutation = trpc.documentos.upload.useMutation();
  const conferirMutation = trpc.ia.conferirDocumentos.useMutation();
  const atualizarMutation = trpc.operacoes.atualizar.useMutation();

  const [filaArquivos, setFilaArquivos] = useState<Record<number, ArquivoLocal[]>>({});
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  type DocStatus = {
    id: number;
    nome: string;
    semaforo: "verde" | "amarelo" | "vermelho";
    tipo_identificado: string;
    legivel: boolean;
    pertence_ao_cliente: boolean | null;
    observacao: string;
    dados_extraidos: {
      titular_identificado: string | null;
      data_emissao: string | null;
      validade: string | null;
      numero_documento: string | null;
    };
  };
  type LeituraOperacional = {
    perfil_patrimonial: string | null;
    perfil_financeiro: string | null;
    grau_organizacao_documental: "alto" | "médio" | "baixo" | null;
    complexidade_operacao: "simples" | "média" | "complexa" | null;
    mitigadores_risco: string[];
    fragilidades: string[];
    aderencia_bancaria_aparente: "alta" | "média" | "baixa" | null;
  };
  const [resultadoConferencia, setResultadoConferencia] = useState<{
    aprovado: boolean;
    situacaoGeral: string;
    documentosPorStatus: DocStatus[];
    dadosExtraidos: Record<string, string | null> | null;
    leituraOperacional: LeituraOperacional | null;
    pendenciasCriticas: string[];
    pendenciasSecundarias: string[];
    documentosAusentes: string[];
    resumo: string;
    checklist_total: number;
    checklist_concluidos: number;
  } | null>(null);
  const [conferindo, setConferindo] = useState(false);

  // Visualizador de arquivos
  const [visualizadorAberto, setVisualizadorAberto] = useState(false);
  const [previewArquivo, setPreviewArquivo] = useState<{ url: string; nome: string; tipo: string } | null>(null);
  const [zoomPreview, setZoomPreview] = useState(1);

  // Perfil extraído pela IA (exibido após conferência)
  const [perfilExtraido, setPerfilExtraido] = useState<Record<string, string | null> | null>(null);

  // Índice do arquivo atual na lista de navegação
  const [previewIndex, setPreviewIndex] = useState(0);

  const abrirPreview = (url: string, nome: string, index?: number) => {
    const ext = nome.toLowerCase().split(".").pop() ?? "";
    const tipo = ["pdf"].includes(ext) ? "pdf" : ["jpg", "jpeg", "png", "webp", "heic"].includes(ext) ? "imagem" : "outro";
    setPreviewArquivo({ url, nome, tipo });
    setZoomPreview(1);
    setPreviewIndex(index ?? 0);
    setVisualizadorAberto(true);
  };

  const navegarPreview = (direcao: "anterior" | "proximo") => {
    if (!documentos) return;
    const lista = documentos.filter((d) => d.arquivoUrl);
    const novoIdx = direcao === "proximo"
      ? Math.min(previewIndex + 1, lista.length - 1)
      : Math.max(previewIndex - 1, 0);
    const doc = lista[novoIdx];
    if (doc?.arquivoUrl) {
      abrirPreview(doc.arquivoUrl, doc.nomeDocumento, novoIdx);
    }
  };

  // Upload em lote
  const classificarMutation = trpc.ia.classificarDocumentos.useMutation();
  const loteInputRef = useRef<HTMLInputElement | null>(null);
  type ArquivoLote = {
    id: string;
    file: File;
    status: "aguardando" | "classificando" | "enviando" | "enviado" | "nao_classificado" | "erro";
    documentoId: number | null;
    documentoNome: string | null;
    confianca: string | null;
    motivo: string | null;
    erro?: string;
  };
  const [arquivosLote, setArquivosLote] = useState<ArquivoLote[]>([]);
  const [classificando, setClassificando] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const processarLote = useCallback(async (files: FileList | File[]) => {
    if (!operacaoId || !documentos) return;
    const filesArr = Array.from(files);
    if (filesArr.length === 0) return;

    // Detectar duplicatas
    const nomesExistentes = new Set(arquivosLote.map((a) => `${a.file.name}-${a.file.size}`));
    const novos: File[] = [];
    const duplicados: string[] = [];
    for (const f of filesArr) {
      const key = `${f.name}-${f.size}`;
      if (nomesExistentes.has(key)) duplicados.push(f.name);
      else novos.push(f);
    }
    if (duplicados.length > 0) {
      toast.warning(`${duplicados.length} arquivo(s) duplicado(s) ignorado(s): ${duplicados.slice(0, 3).join(", ")}${duplicados.length > 3 ? "..." : ""}`);
    }
    if (novos.length === 0) return;

    // Adicionar na fila com status aguardando
    const novosLote: ArquivoLote[] = novos.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      status: "aguardando" as const,
      documentoId: null,
      documentoNome: null,
      confianca: null,
      motivo: null,
    }));
    setArquivosLote((prev) => [...prev, ...novosLote]);

    // Classificar com IA
    setClassificando(true);
    setArquivosLote((prev) =>
      prev.map((a) => novosLote.find((n) => n.id === a.id) ? { ...a, status: "classificando" as const } : a)
    );
    try {
      const resultado = await classificarMutation.mutateAsync({
        operacaoId,
        arquivos: novos.map((f) => ({ nome: f.name, mimeType: f.type || "application/octet-stream", tamanhoBytes: f.size })),
      });

      // Mapear resultado de volta para os arquivos da fila
      const mapa = new Map(resultado.classificacoes.map((c) => [c.indiceArquivo, c]));
      const checklistMap = new Map(resultado.checklistItems.map((c: any) => [c.id, c.nome]));

      // Atualizar status e documentoId
      const lotesAtualizados = novosLote.map((a, idx) => {
        const cl = mapa.get(idx);
        if (!cl) return { ...a, status: "nao_classificado" as const };
        return {
          ...a,
          status: "aguardando" as const,
          documentoId: cl.documentoId,
          documentoNome: cl.documentoId ? (checklistMap.get(cl.documentoId) ?? null) : null,
          confianca: cl.confianca,
          motivo: cl.motivo,
        };
      });

      setArquivosLote((prev) =>
        prev.map((a) => {
          const atualizado = lotesAtualizados.find((n) => n.id === a.id);
          return atualizado ?? a;
        })
      );

      // Fazer upload de cada arquivo classificado
      for (const arq of lotesAtualizados) {
        if (arq.file.size > 20 * 1024 * 1024) {
          setArquivosLote((prev) => prev.map((a) => a.id === arq.id ? { ...a, status: "erro" as const, erro: "Arquivo muito grande (máx. 20MB)" } : a));
          continue;
        }
        setArquivosLote((prev) => prev.map((a) => a.id === arq.id ? { ...a, status: "enviando" as const } : a));
        try {
          const base64 = await fileToBase64(arq.file);
          // Se classificado, vincular ao documentoId; se não, usar primeiro doc como complementar
          const docAlvo = arq.documentoId
            ? documentos.find((d) => d.id === arq.documentoId)
            : null;
          const docComplementar = documentos[documentos.length - 1]; // fallback
          const docFinal = docAlvo ?? docComplementar;
          if (!docFinal) { setArquivosLote((prev) => prev.map((a) => a.id === arq.id ? { ...a, status: "erro" as const, erro: "Nenhum item do checklist disponível" } : a)); continue; }
          await uploadMutation.mutateAsync({
            operacaoId,
            documentoId: docFinal.id,
            nomeDocumento: docFinal.nomeDocumento,
            categoria: docFinal.categoria,
            fileBase64: base64,
            fileName: arq.file.name,
            mimeType: arq.file.type || "application/octet-stream",
          });
          setArquivosLote((prev) => prev.map((a) => a.id === arq.id ? { ...a, status: "enviado" as const } : a));
        } catch (err: any) {
          setArquivosLote((prev) => prev.map((a) => a.id === arq.id ? { ...a, status: "erro" as const, erro: err.message } : a));
        }
      }
      refetch();
      setResultadoConferencia(null);
      toast.success(`${lotesAtualizados.filter((a) => a.documentoId !== null).length} arquivo(s) processado(s) com sucesso.`);
    } catch (err: any) {
      setArquivosLote((prev) =>
        prev.map((a) => novosLote.find((n) => n.id === a.id) ? { ...a, status: "erro" as const, erro: "Erro na classificação" } : a)
      );
      toast.error("Erro ao classificar documentos: " + err.message);
    } finally {
      setClassificando(false);
    }
  }, [operacaoId, documentos, arquivosLote, classificarMutation, uploadMutation, refetch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) processarLote(e.dataTransfer.files);
  }, [processarLote]);

  const removerArquivoLote = (id: string) => {
    setArquivosLote((prev) => prev.filter((a) => a.id !== id));
  };

  const enviados = documentos?.filter((d) => d.estado !== "Pendente") ?? [];
  const total = documentos?.length ?? 0;
  const progresso = total > 0 ? Math.round((enviados.length / total) * 100) : 0;

  const uploadArquivo = useCallback(
    async (doc: { id: number; nomeDocumento: string; categoria: string }, arquivo: ArquivoLocal) => {
      if (!operacaoId) return;
      if (arquivo.file.size > 16 * 1024 * 1024) {
        setFilaArquivos((prev) => ({
          ...prev,
          [doc.id]: (prev[doc.id] ?? []).map((a) =>
            a.id === arquivo.id ? { ...a, status: "erro" as const, erro: "Arquivo muito grande (máx. 16MB)" } : a
          ),
        }));
        toast.error(`${arquivo.file.name}: muito grande (máx. 16MB)`);
        return;
      }
      setFilaArquivos((prev) => ({
        ...prev,
        [doc.id]: (prev[doc.id] ?? []).map((a) =>
          a.id === arquivo.id ? { ...a, status: "enviando" as const } : a
        ),
      }));
      try {
        const base64 = await fileToBase64(arquivo.file);
        await uploadMutation.mutateAsync({
          operacaoId,
          documentoId: doc.id,
          nomeDocumento: doc.nomeDocumento,
          categoria: doc.categoria,
          fileBase64: base64,
          fileName: arquivo.file.name,
          mimeType: arquivo.file.type,
        });
        setFilaArquivos((prev) => ({
          ...prev,
          [doc.id]: (prev[doc.id] ?? []).map((a) =>
            a.id === arquivo.id ? { ...a, status: "enviado" as const } : a
          ),
        }));
        refetch();
        setResultadoConferencia(null);
      } catch (err: any) {
        setFilaArquivos((prev) => ({
          ...prev,
          [doc.id]: (prev[doc.id] ?? []).map((a) =>
            a.id === arquivo.id ? { ...a, status: "erro" as const, erro: err.message } : a
          ),
        }));
        toast.error(`Erro ao enviar ${arquivo.file.name}: ${err.message}`);
      }
    },
    [operacaoId, uploadMutation, refetch]
  );

  const handleFilesSelected = useCallback(
    async (doc: { id: number; nomeDocumento: string; categoria: string }, files: FileList) => {
      if (!operacaoId) return;
      const novosArquivos: ArquivoLocal[] = Array.from(files).map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "pendente" as const,
      }));
      setFilaArquivos((prev) => ({
        ...prev,
        [doc.id]: [...(prev[doc.id] ?? []), ...novosArquivos],
      }));
      for (const arquivo of novosArquivos) {
        await uploadArquivo(doc, arquivo);
      }
    },
    [operacaoId, uploadArquivo]
  );

  const removerArquivo = (docId: number, arquivoId: string) => {
    setFilaArquivos((prev) => ({
      ...prev,
      [docId]: (prev[docId] ?? []).filter((a) => a.id !== arquivoId),
    }));
  };

  const handleConferir = async () => {
    if (!operacaoId) return;
    setConferindo(true);
    try {
      const resultado = await conferirMutation.mutateAsync({ operacaoId });
      setResultadoConferencia(resultado as any);
      // Capturar perfil extraído para exibir no painel
      if ((resultado as any).dadosExtraidos) {
        setPerfilExtraido((resultado as any).dadosExtraidos);
      }
      if (resultado.aprovado) {
        toast.success("Documentação validada pela IA! Você pode prosseguir.");
        await atualizarMutation.mutateAsync({ id: operacaoId, etapaAtual: 4 });
      } else {
        const totalPend = ((resultado as any).pendenciasCriticas?.length ?? 0) + ((resultado as any).pendenciasSecundarias?.length ?? 0);
        toast.warning(`Análise concluída: ${totalPend} pendência(s) encontrada(s). Verifique os documentos abaixo.`);
      }
    } catch (err: any) {
      toast.error("Erro ao conferir documentação: " + err.message);
    } finally {
      setConferindo(false);
    }
  };

  const handleSalvarRascunho = async () => {
    if (!operacaoId) return;
    try {
      await atualizarMutation.mutateAsync({ id: operacaoId, statusRascunho: true, etapaAtual: 3 });
      toast.success("Operação salva como rascunho.");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Fase de testes: avanço sempre liberado — alertas visuais mantidos
  const podeProsseguir = true;

    const docsComArquivo = documentos?.filter((d) => d.arquivoUrl) ?? [];

    return (
    <div className="space-y-6">
      {/* Modal de Preview de Arquivo */}
      <Dialog open={visualizadorAberto} onOpenChange={setVisualizadorAberto}>
        <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-border/40 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-sm font-medium text-foreground truncate max-w-[40%]">
                {previewArquivo?.nome ?? "Visualizar arquivo"}
              </DialogTitle>
              {/* Navegação entre documentos */}
              {docsComArquivo.length > 1 && (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => navegarPreview("anterior")} disabled={previewIndex === 0} className="h-7 w-7 p-0">
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground">{previewIndex + 1}/{docsComArquivo.length}</span>
                  <Button size="sm" variant="ghost" onClick={() => navegarPreview("proximo")} disabled={previewIndex === docsComArquivo.length - 1} className="h-7 w-7 p-0">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-1 ml-auto">
                {previewArquivo?.tipo === "imagem" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setZoomPreview((z) => Math.max(0.5, z - 0.25))} className="h-7 w-7 p-0">
                      <ZoomOut className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoomPreview * 100)}%</span>
                    <Button size="sm" variant="ghost" onClick={() => setZoomPreview((z) => Math.min(3, z + 0.25))} className="h-7 w-7 p-0">
                      <ZoomIn className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
                {previewArquivo?.url && (
                  <a href={previewArquivo.url} download={previewArquivo.nome} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs">
                      <Download className="w-3.5 h-3.5" />Download
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-start justify-center bg-black/20 p-2">
            {previewArquivo?.tipo === "pdf" && (
              <iframe
                src={previewArquivo.url + "#toolbar=1&navpanes=0"}
                className="w-full h-full rounded border-0"
                title={previewArquivo.nome}
              />
            )}
            {previewArquivo?.tipo === "imagem" && (
              <img
                src={previewArquivo.url}
                alt={previewArquivo.nome}
                style={{ transform: `scale(${zoomPreview})`, transformOrigin: "top center", transition: "transform 0.2s" }}
                className="max-w-full rounded shadow-lg"
              />
            )}
            {previewArquivo?.tipo === "outro" && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <FileText className="w-12 h-12" />
                <p className="text-sm">Visualização não disponível para este tipo de arquivo.</p>
                <a href={previewArquivo.url} download={previewArquivo.nome} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Download className="w-3.5 h-3.5" />Baixar arquivo
                  </Button>
                </a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">Documentos — {produto}</h2>
          <p className="text-sm text-muted-foreground">
            Envie os documentos do checklist. Você pode anexar mais de um arquivo por item.
          </p>
        </div>
        {docsComArquivo.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const doc = docsComArquivo[0];
              if (doc?.arquivoUrl) abrirPreview(doc.arquivoUrl, doc.nomeDocumento, 0);
            }}
            className="gap-1.5 text-xs flex-shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            Visualizar Arquivos ({docsComArquivo.length})
          </Button>
        )}
      </div>

      {/* Área de Upload em Lote */}
      <div className="rounded-xl border border-dashed border-border bg-muted/30 overflow-hidden">
        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Upload de Documentação em Lote</span>
        </div>
        <div
          className={cn(
            "mx-4 mb-4 rounded-lg border-2 border-dashed transition-colors cursor-pointer",
            dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-muted/50"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => loteInputRef.current?.click()}
        >
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center pointer-events-none">
            <FolderOpen className={cn("w-10 h-10 mb-3", dragOver ? "text-primary" : "text-muted-foreground")} />
            <p className="text-sm text-foreground">
              Arraste ou <span className="text-primary font-semibold">clique para selecionar</span> todos os documentos da operação
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF · JPG · PNG · HEIC · WEBP · DOC · DOCX · XLS · XLSX — até 20MB por arquivo
            </p>
            {classificando && (
              <div className="flex items-center gap-2 mt-3 text-xs text-primary">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Classificando com IA...</span>
              </div>
            )}
          </div>
        </div>
        <input
          ref={loteInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(e) => { if (e.target.files) { processarLote(e.target.files); e.target.value = ""; } }}
        />

        {/* Lista de arquivos do lote */}
        {arquivosLote.length > 0 && (
          <div className="px-4 pb-4 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">{arquivosLote.length} arquivo(s) na fila</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {arquivosLote.map((arq) => (
                <div key={arq.id} className="flex items-center gap-2 rounded-md bg-background/60 border border-border px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{arq.file.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {arq.documentoNome
                        ? <span className="text-emerald-400">→ {arq.documentoNome}</span>
                        : arq.status === "nao_classificado"
                        ? <span className="text-amber-400">Não classificado</span>
                        : arq.status === "classificando"
                        ? <span className="text-primary">Classificando...</span>
                        : arq.motivo ?? ""}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {arq.status === "aguardando" && <span className="text-[10px] text-muted-foreground">Aguardando</span>}
                    {arq.status === "classificando" && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                    {arq.status === "enviando" && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
                    {arq.status === "enviado" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    {arq.status === "nao_classificado" && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                    {arq.status === "erro" && (
                      <span title={arq.erro}>
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removerArquivoLote(arq.id); }}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    title="Remover"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{enviados.length} de {total} itens com arquivo enviado</span>
          <span className={cn("font-semibold", progresso === 100 ? "text-emerald-400" : "text-primary")}>{progresso}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", progresso === 100 ? "bg-emerald-500" : "bg-primary")}
            style={{ width: `${progresso}%` }}
          />
        </div>
      </div>

      {resultadoConferencia && (
        <div className="space-y-3">
          {/* Status geral */}
          <div className={cn(
            "rounded-lg border p-4 space-y-3",
            resultadoConferencia.aprovado
              ? "border-emerald-500/30 bg-emerald-500/5"
              : resultadoConferencia.pendenciasCriticas.length > 0
                ? "border-red-500/30 bg-red-500/5"
                : "border-yellow-500/30 bg-yellow-500/5"
          )}>
            <div className="flex items-center gap-2 flex-wrap">
              {resultadoConferencia.aprovado
                ? <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                : resultadoConferencia.pendenciasCriticas.length > 0
                  ? <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  : <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />}
              <p className={cn(
                "font-medium text-sm",
                resultadoConferencia.aprovado ? "text-emerald-300"
                  : resultadoConferencia.pendenciasCriticas.length > 0 ? "text-red-300"
                  : "text-yellow-300"
              )}>
                {resultadoConferencia.situacaoGeral}
              </p>
              <span className="ml-auto text-xs text-muted-foreground">
                {resultadoConferencia.checklist_concluidos}/{resultadoConferencia.checklist_total} enviados
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{resultadoConferencia.resumo}</p>
            {resultadoConferencia.pendenciasCriticas.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-red-400 uppercase tracking-wider">Pendências críticas (bloqueiam avanço):</p>
                {resultadoConferencia.pendenciasCriticas.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-red-300/80">
                    <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-400" />
                    {p}
                  </div>
                ))}
              </div>
            )}
            {resultadoConferencia.pendenciasSecundarias.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-yellow-400 uppercase tracking-wider">Pendências secundárias (não bloqueiam):</p>
                {resultadoConferencia.pendenciasSecundarias.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-yellow-300/80">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-yellow-400" />
                    {p}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status por documento */}
          {resultadoConferencia.documentosPorStatus.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Análise por documento:</p>
              {resultadoConferencia.documentosPorStatus.map((docR) => (
                <div key={docR.id} className={cn(
                  "flex items-start gap-3 px-3 py-2.5 rounded-md border text-sm",
                  docR.semaforo === "verde" ? "border-emerald-500/20 bg-emerald-500/5"
                    : docR.semaforo === "amarelo" ? "border-yellow-500/20 bg-yellow-500/5"
                    : "border-red-500/20 bg-red-500/5"
                )}>
                  <span className="flex-shrink-0 mt-0.5">
                    {docR.semaforo === "verde" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      : docR.semaforo === "amarelo" ? <AlertTriangle className="w-4 h-4 text-yellow-400" />
                      : <XCircle className="w-4 h-4 text-red-400" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "font-medium",
                      docR.semaforo === "verde" ? "text-emerald-300"
                        : docR.semaforo === "amarelo" ? "text-yellow-300"
                        : "text-red-300"
                    )}>{docR.nome}</p>
                    {docR.tipo_identificado && docR.tipo_identificado !== docR.nome && (
                      <p className="text-xs text-muted-foreground">Identificado como: {docR.tipo_identificado}</p>
                    )}
                    {docR.observacao && (
                      <p className="text-xs text-muted-foreground mt-0.5">{docR.observacao}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Dados extraídos automaticamente */}
          {resultadoConferencia.dadosExtraidos && Object.values(resultadoConferencia.dadosExtraidos).some(v => v !== null && v !== "") && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <p className="text-xs font-medium text-primary uppercase tracking-wider">Dados extraídos automaticamente pela IA:</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                {Object.entries(resultadoConferencia.dadosExtraidos)
                  .filter(([, v]) => v !== null && v !== "")
                  .map(([k, v]) => (
                    <div key={k} className="text-xs">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}: </span>
                      <span className="text-foreground">{v}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Leitura Operacional */}
          {resultadoConferencia.leituraOperacional && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
              <p className="text-xs font-medium text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                Leitura Operacional da IA
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {resultadoConferencia.leituraOperacional.perfil_patrimonial && (
                  <div className="text-xs">
                    <span className="text-muted-foreground block">Perfil Patrimonial</span>
                    <span className="text-foreground">{resultadoConferencia.leituraOperacional.perfil_patrimonial}</span>
                  </div>
                )}
                {resultadoConferencia.leituraOperacional.perfil_financeiro && (
                  <div className="text-xs">
                    <span className="text-muted-foreground block">Perfil Financeiro</span>
                    <span className="text-foreground">{resultadoConferencia.leituraOperacional.perfil_financeiro}</span>
                  </div>
                )}
                {resultadoConferencia.leituraOperacional.grau_organizacao_documental && (
                  <div className="text-xs">
                    <span className="text-muted-foreground block">Organização Documental</span>
                    <span className={cn(
                      "font-medium capitalize",
                      resultadoConferencia.leituraOperacional.grau_organizacao_documental === "alto" ? "text-emerald-400" :
                      resultadoConferencia.leituraOperacional.grau_organizacao_documental === "médio" ? "text-yellow-400" : "text-red-400"
                    )}>{resultadoConferencia.leituraOperacional.grau_organizacao_documental}</span>
                  </div>
                )}
                {resultadoConferencia.leituraOperacional.aderencia_bancaria_aparente && (
                  <div className="text-xs">
                    <span className="text-muted-foreground block">Aderência Bancária</span>
                    <span className={cn(
                      "font-medium capitalize",
                      resultadoConferencia.leituraOperacional.aderencia_bancaria_aparente === "alta" ? "text-emerald-400" :
                      resultadoConferencia.leituraOperacional.aderencia_bancaria_aparente === "média" ? "text-yellow-400" : "text-red-400"
                    )}>{resultadoConferencia.leituraOperacional.aderencia_bancaria_aparente}</span>
                  </div>
                )}
              </div>
              {resultadoConferencia.leituraOperacional.mitigadores_risco?.length > 0 && (
                <div className="text-xs">
                  <span className="text-muted-foreground block mb-1">Mitigadores de Risco</span>
                  <ul className="space-y-0.5">
                    {resultadoConferencia.leituraOperacional.mitigadores_risco.map((m, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-emerald-300/80">
                        <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5 text-emerald-400" />{m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {resultadoConferencia.leituraOperacional.fragilidades?.length > 0 && (
                <div className="text-xs">
                  <span className="text-muted-foreground block mb-1">Fragilidades</span>
                  <ul className="space-y-0.5">
                    {resultadoConferencia.leituraOperacional.fragilidades.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-yellow-300/80">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-yellow-400" />{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {!documentos ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Carregando checklist...
          </div>
        ) : documentos.map((doc) => {
          const arquivosDoc = filaArquivos[doc.id] ?? [];
          const temEnviando = arquivosDoc.some((a) => a.status === "enviando");
          const temEnviados = arquivosDoc.filter((a) => a.status === "enviado").length;
          const isEnviado = doc.estado !== "Pendente";
          const docConferencia = null; // análise por documento removida na v2
          return (
            <div
              key={doc.id}
              className={cn(
                "rounded-lg border transition-colors",
                isEnviado ? "border-emerald-500/20 bg-emerald-500/5" : "border-border/40 bg-muted/10 hover:border-primary/30"
              )}
            >
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3 min-w-0">
                  {isEnviado
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    : <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{doc.nomeDocumento}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">{doc.categoria}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {temEnviados > 0 && (
                    <span className="text-xs text-emerald-400 hidden sm:block">{temEnviados} arquivo{temEnviados > 1 ? "s" : ""}</span>
                  )}
                  {/* Botão Visualizar — aparece quando há arquivo no banco */}
                  {doc.arquivoUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => abrirPreview(doc.arquivoUrl!, doc.nomeDocumento)}
                      className="gap-1 text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                      title="Visualizar arquivo"
                    >
                      <Eye className="w-3 h-3" />
                      <span className="hidden sm:inline">Ver</span>
                    </Button>
                  )}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                    multiple
                    className="hidden"
                    ref={(el) => { fileInputRefs.current[doc.id] = el; }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFilesSelected(doc, e.target.files);
                      }
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRefs.current[doc.id]?.click()}
                    disabled={temEnviando}
                    className={cn(
                      "gap-1.5 text-xs",
                      isEnviado ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : ""
                    )}
                  >
                    {temEnviando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    {isEnviado ? "Substituir" : temEnviados > 0 ? "Adicionar" : "Enviar"}
                  </Button>
                </div>
              </div>

              {arquivosDoc.length > 0 && (
                <div className="px-3 pb-3 space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Arquivos enviados</p>
                  {arquivosDoc.map((arq) => (
                    <div key={arq.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-background/60 border border-border/30">
                      <div className="flex items-center gap-2 min-w-0">
                        {arq.status === "enviando" && <Loader2 className="w-3 h-3 animate-spin text-primary flex-shrink-0" />}
                        {arq.status === "enviado" && <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                        {arq.status === "erro" && <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                        {arq.status === "pendente" && <div className="w-3 h-3 rounded-full border border-muted-foreground/30 flex-shrink-0" />}
                        <span className="text-xs text-foreground truncate max-w-[180px]">{arq.file.name}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatBytes(arq.file.size)}</span>
                        {arq.status === "erro" && arq.erro && (
                          <span className="text-[10px] text-red-400 truncate">{arq.erro}</span>
                        )}
                      </div>
                      {arq.status !== "enviando" && (
                        <button
                          onClick={() => removerArquivo(doc.id, arq.id)}
                          className="text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0 p-0.5"
                          title="Remover"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Painel: Lista de Arquivos com Visualizar/Substituir */}
      {docsComArquivo.length > 0 && (
        <div className="rounded-lg border border-border/40 overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/20 border-b border-border/30 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Arquivos Enviados ({docsComArquivo.length})</span>
          </div>
          <div className="divide-y divide-border/20">
            {docsComArquivo.map((doc, idx) => {
              const docR = resultadoConferencia?.documentosPorStatus?.find((d) => d.id === doc.id);
              return (
                <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{doc.nomeDocumento}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {docR ? (
                        <span className={cn(
                          "text-[10px] font-medium",
                          docR.semaforo === "verde" ? "text-emerald-400" : docR.semaforo === "amarelo" ? "text-yellow-400" : "text-red-400"
                        )}>
                          {docR.semaforo === "verde" ? "✅ Validado" : docR.semaforo === "amarelo" ? "⚠️ Ressalva" : "❌ Problema"}
                          {docR.tipo_identificado && docR.tipo_identificado !== doc.nomeDocumento ? ` — ${docR.tipo_identificado}` : ""}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{doc.categoria}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => abrirPreview(doc.arquivoUrl!, doc.nomeDocumento, idx)}
                      className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="w-3 h-3" />Visualizar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => fileInputRefs.current[doc.id]?.click()}
                      className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className="w-3 h-3" />Substituir
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Painel: Perfil Extraído pela IA */}
      {perfilExtraido && Object.values(perfilExtraido).some((v) => v !== null && v !== "") && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-primary/20 flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Perfil Extraído pela IA</span>
            <span className="ml-auto text-[10px] text-muted-foreground">Será usado automaticamente na Defesa Comercial</span>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
            {Object.entries(perfilExtraido)
              .filter(([, v]) => v !== null && v !== "")
              .map(([k, v]) => (
                <div key={k} className="text-xs">
                  <span className="text-muted-foreground capitalize block">{k.replace(/_/g, " ")}</span>
                  <span className="text-foreground font-medium">{v}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleSalvarRascunho}
            disabled={atualizarMutation.isPending}
            className="gap-2 text-muted-foreground text-sm"
          >
            {atualizarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Salvar Rascunho
          </Button>
          <Button
            variant="outline"
            onClick={handleConferir}
            disabled={conferindo || enviados.length === 0}
            className="gap-2"
          >
            {conferindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            Conferir Documentação
          </Button>
          <Button
            onClick={onNext}
            className="btn-primary gap-2"
          >
            Prosseguir
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Etapa 4: Resumo + Defesa Comercial ───────────────────────────────────────

function Etapa4ResumoDefesa({
  codigoOperacao,
  operacaoId: operacaoIdProp,
  dadosOperacao,
  onBack,
  onNext,
}: {
  codigoOperacao: string;
  operacaoId: number;
  dadosOperacao: Partial<DadosOperacao>;
  onBack: () => void;
  onNext: () => void;
}) {
  const { data: ops } = trpc.operacoes.listar.useQuery({ busca: codigoOperacao });
  const op = ops?.find((o) => o.codigoOperacao === codigoOperacao);
  const operacaoId = op?.id ?? operacaoIdProp;

  const extrairPerfilMutation = trpc.ia.extrairPerfil.useMutation();
  const gerarDefesaMutation = trpc.ia.gerarDefesaComercial.useMutation();
  const atualizarMutation = trpc.operacoes.atualizar.useMutation();

  const [perfil, setPerfil] = useState<{ success: boolean; perfil: Record<string, string> } | null>(null);
  const [defesa, setDefesa] = useState<string>("");
  const [editandoDefesa, setEditandoDefesa] = useState(false);
  const [defesaEditada, setDefesaEditada] = useState("");
  const [comentarioNovaDefesa, setComentarioNovaDefesa] = useState("");
  const [showComentario, setShowComentario] = useState(false);
  const [extraindo, setExtraindo] = useState(false);
  const [defesaAprovada, setDefesaAprovada] = useState(false);

  const perfilExistente = (op as any)?.perfilExtraidoJson as Record<string, string> | null;
  const defesaExistente = (op as any)?.defesaComercial as string | null;

  const perfilAtual = perfil ? { perfil: perfil.perfil, garantia: {} as Record<string, string> } : (perfilExistente ? { perfil: perfilExistente, garantia: {} as Record<string, string> } : null);
  const defesaAtual = defesa || defesaExistente || "";

  const handleExtrairPerfil = async () => {
    if (!operacaoId) return;
    setExtraindo(true);
    try {
      const resultado = await extrairPerfilMutation.mutateAsync({ operacaoId });
      setPerfil({ success: true, perfil: resultado.perfil ?? resultado });
      toast.success("Perfil extraído com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao extrair perfil: " + err.message);
    } finally {
      setExtraindo(false);
    }
  };

  const handleGerarDefesa = async (comentario?: string) => {
    if (!operacaoId) return;
    try {
      const resultado = await gerarDefesaMutation.mutateAsync({ operacaoId, comentario });
      setDefesa(resultado.defesa);
      setDefesaAprovada(false);
      setShowComentario(false);
      setComentarioNovaDefesa("");
      toast.success("Defesa comercial gerada!");
    } catch (err: any) {
      toast.error("Erro ao gerar defesa: " + err.message);
    }
  };

  const handleAprovarDefesa = async () => {
    if (!operacaoId) return;
    const textoFinal = editandoDefesa ? defesaEditada : defesaAtual;
    try {
      await atualizarMutation.mutateAsync({
        id: operacaoId,
        defesaComercial: textoFinal,
        defesaAprovada: true,
        etapaAtual: 5,
      });
      setDefesaAprovada(true);
      setEditandoDefesa(false);
      toast.success("Defesa aprovada! Pode prosseguir.");
    } catch (err: any) {
      toast.error("Erro ao aprovar defesa: " + err.message);
    }
  };

  const ltv = dadosOperacao.valorSolicitado && dadosOperacao.valorGarantia && parseFloat(dadosOperacao.valorGarantia.replace(",", ".")) > 0
    ? ((parseFloat(dadosOperacao.valorSolicitado.replace(",", ".")) / parseFloat(dadosOperacao.valorGarantia.replace(",", "."))) * 100).toFixed(1)
    : null;

  const camposPerfil = [
    { key: "nomeCompleto", label: "Nome Completo" },
    { key: "cpf", label: "CPF" },
    { key: "rg", label: "RG" },
    { key: "dataNascimento", label: "Data de Nascimento" },
    { key: "estadoCivil", label: "Estado Civil" },
    { key: "profissao", label: "Profissão" },
    { key: "rendaMediaMensal", label: "Renda Média Mensal" },
    { key: "nomeConjuge", label: "Nome do Cônjuge" },
    { key: "cpfConjuge", label: "CPF do Cônjuge" },
    { key: "rgConjuge", label: "RG do Cônjuge" },
  ];

  const camposGarantia = [
    { key: "matricula", label: "Nº da Matrícula" },
    { key: "descricaoImovel", label: "Descrição do Imóvel" },
    { key: "numeroIptu", label: "Nº do IPTU" },
    { key: "valorEstimado", label: "Valor Estimado" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Resumo da Operação + Defesa Comercial</h2>
        <p className="text-sm text-muted-foreground">A IA extrai o perfil do tomador dos documentos e gera a defesa para as IFs.</p>
      </div>

      <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
        <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-300/80">
          <strong>Aviso de Responsabilidade:</strong> O conteúdo gerado pela IA é uma sugestão e não substitui a análise crítica do analista humano. A aprovação final e a responsabilidade pela operação são sempre do profissional qualificado.
        </p>
      </div>

      {/* Dados da Operação */}
      <div className="border border-border/40 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-muted/20 border-b border-border/30">
          <h3 className="text-sm font-semibold text-foreground">Dados da Operação</h3>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Produto", value: dadosOperacao.produto },
            { label: "Valor Solicitado", value: dadosOperacao.valorSolicitado ? `R$ ${dadosOperacao.valorSolicitado}` : "—" },
            { label: "Prazo", value: dadosOperacao.prazo ? `${dadosOperacao.prazo} meses` : "—" },
            { label: "Finalidade", value: dadosOperacao.finalidade },
            { label: "Valor da Garantia", value: dadosOperacao.valorGarantia ? `R$ ${dadosOperacao.valorGarantia}` : "—" },
            { label: "LTV Estimado", value: ltv ? `${ltv}%` : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="space-y-0.5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm text-foreground font-medium">{value ?? "—"}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Perfil do Tomador — JSON Estruturado */}
      {(() => {
        const pj = (op as any)?.perfilExtraidoJson as Record<string, any> | null;
        const clienteData = pj?.cliente ?? pj;
        const financeiroData = pj?.financeiro ?? {};
        const garantiaData = pj?.garantia ?? {};
        const riscoData = pj?.risco ?? {};
        const temDados = pj && Object.values(clienteData ?? {}).some((v) => v !== null && v !== "");
        return (
          <div className="border border-border/40 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-b border-border/30">
              <div className="flex items-center gap-2">
                <Brain className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Perfil Extraído pela IA</h3>
                {temDados && <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">Disponível</span>}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExtrairPerfil}
                disabled={extraindo || !operacaoId}
                className="gap-1.5 text-xs"
              >
                {extraindo ? <Loader2 className="w-3 h-3 animate-spin" /> : temDados ? <RefreshCw className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                {temDados ? "Reextrair" : "Extrair com IA"}
              </Button>
            </div>
            {temDados ? (
              <div className="divide-y divide-border/20">
                {/* Bloco: Identificação */}
                {Object.values(clienteData ?? {}).some((v) => v !== null && v !== "") && (
                  <div className="p-4">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Identificação do Tomador</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                      {Object.entries(clienteData ?? {}).filter(([, v]) => v !== null && v !== "").map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-muted-foreground block capitalize">{k.replace(/_/g, " ")}</span>
                          <span className="text-foreground font-medium">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Bloco: Capacidade Financeira */}
                {Object.values(financeiroData).some((v) => v !== null && v !== "") && (
                  <div className="p-4">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Capacidade Financeira</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                      {Object.entries(financeiroData).filter(([, v]) => v !== null && v !== "").map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-muted-foreground block capitalize">{k.replace(/_/g, " ")}</span>
                          <span className="text-foreground font-medium">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Bloco: Garantia */}
                {Object.values(garantiaData).some((v) => v !== null && v !== "") && (
                  <div className="p-4">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Dados da Garantia</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                      {Object.entries(garantiaData).filter(([, v]) => v !== null && v !== "").map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-muted-foreground block capitalize">{k.replace(/_/g, " ")}</span>
                          <span className="text-foreground font-medium">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Bloco: Leitura Operacional */}
                {(riscoData.perfil_patrimonial || riscoData.perfil_financeiro || riscoData.aderencia_bancaria_aparente) && (
                  <div className="p-4 bg-amber-500/5">
                    <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-2">Leitura Operacional</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {riscoData.perfil_patrimonial && <div className="text-xs"><span className="text-muted-foreground block">Perfil Patrimonial</span><span className="text-foreground">{riscoData.perfil_patrimonial}</span></div>}
                      {riscoData.perfil_financeiro && <div className="text-xs"><span className="text-muted-foreground block">Perfil Financeiro</span><span className="text-foreground">{riscoData.perfil_financeiro}</span></div>}
                      {riscoData.aderencia_bancaria_aparente && <div className="text-xs"><span className="text-muted-foreground block">Aderência Bancária</span><span className={cn("font-medium capitalize", riscoData.aderencia_bancaria_aparente === "alta" ? "text-emerald-400" : riscoData.aderencia_bancaria_aparente === "média" ? "text-yellow-400" : "text-red-400")}>{riscoData.aderencia_bancaria_aparente}</span></div>}
                      {riscoData.complexidade_operacao && <div className="text-xs"><span className="text-muted-foreground block">Complexidade</span><span className="text-foreground capitalize">{riscoData.complexidade_operacao}</span></div>}
                    </div>
                    {riscoData.mitigadores_risco?.length > 0 && (
                      <div className="mt-2 text-xs">
                        <span className="text-muted-foreground block mb-1">Mitigadores</span>
                        <ul className="space-y-0.5">{riscoData.mitigadores_risco.map((m: string, i: number) => <li key={i} className="flex gap-1.5 text-emerald-300/80"><CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5 text-emerald-400" />{m}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Brain className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                <p>Nenhum perfil extraído ainda.</p>
                <p className="text-xs mt-1">Se a Etapa 3 foi concluída com a conferência da IA, o perfil já foi extraído automaticamente. Caso contrário, clique em "Extrair com IA".</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Defesa Comercial */}
      <div className="border border-border/40 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-b border-border/30">
          <h3 className="text-sm font-semibold text-foreground">Defesa Comercial</h3>
          <div className="flex items-center gap-2">
            {defesaAtual && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { navigator.clipboard.writeText(editandoDefesa ? defesaEditada : defesaAtual); toast.success("Copiado!"); }}
                  className="h-7 px-2 gap-1 text-xs text-muted-foreground"
                >
                  <Copy className="w-3 h-3" />Copiar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditandoDefesa(!editandoDefesa); setDefesaEditada(defesaAtual); }}
                  className="h-7 px-2 gap-1 text-xs text-muted-foreground"
                >
                  <Edit3 className="w-3 h-3" />{editandoDefesa ? "Cancelar" : "Editar"}
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="p-4 space-y-4">
          {defesaAtual ? (
            <>
              {editandoDefesa ? (
                <Textarea
                  value={defesaEditada}
                  onChange={(e) => setDefesaEditada(e.target.value)}
                  className="bg-background/50 min-h-[200px] resize-none text-sm"
                  maxLength={2000}
                />
              ) : (
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{defesaAtual}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowComentario(!showComentario)}
                  className="gap-1.5 text-xs"
                >
                  <MessageSquare className="w-3 h-3" />
                  Gerar nova defesa
                </Button>
                {defesaAprovada ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />Defesa aprovada
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleAprovarDefesa}
                    disabled={atualizarMutation.isPending}
                    className="btn-primary gap-1.5 text-xs"
                  >
                    {atualizarMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                    <CheckCircle2 className="w-3 h-3" />
                    Aprovar Defesa
                  </Button>
                )}
              </div>
              {showComentario && (
                <div className="space-y-2 p-3 bg-muted/20 rounded-lg border border-border/30">
                  <Label className="text-xs text-muted-foreground">O que deve mudar na nova defesa? (opcional)</Label>
                  <Textarea
                    value={comentarioNovaDefesa}
                    onChange={(e) => setComentarioNovaDefesa(e.target.value)}
                    placeholder="Ex: Enfatize mais a capacidade financeira, mencione o histórico de pagamentos..."
                    className="bg-background/50 min-h-[80px] resize-none text-sm"
                    rows={3}
                  />
                  <Button
                    size="sm"
                    onClick={() => handleGerarDefesa(comentarioNovaDefesa || undefined)}
                    disabled={gerarDefesaMutation.isPending}
                    className="btn-primary gap-1.5 text-xs"
                  >
                    {gerarDefesaMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Gerar nova defesa
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6 space-y-3">
              <Bot className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Clique em "Gerar Defesa" para criar a defesa comercial baseada em todas as informações da operação.</p>
              <Button
                onClick={() => handleGerarDefesa()}
                disabled={gerarDefesaMutation.isPending || !operacaoId}
                className="btn-primary gap-2"
              >
                {gerarDefesaMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando...</> : <><Bot className="w-4 h-4" />Gerar Defesa</>}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>
        <div className="flex gap-3">
          {!defesaAprovada && defesaAtual && (
            <Button variant="outline" onClick={onNext} className="gap-2 text-muted-foreground text-sm">
              Pular
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
          <Button
            onClick={onNext}
            className="btn-primary gap-2"
          >
            Continuar para SCR / Enviar
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Etapa 5: Termo SCR + Enviar para Análise ─────────────────────────────────

function Etapa5ScrEnviar({
  codigoOperacao,
  operacaoId: operacaoIdProp,
  nomeCliente,
  telefoneTomador,
  emailTomador,
}: {
  codigoOperacao: string;
  operacaoId: number;
  nomeCliente: string;
  telefoneTomador: string;
  emailTomador: string;
}) {
  const { data: ops } = trpc.operacoes.listar.useQuery({ busca: codigoOperacao });
  const op = ops?.find((o) => o.codigoOperacao === codigoOperacao);
  const operacaoId = op?.id ?? operacaoIdProp;

  const { data: termo, refetch: refetchTermo } = trpc.termoScr.obter.useQuery(
    { operacaoId: operacaoId! },
    { enabled: !!operacaoId }
  );
  const criarTermoMutation = trpc.termoScr.criar.useMutation();
  const enviarAnalise = trpc.ia.enviarParaAnalise.useMutation();
  const [, navigate] = useLocation();
  const [enviado, setEnviado] = useState(false);

  // Dados do cônjuge: campos diretos da op ou extraídos pela IA
  const perfilExtrado = (op as any)?.perfilExtraidoJson as { perfil: Record<string, string>; garantia: Record<string, string> } | null;
  const estadoCivilOp = (op as any)?.estadoCivil ?? perfilExtrado?.perfil?.estadoCivil ?? "";
  const temConjuge = estadoCivilOp === "Casado" || estadoCivilOp === "União Estável"
    || !!(perfilExtrado?.perfil?.nomeConjuge && perfilExtrado.perfil.nomeConjuge !== "Informação não localizada automaticamente");
  const nomeConjuge = (op as any)?.nomeConjuge ?? perfilExtrado?.perfil?.nomeConjuge;
  const telefoneConjuge = (op as any)?.telefoneConjuge ?? perfilExtrado?.perfil?.telefoneConjuge;
  const emailConjuge = (op as any)?.emailConjuge ?? perfilExtrado?.perfil?.emailConjuge;

  const linkCompleto = termo ? `${window.location.origin}${termo.linkUnico}` : "";

  const handleCriarTermo = async () => {
    if (!operacaoId) return;
    try {
      await criarTermoMutation.mutateAsync({ operacaoId });
      toast.success("Termo SCR gerado com sucesso!");
      refetchTermo();
    } catch (err: any) {
      toast.error("Erro ao gerar termo: " + err.message);
    }
  };

  const handleEnviarWhatsApp = (telefone: string, nome: string) => {
    const tel = telefone.replace(/\D/g, "");
    const msg = encodeURIComponent(
      `Olá ${nome}! Para darmos continuidade à sua operação de crédito com a Ativa Soluções, precisamos da sua assinatura digital no Termo de Autorização SCR/LGPD.\n\nClique no link abaixo para assinar:\n${linkCompleto}\n\nO link é válido por 30 dias. Em caso de dúvidas, entre em contato conosco.`
    );
    window.open(`https://wa.me/55${tel}?text=${msg}`, "_blank");
  };

  const handleEnviarEmail = (email: string, nome: string) => {
    const assunto = encodeURIComponent(`Termo SCR/LGPD — Operação ${codigoOperacao}`);
    const corpo = encodeURIComponent(
      `Olá ${nome},\n\nPara darmos continuidade à sua operação de crédito com a Ativa Soluções, precisamos da sua assinatura digital no Termo de Autorização SCR/LGPD.\n\nAcesse o link abaixo para assinar:\n${linkCompleto}\n\nO link é válido por 30 dias.\n\nAtenciosamente,\nEquipe Ativa Soluções`
    );
    window.open(`mailto:${email}?subject=${assunto}&body=${corpo}`, "_blank");
  };

  const handleEnviarParaAnalise = async () => {
    if (!operacaoId) return;
    try {
      await enviarAnalise.mutateAsync({ operacaoId });
      setEnviado(true);
      toast.success("Operação enviada para análise! A Renata foi notificada.");
    } catch (err: any) {
      toast.error("Erro ao enviar para análise: " + err.message);
    }
  };

  const statusColor: Record<string, string> = {
    "Aguardando assinatura": "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    "Parcialmente assinado": "text-blue-400 bg-blue-500/10 border-blue-500/20",
    "Assinado completo": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };

  if (enviado) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-foreground">Operação enviada para análise!</h3>
          <p className="text-sm text-muted-foreground mt-2">
            A operação <span className="font-mono text-primary">{codigoOperacao}</span> foi enviada para validação e distribuição às Instituições Financeiras.
          </p>
          <p className="text-sm text-muted-foreground mt-1">A Renata foi notificada automaticamente.</p>
        </div>
        <Button onClick={() => navigate("/operacoes")} className="btn-primary gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Ver Minhas Operações
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Termo SCR/LGPD + Enviar para Análise</h2>
        <p className="text-sm text-muted-foreground">
          Gere o link de assinatura e envie a operação para validação da Renata.
        </p>
      </div>

      <div className="border border-border/40 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-muted/20 border-b border-border/30">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Termo de Autorização SCR/LGPD
          </h3>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            O Termo de Autorização para Consulta ao SCR do Banco Central é obrigatório para que as IFs possam consultar o histórico de crédito do tomador.
          </p>

          {!termo ? (
            <div className="text-center py-4 space-y-3">
              <Button
                onClick={handleCriarTermo}
                disabled={criarTermoMutation.isPending || !operacaoId}
                className="btn-primary gap-2"
              >
                {criarTermoMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando...</> : <><Send className="w-4 h-4" />Gerar Termo SCR</>}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium w-fit", statusColor[termo.status] ?? "text-muted-foreground bg-muted/20 border-border/30")}>
                {termo.status}
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Link de Assinatura</Label>
                <div className="flex items-center gap-2">
                  <Input value={linkCompleto} readOnly className="bg-background/50 text-sm font-mono text-primary" />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { navigator.clipboard.writeText(linkCompleto); toast.success("Link copiado!"); }}
                    className="gap-1.5 flex-shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />Copiar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Válido por 30 dias.</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Enviar para o Tomador</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEnviarWhatsApp(telefoneTomador, nomeCliente)}
                    className="gap-1.5 text-sm text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp — {nomeCliente}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEnviarEmail(emailTomador, nomeCliente)}
                    className="gap-1.5 text-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    E-mail — {nomeCliente}
                  </Button>
                </div>
              </div>

              {temConjuge && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Enviar para o Cônjuge</p>
                  <div className="flex flex-wrap gap-2">
                    {telefoneConjuge && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEnviarWhatsApp(telefoneConjuge, nomeConjuge ?? "Cônjuge")}
                        className="gap-1.5 text-sm text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        WhatsApp — {nomeConjuge ?? "Cônjuge"}
                      </Button>
                    )}
                    {emailConjuge && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEnviarEmail(emailConjuge, nomeConjuge ?? "Cônjuge")}
                        className="gap-1.5 text-sm"
                      >
                        <Send className="w-3.5 h-3.5" />
                        E-mail — {nomeConjuge ?? "Cônjuge"}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 border border-border/40 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Tomador</p>
                  <p className="text-sm font-medium text-foreground">{nomeCliente}</p>
                  {termo.assinadoClienteEm ? (
                    <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />Assinado em {new Date(termo.assinadoClienteEm).toLocaleDateString("pt-BR")}
                    </p>
                  ) : (
                    <p className="text-xs text-yellow-400 mt-1">Aguardando assinatura</p>
                  )}
                </div>
                {temConjuge && (
                  <div className="p-3 border border-border/40 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Cônjuge</p>
                    <p className="text-sm font-medium text-foreground">{nomeConjuge ?? "—"}</p>
                    {termo.assinadoConjugeEm ? (
                      <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />Assinado em {new Date(termo.assinadoConjugeEm).toLocaleDateString("pt-BR")}
                      </p>
                    ) : (
                      <p className="text-xs text-yellow-400 mt-1">Aguardando assinatura</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border border-primary/20 rounded-lg p-4 bg-primary/5 space-y-3">
        <div className="flex items-start gap-3">
          <Send className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Enviar para Análise</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Ao clicar, a operação será enviada para a Renata com notificação automática. Ela receberá um alerta informando que há uma nova operação para validação e distribuição às Instituições Financeiras.
            </p>
          </div>
        </div>
        <Button
          onClick={handleEnviarParaAnalise}
          disabled={enviarAnalise.isPending || !operacaoId}
          className="btn-primary gap-2 w-full sm:w-auto"
        >
          {enviarAnalise.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
          ) : (
            <><Send className="w-4 h-4" />Enviar para Análise</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FieldInput({
  label, value, onChange, placeholder, error, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("bg-background/50", error && "border-red-500")}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
