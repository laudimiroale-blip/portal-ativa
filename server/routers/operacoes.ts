import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addHistoricoStatus,
  addLog,
  createNotificacao,
  createOperacao,
  getAdmins,
  getMetricasDashboard,
  getMetricasPorConsultor,
  getOperacaoById,
  getOperacoes,
  getOperacoesComSlaAlert,
  getOperacoesComSlaAlerts,
  gerarCodigoOperacao,
  softDeleteOperacao,
  updateOperacao,
  updateUserPerfil,
  getAllAssessores,
  getAllUsuarios,
  getUsuariosAdminOperacional,
  softDeleteUsuario,
  updateUsuario,
} from "../db";
import { notifyOwner } from "../_core/notification";
import { protectedProcedure, router } from "../_core/trpc";

// Middleware RBAC por perfil (compatível com sistema atual)
const adminPerfilProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user as any).perfil !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

// Normaliza valores monetários BR: "1.000.000,00" → "1000000.00"
export const parseMoney = (v?: string): string => {
  if (!v) return "0";
  const clean = v.replace(/[^\d.,]/g, "");
  if (clean.includes(",")) return clean.replace(/\./g, "").replace(",", ".");
  const parts = clean.split(".");
  if (parts.length > 2) return parts.join("");
  return clean;
};

