import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addHistoricoStatus,
  addLog,
  createAnaliseIa,
  createDocumento,
  createDocumentoComplementar,
  createGarantia,
  createIF,
  createOperacao,
  createTermoScr,
  createVersaoDocumento,
  getAllAssessores,
  getAllIFsCadastradas,
  getAllUsuarios,
  getAnalisesByOperacao,
  getCondicoesByIF,
  getDistribuicoesByOperacao,
  getIFCadastradaById,
  getNotificacoesByUser,
  createIFCadastrada,
  createDistribuicao,
  createNotificacao,
  updateIFCadastrada,
  updateDistribuicao,
  updateUsuario,
  softDeleteIFCadastrada,
  softDeleteUsuario,
  upsertCondicaoIF,
  deleteCondicaoIF,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
  getIFsAtivas,
  getIFsAtivasPorProduto,
  getMetricasPorIF,
  getHistoricoDistribuicoesByIF,
  getAdmins,
  getUsuariosAdminOperacional,
  getDocumentosComplementares,
  getDocumentosByOperacao,
  getGarantiasByOperacao,
  getHistoricoByOperacao,
  getIFsByOperacao,
  getMetricasDashboard,
  getMetricasPorConsultor,
  getOperacaoById,
  getOperacoes,
  getOperacoesComSlaAlert,
  getOperacoesComSlaAlerts,
  getTermoScrByOperacao,
  getTermoScrByToken,
  getVersoesDocumento,
  gerarCodigoOperacao,
  softDeleteOperacao,
  updateAnaliseIa,
  updateDocumento,
  updateGarantia,
  updateIF,
  updateOperacao,
  updateTermoScr,
  updateUserPerfil,
} from "./db";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { nanoid } from "nanoid";

