import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getHistoricoByOperacao,
  getNotificacoesByUser,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const adminPerfilProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user as any).perfil !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

export const historicoRouter = router({
  // Timeline de status da operação (alias listar para compatibilidade com frontend)
  listar: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .query(async ({ input }) => getHistoricoByOperacao(input.operacaoId)),

  status: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .query(async ({ input }) => getHistoricoByOperacao(input.operacaoId)),

  // Notificações do usuário logado
  notificacoes: protectedProcedure
    .query(async ({ ctx }) => getNotificacoesByUser((ctx.user as any).id)),

  marcarLida: protectedProcedure
    .input(z.object({ notificacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await marcarNotificacaoLida(input.notificacaoId);
      return { success: true };
    }),

  marcarTodasLidas: protectedProcedure
    .mutation(async ({ ctx }) => {
      await marcarTodasNotificacoesLidas((ctx.user as any).id);
      return { success: true };
    }),
});
