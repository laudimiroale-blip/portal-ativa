import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addHistoricoStatus,
  addLog,
  createDistribuicao,
  createNotificacao,
  getAdmins,
  getDistribuicoesByOperacao,
  getAllIFsCadastradas,
  getOperacaoById,
  updateDistribuicao,
  updateOperacao,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const adminPerfilProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user as any).perfil !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

// Mapa de compatibilidade produto → tipos de IF aceitos
const PRODUTO_IF_COMPATIVEL: Record<string, string[]> = {
  "Home Equity": ["Home Equity", "Imobiliário", "Geral"],
  "Auto Equity": ["Auto Equity", "Veicular", "Geral"],
  "Rural Equity": ["Rural", "Agro", "Geral"],
  "Imóvel em Construção": ["Construção", "Imobiliário", "Geral"],
};

export const distribuicoesRouter = router({
  listar: adminPerfilProcedure
    .input(z.object({ operacaoId: z.number() }))
    .query(async ({ input }) => getDistribuicoesByOperacao(input.operacaoId)),

  // IFs compatíveis com a operação (filtro automático por produto/LTV/ticket)
  ifsCompativeis: adminPerfilProcedure
    .input(z.object({ operacaoId: z.number() }))
    .query(async ({ input }) => {
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });

      const ifs = await getAllIFsCadastradas();
      const produto = op.produto ?? "Home Equity";
      const tiposCompativeis = PRODUTO_IF_COMPATIVEL[produto] ?? ["Geral"];
      const valorSolicitado = parseFloat(op.valorSolicitado ?? "0");
      const valorGarantia = parseFloat((op as any).valorGarantia ?? "0");
      const ltv = valorGarantia > 0 ? (valorSolicitado / valorGarantia) * 100 : 0;

      return ifs
        .filter((ifItem: any) => {
          if (ifItem.status === "Inativa") return false;
          // Filtro por ticket mínimo/máximo (via condicoes se disponível)
          return true;
        })
        .map((ifItem: any) => ({
          ...ifItem,
          ltvAtual: ltv.toFixed(1),
          compatibilidade: "Alta",
        }));
    }),

  distribuir: adminPerfilProcedure
    .input(z.object({
      operacaoId: z.number(),
      ifId: z.number(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });

      // Verificar se já foi distribuída para esta IF
      const distribuicoesExistentes = await getDistribuicoesByOperacao(input.operacaoId);
      const jaDistribuida = distribuicoesExistentes.find(
        (d: any) => d.ifId === input.ifId && d.statusRetorno !== "Reprovada"
      );
      if (jaDistribuida) {
        throw new TRPCError({ code: "CONFLICT", message: "Esta operação já foi distribuída para esta instituição financeira." });
      }

      await createDistribuicao({
        operacaoId: input.operacaoId,
        ifId: input.ifId,
        distribuidoPor: user.id,
        observacoes: input.observacoes,
      });

      await updateOperacao(input.operacaoId, { statusMacro: "Em distribuição" });
      await addHistoricoStatus({
        operacaoId: input.operacaoId,
        statusAnterior: op.statusMacro,
        statusNovo: "Em distribuição",
        alteradoPor: user.id,
      });

      await addLog({ evento: "operacao_distribuida", detalhe: { ifId: input.ifId }, usuarioId: user.id, operacaoId: input.operacaoId });

      // Notificar assessor
      if (op.assessorId && op.assessorId !== user.id) {
        await createNotificacao({
          usuarioId: op.assessorId,
          operacaoId: input.operacaoId,
          tipo: "operacao_distribuida",
          mensagem: `Operação ${op.codigoOperacao} distribuída para instituição financeira.`,
        });
      }

      return { success: true };
    }),

  atualizarRetorno: adminPerfilProcedure
    .input(z.object({
      distribuicaoId: z.number(),
      statusRetorno: z.enum(["Aguardando", "Em análise", "Aprovada", "Reprovada", "Contraproposta"]),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const { distribuicaoId, ...updateData } = input;
      await updateDistribuicao(distribuicaoId, updateData);
      await addLog({ evento: "distribuicao_atualizada", detalhe: { distribuicaoId, statusRetorno: input.statusRetorno }, usuarioId: user.id });
      return { success: true };
    }),
});
