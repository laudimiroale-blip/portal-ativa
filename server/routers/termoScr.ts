import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addLog,
  createTermoScr,
  getOperacaoById,
  getTermoScrByOperacao,
  getTermoScrByToken,
  updateOperacao,
  updateTermoScr,
} from "../db";
import { nanoid } from "nanoid";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const adminPerfilProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user as any).perfil !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

export const termoScrRouter = router({
  obter: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .query(async ({ input }) => getTermoScrByOperacao(input.operacaoId)),

  criar: adminPerfilProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      const token = nanoid(32);
      const expiracao = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await createTermoScr({
        operacaoId: input.operacaoId,
        token,
        linkUnico: `/scr/${token}`,
        status: "Aguardando assinatura",
        expiracaoEm: expiracao,
      });
      await updateOperacao(input.operacaoId, { statusScr: "Aguardando assinatura" });
      await addLog({ evento: "termo_scr_criado", detalhe: { token, operacaoId: input.operacaoId }, usuarioId: (ctx.user as any).id, operacaoId: input.operacaoId });
      return { success: true, token, linkUnico: `/scr/${token}` };
    }),

  assinar: publicProcedure
    .input(z.object({ token: z.string(), tipo: z.enum(["cliente", "conjuge"]) }))
    .mutation(async ({ input }) => {
      const termo = await getTermoScrByToken(input.token);
      if (!termo) throw new TRPCError({ code: "NOT_FOUND", message: "Termo não encontrado." });
      if (termo.expiracaoEm && new Date() > new Date(termo.expiracaoEm)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Termo expirado." });
      }
      const updateData: any = {};
      if (input.tipo === "cliente") updateData.assinadoClienteEm = new Date();
      else updateData.assinadoConjugeEm = new Date();
      const assinadoCliente = input.tipo === "cliente" ? true : !!termo.assinadoClienteEm;
      const assinadoConjuge = input.tipo === "conjuge" ? true : !!termo.assinadoConjugeEm;
      const op = await getOperacaoById(termo.operacaoId);
      const temConjuge = op?.estadoCivil === "Casado" || op?.estadoCivil === "União Estável";
      let novoStatus: "Parcialmente assinado" | "Assinado completo";
      if (temConjuge) novoStatus = assinadoCliente && assinadoConjuge ? "Assinado completo" : "Parcialmente assinado";
      else novoStatus = assinadoCliente ? "Assinado completo" : "Parcialmente assinado";
      updateData.status = novoStatus;
      await updateTermoScr(termo.id, updateData);
      if (op) await updateOperacao(op.id, { statusScr: novoStatus });
      return { success: true, status: novoStatus };
    }),

  obterPorToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const termo = await getTermoScrByToken(input.token);
      if (!termo) throw new TRPCError({ code: "NOT_FOUND" });
      const op = await getOperacaoById(termo.operacaoId);
      return { termo, operacao: op ? { nomeCliente: op.nomeCliente, produto: op.produto, estadoCivil: op.estadoCivil, codigoOperacao: op.codigoOperacao } : null };
    }),
});
