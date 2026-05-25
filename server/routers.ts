import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addLog,
  createDistribuicao,
  createIF,
  getDistribuicoesByOperacao,
  getIFCadastradaById,
  getIFsByOperacao,
  getNotificacoesByUser,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
  updateIF,
} from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

// ─── Módulos independentes ────────────────────────────────────────────────────
import { usuariosRouter } from "./routers/usuarios";
import { operacoesRouter } from "./routers/operacoes";
import { documentosRouter } from "./routers/documentos";
import { iaRouter } from "./routers/ia";
import { garantiasRouter } from "./routers/garantias";
import { historicoRouter } from "./routers/historico";
import { ifCadastrosRouter } from "./routers/ifCadastros";
import { distribuicoesRouter } from "./routers/distribuicoes";
import { termoScrRouter } from "./routers/termoScr";
import { distribuicaoRouter } from "./routers/distribuicao";

// ─── App Router ──────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,

  // ─── Auth ──────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Módulos independentes ─────────────────────────────────────────────────
  usuarios: usuariosRouter,
  operacoes: operacoesRouter,
  documentos: documentosRouter,
  ia: iaRouter,
  garantias: garantiasRouter,
  historico: historicoRouter,
  ifCadastros: ifCadastrosRouter,
  distribuicoes: distribuicoesRouter,
  termoScr: termoScrRouter,
  distribuicao: distribuicaoRouter,

  // ─── IFs por operação (Instituições Financeiras)
  ifs: router({
    listar: protectedProcedure
      .input(z.object({ operacaoId: z.number() }))
      .query(async ({ input }) => getIFsByOperacao(input.operacaoId)),

    criar: protectedProcedure
      .input(z.object({
        operacaoId: z.number(),
        ifCadastroId: z.number(),
        dataEnvio: z.string().optional(),
        prazoRetornoEstimado: z.string().optional(),
        proximaAcao: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const ifCadastro = await getIFCadastradaById(input.ifCadastroId);
        if (!ifCadastro) throw new TRPCError({ code: "NOT_FOUND", message: "IF não encontrada no cadastro." });
        await createIF({
          operacaoId: input.operacaoId,
          ifCadastroId: input.ifCadastroId,
          nomeInstituicao: (ifCadastro as any).nome,
          dataEnvio: input.dataEnvio ? new Date(input.dataEnvio) : new Date(),
          prazoRetornoEstimado: input.prazoRetornoEstimado ? new Date(input.prazoRetornoEstimado) : undefined,
          responsavelEnvio: user.id,
          proximaAcao: input.proximaAcao,
        });
        await createDistribuicao({
          operacaoId: input.operacaoId,
          ifId: input.ifCadastroId,
          distribuidoPor: user.id,
        });
        await addLog({ evento: "if_adicionada", detalhe: { ifCadastroId: input.ifCadastroId }, usuarioId: user.id, operacaoId: input.operacaoId });
        return { success: true };
      }),

    atualizar: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["Aguardando", "Em análise", "Aprovado", "Reprovado", "Stand-by"]).optional(),
        retorno: z.string().optional(),
        motivoRecusa: z.string().optional(),
        proximaAcao: z.string().optional(),
        dataUltimoRetorno: z.string().optional(),
        prazoRetornoEstimado: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, dataUltimoRetorno, prazoRetornoEstimado, ...rest } = input;
        await updateIF(id, {
          ...rest,
          dataUltimoRetorno: dataUltimoRetorno ? new Date(dataUltimoRetorno) : undefined,
          prazoRetornoEstimado: prazoRetornoEstimado ? new Date(prazoRetornoEstimado) : undefined,
          ultimaInteracao: new Date(),
        });
        return { success: true };
      }),
  }),

  // ─── Notificações ──────────────────────────────────────────────────────────
  notificacoes: router({
    listar: protectedProcedure.query(async ({ ctx }) => getNotificacoesByUser((ctx.user as any).id)),
    marcarLida: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await marcarNotificacaoLida(input.id); return { success: true }; }),
    marcarTodasLidas: protectedProcedure.mutation(async ({ ctx }) => {
      await marcarTodasNotificacoesLidas((ctx.user as any).id);
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
