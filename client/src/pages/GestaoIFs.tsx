import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import AtivaDashboardLayout from "@/components/AtivaDashboardLayout";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  Edit,
  Mail,
  Phone,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const PRODUTOS = ["Home Equity", "Auto Equity", "Rural Equity", "Imóvel em Construção"] as const;

const STATUS_COLORS: Record<string, string> = {
  Ativa: "bg-green-500/20 text-green-400 border-green-500/30",
  Inativa: "bg-red-500/20 text-red-400 border-red-500/30",
  "Em negociação": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

type IFCadastro = {
  id: number;
  nome: string;
  cnpj: string;
  contatoNome?: string | null;
  contatoEmail?: string | null;
  contatoTel?: string | null;
  status?: string | null;
  observacoes?: string | null;
};

type Condicao = {
  id: number;
  ifId: number;
  produto: string;
  taxaMinima?: string | null;
  taxaMaxima?: string | null;
  ltvMaximo?: string | null;
  prazoMinimo?: number | null;
  prazoMaximo?: number | null;
  valorMinimo?: string | null;
  valorMaximo?: string | null;
  observacoes?: string | null;
};

// ─── Métricas por IF ─────────────────────────────────────────────────────────

function MetricasIF({ ifId }: { ifId: number }) {
  const { data: metricas, isLoading } = trpc.ifCadastros.metricasPorIF.useQuery({ ifId });

  if (isLoading) return <div className="h-16 bg-[#1a1a1a] animate-pulse rounded" />;

  if (!metricas || metricas.totalEnviadas === 0) {
    return (
      <div className="text-center py-6 text-[#555] text-xs">
        <Building2 className="w-5 h-5 mx-auto mb-1 opacity-30" />
        Nenhuma operação distribuída para esta IF ainda.
      </div>
    );
  }

  const taxaAprovacao = metricas.totalEnviadas > 0
    ? ((metricas.totalAprovadas / metricas.totalEnviadas) * 100).toFixed(0)
    : "0";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: "Enviadas", value: metricas.totalEnviadas, color: "text-[#C9A84C]" },
        { label: "Aprovadas", value: metricas.totalAprovadas, color: "text-green-400" },
        { label: "Reprovadas", value: metricas.totalReprovadas, color: "text-red-400" },
        { label: "Taxa Aprovação", value: `${taxaAprovacao}%`, color: "text-blue-400" },
      ].map((m) => (
        <div key={m.label} className="bg-[#1a1a1a] rounded-lg p-3 border border-[#C9A84C]/10">
          <p className="text-[10px] text-[#666] mb-1">{m.label}</p>
          <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
        </div>
      ))}
      {metricas.slaMedioHoras !== null && (
        <div className="col-span-2 md:col-span-4 bg-[#1a1a1a] rounded-lg p-3 border border-[#C9A84C]/10">
          <p className="text-[10px] text-[#666] mb-1">SLA Médio de Retorno</p>
          <p className="text-sm font-semibold text-[#C9A84C]">
            {metricas.slaMedioHoras < 24
              ? `${metricas.slaMedioHoras}h`
              : `${Math.round(metricas.slaMedioHoras / 24)} dias`}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Histórico de Distribuições por IF ──────────────────────────────────────

function HistoricoDistribuicoes({ ifId }: { ifId: number }) {
  const { data: historico, isLoading } = trpc.ifCadastros.historicoDistribuicoes.useQuery({ ifId });

  if (isLoading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-[#1a1a1a] animate-pulse rounded" />)}</div>;

  if (!historico || historico.length === 0) {
    return (
      <div className="text-center py-6 text-[#555] text-xs">
        <Building2 className="w-5 h-5 mx-auto mb-1 opacity-30" />
        Nenhum histórico de distribuição para esta IF.
      </div>
    );
  }

  const STATUS_COLORS_HIST: Record<string, string> = {
    Aguardando: "text-yellow-400",
    "Em análise": "text-blue-400",
    Aprovado: "text-green-400",
    Reprovado: "text-red-400",
    "Stand-by": "text-[#888]",
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#C9A84C]/20">
            <th className="text-left py-2 pr-3 text-[#666] font-medium">Código</th>
            <th className="text-left py-2 pr-3 text-[#666] font-medium">Cliente</th>
            <th className="text-left py-2 pr-3 text-[#666] font-medium">Produto</th>
            <th className="text-left py-2 pr-3 text-[#666] font-medium">Envio</th>
            <th className="text-left py-2 text-[#666] font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#C9A84C]/10">
          {historico.map((h) => (
            <tr key={h.dist.id} className="hover:bg-[#C9A84C]/5 transition-colors">
              <td className="py-2 pr-3 font-mono text-[#C9A84C]">{h.codigoOperacao ?? "—"}</td>
              <td className="py-2 pr-3 text-[#FAFAFA]">{h.nomeCliente ?? "—"}</td>
              <td className="py-2 pr-3 text-[#888]">{h.produto ?? "—"}</td>
              <td className="py-2 pr-3 text-[#888]">
                {h.dist.dataEnvio ? format(new Date(h.dist.dataEnvio), "dd/MM/yy", { locale: ptBR }) : "—"}
              </td>
              <td className={`py-2 font-medium ${STATUS_COLORS_HIST[h.dist.statusRetorno ?? "Aguardando"] ?? "text-[#888]"}` }>
                {h.dist.statusRetorno ?? "Aguardando"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Condições por Produto ────────────────────────────────────────────────────

function CondicoesProduto({ ifId, isAdmin }: { ifId: number; isAdmin: boolean }) {
  const { data: condicoes, refetch } = trpc.ifCadastros.listarCondicoes.useQuery({ ifId });
  const salvarCondicao = trpc.ifCadastros.salvarCondicao.useMutation({ onSuccess: () => { refetch(); toast.success("Condição salva!"); } });
  const deletarCondicao = trpc.ifCadastros.deletarCondicao.useMutation({ onSuccess: () => { refetch(); toast.success("Condição removida!"); } });

  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Condicao>>({});
  const [excluindoProduto, setExcluindoProduto] = useState<string | null>(null);
  const [produtosOcultos, setProdutosOcultos] = useState<string[]>([]);

  const iniciarEdicao = (produto: string) => {
    const existing = condicoes?.find((c) => c.produto === produto);
    setForm(existing ?? { ifId, produto });
    setEditando(produto);
  };

  const salvar = () => {
    if (!editando) return;
    salvarCondicao.mutate({
      ifId,
      produto: editando as any,
      taxaMinima: form.taxaMinima ?? undefined,
      taxaMaxima: form.taxaMaxima ?? undefined,
      ltvMaximo: form.ltvMaximo ?? undefined,
      prazoMinimo: form.prazoMinimo ?? undefined,
      prazoMaximo: form.prazoMaximo ?? undefined,
      valorMinimo: form.valorMinimo ?? undefined,
      valorMaximo: form.valorMaximo ?? undefined,
      observacoes: form.observacoes ?? undefined,
    });
    setEditando(null);
  };

  return (
    <div className="space-y-3">
      {PRODUTOS.filter((p) => !produtosOcultos.includes(p)).map((produto) => {
        const cond = condicoes?.find((c) => c.produto === produto);
        return (
          <div key={produto} className="border border-[#C9A84C]/20 rounded-lg p-3 bg-[#111]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[#FAFAFA]">{produto}</span>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[#C9A84C] hover:bg-[#C9A84C]/10" onClick={() => iniciarEdicao(produto)}>
                    <Edit className="w-3 h-3 mr-1" />
                    {cond ? "Editar" : "Configurar"}
                  </Button>
                  {/* Botão Excluir produto */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-red-400 hover:bg-red-500/10"
                    title={cond ? "Excluir produto e condições" : "Remover produto desta IF"}
                    onClick={() => {
                      if (cond) {
                        setExcluindoProduto(produto);
                      } else {
                        setProdutosOcultos((prev) => [...prev, produto]);
                        toast.success(`Produto "${produto}" removido desta IF.`);
                      }
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
            {cond ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                {cond.taxaMinima && <div><span className="text-[#888]">Taxa mín:</span> <span className="text-[#FAFAFA]">{cond.taxaMinima}% a.m.</span></div>}
                {cond.taxaMaxima && <div><span className="text-[#888]">Taxa máx:</span> <span className="text-[#FAFAFA]">{cond.taxaMaxima}% a.m.</span></div>}
                {cond.ltvMaximo && <div><span className="text-[#888]">LTV máx:</span> <span className="text-[#FAFAFA]">{cond.ltvMaximo}%</span></div>}
                {cond.prazoMaximo && <div><span className="text-[#888]">Prazo máx:</span> <span className="text-[#FAFAFA]">{cond.prazoMaximo} meses</span></div>}
                {cond.valorMinimo && <div><span className="text-[#888]">Valor mín:</span> <span className="text-[#FAFAFA]">R$ {cond.valorMinimo}</span></div>}
                {cond.valorMaximo && <div><span className="text-[#888]">Valor máx:</span> <span className="text-[#FAFAFA]">R$ {cond.valorMaximo}</span></div>}
                {cond.observacoes && <div className="col-span-2 md:col-span-4"><span className="text-[#888]">Obs:</span> <span className="text-[#FAFAFA]">{cond.observacoes}</span></div>}
              </div>
            ) : (
              <div className="flex items-center justify-between p-2 bg-amber-500/5 border border-amber-500/20 rounded-md">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500/70 flex-shrink-0" />
                  <p className="text-xs text-amber-500/70">Sem condições configuradas — esta IF não aparecerá na distribuição para este produto.</p>
                </div>
                {isAdmin && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-amber-500 hover:bg-amber-500/10 ml-2 flex-shrink-0" onClick={() => iniciarEdicao(produto)}>
                    Configurar
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Modal de confirmação: excluir produto com condições */}
      <Dialog open={!!excluindoProduto} onOpenChange={() => setExcluindoProduto(null)}>
        <DialogContent className="bg-[#111] border-[#C9A84C]/30 text-[#FAFAFA] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-400">Excluir produto</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#FAFAFA]/80">
            O produto <strong className="text-[#FAFAFA]">{excluindoProduto}</strong> possui condições cadastradas.
            Ao excluir, todas as condições serão perdidas permanentemente.
          </p>
          <p className="text-xs text-red-400/80">Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindoProduto(null)} className="text-[#888]">Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                const cond = condicoes?.find((c) => c.produto === excluindoProduto);
                if (cond) deletarCondicao.mutate({ id: cond.id });
                setProdutosOcultos((prev) => [...prev, excluindoProduto!]);
                setExcluindoProduto(null);
                toast.success(`Produto "${excluindoProduto}" e suas condições foram removidos.`);
              }}
              disabled={deletarCondicao.isPending}
            >
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de edição de condição */}
      <Dialog open={!!editando} onOpenChange={() => setEditando(null)}>
        <DialogContent className="bg-[#111] border-[#C9A84C]/30 text-[#FAFAFA] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#C9A84C]">Condições — {editando}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-[#888]">Taxa Mínima (% a.m.)</Label>
              <Input value={form.taxaMinima ?? ""} onChange={(e) => setForm({ ...form, taxaMinima: e.target.value })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA] h-8 text-sm" placeholder="Ex: 0,89" />
            </div>
            <div>
              <Label className="text-xs text-[#888]">Taxa Máxima (% a.m.)</Label>
              <Input value={form.taxaMaxima ?? ""} onChange={(e) => setForm({ ...form, taxaMaxima: e.target.value })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA] h-8 text-sm" placeholder="Ex: 1,49" />
            </div>
            <div>
              <Label className="text-xs text-[#888]">LTV Máximo (%)</Label>
              <Input value={form.ltvMaximo ?? ""} onChange={(e) => setForm({ ...form, ltvMaximo: e.target.value })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA] h-8 text-sm" placeholder="Ex: 60" />
            </div>
            <div>
              <Label className="text-xs text-[#888]">Prazo Mínimo (meses)</Label>
              <Input type="number" value={form.prazoMinimo ?? ""} onChange={(e) => setForm({ ...form, prazoMinimo: Number(e.target.value) })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA] h-8 text-sm" placeholder="Ex: 12" />
            </div>
            <div>
              <Label className="text-xs text-[#888]">Prazo Máximo (meses)</Label>
              <Input type="number" value={form.prazoMaximo ?? ""} onChange={(e) => setForm({ ...form, prazoMaximo: Number(e.target.value) })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA] h-8 text-sm" placeholder="Ex: 240" />
            </div>
            <div>
              <Label className="text-xs text-[#888]">Valor Mínimo (R$)</Label>
              <Input value={form.valorMinimo ?? ""} onChange={(e) => setForm({ ...form, valorMinimo: e.target.value })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA] h-8 text-sm" placeholder="Ex: 50.000" />
            </div>
            <div>
              <Label className="text-xs text-[#888]">Valor Máximo (R$)</Label>
              <Input value={form.valorMaximo ?? ""} onChange={(e) => setForm({ ...form, valorMaximo: e.target.value })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA] h-8 text-sm" placeholder="Ex: 5.000.000" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-[#888]">Observações</Label>
              <Textarea value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA] text-sm resize-none" rows={2} placeholder="Restrições, exigências especiais..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditando(null)} className="text-[#888]">Cancelar</Button>
            <Button onClick={salvar} disabled={salvarCondicao.isPending} className="bg-[#C9A84C] hover:bg-[#B8973B] text-black font-semibold">
              {salvarCondicao.isPending ? "Salvando..." : "Salvar Condição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IFCard({ if_: ifItem, isAdmin, onEdit, onDelete }: { if_: IFCadastro; isAdmin: boolean; onEdit: (i: IFCadastro) => void; onDelete: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="bg-[#111] border-[#C9A84C]/20 hover:border-[#C9A84C]/40 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div>
              <CardTitle className="text-[#FAFAFA] text-base">{ifItem.nome}</CardTitle>
              <p className="text-xs text-[#555] mt-0.5">CNPJ: {ifItem.cnpj}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs border ${STATUS_COLORS[ifItem.status ?? "Ativa"] ?? STATUS_COLORS["Ativa"]}`}>
              {ifItem.status ?? "Ativa"}
            </Badge>
            {isAdmin && (
              <>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-[#888] hover:text-[#C9A84C]" onClick={() => onEdit(ifItem)}>
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-[#888] hover:text-red-400" onClick={() => onDelete(ifItem.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-4 text-xs text-[#888] mb-3">
          {ifItem.contatoNome && <span className="flex items-center gap-1"><Settings className="w-3 h-3" />{ifItem.contatoNome}</span>}
          {ifItem.contatoEmail && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{ifItem.contatoEmail}</span>}
          {ifItem.contatoTel && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{ifItem.contatoTel}</span>}
        </div>
        {ifItem.observacoes && <p className="text-xs text-[#666] mb-3 italic">{ifItem.observacoes}</p>}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-[#C9A84C] hover:text-[#B8973B] transition-colors"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {expanded ? "Recolher" : "Ver detalhes"}
        </button>
        {expanded && (
          <div className="mt-3">
            <Tabs defaultValue="condicoes">
              <TabsList className="bg-[#1a1a1a] border border-[#C9A84C]/20 mb-3">
                <TabsTrigger value="condicoes" className="text-xs data-[state=active]:bg-[#C9A84C]/20 data-[state=active]:text-[#C9A84C]">Condições</TabsTrigger>
                <TabsTrigger value="metricas" className="text-xs data-[state=active]:bg-[#C9A84C]/20 data-[state=active]:text-[#C9A84C]">Métricas</TabsTrigger>
                <TabsTrigger value="historico" className="text-xs data-[state=active]:bg-[#C9A84C]/20 data-[state=active]:text-[#C9A84C]">Histórico</TabsTrigger>
              </TabsList>
              <TabsContent value="condicoes">
                <CondicoesProduto ifId={ifItem.id} isAdmin={isAdmin} />
              </TabsContent>
              <TabsContent value="metricas">
                <MetricasIF ifId={ifItem.id} />
              </TabsContent>
              <TabsContent value="historico">
                <HistoricoDistribuicoes ifId={ifItem.id} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function GestaoIFs() {
  const { user } = useAuth();
  const isAdmin = (user as any)?.perfil === "admin";

  const { data: ifs, refetch } = trpc.ifCadastros.listar.useQuery();
  const criarIF = trpc.ifCadastros.criar.useMutation({ onSuccess: () => { refetch(); setModalAberto(false); toast.success("IF cadastrada com sucesso!"); } });
  const atualizarIF = trpc.ifCadastros.atualizar.useMutation({ onSuccess: () => { refetch(); setModalAberto(false); toast.success("IF atualizada!"); } });
  const deletarIF = trpc.ifCadastros.deletar.useMutation({ onSuccess: () => { refetch(); toast.success("IF removida!"); } });

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoIF, setEditandoIF] = useState<IFCadastro | null>(null);
  const [form, setForm] = useState({
    nome: "", cnpj: "", contatoNome: "", contatoEmail: "", contatoTel: "",
    status: "Ativa" as "Ativa" | "Inativa" | "Em negociação", observacoes: "",
  });

  const abrirCadastro = (if_?: IFCadastro) => {
    if (if_) {
      setEditandoIF(if_);
      setForm({
        nome: if_.nome, cnpj: if_.cnpj,
        contatoNome: if_.contatoNome ?? "", contatoEmail: if_.contatoEmail ?? "",
        contatoTel: if_.contatoTel ?? "", status: (if_.status ?? "Ativa") as any,
        observacoes: if_.observacoes ?? "",
      });
    } else {
      setEditandoIF(null);
      setForm({ nome: "", cnpj: "", contatoNome: "", contatoEmail: "", contatoTel: "", status: "Ativa", observacoes: "" });
    }
    setModalAberto(true);
  };

  const salvar = () => {
    if (editandoIF) {
      atualizarIF.mutate({ id: editandoIF.id, ...form });
    } else {
      criarIF.mutate(form);
    }
  };

  const ifsFiltradas = (ifs ?? []).filter((i) => {
    const matchBusca = !busca || i.nome.toLowerCase().includes(busca.toLowerCase()) || i.cnpj.includes(busca);
    const matchStatus = filtroStatus === "Todos" || i.status === filtroStatus;
    return matchBusca && matchStatus;
  });

  const ativas = (ifs ?? []).filter((i) => i.status === "Ativa" || !i.status).length;
  const inativas = (ifs ?? []).filter((i) => i.status === "Inativa").length;
  const negociacao = (ifs ?? []).filter((i) => i.status === "Em negociação").length;

  return (
    <AtivaDashboardLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#FAFAFA]">Instituições Financeiras</h1>
            <p className="text-sm text-[#888] mt-1">Gerencie os parceiros e suas condições por produto</p>
          </div>
          {isAdmin && (
            <Button onClick={() => abrirCadastro()} className="bg-[#C9A84C] hover:bg-[#B8973B] text-black font-semibold gap-2">
              <Plus className="w-4 h-4" />
              Nova IF
            </Button>
          )}
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total de IFs", value: ifs?.length ?? 0, color: "text-[#C9A84C]" },
            { label: "Ativas", value: ativas, color: "text-green-400" },
            { label: "Em Negociação", value: negociacao, color: "text-yellow-400" },
            { label: "Inativas", value: inativas, color: "text-red-400" },
          ].map((m) => (
            <Card key={m.label} className="bg-[#111] border-[#C9A84C]/20">
              <CardContent className="p-4">
                <p className="text-xs text-[#888]">{m.label}</p>
                <p className={`text-2xl font-bold mt-1 ${m.color}`}>{m.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555]" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou CNPJ..."
              className="pl-9 bg-[#111] border-[#333] text-[#FAFAFA] placeholder:text-[#555]"
            />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-48 bg-[#111] border-[#333] text-[#FAFAFA]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111] border-[#333] text-[#FAFAFA]">
              <SelectItem value="Todos">Todos os status</SelectItem>
              <SelectItem value="Ativa">Ativas</SelectItem>
              <SelectItem value="Em negociação">Em Negociação</SelectItem>
              <SelectItem value="Inativa">Inativas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Lista */}
        {ifsFiltradas.length === 0 ? (
          <div className="text-center py-16 text-[#555]">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma IF encontrada</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {ifsFiltradas.map((if_) => (
              <IFCard
                key={if_.id}
                if_={if_ as IFCadastro}
                isAdmin={isAdmin}
                onEdit={abrirCadastro}
                onDelete={(id) => deletarIF.mutate({ id })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal Cadastro/Edição */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="bg-[#111] border-[#C9A84C]/30 text-[#FAFAFA] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#C9A84C]">
              {editandoIF ? "Editar Instituição Financeira" : "Cadastrar Nova IF"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs text-[#888]">Nome da Instituição *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA]" placeholder="Ex: Banco Itaú S.A." />
              </div>
              <div>
                <Label className="text-xs text-[#888]">CNPJ *</Label>
                <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA]" placeholder="00.000.000/0001-00" />
              </div>
              <div>
                <Label className="text-xs text-[#888]">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                  <SelectTrigger className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111] border-[#333] text-[#FAFAFA]">
                    <SelectItem value="Ativa">Ativa</SelectItem>
                    <SelectItem value="Em negociação">Em Negociação</SelectItem>
                    <SelectItem value="Inativa">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-[#888]">Nome do Contato</Label>
                <Input value={form.contatoNome} onChange={(e) => setForm({ ...form, contatoNome: e.target.value })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA]" placeholder="Gerente responsável" />
              </div>
              <div>
                <Label className="text-xs text-[#888]">Telefone do Contato</Label>
                <Input value={form.contatoTel} onChange={(e) => setForm({ ...form, contatoTel: e.target.value })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA]" placeholder="(11) 99999-9999" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-[#888]">E-mail do Contato</Label>
                <Input value={form.contatoEmail} onChange={(e) => setForm({ ...form, contatoEmail: e.target.value })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA]" placeholder="contato@banco.com.br" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-[#888]">Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="bg-[#0A0A0A] border-[#333] text-[#FAFAFA] resize-none" rows={2} placeholder="Notas sobre a parceria, restrições, etc." />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalAberto(false)} className="text-[#888]">Cancelar</Button>
            <Button
              onClick={salvar}
              disabled={!form.nome || !form.cnpj || criarIF.isPending || atualizarIF.isPending}
              className="bg-[#C9A84C] hover:bg-[#B8973B] text-black font-semibold"
            >
              {criarIF.isPending || atualizarIF.isPending ? "Salvando..." : editandoIF ? "Salvar Alterações" : "Cadastrar IF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AtivaDashboardLayout>
  );
}
