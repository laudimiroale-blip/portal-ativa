import { useAuth } from "@/_core/hooks/useAuth";
import AtivaDashboardLayout from "@/components/AtivaDashboardLayout";
import { Button } from "@/components/ui/button";
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
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  Edit3,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  Shield,
  Upload,
  User,
} from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Etapa = 1 | 2 | 3 | 4 | 5 | 6;

interface DadosCliente {
  nomeCliente: string;
  cpf: string;
  estadoCivil: "Solteiro" | "Casado" | "Divorciado" | "Viúvo" | "União Estável";
  emailTomador: string;
  telefoneTomador: string;
  nomeConjuge?: string;
  cpfConjuge?: string;
  emailConjuge?: string;
  telefoneConjuge?: string;
}

interface DadosOperacao {
  produto: "Home Equity" | "Auto Equity" | "Rural Equity" | "Imóvel em Construção";
  valorSolicitado: string;
  prazo: number;
  finalidade: string;
  contextoOperacao: string;
  prioridade: "Normal" | "Alta";
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
    { id: 4, label: "Garantia IA", icon: Shield },
    { id: 5, label: "Revisão", icon: Bot },
    { id: 6, label: "Termo SCR", icon: Send },
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
              onNext={(codigo) => {
                setCodigoOperacao(codigo);
                setEtapa(3);
              }}
            />
          )}
          {etapa === 3 && codigoOperacao && (
            <Etapa3Documentos
              codigoOperacao={codigoOperacao}
              produto={dadosOperacao.produto!}
              onBack={() => setEtapa(2)}
              onNext={() => setEtapa(4)}
            />
          )}
          {etapa === 4 && codigoOperacao && (
            <Etapa4GarantiaIA
              codigoOperacao={codigoOperacao}
              produto={dadosOperacao.produto!}
              onBack={() => setEtapa(3)}
              onNext={() => setEtapa(5)}
            />
          )}
          {etapa === 5 && codigoOperacao && (
            <Etapa5RevisaoCompleta
              codigoOperacao={codigoOperacao}
              onBack={() => setEtapa(4)}
              onNext={() => setEtapa(6)}
            />
          )}
          {etapa === 6 && codigoOperacao && (
            <Etapa6TermoSCR
              codigoOperacao={codigoOperacao}
              nomeCliente={dadosCliente.nomeCliente!}
              estadoCivil={dadosCliente.estadoCivil!}
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
    if (!dados.nomeCliente?.trim()) e.nomeCliente = "Nome obrigatório";
    if (!dados.cpf?.trim() || dados.cpf.replace(/\D/g, "").length < 11) e.cpf = "CPF inválido";
    if (!dados.estadoCivil) e.estadoCivil = "Estado civil obrigatório";
    if (!dados.emailTomador?.includes("@")) e.emailTomador = "E-mail inválido";
    if (!dados.telefoneTomador?.trim()) e.telefoneTomador = "Telefone obrigatório";
    if ((dados.estadoCivil === "Casado" || dados.estadoCivil === "União Estável") && !dados.nomeConjuge?.trim()) {
      e.nomeConjuge = "Nome do cônjuge obrigatório";
    }
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const temConjuge = dados.estadoCivil === "Casado" || dados.estadoCivil === "União Estável";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Dados do Cliente (Tomador)</h2>
        <p className="text-sm text-muted-foreground">Informações pessoais do tomador da operação</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldInput label="Nome Completo *" value={dados.nomeCliente ?? ""} onChange={(v) => set("nomeCliente", v)} placeholder="Nome completo do tomador" error={erros.nomeCliente} />
        <FieldInput
          label="CPF *"
          value={dados.cpf ?? ""}
          onChange={(v) => {
            const digits = v.replace(/\D/g, "").slice(0, 11);
            const formatted = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
            set("cpf", formatted);
          }}
          placeholder="000.000.000-00"
          error={erros.cpf}
        />
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Estado Civil *</Label>
          <Select value={dados.estadoCivil ?? ""} onValueChange={(v) => set("estadoCivil", v)}>
            <SelectTrigger className={cn("bg-background/50", erros.estadoCivil && "border-red-500")}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {erros.estadoCivil && <p className="text-xs text-red-400">{erros.estadoCivil}</p>}
        </div>
        <FieldInput label="E-mail *" value={dados.emailTomador ?? ""} onChange={(v) => set("emailTomador", v)} placeholder="email@exemplo.com" error={erros.emailTomador} type="email" />
        <FieldInput label="Telefone / WhatsApp *" value={dados.telefoneTomador ?? ""} onChange={(v) => set("telefoneTomador", v)} placeholder="(11) 99999-9999" error={erros.telefoneTomador} />
      </div>

      {temConjuge && (
        <div className="border border-primary/20 rounded-lg p-4 bg-primary/5">
          <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
            <User className="w-4 h-4" />
            Dados do Cônjuge
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldInput label="Nome do Cônjuge *" value={dados.nomeConjuge ?? ""} onChange={(v) => set("nomeConjuge", v)} placeholder="Nome completo" error={erros.nomeConjuge} />
            <FieldInput
              label="CPF do Cônjuge"
              value={dados.cpfConjuge ?? ""}
              onChange={(v) => {
                const digits = v.replace(/\D/g, "").slice(0, 11);
                const formatted = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                set("cpfConjuge", formatted);
              }}
              placeholder="000.000.000-00"
            />
            <FieldInput label="E-mail do Cônjuge" value={dados.emailConjuge ?? ""} onChange={(v) => set("emailConjuge", v)} placeholder="email@exemplo.com" type="email" />
            <FieldInput label="Telefone do Cônjuge" value={dados.telefoneConjuge ?? ""} onChange={(v) => set("telefoneConjuge", v)} placeholder="(11) 99999-9999" />
          </div>
        </div>
      )}

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
  onNext: (codigo: string) => void;
}) {
  const [erros, setErros] = useState<Record<string, string>>({});
  const criarMutation = trpc.operacoes.criar.useMutation();
  const [, navigate] = useLocation();

  const set = (field: keyof DadosOperacao, value: any) => {
    onChange({ ...dados, [field]: value });
    if (erros[field]) setErros((e) => ({ ...e, [field]: "" }));
  };

  const validar = () => {
    const e: Record<string, string> = {};
    if (!dados.produto) e.produto = "Produto obrigatório";
    if (!dados.valorSolicitado?.trim()) e.valorSolicitado = "Valor obrigatório";
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
        cpf: dadosCliente.cpf!,
        estadoCivil: dadosCliente.estadoCivil!,
        emailTomador: dadosCliente.emailTomador!,
        telefoneTomador: dadosCliente.telefoneTomador!,
        nomeConjuge: dadosCliente.nomeConjuge,
        cpfConjuge: dadosCliente.cpfConjuge,
        emailConjuge: dadosCliente.emailConjuge,
        telefoneConjuge: dadosCliente.telefoneConjuge,
        produto: dados.produto!,
        valorSolicitado: dados.valorSolicitado!,
        prazo: dados.prazo!,
        finalidade: dados.finalidade!,
        contextoOperacao: dados.contextoOperacao,
        prioridade: dados.prioridade ?? "Normal",
        statusRascunho: rascunho,
      });
      toast.success(`Operação ${result.codigoOperacao} criada!`);
      if (rascunho) {
        navigate("/operacoes");
      } else {
        onNext(result.codigoOperacao);
      }
    } catch (err: any) {
      toast.error("Erro ao criar operação: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Dados da Operação</h2>
        <p className="text-sm text-muted-foreground">Produto, valor e finalidade do crédito</p>
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

        <FieldInput label="Valor Solicitado *" value={dados.valorSolicitado ?? ""} onChange={(v) => set("valorSolicitado", v)} placeholder="Ex: 250000" error={erros.valorSolicitado} />

        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Prazo (meses) *</Label>
          <Input
            type="number"
            min={1}
            max={360}
            value={dados.prazo ?? ""}
            onChange={(e) => set("prazo", Number(e.target.value))}
            placeholder="Ex: 120"
            className={cn("bg-background/50", erros.prazo && "border-red-500")}
          />
          {erros.prazo && <p className="text-xs text-red-400">{erros.prazo}</p>}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Prioridade</Label>
          <Select value={dados.prioridade ?? "Normal"} onValueChange={(v) => set("prioridade", v)}>
            <SelectTrigger className="bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Normal">Normal</SelectItem>
              <SelectItem value="Alta">Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>
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

      <div className="space-y-1.5">
        <Label className="text-sm text-muted-foreground">
          Contexto da Operação
          <span className="ml-2 text-xs text-muted-foreground/60">(usado pela IA para gerar a defesa comercial)</span>
        </Label>
        <Textarea
          value={dados.contextoOperacao ?? ""}
          onChange={(e) => set("contextoOperacao", e.target.value)}
          placeholder="Descreva o perfil do cliente, histórico, motivação, pontos positivos que devem ser destacados na análise..."
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
          <Button variant="outline" onClick={() => handleSubmit(true)} disabled={criarMutation.isPending} className="gap-2 text-muted-foreground">
            {criarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Salvar Rascunho
          </Button>
          <Button onClick={() => handleSubmit(false)} disabled={criarMutation.isPending} className="btn-primary gap-2">
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
  produto,
  onBack,
  onNext,
}: {
  codigoOperacao: string;
  produto: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const { data: ops } = trpc.operacoes.listar.useQuery({ busca: codigoOperacao });
  const operacaoId = ops?.find((o) => o.codigoOperacao === codigoOperacao)?.id;

  const { data: documentos, refetch } = trpc.documentos.listar.useQuery(
    { operacaoId: operacaoId! },
    { enabled: !!operacaoId }
  );
  const uploadMutation = trpc.documentos.upload.useMutation();
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [uploading, setUploading] = useState<Record<number, boolean>>({});

  const enviados = documentos?.filter((d) => d.estado !== "Pendente") ?? [];
  const total = documentos?.length ?? 0;
  const progresso = total > 0 ? Math.round((enviados.length / total) * 100) : 0;

  const handleUpload = useCallback(
    async (doc: { id: number; nomeDocumento: string; categoria: string }, file: File) => {
      if (!operacaoId) return;
      if (file.size > 16 * 1024 * 1024) { toast.error("Arquivo muito grande (máx. 16MB)"); return; }
      setUploading((u) => ({ ...u, [doc.id]: true }));
      try {
        const base64 = await fileToBase64(file);
        await uploadMutation.mutateAsync({
          operacaoId,
          documentoId: doc.id,
          nomeDocumento: doc.nomeDocumento,
          categoria: doc.categoria,
          fileBase64: base64,
          fileName: file.name,
          mimeType: file.type,
        });
        toast.success(`${doc.nomeDocumento} enviado!`);
        refetch();
      } catch (err: any) {
        toast.error("Erro no upload: " + err.message);
      } finally {
        setUploading((u) => ({ ...u, [doc.id]: false }));
      }
    },
    [operacaoId, uploadMutation, refetch]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Documentos — {produto}</h2>
        <p className="text-sm text-muted-foreground">Envie os documentos do checklist para continuar</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{enviados.length} de {total} documentos enviados</span>
          <span className={cn("font-semibold", progresso === 100 ? "text-emerald-400" : "text-primary")}>{progresso}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-500", progresso === 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${progresso}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        {!documentos ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Carregando checklist...
          </div>
        ) : documentos.map((doc) => {
          const isUploading = uploading[doc.id];
          const isEnviado = doc.estado !== "Pendente";
          return (
            <div key={doc.id} className={cn("flex items-center justify-between p-3 rounded-lg border transition-colors", isEnviado ? "border-emerald-500/20 bg-emerald-500/5" : "border-border/40 bg-muted/10 hover:border-primary/30")}>
              <div className="flex items-center gap-3 min-w-0">
                {isEnviado ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{doc.nomeDocumento}</p>
                  <p className="text-xs text-muted-foreground">{doc.categoria}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isEnviado && <span className="text-xs text-emerald-400 hidden sm:block">Enviado</span>}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" ref={(el) => { fileInputRefs.current[doc.id] = el; }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUpload(doc, file); }} />
                <Button size="sm" variant="outline" onClick={() => fileInputRefs.current[doc.id]?.click()} disabled={isUploading} className={cn("gap-1.5 text-xs", isEnviado && "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10")}>
                  {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  {isEnviado ? "Reenviar" : "Enviar"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>
        <div className="flex gap-3">
          {progresso < 100 && (
            <Button variant="outline" onClick={onNext} className="gap-2 text-muted-foreground text-sm">
              Pular por agora
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
          <Button onClick={onNext} className="btn-primary gap-2">
            {progresso === 100 ? "Continuar para Garantia IA" : "Continuar"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Etapa 4: Garantia IA ─────────────────────────────────────────────────────

function Etapa4GarantiaIA({
  codigoOperacao,
  produto,
  onBack,
  onNext,
}: {
  codigoOperacao: string;
  produto: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const { data: ops } = trpc.operacoes.listar.useQuery({ busca: codigoOperacao });
  const operacaoId = ops?.find((o) => o.codigoOperacao === codigoOperacao)?.id;

  const { data: garantias, refetch } = trpc.garantias.listar.useQuery(
    { operacaoId: operacaoId! },
    { enabled: !!operacaoId }
  );
  const preencherMutation = trpc.ia.preencherGarantia.useMutation();
  const atualizarMutation = trpc.garantias.atualizar.useMutation();
  const [editando, setEditando] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});

  const garantia = garantias?.[0];

  const handlePreencher = async () => {
    if (!operacaoId) return;
    try {
      await preencherMutation.mutateAsync({ operacaoId });
      toast.success("Garantia preenchida pela IA!");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao preencher garantia: " + err.message);
    }
  };

  const handleSalvarEdicao = async () => {
    if (!garantia) return;
    try {
      await atualizarMutation.mutateAsync({ id: garantia.id, ...editData });
      toast.success("Garantia atualizada!");
      setEditando(false);
      refetch();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    }
  };

  const camposGarantia = [
    { key: "tipoImovel", label: "Tipo de Imóvel" },
    { key: "endereco", label: "Endereço" },
    { key: "cidade", label: "Cidade" },
    { key: "estado", label: "Estado (UF)" },
    { key: "matricula", label: "Matrícula" },
    { key: "metragem", label: "Metragem" },
    { key: "situacaoDocumental", label: "Situação Documental" },
    { key: "valorEstimado", label: "Valor Estimado" },
    { key: "ltvEstimado", label: "LTV Estimado (%)" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Garantia — Preenchimento por IA</h2>
        <p className="text-sm text-muted-foreground">A IA extrai os dados da garantia a partir dos documentos enviados. Você pode editar manualmente após.</p>
      </div>

      {!garantia ? (
        <div className="text-center py-10 space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="text-foreground font-medium">Nenhuma garantia cadastrada ainda</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Preencher com IA" para extrair os dados automaticamente dos documentos enviados.</p>
          </div>
          <Button onClick={handlePreencher} disabled={preencherMutation.isPending || !operacaoId} className="btn-primary gap-2">
            {preencherMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Analisando documentos...</> : <><Bot className="w-4 h-4" />Preencher com IA</>}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {garantia.preenchidoPorIa && (
            <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
              <Bot className="w-3.5 h-3.5" />
              Preenchido automaticamente pela IA
              {garantia.editadoManualmente && <span className="ml-1 text-muted-foreground">· editado manualmente</span>}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {camposGarantia.map(({ key, label }) => {
              const valor = (garantia as any)[key];
              return (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  {editando ? (
                    <Input value={editData[key] ?? valor ?? ""} onChange={(e) => setEditData((d) => ({ ...d, [key]: e.target.value }))} className="bg-background/50 text-sm h-8" />
                  ) : (
                    <p className="text-sm text-foreground bg-muted/20 rounded px-2 py-1.5 min-h-[32px]">
                      {valor ?? <span className="text-muted-foreground/50">—</span>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 pt-2">
            {editando ? (
              <>
                <Button size="sm" onClick={handleSalvarEdicao} disabled={atualizarMutation.isPending} className="btn-primary gap-1.5">
                  {atualizarMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar Edição
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => { setEditando(true); setEditData({}); }} className="gap-1.5">
                  <Edit3 className="w-3.5 h-3.5" />Editar
                </Button>
                <Button size="sm" variant="outline" onClick={handlePreencher} disabled={preencherMutation.isPending} className="gap-1.5">
                  {preencherMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Refazer com IA
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>
        <div className="flex gap-3">
          {!garantia && (
            <Button variant="outline" onClick={onNext} className="gap-2 text-muted-foreground text-sm">
              Pular<ArrowRight className="w-4 h-4" />
            </Button>
          )}
          <Button onClick={onNext} className="btn-primary gap-2">
            Continuar para Revisão<ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Etapa 5: Revisão Completa ────────────────────────────────────────────────

function Etapa5RevisaoCompleta({
  codigoOperacao,
  onBack,
  onNext,
}: {
  codigoOperacao: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const { data: ops } = trpc.operacoes.listar.useQuery({ busca: codigoOperacao });
  const operacaoId = ops?.find((o) => o.codigoOperacao === codigoOperacao)?.id;

  const { data: analises, refetch } = trpc.ia.listar.useQuery(
    { operacaoId: operacaoId! },
    { enabled: !!operacaoId }
  );
  const gerarMutation = trpc.ia.gerarRevisaoCompleta.useMutation();
  const [editandoCampo, setEditandoCampo] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const analiseRevisao = analises?.find((a) => a.camada === "revisao" && a.statusProcessamento === "concluido");
  const resultado = analiseRevisao?.resultadoJson as Record<string, string> | null;

  const handleGerar = async () => {
    if (!operacaoId) return;
    try {
      await gerarMutation.mutateAsync({ operacaoId });
      toast.success("Revisão gerada com sucesso!");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao gerar revisão: " + err.message);
    }
  };

  const handleCopiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast.success("Copiado!");
  };

  const camposRevisao = [
    { key: "resumoOperacional", label: "Resumo Operacional" },
    { key: "parecerComercial", label: "Parecer Comercial" },
    { key: "defesaOperacao", label: "Defesa da Operação" },
    { key: "analiseDocumental", label: "Análise Documental" },
    { key: "conclusao", label: "Conclusão e Recomendação" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Revisão Completa — Estilo Comitê de Crédito</h2>
        <p className="text-sm text-muted-foreground">A IA gera a revisão completa para apresentação às Instituições Financeiras.</p>
      </div>

      <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
        <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-300/80">
          <strong>Aviso de Responsabilidade:</strong> O conteúdo gerado pela IA é uma sugestão de defesa comercial e não substitui a análise crítica do analista humano responsável. A aprovação final e a responsabilidade pela operação são sempre do profissional qualificado.
        </p>
      </div>

      {!resultado ? (
        <div className="text-center py-10 space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Bot className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="text-foreground font-medium">Revisão não gerada ainda</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Gerar Revisão" para criar a análise completa.</p>
          </div>
          <Button onClick={handleGerar} disabled={gerarMutation.isPending || !operacaoId} className="btn-primary gap-2">
            {gerarMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando revisão...</> : <><Bot className="w-4 h-4" />Gerar Revisão Completa</>}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {camposRevisao.map(({ key, label }) => {
            const valor = editValues[key] ?? resultado[key] ?? "";
            const isEditando = editandoCampo === key;
            return (
              <div key={key} className="border border-border/40 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20 border-b border-border/30">
                  <h3 className="text-sm font-medium text-foreground">{label}</h3>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => handleCopiar(valor)} className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Copy className="w-3 h-3" />Copiar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (isEditando) { setEditandoCampo(null); } else { setEditandoCampo(key); setEditValues((v) => ({ ...v, [key]: valor })); } }} className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Edit3 className="w-3 h-3" />{isEditando ? "Fechar" : "Editar"}
                    </Button>
                  </div>
                </div>
                <div className="p-4">
                  {isEditando ? (
                    <Textarea value={editValues[key] ?? ""} onChange={(e) => setEditValues((v) => ({ ...v, [key]: e.target.value }))} className="bg-background/50 min-h-[120px] resize-none text-sm" />
                  ) : (
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{valor}</p>
                  )}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={handleGerar} disabled={gerarMutation.isPending} className="gap-1.5">
              {gerarMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Regenerar
            </Button>
            <Button size="sm" variant="outline" onClick={() => { const texto = camposRevisao.map(({ key, label }) => `## ${label}\n\n${editValues[key] ?? resultado[key] ?? ""}`).join("\n\n---\n\n"); handleCopiar(texto); }} className="gap-1.5">
              <Copy className="w-3.5 h-3.5" />Copiar Tudo
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />Voltar
        </Button>
        <div className="flex gap-3">
          {!resultado && (
            <Button variant="outline" onClick={onNext} className="gap-2 text-muted-foreground text-sm">
              Pular<ArrowRight className="w-4 h-4" />
            </Button>
          )}
          <Button onClick={onNext} className="btn-primary gap-2">
            Continuar para Termo SCR<ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Etapa 6: Termo SCR ───────────────────────────────────────────────────────

function Etapa6TermoSCR({
  codigoOperacao,
  nomeCliente,
  estadoCivil,
}: {
  codigoOperacao: string;
  nomeCliente: string;
  estadoCivil: string;
}) {
  const { data: ops } = trpc.operacoes.listar.useQuery({ busca: codigoOperacao });
  const operacaoId = ops?.find((o) => o.codigoOperacao === codigoOperacao)?.id;

  const { data: termo, refetch } = trpc.termoScr.obter.useQuery(
    { operacaoId: operacaoId! },
    { enabled: !!operacaoId }
  );
  const criarMutation = trpc.termoScr.criar.useMutation();
  const [, navigate] = useLocation();

  const temConjuge = estadoCivil === "Casado" || estadoCivil === "União Estável";

  const handleCriar = async () => {
    if (!operacaoId) return;
    try {
      await criarMutation.mutateAsync({ operacaoId });
      toast.success("Termo SCR gerado com sucesso!");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao gerar termo: " + err.message);
    }
  };

  const linkCompleto = termo ? `${window.location.origin}${termo.linkUnico}` : "";

  const statusColor: Record<string, string> = {
    "Aguardando assinatura": "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    "Parcialmente assinado": "text-blue-400 bg-blue-500/10 border-blue-500/20",
    "Assinado completo": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Termo de Autorização SCR</h2>
        <p className="text-sm text-muted-foreground">Gere o link único de assinatura digital do Termo SCR para enviar ao cliente{temConjuge ? " e cônjuge" : ""}.</p>
      </div>

      <div className="p-4 bg-muted/20 border border-border/40 rounded-lg space-y-2">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          O que é o Termo SCR?
        </h3>
        <p className="text-sm text-muted-foreground">
          O Termo de Autorização para Consulta ao SCR do Banco Central é obrigatório para que as IFs possam consultar o histórico de crédito do tomador. O cliente{temConjuge ? " e o cônjuge precisam" : " precisa"} assinar digitalmente antes do envio às IFs.
        </p>
      </div>

      {!termo ? (
        <div className="text-center py-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Send className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="text-foreground font-medium">Termo SCR não gerado</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Gerar Termo SCR" para criar o link único de assinatura.</p>
          </div>
          <Button onClick={handleCriar} disabled={criarMutation.isPending || !operacaoId} className="btn-primary gap-2">
            {criarMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando...</> : <><Send className="w-4 h-4" />Gerar Termo SCR</>}
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
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(linkCompleto); toast.success("Link copiado!"); }} className="gap-1.5 flex-shrink-0">
                <Copy className="w-3.5 h-3.5" />Copiar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Válido por 30 dias. Envie ao cliente{temConjuge ? " e ao cônjuge" : ""} via WhatsApp ou e-mail.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 border border-border/40 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Tomador</p>
              <p className="text-sm font-medium text-foreground">{nomeCliente}</p>
              {termo.assinadoClienteEm ? (
                <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Assinado em {new Date(termo.assinadoClienteEm).toLocaleDateString("pt-BR")}</p>
              ) : (
                <p className="text-xs text-yellow-400 mt-1">Aguardando assinatura</p>
              )}
            </div>
            {temConjuge && (
              <div className="p-3 border border-border/40 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Cônjuge</p>
                <p className="text-sm font-medium text-foreground">—</p>
                {termo.assinadoConjugeEm ? (
                  <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Assinado em {new Date(termo.assinadoConjugeEm).toLocaleDateString("pt-BR")}</p>
                ) : (
                  <p className="text-xs text-yellow-400 mt-1">Aguardando assinatura</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-border/30 pt-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Operação <span className="font-mono text-primary">{codigoOperacao}</span> cadastrada com sucesso.
        </p>
        <Button onClick={() => navigate("/operacoes")} className="btn-primary gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Concluir e Ver Operações
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FieldInput({ label, value, onChange, placeholder, error, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn("bg-background/50", error && "border-red-500")} />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const result = reader.result as string; resolve(result.split(",")[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
