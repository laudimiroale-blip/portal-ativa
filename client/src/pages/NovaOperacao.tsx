import { useAuth } from "@/_core/hooks/useAuth";
import AtivaDashboardLayout from "@/components/AtivaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, FileText, Save, Send } from "lucide-react";
import { Link } from "wouter";

const PRODUTOS = ["Home Equity", "Auto Equity", "Rural Equity", "Imóvel em Construção"] as const;
const ESTADOS_CIVIS = ["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável"] as const;
const PRIORIDADES = ["Baixa", "Normal", "Alta", "Urgente"] as const;

export default function NovaOperacao() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: usuarios } = trpc.usuarios.listar.useQuery();

  const [form, setForm] = useState({
    nomeCliente: "",
    cpf: "",
    estadoCivil: "Solteiro" as typeof ESTADOS_CIVIS[number],
    emailTomador: "",
    telefoneTomador: "",
    nomeConjuge: "",
    emailConjuge: "",
    telefoneConjuge: "",
    produto: "Home Equity" as typeof PRODUTOS[number],
    valorSolicitado: "",
    prazo: "",
    finalidade: "",
    responsavelOperacionalId: "",
    prioridade: "Normal" as typeof PRIORIDADES[number],
    observacoesEstrategicas: "",
  });

  const criarMutation = trpc.operacoes.criar.useMutation({
    onSuccess: async (data) => {
      await utils.operacoes.listar.invalidate();
      toast.success(`Operação ${data.codigoOperacao} criada com sucesso!`);
      navigate(`/operacoes/${data.codigoOperacao}`);
    },
    onError: (err) => toast.error("Erro ao criar operação: " + err.message),
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (rascunho: boolean) => {
    if (!form.nomeCliente || !form.cpf || !form.emailTomador || !form.produto || !form.valorSolicitado || !form.prazo || !form.finalidade) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    if (form.estadoCivil === "Casado" && !form.nomeConjuge) {
      toast.error("Nome do cônjuge é obrigatório para casados.");
      return;
    }
    const respId = form.responsavelOperacionalId ? Number(form.responsavelOperacionalId) : (user as any)?.id ?? 1;

    setSaving(true);
    try {
      await criarMutation.mutateAsync({
        nomeCliente: form.nomeCliente,
        cpf: form.cpf,
        estadoCivil: form.estadoCivil,
        emailTomador: form.emailTomador,
        telefoneTomador: form.telefoneTomador,
        nomeConjuge: form.nomeConjuge || undefined,
        emailConjuge: form.emailConjuge || undefined,
        telefoneConjuge: form.telefoneConjuge || undefined,
        produto: form.produto,
        valorSolicitado: form.valorSolicitado.replace(/\D/g, "").replace(/(\d+)(\d{2})$/, "$1.$2"),
        prazo: Number(form.prazo),
        finalidade: form.finalidade,
        responsavelOperacionalId: respId,
        prioridade: form.prioridade,
        statusRascunho: rascunho,
        observacoesEstrategicas: form.observacoesEstrategicas || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const inputClass =
    "w-full px-3 py-2.5 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors";
  const labelClass = "block text-xs font-medium text-muted-foreground mb-1.5";
  const sectionClass = "card-premium p-5 rounded-lg space-y-4";

  return (
    <AtivaDashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/operacoes">
            <a className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </a>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Nova Operação</h1>
            <p className="text-xs text-muted-foreground">Código será gerado automaticamente no padrão ATV-2026-XXXXXX</p>
          </div>
        </div>

        {/* Dados do Tomador */}
        <div className={sectionClass}>
          <h2 className="text-sm font-semibold text-foreground border-b border-border pb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">1</span>
            Dados do Tomador
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Nome completo <span className="text-red-400">*</span></label>
              <input className={inputClass} value={form.nomeCliente} onChange={(e) => set("nomeCliente", e.target.value)} placeholder="Nome completo do tomador" />
            </div>
            <div>
              <label className={labelClass}>CPF <span className="text-red-400">*</span></label>
              <input className={inputClass} value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" maxLength={14} />
            </div>
            <div>
              <label className={labelClass}>Estado civil <span className="text-red-400">*</span></label>
              <select className={inputClass} value={form.estadoCivil} onChange={(e) => set("estadoCivil", e.target.value)}>
                {ESTADOS_CIVIS.map((ec) => <option key={ec} value={ec}>{ec}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>E-mail <span className="text-red-400">*</span></label>
              <input type="email" className={inputClass} value={form.emailTomador} onChange={(e) => set("emailTomador", e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div>
              <label className={labelClass}>Telefone / WhatsApp <span className="text-red-400">*</span></label>
              <input className={inputClass} value={form.telefoneTomador} onChange={(e) => set("telefoneTomador", e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          </div>
        </div>

        {/* Cônjuge (condicional) */}
        {(form.estadoCivil === "Casado" || form.estadoCivil === "União Estável") && (
          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-foreground border-b border-border pb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">2</span>
              Dados do Cônjuge
              {form.estadoCivil === "Casado" && <span className="text-red-400 text-xs">(obrigatório)</span>}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Nome completo {form.estadoCivil === "Casado" && <span className="text-red-400">*</span>}</label>
                <input className={inputClass} value={form.nomeConjuge} onChange={(e) => set("nomeConjuge", e.target.value)} placeholder="Nome completo do cônjuge" />
              </div>
              <div>
                <label className={labelClass}>E-mail</label>
                <input type="email" className={inputClass} value={form.emailConjuge} onChange={(e) => set("emailConjuge", e.target.value)} placeholder="email@exemplo.com" />
              </div>
              <div>
                <label className={labelClass}>Telefone</label>
                <input className={inputClass} value={form.telefoneConjuge} onChange={(e) => set("telefoneConjuge", e.target.value)} placeholder="(00) 00000-0000" />
              </div>
            </div>
          </div>
        )}

        {/* Produto e Financeiro */}
        <div className={sectionClass}>
          <h2 className="text-sm font-semibold text-foreground border-b border-border pb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">
              {form.estadoCivil === "Casado" || form.estadoCivil === "União Estável" ? "3" : "2"}
            </span>
            Produto e Dados Financeiros
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Produto <span className="text-red-400">*</span></label>
              <select className={inputClass} value={form.produto} onChange={(e) => set("produto", e.target.value)}>
                {PRODUTOS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Prioridade</label>
              <select className={inputClass} value={form.prioridade} onChange={(e) => set("prioridade", e.target.value)}>
                {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Valor solicitado (R$) <span className="text-red-400">*</span></label>
              <input className={inputClass} value={form.valorSolicitado} onChange={(e) => set("valorSolicitado", e.target.value)} placeholder="Ex: 250000" />
            </div>
            <div>
              <label className={labelClass}>Prazo (meses) <span className="text-red-400">*</span></label>
              <input type="number" className={inputClass} value={form.prazo} onChange={(e) => set("prazo", e.target.value)} placeholder="Ex: 120" min={1} max={360} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Finalidade do crédito <span className="text-red-400">*</span></label>
              <textarea className={inputClass + " resize-none"} rows={3} value={form.finalidade} onChange={(e) => set("finalidade", e.target.value)} placeholder="Descreva a finalidade do crédito..." />
            </div>
          </div>
        </div>

        {/* Responsável e Observações */}
        <div className={sectionClass}>
          <h2 className="text-sm font-semibold text-foreground border-b border-border pb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">
              {form.estadoCivil === "Casado" || form.estadoCivil === "União Estável" ? "4" : "3"}
            </span>
            Responsável e Observações
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Responsável operacional</label>
              <select className={inputClass} value={form.responsavelOperacionalId} onChange={(e) => set("responsavelOperacionalId", e.target.value)}>
                <option value="">Selecionar responsável</option>
                {usuarios?.map((u) => (
                  <option key={u.id} value={u.id}>{u.name ?? u.email ?? `Usuário #${u.id}`}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Observações estratégicas (internas)</label>
              <textarea className={inputClass + " resize-none"} rows={3} value={form.observacoesEstrategicas} onChange={(e) => set("observacoesEstrategicas", e.target.value)} placeholder="Notas internas sobre a operação, contexto do cliente, pontos de atenção..." />
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/operacoes">
            <a className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent transition-colors">
              Cancelar
            </a>
          </Link>
          <button
            onClick={() => handleSubmit(true)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 text-sm border border-primary/30 text-primary rounded-lg hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            Salvar como Rascunho
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {saving ? "Criando..." : "Criar Operação"}
          </button>
        </div>
      </div>
    </AtivaDashboardLayout>
  );
}
