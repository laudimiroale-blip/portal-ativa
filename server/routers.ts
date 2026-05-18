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
  getAnalisesByOperacao,
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
    listar: protectedProcedure.query(async () => {
      return getAllAssessores();
    }),
    setPerfil: adminProcedure
      .input(z.object({ userId: z.number(), perfil: z.enum(["admin", "assessor"]) }))
      .mutation(async ({ input }) => {
        await updateUserPerfil(input.userId, input.perfil);
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
        };
        if (!isAdmin || input?.apenasMinhas) {
          filters.assessorId = user.id;
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
          cpf: z.string().min(11),
          estadoCivil: z.enum(["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável"]),
          emailTomador: z.string().email(),
          telefoneTomador: z.string().min(10),
          nomeConjuge: z.string().optional(),
          cpfConjuge: z.string().optional(),
          emailConjuge: z.string().optional(),
          telefoneConjuge: z.string().optional(),
          produto: z.enum(["Home Equity", "Auto Equity", "Rural Equity", "Imóvel em Construção"]),
          valorSolicitado: z.string(),
          prazo: z.number().min(1),
          finalidade: z.string().min(3),
          contextoOperacao: z.string().optional(),
          prioridade: z.enum(["Normal", "Alta"]).default("Normal"),
          statusRascunho: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const codigo = await gerarCodigoOperacao();
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
          valorSolicitado: input.valorSolicitado,
          prazo: input.prazo,
          finalidade: input.finalidade,
          contextoOperacao: input.contextoOperacao,
          assessorId: user.id,
          prioridade: input.prioridade,
          statusRascunho: input.statusRascunho,
          statusMacro: "Pré-cadastro",
          statusValidacaoIa: "Não analisado",
        });

        await inicializarChecklist(codigo, input.produto);
        await addLog({ evento: "operacao_criada", detalhe: { codigo }, usuarioId: user.id });
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
        return { success: true };
      }),

    excluir: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await softDeleteOperacao(input.id);
        await addLog({ evento: "operacao_excluida", detalhe: { id: input.id }, usuarioId: (ctx.user as any).id, operacaoId: input.id });
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
        const key = `operacoes/${input.operacaoId}/docs/${Date.now()}-${input.fileName}`;
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
          const key = `operacoes/${input.operacaoId}/complementares/${Date.now()}-${input.fileName}`;
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

        const docsInfo = docs.map((d) => ({
          id: d.id,
          nome: d.nomeDocumento,
          categoria: d.categoria,
          estado: d.estado,
          temArquivo: !!d.arquivoUrl,
        }));

        const systemPrompt = `Você é um assistente de validação documental da Ativa Soluções, especializado em crédito com garantia real.
PAPEL: Validar documentos enviados para operações de crédito. A aprovação final permanece com o analista humano.
AO RECEBER DOCUMENTOS: (1) Confirme se o documento é o que se declara ser. (2) Sinalize: ilegível, vencido, inconsistente, documento incorreto. (3) Extraia dados relevantes. (4) Atribua semáforo: verde (ok) / amarelo (atenção) / vermelho (problema).
RETORNE JSON com array "documentos" onde cada item tem: { "id": number, "nome": string, "semaforo": "verde"|"amarelo"|"vermelho", "observacao": string, "dados_extraidos": {} }
REGRAS: NUNCA invente dados. Objetivo e técnico. Responda APENAS com JSON válido.`;

        const userMessage = `Analise os seguintes documentos da operação ${op.codigoOperacao} (${op.produto}):
Cliente: ${op.nomeCliente}
Documentos: ${JSON.stringify(docsInfo, null, 2)}

Retorne análise JSON para cada documento.`;

        const inicio = Date.now();
        let analiseId: number | undefined;

        try {
          const analises = await getAnalisesByOperacao(input.operacaoId);
          const analiseRecente = analises.find((a) => a.statusProcessamento === "processando" && a.camada === "documental");
          analiseId = analiseRecente?.id;

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
          const temProblema = docs_result.some((d: any) => d.semaforo === "vermelho");
          const novoStatusIa = temProblema ? "Pendência encontrada" : "Validado";

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
            await updateAnaliseIa(analiseId, {
              statusProcessamento: "erro",
              erroProcessamento: err.message,
            });
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

        const systemPrompt = `Você é um analista de garantias da Ativa Soluções, especializado em crédito com garantia real (imóvel, veículo, rural).
Com base nos documentos enviados, extraia as informações da garantia.
RETORNE JSON com os campos: {
  "tipoGarantia": string,
  "endereco": string,
  "matricula": string,
  "metragem": string,
  "cidade": string,
  "estado": string,
  "tipoImovel": string,
  "situacaoDocumental": string,
  "valorEstimado": string,
  "ltvEstimado": number,
  "observacoes": string
}
Se um campo não puder ser determinado, use null.
NUNCA invente dados. Baseie-se apenas nos documentos fornecidos.`;

        const userMessage = `Extraia os dados da garantia para a operação ${op.codigoOperacao}:
Produto: ${op.produto}
Cliente: ${op.nomeCliente}
Valor Solicitado: R$ ${op.valorSolicitado}
Documentos enviados: ${JSON.stringify(docsEnviados.map((d) => ({ nome: d.nomeDocumento, categoria: d.categoria, estado: d.estado })), null, 2)}`;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
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

          // Criar ou atualizar garantia
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
            valorEstimado: resultado.valorEstimado ? String(resultado.valorEstimado).replace(/[^0-9.,]/g, "").replace(",", ".") : undefined,
            ltvEstimado: resultado.ltvEstimado ? String(resultado.ltvEstimado) : undefined,
            preenchidoPorIa: true,
            dadosExtrasJson: { observacoes: resultado.observacoes },
          };

          if (garantiasExistentes.length > 0) {
            await updateGarantia(garantiasExistentes[0].id, garantiaData);
          } else {
            await createGarantia({ operacaoId: input.operacaoId, ...garantiaData });
          }

          return { success: true, resultado };
        } catch (err: any) {
          if (analiseId) {
            await updateAnaliseIa(analiseId, {
              statusProcessamento: "erro",
              erroProcessamento: err.message,
            });
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

        const [analises, garantiasOp] = await Promise.all([
          getAnalisesByOperacao(input.operacaoId),
          getGarantiasByOperacao(input.operacaoId),
        ]);

        const analiseDocumental = analises.find((a) => a.camada === "documental" && a.statusProcessamento === "concluido");
        const analiseGarantia = analises.find((a) => a.camada === "garantia" && a.statusProcessamento === "concluido");
        const garantia = garantiasOp[0];

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

        const systemPrompt = `Você é um Analista de Crédito Sênior da Ativa Soluções, especializado em operações de crédito com garantia real.
PAPEL: Gerar revisão completa para apresentação em comitê de crédito e envio às Instituições Financeiras.
TOM: Sempre comercial e positivo. A IA NÃO reprova operações — ajuda a estruturar a melhor defesa possível.
RETORNE JSON com os campos:
{
  "resumoOperacional": string (2-3 parágrafos resumindo a operação),
  "parecerComercial": string (avaliação comercial positiva do cliente),
  "defesaOperacao": string (argumentos para aprovação, máx 2000 chars),
  "analiseDocumental": string (resumo da situação documental),
  "conclusao": string (parecer final positivo e recomendação)
}
REGRAS: NUNCA invente dados. NUNCA reprove a operação. Foque nos pontos positivos. Máx 2000 chars por campo.`;

        const userMessage = `Gere revisão completa para a operação ${op.codigoOperacao}:
Produto: ${op.produto}
Cliente: ${op.nomeCliente}
Valor Solicitado: R$ ${op.valorSolicitado}
Prazo: ${op.prazo} meses
Finalidade: ${op.finalidade}
Estado Civil: ${op.estadoCivil}
Contexto da Operação: ${op.contextoOperacao ?? op.observacoesEstrategicas ?? "Não informado"}
Garantia: ${garantia ? JSON.stringify({ tipo: garantia.tipoGarantia, valor: garantia.valorEstimado, ltv: garantia.ltvEstimado, cidade: garantia.cidade }) : "Não disponível"}
Análise Documental: ${analiseDocumental ? JSON.stringify(analiseDocumental.resultadoJson) : "Não disponível"}`;

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

          // Notificar Admin (Renata)
          await notifyOwner({
            title: `✅ Operação ${op.codigoOperacao} pronta para validação`,
            content: `A operação ${op.codigoOperacao} de ${op.nomeCliente} (${op.produto}) concluiu a revisão IA e está pronta para validação humana e distribuição às IFs.`,
          }).catch(() => {});

          return { success: true, resultado };
        } catch (err: any) {
          if (analiseId) {
            await updateAnaliseIa(analiseId, {
              statusProcessamento: "erro",
              erroProcessamento: err.message,
            });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na revisão: " + err.message });
        }
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
          nomeInstituicao: z.string().min(2),
          dataEnvio: z.string().optional(),
          prazoRetornoEstimado: z.string().optional(),
          proximaAcao: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await createIF({
          operacaoId: input.operacaoId,
          nomeInstituicao: input.nomeInstituicao,
          dataEnvio: input.dataEnvio ? new Date(input.dataEnvio) : undefined,
          prazoRetornoEstimado: input.prazoRetornoEstimado ? new Date(input.prazoRetornoEstimado) : undefined,
          responsavelEnvio: (ctx.user as any).id,
          proximaAcao: input.proximaAcao,
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
});

export type AppRouter = typeof appRouter;

// ─── Helper: inicializar checklist por produto ────────────────────────────────

async function inicializarChecklist(codigoOperacao: string, produto: string) {
  const ops = await getOperacoes({ busca: codigoOperacao });
  const op = ops.find((o) => o.codigoOperacao === codigoOperacao);
  if (!op) return;

  const checklistPorProduto: Record<string, { nome: string; categoria: string }[]> = {
    "Home Equity": [
      { nome: "RG ou CNH", categoria: "Pessoal" },
      { nome: "CPF", categoria: "Pessoal" },
      { nome: "Comprovante de residência (até 90 dias)", categoria: "Pessoal" },
      { nome: "IRPF — declaração + recibo", categoria: "Pessoal" },
      { nome: "Certidão de estado civil", categoria: "Pessoal" },
      { nome: "Extratos bancários PF — 3 meses", categoria: "Renda" },
      { nome: "Contracheques — 3 meses (CLT)", categoria: "Renda" },
      { nome: "Matrícula atualizada do imóvel", categoria: "Imóvel" },
      { nome: "IPTU com metragem", categoria: "Imóvel" },
      { nome: "Fotos do imóvel (frente/fundos/lateral/interna)", categoria: "Imóvel" },
      { nome: "Escritura (se disponível)", categoria: "Imóvel" },
    ],
    "Auto Equity": [
      { nome: "RG ou CNH", categoria: "Pessoal" },
      { nome: "CPF", categoria: "Pessoal" },
      { nome: "Comprovante de residência (até 90 dias)", categoria: "Pessoal" },
      { nome: "IRPF — declaração + recibo", categoria: "Pessoal" },
      { nome: "Certidão de estado civil", categoria: "Pessoal" },
      { nome: "Extratos bancários PF — 3 meses", categoria: "Renda" },
      { nome: "CRLV", categoria: "Veículo" },
      { nome: "Fotos do veículo (frente/traseira/laterais/painel/km)", categoria: "Veículo" },
      { nome: "Comprovante de quitação ou extrato de financiamento", categoria: "Veículo" },
    ],
    "Rural Equity": [
      { nome: "RG ou CNH", categoria: "Pessoal" },
      { nome: "CPF", categoria: "Pessoal" },
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
      { nome: "RG ou CNH", categoria: "Pessoal" },
      { nome: "CPF", categoria: "Pessoal" },
      { nome: "Comprovante de residência (até 90 dias)", categoria: "Pessoal" },
      { nome: "IRPF — declaração + recibo", categoria: "Pessoal" },
      { nome: "Certidão de estado civil", categoria: "Pessoal" },
      { nome: "Extratos bancários PF — 3 meses", categoria: "Renda" },
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
    });
  }
}
