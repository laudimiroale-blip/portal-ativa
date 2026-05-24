import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createGarantia,
  getGarantiasByOperacao,
  getOperacaoById,
  updateGarantia,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const adminPerfilProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user as any).perfil !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

export const garantiasRouter = router({
  listar: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .query(async ({ input }) => getGarantiasByOperacao(input.operacaoId)),

  criar: protectedProcedure
    .input(z.object({
      operacaoId: z.number(),
      tipoGarantia: z.string(),
      descricao: z.string().optional(),
      valorEstimado: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await createGarantia({
        operacaoId: input.operacaoId,
        tipoGarantia: input.tipoGarantia,
        descricao: input.descricao,
        valorEstimado: input.valorEstimado,
      });
      return { success: true };
    }),

  atualizar: adminPerfilProcedure
    .input(z.object({
      id: z.number(),
      tipoGarantia: z.string().optional(),
      endereco: z.string().optional(),
      matricula: z.string().optional(),
      metragem: z.string().optional(),
      cidade: z.string().optional(),
      estado: z.string().optional(),
      tipoImovel: z.string().optional(),
      situacaoDocumental: z.string().optional(),
      valorEstimado: z.string().optional(),
      ltvEstimado: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await updateGarantia(id, { ...rest, editadoManualmente: true });
      return { success: true };
    }),

  // Edição manual de dados extraídos pela IA
  editarDadosExtraidos: protectedProcedure
    .input(z.object({
      operacaoId: z.number(),
      dados: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      if (user.perfil !== "admin" && op.assessorId !== user.id) throw new TRPCError({ code: "FORBIDDEN" });
      const garantiasOp = await getGarantiasByOperacao(input.operacaoId);
      const dadosTyped = input.dados as Record<string, unknown>;
      if (garantiasOp.length > 0) {
        await updateGarantia(garantiasOp[0].id, { ...(dadosTyped as any), editadoManualmente: true });
      } else {
        await createGarantia({ operacaoId: input.operacaoId, tipoGarantia: (dadosTyped.tipoGarantia as string) ?? op.produto ?? "Imóvel", ...(dadosTyped as any) });
      }
      return { success: true };
    }),
});