// Inicializar checklist por produto
async function inicializarChecklist(codigoOperacao: string, produto: string, estadoCivil?: string) {
  const { createDocumento } = await import("../db");
  const ops = await getOperacoes({ busca: codigoOperacao });
  const op = ops.find((o) => o.codigoOperacao === codigoOperacao);
  if (!op) return;

  // Documentos do cônjuge — obrigatórios quando Casado ou União Estável
  const exigeConjuge = estadoCivil === "Casado" || estadoCivil === "União Estável";

  const checklistPorProduto: Record<string, { nome: string; categoria: string; opcional?: boolean }[]> = {
    "Home Equity": [
      { nome: "RG/CPF ou CNH", categoria: "Pessoal" },
      { nome: "Comprovante de residência (até 90 dias)", categoria: "Pessoal" },
      { nome: "IRPF — declaração + recibo", categoria: "Pessoal" },
      { nome: "Certidão de estado civil", categoria: "Pessoal" },
      { nome: "Extratos bancários PF — 3 meses", categoria: "Renda" },
      { nome: "Contracheques — 3 meses (CLT)", categoria: "Renda", opcional: true },
      { nome: "Matrícula atualizada do imóvel", categoria: "Imóvel" },
      { nome: "IPTU com metragem", categoria: "Imóvel" },
      { nome: "Fotos do imóvel (frente/fundos/lateral/interna)", categoria: "Imóvel" },
      { nome: "Escritura (se disponível)", categoria: "Imóvel" },
    ],
    "Auto Equity": [
      { nome: "RG/CPF ou CNH", categoria: "Pessoal" },
      { nome: "Comprovante de residência (até 90 dias)", categoria: "Pessoal" },
      { nome: "IRPF — declaração + recibo", categoria: "Pessoal" },
      { nome: "Certidão de estado civil", categoria: "Pessoal" },
      { nome: "Extratos bancários PF — 3 meses", categoria: "Renda" },
      { nome: "CRLV", categoria: "Veículo" },
      { nome: "Fotos do veículo (frente/traseira/laterais/painel/km)", categoria: "Veículo" },
      { nome: "Comprovante de quitação ou extrato de financiamento", categoria: "Veículo" },
    ],
    "Rural Equity": [
      { nome: "RG/CPF ou CNH", categoria: "Pessoal" },
      { nome: "Comprovante de residência (até 90 dias)", categoria: "Pessoal" },
      { nome: "IRPF com atividade rural", categoria: "Pessoal" },
      { nome: "Certidão de estado civil", categoria: "Pessoal" },
      { nome: "Extratos bancários", categoria: "Renda" },
      { nome: "Matrícula atualizada", categoria: "Imóvel Rural" },
      { nome: "Georreferenciamento INCRA", categoria: "Imóvel Rural" },
      { nome: "ITR", categoria: "Imóvel Rural" },
      { nome: "CAR — Cadastro Ambiental Rural", categoria: "Imóvel Rural" },
      { nome: "CCIR", categoria: "Imóvel Rural" },
      { nome: "CAFIR", categoria: "Imóvel Rural" },
      { nome: "Laudo de avaliação", categoria: "Imóvel Rural" },
      { nome: "Fotos da propriedade e atividade produtiva", categoria: "Imóvel Rural" },
    ],
    "Imóvel em Construção": [
      { nome: "RG/CPF ou CNH", categoria: "Pessoal" },
      { nome: "Comprovante de residência (até 90 dias)", categoria: "Pessoal" },
      { nome: "IRPF — declaração + recibo", categoria: "Pessoal" },
      { nome: "Certidão de estado civil", categoria: "Pessoal" },
      { nome: "Extratos bancários PF — 3 meses", categoria: "Renda" },
      { nome: "Contracheques — 3 meses (CLT)", categoria: "Renda", opcional: true },
      { nome: "Matrícula do terreno", categoria: "Obra" },
      { nome: "Alvará vigente", categoria: "Obra" },
      { nome: "Projeto aprovado pela prefeitura", categoria: "Obra" },
      { nome: "ART ou RRT", categoria: "Obra" },
      { nome: "Habite-se (se emitido)", categoria: "Obra" },
      { nome: "Fotos da obra", categoria: "Obra" },
      { nome: "Orçamento da construção", categoria: "Obra" },
    ],
    "Crédito para Construção / Término de Obra": [
      { nome: "RG/CPF ou CNH", categoria: "Pessoal" },
      { nome: "Comprovante de residência (até 90 dias)", categoria: "Pessoal" },
      { nome: "IRPF — declaração + recibo", categoria: "Pessoal" },
      { nome: "Certidão de estado civil", categoria: "Pessoal" },
      { nome: "Extratos bancários PF — 3 meses", categoria: "Renda" },
      { nome: "Contracheques — 3 meses (CLT)", categoria: "Renda", opcional: true },
      { nome: "Matrícula do terreno / imóvel", categoria: "Obra" },
      { nome: "Alvará de construção vigente", categoria: "Obra" },
      { nome: "Projeto arquitetônico aprovado", categoria: "Obra" },
      { nome: "ART ou RRT do responsável técnico", categoria: "Obra" },
      { nome: "Cronograma físico-financeiro", categoria: "Obra" },
      { nome: "Orçamento detalhado da obra", categoria: "Obra" },
      { nome: "Fotos atuais da obra / terreno", categoria: "Obra" },
      { nome: "Habite-se parcial (se aplicável)", categoria: "Obra", opcional: true },
      { nome: "Memorial descritivo", categoria: "Obra", opcional: true },
    ],
  };

  const itens = checklistPorProduto[produto] ?? [];
  for (const item of itens) {
    await createDocumento({
      operacaoId: op.id,
      nomeDocumento: item.nome,
      categoria: item.categoria,
      estado: "Pendente",
      versaoAtual: 1,
      opcional: item.opcional ?? false,
    } as any);
  }

  // Adicionar documentos do cônjuge quando estado civil exige
  if (exigeConjuge) {
    const docsConjuge = [
      { nome: "RG/CPF ou CNH do cônjuge", categoria: "Cônjuge" },
      { nome: "IRPF do cônjuge — declaração + recibo de entrega", categoria: "Cônjuge" },
    ];
    for (const doc of docsConjuge) {
      await createDocumento({
        operacaoId: op.id,
        nomeDocumento: doc.nome,
        categoria: doc.categoria,
        estado: "Pendente",
        versaoAtual: 1,
        opcional: false,
      } as any);
    }
  }
}

