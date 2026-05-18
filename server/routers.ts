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
