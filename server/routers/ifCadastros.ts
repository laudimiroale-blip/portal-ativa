import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createIFCadastrada,
  getAllIFsCadastradas,
  getIFsAtivas,
  getIFsAtivasPorProduto,
  getMetricasPorIF,
  getHistoricoDistribuicoesByIF,
  getIFCadastradaById,
  updateIFCadastrada,
  softDeleteIFCadastrada,
  getCondicoesByIF,
  upsertCondicaoIF,
  deleteCondicaoIF,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const adminPerfilProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user as any).perfil !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

export const ifCadastrosRouter = router({
  listar: protectedProcedure.query(async () => getAllIFsCadastradas()),
  listarAtivas: protectedProcedure.query(async () => getIFsAtivas()),
  listarAtivasPorProduto: protectedProcedure
    .input(z.object({ produto: z.string().optional() }))
    .query(async ({ input }) => getIFsAtivasPorProduto(input.produto)),
  metricasPorIF: protectedProcedure
    .input(z.object({ ifId: z.number() }))
    .query(async ({ input }) => getMetricasPorIF(input.ifId)),
  historicoDistribuicoes: protectedProcedure
    .input(z.object({ ifId: z.number() }))
    .query(async ({ input }) => getHistoricoDistribuicoesByIF(input.ifId)),
  obter: adminPerfilProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => getIFCadastradaById(input.id)),

  criar: adminPerfilProcedure
    .input(z.object({
      nome: z.string().min(2),
      cnpj: z.string().min(14),
      contatoNome: z.string().optional(),
      contatoEmail: z.string().email().optional(),
      contatoTel: z.string().optional(),
      status: z.enum(["Ativa", "Inativa", "Em negociação"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await createIFCadastrada(input as any);
      return { success: true };
    }),

  atualizar: adminPerfilProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().min(2).optional(),
      cnpj: z.string().optional(),
      contatoNome: z.string().optional(),
      contatoEmail: z.string().optional(),
      contatoTel: z.string().optional(),
      status: z.enum(["Ativa", "Inativa", "Em negociação"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateIFCadastrada(id, data as any);
      return { success: true };
    }),

  deletar: adminPerfilProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await softDeleteIFCadastrada(input.id);
      return { success: true };
    }),

  listarCondicoes: protectedProcedure
    .input(z.object({ ifId: z.number() }))
    .query(async ({ input }) => getCondicoesByIF(input.ifId)),

  salvarCondicao: adminPerfilProcedure
    .input(z.object({
      ifId: z.number(),
      produto: z.enum(["Home Equity", "Auto Equity", "Rural Equity", "Imóvel em Construção"]),
      taxaMinima: z.string().optional(),
      taxaMaxima: z.string().optional(),
      ltvMaximo: z.string().optional(),
      prazoMinimo: z.number().optional(),
      prazoMaximo: z.number().optional(),
      valorMinimo: z.string().optional(),
      valorMaximo: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await upsertCondicaoIF(input as any);
      return { success: true };
    }),

  deletarCondicao: adminPerfilProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteCondicaoIF(input.id);
      return { success: true };
    }),
});