// ─── Middleware RBAC ─────────────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user as any).perfil !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

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

  // ─── Usuários ──────────────────────────────────────────────────────────────
  usuarios: router({
    listar: adminProcedure.query(async () => {
      return getAllUsuarios();
    }),
    listarAssessores: protectedProcedure.query(async () => {
      return getAllAssessores();
    }),
    listarAdminOperacional: protectedProcedure.query(async () => {
      return getUsuariosAdminOperacional();
    }),
    setPerfil: adminProcedure
      .input(z.object({ userId: z.number(), perfil: z.enum(["admin", "operacional", "assessor"]) }))
      .mutation(async ({ input }) => {
        await updateUserPerfil(input.userId, input.perfil);
        return { success: true };
      }),
    setAtivo: adminProcedure
      .input(z.object({ userId: z.number(), ativo: z.boolean() }))
      .mutation(async ({ input }) => {
        await updateUsuario(input.userId, { ativo: input.ativo });
        return { success: true };
      }),
    deletar: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        await softDeleteUsuario(input.userId);
        return { success: true };
      }),

    convidar: adminProcedure
      .input(z.object({
        nome: z.string().min(2),
        email: z.string().email(),
        perfil: z.enum(["admin", "operacional", "assessor"]),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
        const existente = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (existente.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe um usuário com este e-mail." });
        }
        const token = nanoid(32);
        await db.insert(users).values({
          openId: `convite_${token}`,
          name: input.nome,
          email: input.email,
          perfil: input.perfil,
          role: input.perfil === "admin" ? "admin" : "user",
          conviteToken: token,
          conviteStatus: "Convidado",
          ativo: false,
          lastSignedIn: new Date(),
        });
        return { success: true, token };
      }),

    ativarConvite: publicProcedure
      .input(z.object({ token: z.string(), nome: z.string().min(2) }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
        const [usuario] = await db.select().from(users).where(eq(users.conviteToken, input.token)).limit(1);
        if (!usuario) throw new TRPCError({ code: "NOT_FOUND", message: "Token de convite inválido ou expirado." });
        if (usuario.conviteStatus !== "Convidado") throw new TRPCError({ code: "BAD_REQUEST", message: "Este convite já foi utilizado." });
        await db.update(users).set({
          name: input.nome,
          conviteStatus: "Ativo",
          ativo: true,
          conviteToken: null,
        }).where(eq(users.id, usuario.id));
        return { success: true, email: usuario.email, perfil: usuario.perfil };
      }),

    obterConvite: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
        const [usuario] = await db.select({ nome: users.name, email: users.email, perfil: users.perfil, status: users.conviteStatus }).from(users).where(eq(users.conviteToken, input.token)).limit(1);
        if (!usuario) throw new TRPCError({ code: "NOT_FOUND", message: "Token de convite inválido ou expirado." });
        if (usuario.status !== "Convidado") throw new TRPCError({ code: "BAD_REQUEST", message: "Este convite já foi utilizado." });
        return usuario;
      }),

    revogarConvite: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
        const [usuario] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
        if (!usuario) throw new TRPCError({ code: "NOT_FOUND" });
        if (usuario.conviteStatus !== "Convidado") throw new TRPCError({ code: "BAD_REQUEST", message: "Este usuário não tem convite pendente." });
        // Hard delete do usuário convidado (ainda não tem dados reais)
        await db.delete(users).where(eq(users.id, input.userId));
        return { success: true };
      }),
  }),

  // ─── Operações ─────────────────────────────────────────────────────────────
  operacoes: router({
    listar: protectedProcedure
      .input(
        z.object({
          statusMacro: z.string().optional(),
          produto: z.string().optional(),
          prioridade: z.string().optional(),
          busca: z.string().optional(),
          apenasMinhas: z.boolean().optional(),
          responsavelOperacionalId: z.number().optional(),
          assessorId: z.number().optional(),
        }).optional()
      )
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
      .input(
        z.object({
          nomeCliente: z.string().min(2),
          cpf: z.string().optional().default(""),
          estadoCivil: z.enum(["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável"]).optional().default("Solteiro"),
          emailTomador: z.string().optional().default(""),
          telefoneTomador: z.string().min(10),
          nomeConjuge: z.string().optional(),
          cpfConjuge: z.string().optional(),
          emailConjuge: z.string().optional(),
          telefoneConjuge: z.string().optional(),
          produto: z.enum(["Home Equity", "Auto Equity", "Rural Equity", "Imóvel em Construção"]).optional().default("Home Equity"),
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
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const codigo = await gerarCodigoOperacao();
        // Normaliza valores monetários: remove pontos de milhar, troca vírgula por ponto
        const parseMoney = (v?: string): string => {
          if (!v) return "0";
          // Remove tudo exceto dígitos, vírgula e ponto
          const clean = v.replace(/[^\d.,]/g, "");
          // Se tem vírgula, trata como separador decimal BR (1.000.000,00 → 1000000.00)
          if (clean.includes(",")) {
            return clean.replace(/\./g, "").replace(",", ".");
          }
          // Se só tem pontos, verifica se é milhar (1.000.000) ou decimal (1000.50)
          const parts = clean.split(".");
          if (parts.length > 2) {
            // Múltiplos pontos = separador de milhar (1.000.000)
            return parts.join("");
          }
          return clean;
        };
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

        await inicializarChecklist(codigo, input.produto);
        await addLog({ evento: "operacao_criada", detalhe: { codigo }, usuarioId: user.id });
        // Notificar admins sobre nova operação
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
      .input(
        z.object({
          id: z.number(),
          nomeCliente: z.string().optional(),
          cpf: z.string().optional(),
          estadoCivil: z.enum(["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável"]).optional(),
          emailTomador: z.string().optional(),
          telefoneTomador: z.string().optional(),
          nomeConjuge: z.string().optional(),
          cpfConjuge: z.string().optional(),
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
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, statusMacro, ...rest } = input;
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
          });
        }

        await updateOperacao(id, updateData);
        await addLog({ evento: "operacao_atualizada", detalhe: { id }, usuarioId: user.id, operacaoId: id });
        // Notificar admins em status críticos
        if (statusMacro) {
          const admins = await getAdmins();
          let tipoNotif: string | null = null;
          let msgNotif: string | null = null;
          if (statusMacro === "Documentação Completa") {
            tipoNotif = "documentacao_completa";
            msgNotif = `Documentação completa: ${op.codigoOperacao} — ${op.nomeCliente}`;
          } else if (statusMacro === "Pronta para Análise") {
            tipoNotif = "pronta_analise";
            msgNotif = `Operação pronta para análise IA: ${op.codigoOperacao} — ${op.nomeCliente}`;
          } else if (statusMacro === "Pronta para Distribuição") {
            tipoNotif = "pronta_distribuicao";
            msgNotif = `Operação pronta para distribuição: ${op.codigoOperacao} — ${op.nomeCliente}`;
          }
          if (tipoNotif && msgNotif) {
            for (const admin of admins) {
              if (admin.id !== user.id) {
                await createNotificacao({ usuarioId: admin.id, tipo: tipoNotif, mensagem: msgNotif, operacaoId: id });
              }
            }
          }
        }
        return { success: true };
      }),

    arquivar: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const op = await getOperacaoById(input.id);
        if (!op) throw new TRPCError({ code: "NOT_FOUND" });
        await updateOperacao(input.id, { statusMacro: "Arquivada" });
        await addHistoricoStatus({
          operacaoId: input.id,
          statusAnterior: op.statusMacro,
          statusNovo: "Arquivada",
          alteradoPor: (ctx.user as any).id,
        });
        await addLog({ evento: "operacao_arquivada", detalhe: { id: input.id }, usuarioId: (ctx.user as any).id, operacaoId: input.id });
        return { success: true };
      }),

    desarquivar: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const op = await getOperacaoById(input.id);
        if (!op) throw new TRPCError({ code: "NOT_FOUND" });
        if (op.statusMacro !== "Arquivada") throw new TRPCError({ code: "BAD_REQUEST", message: "Operação não está arquivada." });
        // Restaurar para Pré-cadastro
        await updateOperacao(input.id, { statusMacro: "Pré-cadastro" });
        await addHistoricoStatus({
          operacaoId: input.id,
          statusAnterior: "Arquivada",
          statusNovo: "Pré-cadastro",
          alteradoPor: (ctx.user as any).id,
        });
        await addLog({ evento: "operacao_desarquivada", detalhe: { id: input.id }, usuarioId: (ctx.user as any).id, operacaoId: input.id });
        return { success: true };
      }),

    excluir: adminProcedure
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

    metricas: adminProcedure.query(async () => {
      return getMetricasDashboard();
    }),

    metricasPorConsultor: adminProcedure.query(async () => {
      return getMetricasPorConsultor();
    }),

    slaAlerts: adminProcedure.query(async () => {
      return getOperacoesComSlaAlert();
    }),
    slaAlertsFull: adminProcedure.query(async () => {
      return getOperacoesComSlaAlerts();
    }),
  }),

  // ─── Documentos ────────────────────────────────────────────────────────────
  documentos: router({
    listar: protectedProcedure
      .input(z.object({ operacaoId: z.number() }))
      .query(async ({ input }) => {
        return getDocumentosByOperacao(input.operacaoId);
      }),

    upload: protectedProcedure
      .input(
        z.object({
          operacaoId: z.number(),
          documentoId: z.number().optional(),
          nomeDocumento: z.string(),
          categoria: z.string(),
          fileBase64: z.string(),
          fileName: z.string(),
          mimeType: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const buffer = Buffer.from(input.fileBase64, "base64");
        // Sanitize filename: remove accents, replace spaces with hyphens, keep only ASCII-safe chars
        const sanitizeFileName = (name: string) =>
          name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // strip diacritics
            .replace(/[^a-zA-Z0-9._-]/g, "-") // replace non-ASCII with hyphen
            .replace(/-{2,}/g, "-") // collapse consecutive hyphens
            .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
        const safeFileName = sanitizeFileName(input.fileName);
        const key = `operacoes/${input.operacaoId}/docs/${Date.now()}-${safeFileName}`;
        const { url } = await storagePut(key, buffer, input.mimeType);

        if (input.documentoId) {
          const doc = await getDocumentosByOperacao(input.operacaoId);
          const existing = doc.find((d) => d.id === input.documentoId);
          const novaVersao = (existing?.versaoAtual ?? 0) + 1;
          await createVersaoDocumento({
            documentoId: input.documentoId,
            arquivoUrl: url,
            arquivoKey: key,
            versao: novaVersao,
            enviadoPor: user.id,
          });
          await updateDocumento(input.documentoId, {
            arquivoUrl: url,
            arquivoKey: key,
            versaoAtual: novaVersao,
            estado: "Enviado",
            enviadoPor: user.id,
          });
        } else {
          await createDocumento({
            operacaoId: input.operacaoId,
            nomeDocumento: input.nomeDocumento,
            categoria: input.categoria,
            estado: "Enviado",
            arquivoUrl: url,
            arquivoKey: key,
            versaoAtual: 1,
            enviadoPor: user.id,
          });
        }

        const op = await getOperacaoById(input.operacaoId);
        if (op && op.statusMacro === "Pré-cadastro") {
          await updateOperacao(input.operacaoId, { statusMacro: "Documentação parcial" });
          await addHistoricoStatus({
            operacaoId: input.operacaoId,
            statusAnterior: op.statusMacro,
            statusNovo: "Documentação parcial",
            alteradoPor: user.id,
          });
        }

        await addLog({ evento: "documento_enviado", detalhe: { nomeDocumento: input.nomeDocumento }, usuarioId: user.id, operacaoId: input.operacaoId });
        return { success: true, url };
      }),

    atualizarEstado: adminProcedure
      .input(
        z.object({
          documentoId: z.number(),
          estado: z.enum(["Pendente", "Enviado", "Validado", "Pendência encontrada", "Ilegível", "Vencido", "Em Análise", "Aprovado", "Reprovado", "Reenviar"]),
          observacao: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await updateDocumento(input.documentoId, {
          estado: input.estado,
          observacao: input.observacao,
        });
        return { success: true };
      }),

    versoes: protectedProcedure
      .input(z.object({ documentoId: z.number() }))
      .query(async ({ input }) => {
        return getVersoesDocumento(input.documentoId);
      }),

    marcarNaoAplicavel: protectedProcedure
      .input(z.object({ documentoId: z.number(), naoAplicavel: z.boolean() }))
      .mutation(async ({ input }) => {
        await updateDocumento(input.documentoId, {
          naoAplicavel: input.naoAplicavel,
          estado: input.naoAplicavel ? "Pendente" : "Pendente",
        } as any);
        return { success: true };
      }),

    complementares: router({
      listar: protectedProcedure
        .input(z.object({ operacaoId: z.number() }))
        .query(async ({ input }) => {
          return getDocumentosComplementares(input.operacaoId);
        }),

      upload: protectedProcedure
        .input(
          z.object({
            operacaoId: z.number(),
            nomeArquivo: z.string(),
            fileBase64: z.string(),
            fileName: z.string(),
            mimeType: z.string(),
            observacao: z.string().optional(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const user = ctx.user as any;
          const buffer = Buffer.from(input.fileBase64, "base64");
          const sanitizeFileName = (name: string) =>
            name
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-zA-Z0-9._-]/g, "-")
              .replace(/-{2,}/g, "-")
              .replace(/^-|-$/g, "");
          const safeFileName = sanitizeFileName(input.fileName);
          const key = `operacoes/${input.operacaoId}/complementares/${Date.now()}-${safeFileName}`;
          const { url } = await storagePut(key, buffer, input.mimeType);
          await createDocumentoComplementar({
            operacaoId: input.operacaoId,
            nomeArquivo: input.nomeArquivo,
            arquivoUrl: url,
            arquivoKey: key,
            observacao: input.observacao,
            enviadoPor: user.id,
          });
          return { success: true, url };
        }),
    }),
  }),

  // ─── Análise IA ────────────────────────────────────────────────────────────
  ia: router({
    listar: adminProcedure
      .input(z.object({ operacaoId: z.number() }))
      .query(async ({ input }) => {
        return getAnalisesByOperacao(input.operacaoId);
      }),

    analisarDocumental: adminProcedure
      .input(z.object({ operacaoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const docs = await getDocumentosByOperacao(input.operacaoId);
        const op = await getOperacaoById(input.operacaoId);
        if (!op) throw new TRPCError({ code: "NOT_FOUND" });

        await createAnaliseIa({
          operacaoId: input.operacaoId,
          camada: "documental",
          statusProcessamento: "processando",
          geradoPor: user.id,
          modeloUtilizado: "built-in-llm",
        });

        await updateOperacao(input.operacaoId, { statusValidacaoIa: "Em análise", statusMacro: "Em análise IA" });
        await addHistoricoStatus({
          operacaoId: input.operacaoId,
          statusAnterior: op.statusMacro,
          statusNovo: "Em análise IA",
          alteradoPor: user.id,
        });

        const docsEnviados = docs.filter((d) => d.arquivoUrl);
        const docsPendentes = docs.filter((d) => !d.arquivoUrl);

        const systemPrompt = `Você é um Analista Documental Sênior da Ativa Soluções, especializado em crédito com garantia real (Home Equity, Auto Equity, Rural Equity, Imóvel em Construção).

SUA MISSÃO: Realizar conferência documental completa e rigorosa da operação de crédito.

ANALISE CADA DOCUMENTO E VERIFIQUE:
1. Tipo e correspondência: o documento é realmente o que se declara ser?
2. Legibilidade: está legível, sem cortes, sem partes ilegíveis?
3. Validade: está dentro do prazo de validade? (Matrícula: máx 30 dias; IPTU: exercício atual; Extrato: últimos 3 meses; CNH/RG: não vencido)
4. Correspondência ao titular: pertence ao tomador ou cônjuge declarado?
5. Completude: está completo ou faltam páginas?
6. Consistência: dados batem com o restante da operação?

SEMÁFORO:
- verde: documento válido, legível, completo e dentro do prazo
- amarelo: documento presente mas com ressalva (data próxima do vencimento, qualidade reduzida, dado não confirmado)
- vermelho: documento ausente, vencido, ilegível, incorreto ou inconsistente

RETORNE JSON ESTRITAMENTE NESTE FORMATO:
{
  "documentos": [
    {
      "id": number,
      "nome": string,
      "semaforo": "verde" | "amarelo" | "vermelho",
      "observacao": string,
      "dados_extraidos": {
        "tipo_identificado": string,
        "titular_identificado": string | null,
        "data_emissao": string | null,
        "validade": string | null,
        "numero_documento": string | null
      }
    }
  ],
  "pendencias": [string],
  "documentos_ausentes": [string],
  "situacao_geral": "Completa" | "Pendente" | "Crítica",
  "resumo_documental": string
}

REGRAS ABSOLUTAS:
- NUNCA invente dados não presentes nos documentos
- Se não conseguir identificar um dado, use null
- Seja objetivo e técnico
- Responda APENAS com JSON válido, sem markdown`;

        const contentParts: any[] = [
          {
            type: "text",
            text: `Realize a conferência documental completa da operação ${op.codigoOperacao}.

INFORMAÇÕES DA OPERAÇÃO:
- Produto: ${op.produto}
- Cliente/Tomador: ${op.nomeCliente} (CPF: ${op.cpf})
- Cônjuge: ${op.nomeConjuge ? `${op.nomeConjuge} (CPF: ${op.cpfConjuge})` : "Não informado"}
- Estado Civil: ${op.estadoCivil}
- Valor Solicitado: R$ ${Number(op.valorSolicitado).toLocaleString("pt-BR")}
- Prazo: ${op.prazo} meses
- Finalidade: ${op.finalidade ?? "Não informada"}
- Contexto: ${op.contextoOperacao ?? "Não informado"}

DOCUMENTOS DO CHECKLIST (${docs.length} itens):
${docs.map((d) => `- [${d.arquivoUrl ? "ENVIADO" : "PENDENTE"}] ID:${d.id} | ${d.nomeDocumento} (${d.categoria}) | Estado: ${d.estado}`).join("\n")}

DOCUMENTOS PENDENTES (sem arquivo): ${docsPendentes.map((d) => d.nomeDocumento).join(", ") || "Nenhum"}

Analise cada documento enviado e identifique pendências.`,
          },
        ];

        const docsComArquivo = docsEnviados.slice(0, 10);
        for (const doc of docsComArquivo) {
          if (doc.arquivoUrl) {
            const mimeType = doc.arquivoUrl.toLowerCase().includes(".pdf") ? "application/pdf" : undefined;
            if (mimeType) {
              contentParts.push({ type: "file_url", file_url: { url: doc.arquivoUrl, mime_type: mimeType } });
            } else {
              contentParts.push({ type: "image_url", image_url: { url: doc.arquivoUrl, detail: "high" } });
            }
            contentParts.push({ type: "text", text: `[Documento acima: ID=${doc.id} | ${doc.nomeDocumento} | Categoria: ${doc.categoria}]` });
          }
        }

        const inicio = Date.now();
        let analiseId: number | undefined;

        try {
          const analises = await getAnalisesByOperacao(input.operacaoId);
          const analiseRecente = analises.find((a) => a.statusProcessamento === "processando" && a.camada === "documental");
          analiseId = analiseRecente?.id;

          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: contentParts },
            ],
            response_format: { type: "json_object" } as any,
          });

          const tempo = Date.now() - inicio;
          const rawContent = response.choices[0]?.message?.content;
          const conteudo = typeof rawContent === "string" ? rawContent : "{}";
          const resultadoJson = JSON.parse(conteudo);
          const tokens = response.usage?.total_tokens ?? 0;
          const custo = tokens * 0.000003;

          if (analiseId) {
            await updateAnaliseIa(analiseId, {
              resultadoJson,
              resultadoTexto: conteudo,
              tokensConsumidos: tokens,
              custoEstimado: String(custo),
              tempoProcessamento: tempo,
              statusProcessamento: "concluido",
              modeloUtilizado: response.model ?? "llm",
            });
          }

          const docs_result = resultadoJson.documentos ?? [];
          const temVermelho = docs_result.some((d: any) => d.semaforo === "vermelho");
          const novoStatusIa = temVermelho ? "Pendência encontrada" : "Validado";

          await updateOperacao(input.operacaoId, {
            statusValidacaoIa: novoStatusIa,
            statusMacro: "Em validação humana",
          });
          await addHistoricoStatus({
            operacaoId: input.operacaoId,
            statusAnterior: "Em análise IA",
            statusNovo: "Em validação humana",
            alteradoPor: user.id,
          });

          return { success: true, resultado: resultadoJson };
        } catch (err: any) {
          if (analiseId) {
            await updateAnaliseIa(analiseId, { statusProcessamento: "erro", erroProcessamento: err.message });
          }
          await updateOperacao(input.operacaoId, { statusValidacaoIa: "Não analisado" });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na análise IA: " + err.message });
        }
      }),

    preencherGarantia: adminProcedure
      .input(z.object({ operacaoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const op = await getOperacaoById(input.operacaoId);
        if (!op) throw new TRPCError({ code: "NOT_FOUND" });

        const docs = await getDocumentosByOperacao(input.operacaoId);
        const docsEnviados = docs.filter((d) => d.arquivoUrl);
        const docsPendentes = docs.filter((d) => !d.arquivoUrl);

        await createAnaliseIa({
          operacaoId: input.operacaoId,
          camada: "garantia",
          statusProcessamento: "processando",
          geradoPor: user.id,
          modeloUtilizado: "built-in-llm",
        });

        const analises = await getAnalisesByOperacao(input.operacaoId);
        const analiseRecente = analises.find((a) => a.statusProcessamento === "processando" && a.camada === "garantia");
        const analiseId = analiseRecente?.id;
        const analiseDocumental = analises.find((a) => a.camada === "documental" && a.statusProcessamento === "concluido");

        const systemPrompt = `Você é um Analista de Garantias Sênior da Ativa Soluções, especializado em avaliação de garantias reais para operações de crédito.

SUA MISSÃO: Extrair e estruturar todos os dados da garantia a partir dos documentos enviados.

EXTRAIA OS SEGUINTES DADOS:
1. Tipo de imóvel (residencial, comercial, rural, terreno, etc.)
2. Endereço completo (logradouro, número, complemento, bairro)
3. Cidade e Estado
4. Número de matrícula do imóvel
5. Metragem total (m²)
6. Valor estimado de mercado (baseado em IPTU, laudo ou matrícula)
7. LTV estimado (valor solicitado / valor do imóvel × 100)
8. Situação documental da garantia
9. Pendências específicas da garantia

SITUAÇÃO DOCUMENTAL — use frases como:
- "Documentação aparentemente completa"
- "Matrícula precisa atualização (emitida há mais de 30 dias)"
- "Pendência de IPTU do exercício atual"
- "Ausência de laudo de avaliação"
- "Imóvel com ônus — verificar cancelamento"

RETORNE JSON ESTRITAMENTE NESTE FORMATO:
{
  "tipoGarantia": string,
  "tipoImovel": string,
  "endereco": string,
  "cidade": string,
  "estado": string,
  "matricula": string,
  "metragem": string,
  "valorEstimado": string,
  "ltvEstimado": number,
  "situacaoDocumental": string,
  "pendenciasGarantia": [string],
  "observacoes": string
}

REGRAS ABSOLUTAS:
- NUNCA invente dados não presentes nos documentos
- Se não conseguir identificar um dado, use "Informação não localizada automaticamente"
- Para LTV: calcule com base no valor solicitado e no valor estimado do imóvel
- Responda APENAS com JSON válido, sem markdown`;

        const contentParts: any[] = [
          {
            type: "text",
            text: `Extraia os dados da garantia para a operação ${op.codigoOperacao}.

INFORMAÇÕES DA OPERAÇÃO:
- Produto: ${op.produto}
- Cliente: ${op.nomeCliente} (CPF: ${op.cpf})
- Valor Solicitado: R$ ${Number(op.valorSolicitado).toLocaleString("pt-BR")}
- Prazo: ${op.prazo} meses
- Finalidade: ${op.finalidade ?? "Não informada"}
- Contexto: ${op.contextoOperacao ?? "Não informado"}

DOCUMENTOS ENVIADOS (${docsEnviados.length} de ${docs.length}):
${docs.map((d) => `- [${d.arquivoUrl ? "ENVIADO" : "PENDENTE"}] ${d.nomeDocumento} (${d.categoria})`).join("\n")}

DOCUMENTOS PENDENTES: ${docsPendentes.map((d) => d.nomeDocumento).join(", ") || "Nenhum"}

ANÁLISE DOCUMENTAL PRÉVIA: ${analiseDocumental ? JSON.stringify(analiseDocumental.resultadoJson) : "Não disponível"}

Extraia todos os dados da garantia a partir dos documentos enviados abaixo.`,
          },
        ];

        const docsParaAnalise = docsEnviados.slice(0, 10);
        for (const doc of docsParaAnalise) {
          if (doc.arquivoUrl) {
            const mimeType = doc.arquivoUrl.toLowerCase().includes(".pdf") ? "application/pdf" : undefined;
            if (mimeType) {
              contentParts.push({ type: "file_url", file_url: { url: doc.arquivoUrl, mime_type: mimeType } });
            } else {
              contentParts.push({ type: "image_url", image_url: { url: doc.arquivoUrl, detail: "high" } });
            }
            contentParts.push({ type: "text", text: `[Documento acima: ${doc.nomeDocumento} | Categoria: ${doc.categoria}]` });
          }
        }

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: contentParts },
            ],
            response_format: { type: "json_object" } as any,
          });

          const rawContent = response.choices[0]?.message?.content;
          const conteudo = typeof rawContent === "string" ? rawContent : "{}";
          const resultado = JSON.parse(conteudo);
          const tokens = response.usage?.total_tokens ?? 0;

          if (analiseId) {
            await updateAnaliseIa(analiseId, {
              resultadoJson: resultado,
              resultadoTexto: conteudo,
              tokensConsumidos: tokens,
              statusProcessamento: "concluido",
              modeloUtilizado: response.model ?? "llm",
            });
          }

          const garantiasExistentes = await getGarantiasByOperacao(input.operacaoId);
          const garantiaData = {
            tipoGarantia: resultado.tipoGarantia ?? op.produto,
            endereco: resultado.endereco,
            matricula: resultado.matricula,
            metragem: resultado.metragem,
            cidade: resultado.cidade,
            estado: resultado.estado,
            tipoImovel: resultado.tipoImovel,
            situacaoDocumental: resultado.situacaoDocumental,
            valorEstimado: resultado.valorEstimado
              ? String(resultado.valorEstimado).replace(/[^0-9.,]/g, "").replace(",", ".")
              : undefined,
            ltvEstimado: resultado.ltvEstimado ? String(resultado.ltvEstimado) : undefined,
            preenchidoPorIa: true,
            dadosExtrasJson: {
              observacoes: resultado.observacoes,
              pendenciasGarantia: resultado.pendenciasGarantia ?? [],
            },
          };

          if (garantiasExistentes.length > 0) {
            await updateGarantia(garantiasExistentes[0].id, garantiaData);
          } else {
            await createGarantia({ operacaoId: input.operacaoId, ...garantiaData });
          }

          return { success: true, resultado };
        } catch (err: any) {
          if (analiseId) {
            await updateAnaliseIa(analiseId, { statusProcessamento: "erro", erroProcessamento: err.message });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao preencher garantia: " + err.message });
        }
      }),

    gerarRevisaoCompleta: adminProcedure
      .input(z.object({ operacaoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const op = await getOperacaoById(input.operacaoId);
        if (!op) throw new TRPCError({ code: "NOT_FOUND" });

        const [analises, garantiasOp, docs] = await Promise.all([
          getAnalisesByOperacao(input.operacaoId),
          getGarantiasByOperacao(input.operacaoId),
          getDocumentosByOperacao(input.operacaoId),
        ]);

        const analiseDocumental = analises.find((a) => a.camada === "documental" && a.statusProcessamento === "concluido");
        const analiseGarantia = analises.find((a) => a.camada === "garantia" && a.statusProcessamento === "concluido");
        const garantia = garantiasOp[0];
        const docsEnviados = docs.filter((d) => d.arquivoUrl);
        const docsPendentes = docs.filter((d) => !d.arquivoUrl);

        await createAnaliseIa({
          operacaoId: input.operacaoId,
          camada: "revisao",
          statusProcessamento: "processando",
          geradoPor: user.id,
          modeloUtilizado: "built-in-llm",
        });

        const analisesAtualizadas = await getAnalisesByOperacao(input.operacaoId);
        const analiseRecente = analisesAtualizadas.find((a) => a.statusProcessamento === "processando" && a.camada === "revisao");
        const analiseId = analiseRecente?.id;

        const systemPrompt = `Você é um Analista de Crédito Sênior da Ativa Soluções, especializado em operações de crédito com garantia real (Home Equity, Auto Equity, Rural Equity, Imóvel em Construção).

SUA MISSÃO: Gerar revisão completa e defesa de crédito profissional para apresentação em comitê de crédito e envio às Instituições Financeiras parceiras.

PRINCÍPIOS:
- Tom SEMPRE comercial, positivo e institucional
- Linguagem técnica e consultiva, própria de comitê de crédito
- A IA NÃO reprova operações — estrutura a melhor defesa possível
- Responsabilidade final permanece com o analista humano
- NUNCA invente dados não fornecidos

ESTRUTURA OBRIGATÓRIA DA DEFESA (10 seções):
1. Resumo da Operação
2. Perfil do Cliente
3. Finalidade do Crédito
4. Capacidade Financeira
5. Análise da Garantia
6. Situação Documental
7. Mitigadores de Risco
8. LTV Estimado
9. Pendências Identificadas
10. Parecer Preliminar do Analista

RETORNE JSON ESTRITAMENTE NESTE FORMATO:
{
  "resumoOperacional": string,
  "perfilCliente": string,
  "finalidadeCredito": string,
  "capacidadeFinanceira": string,
  "analiseGarantia": string,
  "situacaoDocumental": string,
  "mitigadoresRisco": string,
  "ltvEstimado": string,
  "pendenciasIdentificadas": [string],
  "parecerPreliminar": string,
  "defesaComercial": string
}

REGRAS:
- Máx 2000 chars por campo de texto
- Responda APENAS com JSON válido, sem markdown
- Use linguagem formal e técnica em todos os campos`;

        const userMessage = `Gere a revisão completa e defesa de crédito para a operação ${op.codigoOperacao}.

DADOS DA OPERAÇÃO:
- Produto: ${op.produto}
- Cliente/Tomador: ${op.nomeCliente} (CPF: ${op.cpf})
- Cônjuge: ${op.nomeConjuge ? `${op.nomeConjuge} (CPF: ${op.cpfConjuge})` : "Não informado"}
- Estado Civil: ${op.estadoCivil}
- Valor Solicitado: R$ ${Number(op.valorSolicitado).toLocaleString("pt-BR")}
- Prazo: ${op.prazo} meses
- Finalidade: ${op.finalidade ?? "Não informada"}
- Contexto da Operação: ${op.contextoOperacao ?? op.observacoesEstrategicas ?? "Não informado"}

DADOS DA GARANTIA:
${garantia ? `- Tipo: ${garantia.tipoGarantia}
- Imóvel: ${garantia.tipoImovel ?? "Não identificado"}
- Endereço: ${garantia.endereco ?? "Não identificado"}
- Cidade/Estado: ${garantia.cidade ?? "Não identificada"}/${garantia.estado ?? "Não identificado"}
- Matrícula: ${garantia.matricula ?? "Não identificada"}
- Metragem: ${garantia.metragem ?? "Não identificada"}
- Valor Estimado: R$ ${garantia.valorEstimado ?? "Não estimado"}
- LTV Estimado: ${garantia.ltvEstimado ?? "Não calculado"}%
- Situação Documental: ${garantia.situacaoDocumental ?? "Não avaliada"}
- Observações: ${(garantia.dadosExtrasJson as any)?.observacoes ?? "Nenhuma"}` : "Garantia ainda não analisada"}

SITUAÇÃO DOCUMENTAL:
- Total de documentos: ${docs.length}
- Documentos enviados: ${docsEnviados.length}
- Documentos pendentes: ${docsPendentes.length} (${docsPendentes.map((d) => d.nomeDocumento).join(", ") || "Nenhum"})
- Resultado da análise documental: ${analiseDocumental ? JSON.stringify(analiseDocumental.resultadoJson) : "Análise documental não realizada"}

ANÁLISE DE GARANTIA PRÉVIA:
${analiseGarantia ? JSON.stringify(analiseGarantia.resultadoJson) : "Análise de garantia não realizada"}

Gere a revisão completa seguindo a estrutura de 10 seções obrigatórias.`;

        const inicio = Date.now();

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            response_format: { type: "json_object" } as any,
          });

          const tempo = Date.now() - inicio;
          const rawContent = response.choices[0]?.message?.content;
          const conteudo = typeof rawContent === "string" ? rawContent : "{}";
          const resultado = JSON.parse(conteudo);
          const tokens = response.usage?.total_tokens ?? 0;
          const custo = tokens * 0.000003;

          if (analiseId) {
            await updateAnaliseIa(analiseId, {
              resultadoJson: resultado,
              resultadoTexto: conteudo,
              tokensConsumidos: tokens,
              custoEstimado: String(custo),
              tempoProcessamento: tempo,
              statusProcessamento: "concluido",
              modeloUtilizado: response.model ?? "llm",
            });
          }

          await updateOperacao(input.operacaoId, { statusMacro: "Pronta para distribuição" });
          await addHistoricoStatus({
            operacaoId: input.operacaoId,
            statusAnterior: op.statusMacro,
            statusNovo: "Pronta para distribuição",
            alteradoPor: user.id,
          });

          await notifyOwner({
            title: `✅ Operação ${op.codigoOperacao} pronta para validação`,
            content: `A operação ${op.codigoOperacao} de ${op.nomeCliente} (${op.produto}) concluiu a revisão IA completa e está pronta para validação humana e distribuição às IFs.\n\nParecer preliminar: ${resultado.parecerPreliminar?.substring(0, 200) ?? "Gerado"}...`,
          }).catch(() => {});

          return { success: true, resultado };
        } catch (err: any) {
          if (analiseId) {
            await updateAnaliseIa(analiseId, { statusProcessamento: "erro", erroProcessamento: err.message });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na revisão: " + err.message });
        }
      }),

        classificarDocumentos: protectedProcedure
      .input(z.object({
        operacaoId: z.number(),
        arquivos: z.array(z.object({
          nome: z.string(),
          mimeType: z.string(),
          tamanhoBytes: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const op = await getOperacaoById(input.operacaoId);
        if (!op) throw new TRPCError({ code: "NOT_FOUND" });
        if (user.perfil !== "admin" && user.perfil !== "operacional" && op.assessorId !== user.id)
          throw new TRPCError({ code: "FORBIDDEN" });

        const docs = await getDocumentosByOperacao(input.operacaoId);
        const checklistItems = docs.map((d: any) => ({ id: d.id, nome: d.nomeDocumento, categoria: d.categoria }));

        const prompt = `Você é um classificador de documentos para operações de crédito com garantia (Home Equity, Auto Equity, Rural Equity, Imóvel em Construção).

Checklist de documentos esperados para esta operação:
${checklistItems.map((c: any) => `- ID ${c.id}: ${c.nome} (${c.categoria})`).join("\n")}

Arquivos enviados pelo usuário:
${input.arquivos.map((a, i) => `${i + 1}. "${a.nome}" (${a.mimeType}, ${(a.tamanhoBytes / 1024).toFixed(0)} KB)`).join("\n")}

Para cada arquivo, determine qual item do checklist ele corresponde com base no nome do arquivo e tipo MIME.
Se não conseguir classificar com confiança, use documentoId: null.

Responda em JSON com este formato exato:
{
  "classificacoes": [
    { "indiceArquivo": 0, "documentoId": 123, "confianca": "alta", "motivo": "Nome contém RG" },
    { "indiceArquivo": 1, "documentoId": null, "confianca": "baixa", "motivo": "Nome genérico, não identificado" }
  ]
}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um classificador de documentos. Responda apenas com JSON válido, sem markdown." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        });

        let classificacoes: Array<{ indiceArquivo: number; documentoId: number | null; confianca: string; motivo: string }> = [];
        try {
          const parsed = JSON.parse(response.choices[0].message.content as string);
          classificacoes = parsed.classificacoes ?? [];
        } catch {
          // fallback: todos não classificados
          classificacoes = input.arquivos.map((_, i) => ({ indiceArquivo: i, documentoId: null, confianca: "baixa", motivo: "Erro ao classificar" }));
        }

        return { classificacoes, checklistItems };
      }),

        conferirDocumentos: protectedProcedure
      .input(z.object({ operacaoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const op = await getOperacaoById(input.operacaoId);
        if (!op) throw new TRPCError({ code: "NOT_FOUND" });
        if (user.perfil !== "admin" && op.assessorId !== user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const docs = await getDocumentosByOperacao(input.operacaoId);
        const docsEnviados = docs.filter((d: any) => d.arquivoUrl);
        const docsPendentes = docs.filter((d: any) => !d.arquivoUrl);
        const checklistTotal = docs.length;
        const checklistConcluidos = docsEnviados.length;

        // Buscar todas as versões para ter todos os arquivos por documento
        const todasVersoes: Record<number, string[]> = {};
        for (const doc of docsEnviados) {
          try {
            const versoes = await getVersoesDocumento(doc.id);
            todasVersoes[doc.id] = versoes.map((v: any) => v.arquivoUrl).filter(Boolean);
          } catch {
            todasVersoes[doc.id] = doc.arquivoUrl ? [doc.arquivoUrl] : [];
          }
        }

        // Helper para construir URL pública para o LLM
        const buildPublicUrl = (url: string) => {
          if (!url) return url;
          if (url.startsWith("/manus-storage/") || url.startsWith("/")) {
            return `${process.env.BUILT_IN_FORGE_API_URL?.replace("/api", "") ?? ""}${url}`;
          }
          return url;
        };

        const systemPrompt = `Você é um Analista Documental Sênior da Ativa Soluções, especializado em crédito com garantia real (Home Equity, Auto Equity, Rural Equity, Imóvel em Construção).

SUA MISSÃO: Realizar pré-análise documental completa, extrair dados estruturados e gerar inteligência operacional para alimentar a Defesa Comercial.

=== CAMADA 1: ANÁLISE DOCUMENTAL ===
PARA CADA DOCUMENTO ANALISE:
1. Tipo e correspondência: o documento é realmente o que se declara ser?
2. Legibilidade: está legível, sem cortes, sem partes ilegíveis?
3. Validade: está dentro do prazo? (Matrícula: máx 30 dias; IPTU: exercício atual; Extrato: últimos 3 meses; CNH/RG: não vencido)
4. Pertinência ao titular: pertence ao tomador ou cônjuge declarado?
5. Completude: está completo ou faltam páginas?
6. Consistência: dados batem com o restante da operação?

SEMÁFORO:
- verde: documento válido, legível, completo e dentro do prazo
- amarelo: presente mas com ressalva (data próxima do vencimento, qualidade reduzida, dado não confirmado)
- vermelho: ausente, vencido, ilegível, incorreto ou inconsistente

=== CAMADA 2: PERFILAMENTO DO TOMADOR ===
Extraia automaticamente dos documentos:
- Identificação: nome_completo, cpf, rg, data_nascimento, estado_civil
- Contato: telefone, email, endereco_residencial
- Profissional: profissao, empresa, participacao_societaria
- Financeiro: renda_mensal_estimada, faturamento_mensal, saldo_medio_estimado, movimentacao_financeira, banco
- Patrimonial: patrimonio_aparente
- Fiscal: renda_declarada (IRPF)

=== CAMADA 3: PERFILAMENTO DA GARANTIA ===
IMOVEL URBANO: matricula_imovel, cartorio, iptu, inscricao_cadastral, area_total, area_construida, descricao_imovel, padrao_construtivo, averbacao, onus, alienacao, hipoteca, penhora, inventario, liquidez_aparente, endereco_imovel, cidade_imovel, uf_imovel, titularidade
IMOVEL RURAL: hectares, car, ccir, itr, georreferenciamento, atividade_explorada, benfeitorias, logistica, produtividade_aparente
VEICULO: marca, modelo, ano_veiculo, placa, renavam, alienacao_veiculo, debitos_veiculo

=== CAMADA 4: LEITURA OPERACIONAL ===
Gere uma avaliação estruturada contendo:
- perfil_patrimonial: descrição do patrimônio identificado
- perfil_financeiro: capacidade financeira aparente
- grau_organizacao_documental: "alto" | "médio" | "baixo"
- complexidade_operacao: "simples" | "média" | "complexa"
- mitigadores_risco: lista de pontos positivos identificados
- fragilidades: lista de pontos de atenção (sem inventar)
- aderencia_bancaria_aparente: "alta" | "média" | "baixa"

RETORNE JSON ESTRITAMENTE NESTE FORMATO:
{
  "documentos": [
    {
      "id": number,
      "nome": string,
      "semaforo": "verde" | "amarelo" | "vermelho",
      "tipo_identificado": string,
      "legivel": boolean,
      "pertence_ao_cliente": boolean | null,
      "observacao": string,
      "dados_extraidos": {
        "titular_identificado": string | null,
        "data_emissao": string | null,
        "validade": string | null,
        "numero_documento": string | null
      }
    }
  ],
  "dados_extraidos_operacao": {
    "nome_completo": string | null,
    "cpf": string | null,
    "rg": string | null,
    "data_nascimento": string | null,
    "estado_civil": string | null,
    "telefone": string | null,
    "email": string | null,
    "endereco_residencial": string | null,
    "profissao": string | null,
    "empresa": string | null,
    "participacao_societaria": string | null,
    "renda_mensal_estimada": string | null,
    "faturamento_mensal": string | null,
    "saldo_medio_estimado": string | null,
    "movimentacao_financeira": string | null,
    "banco": string | null,
    "renda_declarada": string | null,
    "patrimonio_aparente": string | null,
    "matricula_imovel": string | null,
    "cartorio": string | null,
    "iptu": string | null,
    "inscricao_cadastral": string | null,
    "area_total": string | null,
    "area_construida": string | null,
    "descricao_imovel": string | null,
    "padrao_construtivo": string | null,
    "averbacao": string | null,
    "onus": string | null,
    "alienacao": string | null,
    "hipoteca": string | null,
    "penhora": string | null,
    "inventario": string | null,
    "liquidez_aparente": string | null,
    "endereco_imovel": string | null,
    "cidade_imovel": string | null,
    "uf_imovel": string | null,
    "titularidade": string | null,
    "hectares": string | null,
    "car": string | null,
    "ccir": string | null,
    "itr": string | null,
    "georreferenciamento": string | null,
    "atividade_explorada": string | null,
    "benfeitorias": string | null,
    "logistica": string | null,
    "produtividade_aparente": string | null,
    "marca": string | null,
    "modelo": string | null,
    "ano_veiculo": string | null,
    "placa": string | null,
    "renavam": string | null,
    "alienacao_veiculo": string | null,
    "debitos_veiculo": string | null
  },
  "leitura_operacional": {
    "perfil_patrimonial": string | null,
    "perfil_financeiro": string | null,
    "grau_organizacao_documental": "alto" | "médio" | "baixo" | null,
    "complexidade_operacao": "simples" | "média" | "complexa" | null,
    "mitigadores_risco": [string],
    "fragilidades": [string],
    "aderencia_bancaria_aparente": "alta" | "média" | "baixa" | null
  },
  "pendencias_criticas": [string],
  "pendencias_secundarias": [string],
  "documentos_ausentes": [string],
  "situacao_geral": "Completa" | "Pendências secundárias" | "Pendências relevantes" | "Necessita regularização" | "Pronta para análise sênior",
  "pode_prosseguir": boolean,
  "resumo_documental": string
}

REGRAS PARA pode_prosseguir:
- true: sem documentos vermelhos críticos (pode ter amarelos ou ausentes secundários)
- false: qualquer documento ilegível, incorreto, vencido ou ausente obrigatório

REGRAS ABSOLUTAS:
- NUNCA invente dados não presentes nos documentos
- NÃO crie renda, patrimônio ou documentos inexistentes
- Se não conseguir identificar um dado, use null
- Seja objetivo e técnico
- Responda APENAS com JSON válido, sem markdown`;

        const contentParts: any[] = [
          {
            type: "text",
            text: `Realize a pré-análise documental completa da operação ${op.codigoOperacao}.
INFORMAÇÕES DA OPERAÇÃO:
- Produto: ${op.produto}
- Cliente/Tomador: ${op.nomeCliente} (CPF: ${op.cpf})
- Cônjuge: ${op.nomeConjuge ? `${op.nomeConjuge} (CPF: ${op.cpfConjuge})` : "Não informado"}
- Estado Civil: ${op.estadoCivil}
- Valor Solicitado: R$ ${Number(op.valorSolicitado).toLocaleString("pt-BR")}
- Prazo: ${op.prazo} meses
- Finalidade: ${op.finalidade ?? "Não informada"}

CHECKLIST (${docs.length} documentos):
${docs.map((d: any) => `- [${d.arquivoUrl ? "ENVIADO" : "PENDENTE"}] ID:${d.id} | ${d.nomeDocumento} (${d.categoria})`).join("\n")}

DOCUMENTOS AUSENTES: ${docsPendentes.map((d: any) => d.nomeDocumento).join(", ") || "Nenhum"}

Analise cada documento enviado abaixo e retorne o JSON completo.`,
          },
        ];

        // Adicionar até 10 arquivos para análise
        let arquivosAdicionados = 0;
        for (const doc of docsEnviados) {
          if (arquivosAdicionados >= 10) break;
          const urls = todasVersoes[doc.id] ?? (doc.arquivoUrl ? [doc.arquivoUrl] : []);
          const urlRecente = urls[0];
          if (!urlRecente) continue;
          const publicUrl = buildPublicUrl(urlRecente);
          const mimeType = urlRecente.toLowerCase().includes(".pdf") ? "application/pdf" : undefined;
          if (mimeType) {
            contentParts.push({ type: "file_url", file_url: { url: publicUrl, mime_type: mimeType } });
          } else {
            contentParts.push({ type: "image_url", image_url: { url: publicUrl, detail: "high" } });
          }
          contentParts.push({ type: "text", text: `[Documento acima: ID=${doc.id} | ${doc.nomeDocumento} | Categoria: ${doc.categoria}]` });
          arquivosAdicionados++;
        }

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: contentParts },
            ],
            response_format: { type: "json_object" } as any,
          });
          const rawContent = response.choices[0]?.message?.content;
          const conteudo = typeof rawContent === "string" ? rawContent : "{}";
          const resultado = JSON.parse(conteudo);

          const podeProsseguir = resultado.pode_prosseguir === true;
          const situacaoGeral = resultado.situacao_geral ?? (podeProsseguir ? "Pendências secundárias" : "Pendências relevantes");

          // Atualizar status da operação
          const novoStatusMacro = podeProsseguir ? "Documentação completa" : "Aguardando documentos";
          await updateOperacao(input.operacaoId, {
            statusValidacaoIa: podeProsseguir ? "Validado" : "Pendência encontrada",
            statusMacro: novoStatusMacro,
          });
          await addHistoricoStatus({
            operacaoId: input.operacaoId,
            statusAnterior: op.statusMacro,
            statusNovo: novoStatusMacro,
            alteradoPor: user.id,
          });

          // Salvar dados extraídos + leitura operacional no perfilExtraidoJson
          if (resultado.dados_extraidos_operacao || resultado.leitura_operacional) {
            const jsonEstruturado = {
              cliente: resultado.dados_extraidos_operacao ?? {},
              garantia: {
                matricula_imovel: resultado.dados_extraidos_operacao?.matricula_imovel,
                cartorio: resultado.dados_extraidos_operacao?.cartorio,
                iptu: resultado.dados_extraidos_operacao?.iptu,
                area_total: resultado.dados_extraidos_operacao?.area_total,
                area_construida: resultado.dados_extraidos_operacao?.area_construida,
                onus: resultado.dados_extraidos_operacao?.onus,
                alienacao: resultado.dados_extraidos_operacao?.alienacao,
                hipoteca: resultado.dados_extraidos_operacao?.hipoteca,
                penhora: resultado.dados_extraidos_operacao?.penhora,
                liquidez_aparente: resultado.dados_extraidos_operacao?.liquidez_aparente,
                hectares: resultado.dados_extraidos_operacao?.hectares,
                car: resultado.dados_extraidos_operacao?.car,
                marca: resultado.dados_extraidos_operacao?.marca,
                modelo: resultado.dados_extraidos_operacao?.modelo,
                placa: resultado.dados_extraidos_operacao?.placa,
              },
              financeiro: {
                renda_mensal_estimada: resultado.dados_extraidos_operacao?.renda_mensal_estimada,
                faturamento_mensal: resultado.dados_extraidos_operacao?.faturamento_mensal,
                saldo_medio_estimado: resultado.dados_extraidos_operacao?.saldo_medio_estimado,
                movimentacao_financeira: resultado.dados_extraidos_operacao?.movimentacao_financeira,
                renda_declarada: resultado.dados_extraidos_operacao?.renda_declarada,
                banco: resultado.dados_extraidos_operacao?.banco,
              },
              documentacao: {
                situacao_geral: resultado.situacao_geral,
                pode_prosseguir: resultado.pode_prosseguir,
                checklist_total: checklistTotal,
                checklist_concluidos: checklistConcluidos,
              },
              risco: resultado.leitura_operacional ?? {},
              pendencias: {
                criticas: resultado.pendencias_criticas ?? [],
                secundarias: resultado.pendencias_secundarias ?? [],
                ausentes: resultado.documentos_ausentes ?? [],
              },
            };
            await updateOperacao(input.operacaoId, {
              perfilExtraidoJson: jsonEstruturado,
            });
          }

          // Disparar notificação para admins quando documentação completa
          if (podeProsseguir) {
            const admins = await getAdmins();
            for (const admin of admins) {
              await createNotificacao({
                usuarioId: admin.id,
                operacaoId: input.operacaoId,
                tipo: "documentacao_completa",
                mensagem: `Documentação de ${op.nomeCliente} (${op.codigoOperacao}) validada pela IA — pronta para análise.`,
              });
            }
          }

          return {
            aprovado: podeProsseguir,
            situacaoGeral,
            documentosPorStatus: resultado.documentos ?? [],
            dadosExtraidos: resultado.dados_extraidos_operacao ?? null,
            leituraOperacional: resultado.leitura_operacional ?? null,
            pendenciasCriticas: resultado.pendencias_criticas ?? [],
            pendenciasSecundarias: resultado.pendencias_secundarias ?? [],
            documentosAusentes: resultado.documentos_ausentes ?? [],
            resumo: resultado.resumo_documental ?? "",
            checklist_total: checklistTotal,
            checklist_concluidos: checklistConcluidos,
          };
        } catch (err: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na conferência: " + err.message });
        }
      }),

        extrairPerfil: protectedProcedure
      .input(z.object({ operacaoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const op = await getOperacaoById(input.operacaoId);
        if (!op) throw new TRPCError({ code: "NOT_FOUND" });
        if (user.perfil !== "admin" && op.assessorId !== user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const docs = await getDocumentosByOperacao(input.operacaoId);
        const docsEnviados = docs.filter((d: any) => d.arquivoUrl);

        if (docsEnviados.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum documento enviado. Envie os documentos na Etapa 3 antes de extrair o perfil." });
        }

        const buildPublicUrl = (url: string) => {
          if (!url) return url;
          if (url.startsWith("/manus-storage/") || url.startsWith("/")) {
            return `${process.env.BUILT_IN_FORGE_API_URL?.replace("/api", "") ?? ""}${url}`;
          }
          return url;
        };

        const promptText = `Extraia os dados do tomador e da garantia dos documentos da operação ${op.codigoOperacao}.
Cliente: ${op.nomeCliente} (CPF: ${op.cpf}), Produto: ${op.produto}
Estado Civil: ${(op as any).estadoCivil ?? "Não informado"}
Cônjuge: ${(op as any).nomeConjuge ? `${(op as any).nomeConjuge} (CPF: ${(op as any).cpfConjuge})` : "Não informado"}

Retorne JSON ESTRITAMENTE neste formato (use null para campos não encontrados, nunca strings como "Informação não localizada"):
{
  "cliente": { "nome_completo": null, "cpf": null, "rg": null, "data_nascimento": null, "estado_civil": null, "telefone": null, "email": null, "endereco_residencial": null, "profissao": null, "empresa": null, "participacao_societaria": null, "patrimonio_aparente": null },
  "financeiro": { "renda_mensal_estimada": null, "faturamento_mensal": null, "saldo_medio_estimado": null, "movimentacao_financeira": null, "renda_declarada": null, "banco": null },
  "garantia": { "matricula_imovel": null, "cartorio": null, "iptu": null, "area_total": null, "area_construida": null, "descricao_imovel": null, "onus": null, "alienacao": null, "hipoteca": null, "penhora": null, "liquidez_aparente": null, "hectares": null, "car": null, "marca": null, "modelo": null, "placa": null },
  "risco": { "perfil_patrimonial": null, "perfil_financeiro": null, "grau_organizacao_documental": null, "aderencia_bancaria_aparente": null, "mitigadores_risco": [], "fragilidades": [] }
}`;

        const contentParts: any[] = [{ type: "text", text: promptText }];

        for (const doc of docsEnviados.slice(0, 10)) {
          if (doc.arquivoUrl) {
            const url = buildPublicUrl(doc.arquivoUrl);
            const ext = doc.arquivoUrl.toLowerCase().split("?")[0].split(".").pop() ?? "";
            if (ext === "pdf") {
              contentParts.push({ type: "file_url", file_url: { url, mime_type: "application/pdf" } });
            } else {
              contentParts.push({ type: "image_url", image_url: { url, detail: "high" } });
            }
            contentParts.push({ type: "text", text: `[Documento: ${doc.nomeDocumento} | Categoria: ${doc.categoria}]` });
          }
        }

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "Você é um analista de crédito sênior especializado em extração de dados de documentos. Retorne APENAS JSON válido no formato estruturado solicitado, sem markdown." },
              { role: "user", content: contentParts },
            ],
            response_format: { type: "json_object" } as any,
          });
          if (!response?.choices?.[0]?.message?.content) {
            throw new Error("Resposta da IA vazia ou inválida");
          }
          const rawContent = response.choices[0].message.content;
          const conteudo = typeof rawContent === "string" ? rawContent : "{}";
          const perfilBruto = JSON.parse(conteudo);
          const perfilEstruturado = {
            cliente: perfilBruto.cliente ?? perfilBruto,
            financeiro: perfilBruto.financeiro ?? {},
            garantia: perfilBruto.garantia ?? {},
            risco: perfilBruto.risco ?? {},
          };
          await updateOperacao(input.operacaoId, { perfilExtraidoJson: perfilEstruturado } as any);
          return { success: true, perfil: perfilEstruturado };
        } catch (err: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na extração: " + err.message });
        }
      }),

        gerarDefesaComercial: protectedProcedure
      .input(z.object({ operacaoId: z.number(), comentario: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const op = await getOperacaoById(input.operacaoId);
        if (!op) throw new TRPCError({ code: "NOT_FOUND" });
        if (user.perfil !== "admin" && op.assessorId !== user.id) throw new TRPCError({ code: "FORBIDDEN" });

        // Extrair dados estruturados do JSON salvo pela IA de pré-análise
        const perfilJson = (op as any).perfilExtraidoJson ?? {};
        const cliente = perfilJson.cliente ?? perfilJson; // suporte a formato legado
        const garantia = perfilJson.garantia ?? {};
        const financeiro = perfilJson.financeiro ?? {};
        const risco = perfilJson.risco ?? {};
        const pendencias = perfilJson.pendencias ?? {};

        const valorGarantia = (op as any).valorGarantia ?? "Não informado";
        const tipoGarantia = (op as any).tipoGarantiaDescricao ?? op.produto;
        const ltv = valorGarantia && op.valorSolicitado && !isNaN(parseFloat(valorGarantia))
          ? ((parseFloat(op.valorSolicitado) / parseFloat(valorGarantia)) * 100).toFixed(1) + "%"
          : "Não calculado";

        // Montar bloco de dados estruturados para o prompt
        const blocoCliente = [
          cliente.nome_completo ? `Nome: ${cliente.nome_completo}` : null,
          cliente.cpf ? `CPF: ${cliente.cpf}` : null,
          cliente.data_nascimento ? `Nascimento: ${cliente.data_nascimento}` : null,
          cliente.estado_civil ? `Estado Civil: ${cliente.estado_civil}` : null,
          cliente.profissao ? `Profissão: ${cliente.profissao}` : null,
          cliente.empresa ? `Empresa: ${cliente.empresa}` : null,
          cliente.participacao_societaria ? `Participação Societária: ${cliente.participacao_societaria}` : null,
          cliente.patrimonio_aparente ? `Patrimônio: ${cliente.patrimonio_aparente}` : null,
        ].filter(Boolean).join(" | ");

        const blocoFinanceiro = [
          financeiro.renda_mensal_estimada ? `Renda mensal estimada: ${financeiro.renda_mensal_estimada}` : null,
          financeiro.faturamento_mensal ? `Faturamento mensal: ${financeiro.faturamento_mensal}` : null,
          financeiro.saldo_medio_estimado ? `Saldo médio: ${financeiro.saldo_medio_estimado}` : null,
          financeiro.movimentacao_financeira ? `Movimentação: ${financeiro.movimentacao_financeira}` : null,
          financeiro.renda_declarada ? `Renda declarada (IRPF): ${financeiro.renda_declarada}` : null,
          financeiro.banco ? `Banco principal: ${financeiro.banco}` : null,
        ].filter(Boolean).join(" | ");

        const blocoGarantia = [
          garantia.matricula_imovel ? `Matrícula: ${garantia.matricula_imovel}` : null,
          garantia.cartorio ? `Cartório: ${garantia.cartorio}` : null,
          garantia.area_total ? `Área total: ${garantia.area_total}` : null,
          garantia.area_construida ? `Área construída: ${garantia.area_construida}` : null,
          garantia.onus ? `Ônus: ${garantia.onus}` : null,
          garantia.alienacao ? `Alienação: ${garantia.alienacao}` : null,
          garantia.hipoteca ? `Hipoteca: ${garantia.hipoteca}` : null,
          garantia.penhora ? `Penhora: ${garantia.penhora}` : null,
          garantia.liquidez_aparente ? `Liquidez: ${garantia.liquidez_aparente}` : null,
          garantia.hectares ? `Hectares: ${garantia.hectares}` : null,
          garantia.marca ? `Veículo: ${garantia.marca} ${garantia.modelo ?? ""} ${garantia.placa ?? ""}` : null,
        ].filter(Boolean).join(" | ");

        const blocoRisco = [
          risco.perfil_patrimonial ? `Perfil patrimonial: ${risco.perfil_patrimonial}` : null,
          risco.perfil_financeiro ? `Perfil financeiro: ${risco.perfil_financeiro}` : null,
          risco.grau_organizacao_documental ? `Organização documental: ${risco.grau_organizacao_documental}` : null,
          risco.aderencia_bancaria_aparente ? `Aderência bancária: ${risco.aderencia_bancaria_aparente}` : null,
          risco.mitigadores_risco?.length ? `Mitigadores: ${risco.mitigadores_risco.join("; ")}` : null,
          risco.fragilidades?.length ? `Fragilidades: ${risco.fragilidades.join("; ")}` : null,
        ].filter(Boolean).join(" | ");

        const systemPrompt = `Você é um Analista de Crédito Sênior da Ativa Soluções, especializado em crédito com garantia real.

SUA MISSÃO: Gere uma Defesa Comercial técnica, persuasiva e altamente personalizada para apresentação às Instituições Financeiras.

USE TODOS OS DADOS FORNECIDOS para construir argumentos específicos e concretos. Quanto mais dados disponíveis, mais rica e personalizada deve ser a defesa.

ESTRUTURA OBRIGATÓRIA:
1. PERFIL DO TOMADOR: Apresente o cliente com dados concretos (profissão, renda, patrimônio, histórico)
2. CAPACIDADE DE PAGAMENTO: Demonstre com números reais (renda, movimentação, saldo, faturamento)
3. GARANTIA: Descreva o bem com dados da matrícula/registro, área, localização, situação jurídica
4. LTV E PROPORCIONALIDADE: Argumente sobre o LTV e margem de segurança
5. FINALIDADE E COERÊNCIA: Conecte a finalidade ao perfil do tomador
6. REGULARIDADE DOCUMENTAL: Mencione a qualidade e completude da documentação
7. PARECER POSITIVO: Conclua com recomendação clara de aprovação

REGRAS:
- Tom SEMPRE positivo, técnico e institucional
- Máximo 2.200 caracteres
- NÃO invente informações não fornecidas
- NÃO mencione riscos sem mitigadores
- Use linguagem de crédito (LTV, CCB, alienacão fiduciária, etc.)
- Seja específico: cite números reais quando disponíveis`;

        const userMessage = `DADOS DA OPERAÇÃO:
Código: ${op.codigoOperacao} | Produto: ${op.produto}
Cliente: ${op.nomeCliente}
Valor Solicitado: R$ ${op.valorSolicitado} | Prazo: ${op.prazo} meses
Finalidade: ${op.finalidade}
Tipo de Garantia: ${tipoGarantia} | Valor da Garantia: R$ ${valorGarantia}
LTV Estimado: ${ltv}
Estado Civil: ${op.estadoCivil ?? "Não informado"}
Contexto: ${op.contextoOperacao ?? "Não informado"}

PERFIL DO TOMADOR (extraído dos documentos):
${blocoCliente || "Dados não extraídos"}

CAPACIDADE FINANCEIRA:
${blocoFinanceiro || "Dados não extraídos"}

GARANTIA:
${blocoGarantia || "Dados não extraídos"}

LEITURA OPERACIONAL DA IA:
${blocoRisco || "Não disponível"}
${pendencias.criticas?.length ? `\nPendências críticas resolvidas: ${pendencias.criticas.join("; ")}` : ""}
${input.comentario ? `\nComentário do consultor: ${input.comentario}` : ""}`;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
          });
          const rawContent = response.choices[0]?.message?.content;
          const defesa = typeof rawContent === "string" ? rawContent : "";
          await updateOperacao(input.operacaoId, { defesaComercial: defesa } as any);
          return { success: true, defesa };
        } catch (err: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na geração da defesa: " + err.message });
        }
      }),

        enviarParaAnalise: protectedProcedure
      .input(z.object({ operacaoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const op = await getOperacaoById(input.operacaoId);
        if (!op) throw new TRPCError({ code: "NOT_FOUND" });
        if (user.perfil !== "admin" && op.assessorId !== user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await updateOperacao(input.operacaoId, {
          statusMacro: "Em validação humana",
          statusRascunho: false,
          etapaAtual: 5,
        } as any);
        await addHistoricoStatus({
          operacaoId: input.operacaoId,
          statusAnterior: op.statusMacro,
          statusNovo: "Em validação humana",
          alteradoPor: user.id,
        });
        await notifyOwner({
          title: `Nova operação para análise: ${op.codigoOperacao}`,
          content: `O consultor ${user.name ?? user.email} enviou a operação ${op.codigoOperacao} (${op.produto} — ${op.nomeCliente}) para validação humana. Acesse o portal para revisar.`,
        });
        await addLog({ evento: "operacao_enviada_analise", detalhe: { id: input.operacaoId }, usuarioId: user.id, operacaoId: input.operacaoId });
        return { success: true };
      }),

        gerarDefesa: adminProcedure
      .input(z.object({ operacaoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const op = await getOperacaoById(input.operacaoId);
        if (!op) throw new TRPCError({ code: "NOT_FOUND" });

        const analises = await getAnalisesByOperacao(input.operacaoId);
        const analiseDocumental = analises.find((a) => a.camada === "documental" && a.statusProcessamento === "concluido");

        const systemPrompt = `Você é um Analista de Crédito Sênior da Ativa Soluções, especializado em Home Equity, Auto Equity, Rural Equity.
PAPEL: Gerar defesa comercial para apresentação às Instituições Financeiras. Responsabilidade final permanece humana.
RETORNE DUAS PARTES:
PARTE 1 — JSON: { valor_solicitado, valor_estimado_garantia, ltv_estimado, perfil_renda, finalidade, tipo_garantia, regiao, patrimonio_identificado, tipo_cliente, objetivo_financeiro }
PARTE 2 — Defesa comercial (máx. 2000 chars): A. Perfil favorável do cliente. B. Finalidade clara. C. Capacidade financeira demonstrada. D. Garantia sólida e LTV conservador. E. Regularidade documental. F. Parecer positivo.
REGRAS: Tom SEMPRE positivo. NÃO enfatize riscos. NÃO inviabilize operações. NUNCA invente informações.
Formato de resposta: JSON com campos "parte1" (objeto) e "parte2" (string).`;

        const userMessage = `Gere defesa comercial para a operação ${op.codigoOperacao}:
Produto: ${op.produto}
Cliente: ${op.nomeCliente}
Valor Solicitado: R$ ${op.valorSolicitado}
Prazo: ${op.prazo} meses
Finalidade: ${op.finalidade}
Estado Civil: ${op.estadoCivil}
Contexto da Operação: ${op.contextoOperacao ?? op.observacoesEstrategicas ?? "Nenhuma"}
Resultado Documental: ${analiseDocumental ? JSON.stringify(analiseDocumental.resultadoJson) : "Não disponível"}`;

        const inicio = Date.now();

        await createAnaliseIa({
          operacaoId: input.operacaoId,
          camada: "analista",
          statusProcessamento: "processando",
          geradoPor: user.id,
          modeloUtilizado: "built-in-llm",
        });

        const analises2 = await getAnalisesByOperacao(input.operacaoId);
        const analiseRecente = analises2.find((a) => a.statusProcessamento === "processando" && a.camada === "analista");
        const analiseId = analiseRecente?.id;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            response_format: { type: "json_object" } as any,
          });

          const tempo = Date.now() - inicio;
          const rawContent2 = response.choices[0]?.message?.content;
          const conteudo = typeof rawContent2 === "string" ? rawContent2 : "{}";
          const resultado = JSON.parse(conteudo);
          const tokens = response.usage?.total_tokens ?? 0;
          const custo = tokens * 0.000003;

          if (analiseId) {
            await updateAnaliseIa(analiseId, {
              resultadoJson: resultado.parte1,
              resultadoTexto: resultado.parte2,
              tokensConsumidos: tokens,
              custoEstimado: String(custo),
              tempoProcessamento: tempo,
              statusProcessamento: "concluido",
              modeloUtilizado: response.model ?? "llm",
            });
          }

          return { success: true, parte1: resultado.parte1, parte2: resultado.parte2 };
        } catch (err: any) {
          if (analiseId) {
            await updateAnaliseIa(analiseId, {
              statusProcessamento: "erro",
              erroProcessamento: err.message,
            });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na geração da defesa: " + err.message });
        }
      }),
  }),

  // ─── Instituições Financeiras ───────────────────────────────────────────────
    ifs: router({
    listar: protectedProcedure
      .input(z.object({ operacaoId: z.number() }))
      .query(async ({ input }) => {
        return getIFsByOperacao(input.operacaoId);
      }),
    criar: adminProcedure
      .input(
        z.object({
          operacaoId: z.number(),
          ifCadastroId: z.number(),
          dataEnvio: z.string().optional(),
          prazoRetornoEstimado: z.string().optional(),
          proximaAcao: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const ifCadastro = await getIFCadastradaById(input.ifCadastroId);
        if (!ifCadastro) throw new TRPCError({ code: "NOT_FOUND", message: "IF não encontrada no cadastro." });
        await createIF({
          operacaoId: input.operacaoId,
          ifCadastroId: input.ifCadastroId,
          nomeInstituicao: ifCadastro.nome,
          dataEnvio: input.dataEnvio ? new Date(input.dataEnvio) : new Date(),
          prazoRetornoEstimado: input.prazoRetornoEstimado ? new Date(input.prazoRetornoEstimado) : undefined,
          responsavelEnvio: (ctx.user as any).id,
          proximaAcao: input.proximaAcao,
        });
        // Registrar também na tabela if_distribuicoes para rastreabilidade
        await createDistribuicao({
          operacaoId: input.operacaoId,
          ifId: input.ifCadastroId,
          distribuidoPor: (ctx.user as any).id,
        });
        return { success: true };
      }),

    atualizar: adminProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["Aguardando", "Em análise", "Aprovado", "Reprovado", "Stand-by"]).optional(),
          retorno: z.string().optional(),
          motivoRecusa: z.string().optional(),
          proximaAcao: z.string().optional(),
          dataUltimoRetorno: z.string().optional(),
          prazoRetornoEstimado: z.string().optional(),
        })
      )
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

  // ─── Histórico ─────────────────────────────────────────────────────────────
  historico: router({
    listar: protectedProcedure
      .input(z.object({ operacaoId: z.number() }))
      .query(async ({ input }) => {
        return getHistoricoByOperacao(input.operacaoId);
      }),
  }),

  // ─── Garantias ─────────────────────────────────────────────────────────────
  garantias: router({
    listar: protectedProcedure
      .input(z.object({ operacaoId: z.number() }))
      .query(async ({ input }) => {
        return getGarantiasByOperacao(input.operacaoId);
      }),

    criar: protectedProcedure
      .input(
        z.object({
          operacaoId: z.number(),
          tipoGarantia: z.string(),
          descricao: z.string().optional(),
          valorEstimado: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await createGarantia({
          operacaoId: input.operacaoId,
          tipoGarantia: input.tipoGarantia,
          descricao: input.descricao,
          valorEstimado: input.valorEstimado,
        });
        return { success: true };
      }),

    atualizar: adminProcedure
      .input(
        z.object({
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
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        await updateGarantia(id, { ...rest, editadoManualmente: true });
        return { success: true };
      }),
  }),

  // ─── Termos SCR ────────────────────────────────────────────────────────────
  termoScr: router({
    obter: protectedProcedure
      .input(z.object({ operacaoId: z.number() }))
      .query(async ({ input }) => {
        return getTermoScrByOperacao(input.operacaoId);
      }),

    criar: adminProcedure
      .input(z.object({ operacaoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const op = await getOperacaoById(input.operacaoId);
        if (!op) throw new TRPCError({ code: "NOT_FOUND" });

        const token = nanoid(32);
        const expiracao = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias

        // O link será construído no frontend com window.location.origin
        await createTermoScr({
          operacaoId: input.operacaoId,
          token,
          linkUnico: `/scr/${token}`,
          status: "Aguardando assinatura",
          expiracaoEm: expiracao,
        });

        await updateOperacao(input.operacaoId, { statusScr: "Aguardando assinatura" });
        await addLog({
          evento: "termo_scr_criado",
          detalhe: { token, operacaoId: input.operacaoId },
          usuarioId: (ctx.user as any).id,
          operacaoId: input.operacaoId,
        });

        return { success: true, token, linkUnico: `/scr/${token}` };
      }),

    assinar: publicProcedure
      .input(
        z.object({
          token: z.string(),
          tipo: z.enum(["cliente", "conjuge"]),
        })
      )
      .mutation(async ({ input }) => {
        const termo = await getTermoScrByToken(input.token);
        if (!termo) throw new TRPCError({ code: "NOT_FOUND", message: "Termo não encontrado." });
        if (termo.expiracaoEm && new Date() > new Date(termo.expiracaoEm)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termo expirado." });
        }

        const updateData: any = {};
        if (input.tipo === "cliente") {
          updateData.assinadoClienteEm = new Date();
        } else {
          updateData.assinadoConjugeEm = new Date();
        }

        // Determinar novo status
        const assinadoCliente = input.tipo === "cliente" ? true : !!termo.assinadoClienteEm;
        const assinadoConjuge = input.tipo === "conjuge" ? true : !!termo.assinadoConjugeEm;

        const op = await getOperacaoById(termo.operacaoId);
        const temConjuge = op?.estadoCivil === "Casado" || op?.estadoCivil === "União Estável";

        let novoStatus: "Parcialmente assinado" | "Assinado completo";
        if (temConjuge) {
          novoStatus = assinadoCliente && assinadoConjuge ? "Assinado completo" : "Parcialmente assinado";
        } else {
          novoStatus = assinadoCliente ? "Assinado completo" : "Parcialmente assinado";
        }

        updateData.status = novoStatus;
        await updateTermoScr(termo.id, updateData);

        if (op) {
          await updateOperacao(op.id, { statusScr: novoStatus });
        }

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
  }),

  // ─── IFs Parceiras (Cadastro Global) ──────────────────────────────────────────────
  ifCadastros: router({
    listar: protectedProcedure.query(async () => {
      return getAllIFsCadastradas();
    }),
    listarAtivas: protectedProcedure.query(async () => {
      return getIFsAtivas();
    }),
    listarAtivasPorProduto: protectedProcedure
      .input(z.object({ produto: z.string().optional() }))
      .query(async ({ input }) => {
        return getIFsAtivasPorProduto(input.produto);
      }),
    metricasPorIF: protectedProcedure
      .input(z.object({ ifId: z.number() }))
      .query(async ({ input }) => {
        return getMetricasPorIF(input.ifId);
      }),
    historicoDistribuicoes: protectedProcedure
      .input(z.object({ ifId: z.number() }))
      .query(async ({ input }) => {
        return getHistoricoDistribuicoesByIF(input.ifId);
      }),
    obter: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getIFCadastradaById(input.id);
      }),
    criar: adminProcedure
      .input(
        z.object({
          nome: z.string().min(2),
          cnpj: z.string().min(14),
          contatoNome: z.string().optional(),
          contatoEmail: z.string().email().optional(),
          contatoTel: z.string().optional(),
          status: z.enum(["Ativa", "Inativa", "Em negociação"]).optional(),
          observacoes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await createIFCadastrada(input);
        return { success: true };
      }),
    atualizar: adminProcedure
      .input(
        z.object({
          id: z.number(),
          nome: z.string().min(2).optional(),
          cnpj: z.string().optional(),
          contatoNome: z.string().optional(),
          contatoEmail: z.string().optional(),
          contatoTel: z.string().optional(),
          status: z.enum(["Ativa", "Inativa", "Em negociação"]).optional(),
          observacoes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateIFCadastrada(id, data);
        return { success: true };
      }),
    deletar: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await softDeleteIFCadastrada(input.id);
        return { success: true };
      }),
    // Condições por produto
    listarCondicoes: protectedProcedure
      .input(z.object({ ifId: z.number() }))
      .query(async ({ input }) => {
        return getCondicoesByIF(input.ifId);
      }),
    salvarCondicao: adminProcedure
      .input(
        z.object({
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
        })
      )
      .mutation(async ({ input }) => {
        await upsertCondicaoIF(input as any);
        return { success: true };
      }),
    deletarCondicao: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteCondicaoIF(input.id);
        return { success: true };
      }),
  }),

  // ─── Distribuições de Operações para IFs ─────────────────────────────────────────
  distribuicoes: router({
    listar: protectedProcedure
      .input(z.object({ operacaoId: z.number() }))
      .query(async ({ input }) => {
        return getDistribuicoesByOperacao(input.operacaoId);
      }),
    distribuir: adminProcedure
      .input(
        z.object({
          operacaoId: z.number(),
          ifIds: z.array(z.number()).min(1),
          observacoes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        for (const ifId of input.ifIds) {
          await createDistribuicao({
            operacaoId: input.operacaoId,
            ifId,
            observacoes: input.observacoes,
            distribuidoPor: (ctx.user as any).id,
          });
        }
        await updateOperacao(input.operacaoId, { statusMacro: "Em distribuição" });
        return { success: true };
      }),
    atualizarStatus: adminProcedure
      .input(
        z.object({
          id: z.number(),
          statusRetorno: z.enum(["Aguardando", "Em análise", "Aprovada", "Reprovada", "Contraproposta"]),
          observacoes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateDistribuicao(id, data);
        return { success: true };
      }),
  }),

  // ─── Notificações ───────────────────────────────────────────────────────────────────
  notificacoes: router({
    listar: protectedProcedure.query(async ({ ctx }) => {
      return getNotificacoesByUser((ctx.user as any).id);
    }),
    marcarLida: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await marcarNotificacaoLida(input.id);
        return { success: true };
      }),
    marcarTodasLidas: protectedProcedure.mutation(async ({ ctx }) => {
      await marcarTodasNotificacoesLidas((ctx.user as any).id);
      return { success: true };
    }),
  }),
});
export type AppRouter = typeof appRouter;

// ─── Helper: inicializar checklist por produto ────────────────────────────────

async function inicializarChecklist(codigoOperacao: string, produto: string) {
  const ops = await getOperacoes({ busca: codigoOperacao });
  const op = ops.find((o) => o.codigoOperacao === codigoOperacao);
  if (!op) return;

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
}