export const operacoesRouter = router({
  listar: protectedProcedure
    .input(z.object({
      statusMacro: z.string().optional(),
      produto: z.string().optional(),
      prioridade: z.string().optional(),
      busca: z.string().optional(),
      apenasMinhas: z.boolean().optional(),
      responsavelOperacionalId: z.number().optional(),
      assessorId: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const isAdmin = user.perfil === "admin";
      const filters: any = {
        statusMacro: input?.statusMacro,
        produto: input?.produto,
        prioridade: input?.prioridade,
        busca: input?.busca,
        responsavelOperacionalId: input?.responsavelOperacionalId,
      };
      if (!isAdmin || input?.apenasMinhas) {
        filters.assessorId = user.id;
      } else if (input?.assessorId) {
        filters.assessorId = input.assessorId;
      }
      return getOperacoes(filters);
    }),

  obter: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const op = await getOperacaoById(input.id);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      const user = ctx.user as any;
      if (user.perfil !== "admin" && op.assessorId !== user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return op;
    }),

  criar: protectedProcedure
    .input(z.object({
      nomeCliente: z.string().min(2),
      cpf: z.string().optional().default(""),
      estadoCivil: z.enum(["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável"]).optional().default("Solteiro"),
      emailTomador: z.string().optional().default(""),
      telefoneTomador: z.string().min(10),
      nomeConjuge: z.string().optional(),
      cpfConjuge: z.string().optional(),
      nascimentoConjuge: z.string().optional(),
      profissaoConjuge: z.string().optional(),
      emailConjuge: z.string().optional(),
      telefoneConjuge: z.string().optional(),
      produto: z.enum(["Home Equity", "Auto Equity", "Rural Equity", "Imóvel em Construção", "Crédito para Construção / Término de Obra"]).optional().default("Home Equity"),
      valorSolicitado: z.string().optional().default("0"),
      prazo: z.number().min(1).optional().default(12),
      finalidade: z.string().optional().default(""),
      contextoOperacao: z.string().optional(),
      valorGarantia: z.string().optional(),
      tipoGarantiaDescricao: z.string().optional(),
      prioridade: z.enum(["Normal", "Alta"]).default("Normal"),
      statusRascunho: z.boolean().default(false),
      etapaAtual: z.number().optional().default(1),
      responsavelOperacionalId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const codigo = await gerarCodigoOperacao();
      const valorSolicitadoNorm = parseMoney(input.valorSolicitado);
      const valorGarantiaNorm = input.valorGarantia ? parseMoney(input.valorGarantia) : undefined;
      await createOperacao({
        codigoOperacao: codigo,
        nomeCliente: input.nomeCliente,
        cpf: input.cpf,
        estadoCivil: input.estadoCivil,
        emailTomador: input.emailTomador,
        telefoneTomador: input.telefoneTomador,
        nomeConjuge: input.nomeConjuge,
        cpfConjuge: input.cpfConjuge,
        nascimentoConjuge: input.nascimentoConjuge,
        profissaoConjuge: input.profissaoConjuge,
        emailConjuge: input.emailConjuge,
        telefoneConjuge: input.telefoneConjuge,
        produto: input.produto,
        valorSolicitado: valorSolicitadoNorm,
        prazo: input.prazo,
        finalidade: input.finalidade,
        contextoOperacao: input.contextoOperacao,
        assessorId: user.id,
        prioridade: input.prioridade,
        statusRascunho: input.statusRascunho,
        statusMacro: "Pré-cadastro",
        statusValidacaoIa: "Não analisado",
        valorGarantia: valorGarantiaNorm,
        tipoGarantiaDescricao: input.tipoGarantiaDescricao,
        etapaAtual: input.etapaAtual ?? 1,
        responsavelOperacionalId: input.responsavelOperacionalId,
      });
      await inicializarChecklist(codigo, input.produto, input.estadoCivil);
      await addLog({ evento: "operacao_criada", detalhe: { codigo }, usuarioId: user.id });
      const admins = await getAdmins();
      for (const admin of admins) {
        if (admin.id !== user.id) {
          await createNotificacao({
            usuarioId: admin.id,
            tipo: "nova_operacao",
            mensagem: `Nova operação criada: ${codigo} — ${input.nomeCliente} (${input.produto ?? "Home Equity"})`,
          });
        }
      }
      return { codigoOperacao: codigo };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      nomeCliente: z.string().optional(),
      cpf: z.string().optional(),
      estadoCivil: z.enum(["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável"]).optional(),
      emailTomador: z.string().optional(),
      telefoneTomador: z.string().optional(),
      nomeConjuge: z.string().optional(),
      cpfConjuge: z.string().optional(),
      nascimentoConjuge: z.string().optional(),
      profissaoConjuge: z.string().optional(),
      emailConjuge: z.string().optional(),
      telefoneConjuge: z.string().optional(),
      valorSolicitado: z.string().optional(),
      prazo: z.number().optional(),
      finalidade: z.string().optional(),
      contextoOperacao: z.string().optional(),
      prioridade: z.enum(["Normal", "Alta", "Baixa", "Urgente"]).optional(),
      statusRascunho: z.boolean().optional(),
      statusMacro: z.string().optional(),
      valorGarantia: z.string().optional(),
      tipoGarantiaDescricao: z.string().optional(),
      etapaAtual: z.number().optional(),
      defesaComercial: z.string().optional(),
      defesaAprovada: z.boolean().optional(),
      perfilExtraidoJson: z.any().optional(),
      responsavelOperacionalId: z.number().nullable().optional(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, statusMacro, motivo, ...rest } = input;
      const op = await getOperacaoById(id);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      const user = ctx.user as any;
      if (user.perfil !== "admin" && op.assessorId !== user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const updateData: any = { ...rest };
      if (statusMacro) {
        updateData.statusMacro = statusMacro;
        await addHistoricoStatus({
          operacaoId: id,
          statusAnterior: op.statusMacro,
          statusNovo: statusMacro,
          alteradoPor: user.id,
          motivo: motivo ?? undefined,
        });
      }
      await updateOperacao(id, updateData);
      await addLog({ evento: "operacao_atualizada", detalhe: { id }, usuarioId: user.id, operacaoId: id });
      // Notificar admins em status críticos
      if (statusMacro) {
        const admins = await getAdmins();
        const notifMap: Record<string, { tipo: string; msg: string }> = {
          "Documentação completa": { tipo: "documentacao_completa", msg: `Documentação completa: ${op.codigoOperacao} — ${op.nomeCliente}` },
          "Documentação Completa": { tipo: "documentacao_completa", msg: `Documentação completa: ${op.codigoOperacao} — ${op.nomeCliente}` },
          "Pronta para análise": { tipo: "pronta_analise", msg: `Operação pronta para análise IA: ${op.codigoOperacao} — ${op.nomeCliente}` },
          "Pronta para Análise": { tipo: "pronta_analise", msg: `Operação pronta para análise IA: ${op.codigoOperacao} — ${op.nomeCliente}` },
          "Pronta para distribuição": { tipo: "pronta_distribuicao", msg: `Operação pronta para distribuição: ${op.codigoOperacao} — ${op.nomeCliente}` },
          "Pronta para Distribuição": { tipo: "pronta_distribuicao", msg: `Operação pronta para distribuição: ${op.codigoOperacao} — ${op.nomeCliente}` },
        };
        const notif = notifMap[statusMacro];
        if (notif) {
          for (const admin of admins) {
            if (admin.id !== user.id) {
              await createNotificacao({ usuarioId: admin.id, tipo: notif.tipo, mensagem: notif.msg, operacaoId: id });
            }
          }
        }
      }
      return { success: true };
    }),

  arquivar: adminPerfilProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const op = await getOperacaoById(input.id);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      await updateOperacao(input.id, { statusMacro: "Arquivada" });
      await addHistoricoStatus({ operacaoId: input.id, statusAnterior: op.statusMacro, statusNovo: "Arquivada", alteradoPor: (ctx.user as any).id });
      await addLog({ evento: "operacao_arquivada", detalhe: { id: input.id }, usuarioId: (ctx.user as any).id, operacaoId: input.id });
      return { success: true };
    }),

  desarquivar: adminPerfilProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const op = await getOperacaoById(input.id);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      if (op.statusMacro !== "Arquivada") throw new TRPCError({ code: "BAD_REQUEST", message: "Operação não está arquivada." });
      await updateOperacao(input.id, { statusMacro: "Pré-cadastro" });
      await addHistoricoStatus({ operacaoId: input.id, statusAnterior: "Arquivada", statusNovo: "Pré-cadastro", alteradoPor: (ctx.user as any).id });
      await addLog({ evento: "operacao_desarquivada", detalhe: { id: input.id }, usuarioId: (ctx.user as any).id, operacaoId: input.id });
      return { success: true };
    }),

  excluir: adminPerfilProcedure
    .input(z.object({ id: z.number(), codigoConfirmacao: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const op = await getOperacaoById(input.id);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.codigoConfirmacao.trim().toUpperCase() !== op.codigoOperacao.trim().toUpperCase()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código ATV incorreto. Digite exatamente o código da operação para confirmar." });
      }
      await softDeleteOperacao(input.id);
      await addLog({ evento: "operacao_excluida", detalhe: { id: input.id, codigo: op.codigoOperacao }, usuarioId: (ctx.user as any).id, operacaoId: input.id });
      return { success: true };
    }),

  metricas: adminPerfilProcedure.query(async () => getMetricasDashboard()),

  metricasPorConsultor: adminPerfilProcedure.query(async () => getMetricasPorConsultor()),

  slaAlerts: adminPerfilProcedure.query(async () => getOperacoesComSlaAlert()),

  slaAlertsFull: adminPerfilProcedure.query(async () => getOperacoesComSlaAlerts()),
});
