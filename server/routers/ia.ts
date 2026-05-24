import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addHistoricoStatus,
  addLog,
  createAnaliseIa,
  createGarantia,
  createNotificacao,
  getAdmins,
  getAnalisesByOperacao,
  getDocumentosByOperacao,
  getGarantiasByOperacao,
  getOperacaoById,
  getVersoesDocumento,
  updateAnaliseIa,
  updateGarantia,
  updateOperacao,
  createDocumento,
} from "../db";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import { protectedProcedure, router } from "../_core/trpc";

const adminPerfilProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user as any).perfil !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

// Helper: extrair JSON de string que pode conter markdown
const extrairJSON = (raw: string): any => {
  if (!raw || raw.trim() === "") return {};
  try { return JSON.parse(raw); } catch { /* continua */ }
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) { try { return JSON.parse(match[1].trim()); } catch { /* continua */ } }
  const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) { try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* continua */ } }
  return {};
};

// Helper: construir URL pública para o LLM
const buildPublicUrl = (url: string) => {
  if (!url) return url;
  if (url.startsWith("/manus-storage/") || url.startsWith("/")) {
    return `${process.env.BUILT_IN_FORGE_API_URL?.replace("/api", "") ?? ""}${url}`;
  }
  return url;
};

export const iaRouter = router({
  listar: adminPerfilProcedure
    .input(z.object({ operacaoId: z.number() }))
    .query(async ({ input }) => getAnalisesByOperacao(input.operacaoId)),

  // ─── Análise documental admin (IA sênior completa) ─────────────────────────
  analisarDocumental: adminPerfilProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const docs = await getDocumentosByOperacao(input.operacaoId);
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });

      await createAnaliseIa({ operacaoId: input.operacaoId, camada: "documental", statusProcessamento: "processando", geradoPor: user.id, modeloUtilizado: "built-in-llm" });
      await updateOperacao(input.operacaoId, { statusValidacaoIa: "Em análise", statusMacro: "Em análise IA" });
      await addHistoricoStatus({ operacaoId: input.operacaoId, statusAnterior: op.statusMacro, statusNovo: "Em análise IA", alteradoPor: user.id });

      const docsEnviados = docs.filter((d) => d.arquivoUrl);
      const docsPendentes = docs.filter((d) => !d.arquivoUrl);

      const systemPrompt = `Você é um Analista Documental Sênior da Ativa Soluções, especializado em crédito com garantia real.

ANALISE CADA DOCUMENTO E VERIFIQUE:
1. Tipo e correspondência com o campo solicitado
2. Legibilidade (sem cortes, sem partes ilegíveis)
3. Validade (Matrícula: máx 30 dias; IPTU: exercício atual; Extrato: últimos 3 meses; CNH/RG: não vencido)
4. Pertinência ao titular declarado
5. Completude (não faltam páginas)
6. Consistência com os demais dados da operação

SEMÁFORO: verde=válido | amarelo=ressalva | vermelho=ausente/vencido/ilegível/incorreto

RETORNE JSON:
{
  "documentos": [{"id": number, "nome": string, "semaforo": "verde"|"amarelo"|"vermelho", "observacao": string, "dados_extraidos": {"tipo_identificado": string, "titular_identificado": string|null, "data_emissao": string|null, "validade": string|null, "numero_documento": string|null}}],
  "pendencias": [string],
  "documentos_ausentes": [string],
  "situacao_geral": "Completa"|"Pendente"|"Crítica",
  "resumo_documental": string
}
Responda APENAS com JSON válido, sem markdown.`;

      const contentParts: any[] = [{
        type: "text",
        text: `Conferência documental da operação ${op.codigoOperacao}.\nProduto: ${op.produto} | Cliente: ${op.nomeCliente} (CPF: ${op.cpf})\nDocumentos: ${docs.map((d) => `[${d.arquivoUrl ? "ENVIADO" : "PENDENTE"}] ID:${d.id} | ${d.nomeDocumento}`).join("\n")}`,
      }];

      for (const doc of docsEnviados.slice(0, 10)) {
        const mimeType = doc.arquivoUrl!.toLowerCase().includes(".pdf") ? "application/pdf" : undefined;
        if (mimeType) contentParts.push({ type: "file_url", file_url: { url: doc.arquivoUrl!, mime_type: mimeType } });
        else contentParts.push({ type: "image_url", image_url: { url: doc.arquivoUrl!, detail: "high" } });
        contentParts.push({ type: "text", text: `[Documento acima: ID=${doc.id} | ${doc.nomeDocumento}]` });
      }

      const inicio = Date.now();
      const analises = await getAnalisesByOperacao(input.operacaoId);
      const analiseId = analises.find((a) => a.statusProcessamento === "processando" && a.camada === "documental")?.id;

      try {
        const response = await invokeLLM({ messages: [{ role: "system", content: systemPrompt }, { role: "user", content: contentParts }] });
        const tempo = Date.now() - inicio;
        const rawContent = response.choices[0]?.message?.content;
        const conteudo = typeof rawContent === "string" ? rawContent : "{}";
        const resultadoJson = extrairJSON(conteudo);
        const tokens = response.usage?.total_tokens ?? 0;
        if (analiseId) {
          await updateAnaliseIa(analiseId, { resultadoJson, resultadoTexto: conteudo, tokensConsumidos: tokens, custoEstimado: String(tokens * 0.000003), tempoProcessamento: tempo, statusProcessamento: "concluido", modeloUtilizado: response.model ?? "llm" });
        }
        const temVermelho = (resultadoJson.documentos ?? []).some((d: any) => d.semaforo === "vermelho");
        await updateOperacao(input.operacaoId, { statusValidacaoIa: temVermelho ? "Pendência encontrada" : "Validado", statusMacro: "Em validação humana" });
        await addHistoricoStatus({ operacaoId: input.operacaoId, statusAnterior: "Em análise IA", statusNovo: "Em validação humana", alteradoPor: user.id });
        return { success: true, resultado: resultadoJson };
      } catch (err: any) {
        if (analiseId) await updateAnaliseIa(analiseId, { statusProcessamento: "erro", erroProcessamento: err.message });
        await updateOperacao(input.operacaoId, { statusValidacaoIa: "Não analisado" });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na análise IA: " + err.message });
      }
    }),

  // ─── Preencher garantia automaticamente ────────────────────────────────────
  preencherGarantia: adminPerfilProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      const docs = await getDocumentosByOperacao(input.operacaoId);
      const docsEnviados = docs.filter((d) => d.arquivoUrl);

      await createAnaliseIa({ operacaoId: input.operacaoId, camada: "garantia", statusProcessamento: "processando", geradoPor: user.id, modeloUtilizado: "built-in-llm" });
      const analises = await getAnalisesByOperacao(input.operacaoId);
      const analiseId = analises.find((a) => a.statusProcessamento === "processando" && a.camada === "garantia")?.id;

      // Prompt específico por produto
      const produto = op.produto ?? "Home Equity";
      let camposExtracao = "";
      if (produto === "Auto Equity") {
        camposExtracao = `EXTRAIA: marca, modelo, ano_veiculo, placa, renavam, alienacao_veiculo, debitos_veiculo`;
      } else if (produto === "Rural Equity") {
        camposExtracao = `EXTRAIA: area_total (hectares), matricula, car, ccir, itr, georreferenciamento, atividade_explorada, benfeitorias, produtividade_aparente`;
      } else {
        camposExtracao = `EXTRAIA: tipo_imovel, endereco, cidade, estado, matricula, cartorio, metragem (m²), valor_estimado, iptu, inscricao_cadastral, onus, alienacao, hipoteca, penhora, titularidade, padrao_construtivo`;
      }

      const systemPrompt = `Você é um Analista de Garantias Sênior da Ativa Soluções.
${camposExtracao}
RETORNE JSON com os campos extraídos. Use null para campos não encontrados. Sem markdown.`;

      const contentParts: any[] = [{ type: "text", text: `Extraia dados da garantia — Operação: ${op.codigoOperacao} | Produto: ${produto} | Cliente: ${op.nomeCliente} | Valor Solicitado: R$ ${Number(op.valorSolicitado).toLocaleString("pt-BR")}` }];
      for (const doc of docsEnviados.slice(0, 10)) {
        const url = buildPublicUrl(doc.arquivoUrl!);
        const mimeType = doc.arquivoUrl!.toLowerCase().includes(".pdf") ? "application/pdf" : undefined;
        if (mimeType) contentParts.push({ type: "file_url", file_url: { url, mime_type: mimeType } });
        else contentParts.push({ type: "image_url", image_url: { url, detail: "high" } });
        contentParts.push({ type: "text", text: `[${doc.nomeDocumento}]` });
      }

      try {
        const response = await invokeLLM({ messages: [{ role: "system", content: systemPrompt }, { role: "user", content: contentParts }] });
        const rawContent = response.choices[0]?.message?.content;
        const conteudo = typeof rawContent === "string" ? rawContent : "{}";
        const resultado = extrairJSON(conteudo);
        const tokens = response.usage?.total_tokens ?? 0;
        if (analiseId) await updateAnaliseIa(analiseId, { resultadoJson: resultado, resultadoTexto: conteudo, tokensConsumidos: tokens, statusProcessamento: "concluido", modeloUtilizado: response.model ?? "llm" });

        const garantiasExistentes = await getGarantiasByOperacao(input.operacaoId);
        const garantiaData: any = {
          tipoGarantia: resultado.tipoGarantia ?? produto,
          endereco: resultado.endereco ?? resultado.logradouro,
          matricula: resultado.matricula,
          metragem: resultado.metragem ?? resultado.area_total,
          cidade: resultado.cidade,
          estado: resultado.estado,
          tipoImovel: resultado.tipo_imovel ?? resultado.tipoImovel,
          situacaoDocumental: resultado.situacaoDocumental ?? "Analisado automaticamente",
          valorEstimado: resultado.valor_estimado ? String(resultado.valor_estimado).replace(/[^0-9.,]/g, "").replace(",", ".") : undefined,
          ltvEstimado: resultado.ltvEstimado ? String(resultado.ltvEstimado) : undefined,
          preenchidoPorIa: true,
          dadosExtrasJson: { ...resultado },
        };
        if (garantiasExistentes.length > 0) await updateGarantia(garantiasExistentes[0].id, garantiaData);
        else await createGarantia({ operacaoId: input.operacaoId, ...garantiaData });
        return { success: true, resultado };
      } catch (err: any) {
        if (analiseId) await updateAnaliseIa(analiseId, { statusProcessamento: "erro", erroProcessamento: err.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao preencher garantia: " + err.message });
      }
    }),

  // ─── Conferência documental (consultor — Etapa 3) ──────────────────────────
  conferirDocumentos: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      if (user.perfil !== "admin" && op.assessorId !== user.id) throw new TRPCError({ code: "FORBIDDEN" });

      const docs = await getDocumentosByOperacao(input.operacaoId);
      const docsAtivos = docs.filter((d: any) => !d.naoAplicavel);
      const docsEnviados = docsAtivos.filter((d: any) => d.arquivoUrl);
      const docsPendentes = docsAtivos.filter((d: any) => !d.arquivoUrl);

      // Buscar versões para ter URL mais recente
      const todasVersoes: Record<number, string[]> = {};
      for (const doc of docsEnviados) {
        try {
          const versoes = await getVersoesDocumento(doc.id);
          todasVersoes[doc.id] = versoes.map((v: any) => v.arquivoUrl).filter(Boolean);
        } catch {
          todasVersoes[doc.id] = doc.arquivoUrl ? [doc.arquivoUrl] : [];
        }
      }

      const systemPrompt = `Você é um Analista Documental Sênior da Ativa Soluções, especializado em crédito com garantia real (Home Equity, Auto Equity, Rural Equity, Imóvel em Construção).

SUA MISSÃO: Realizar pré-análise documental completa, extrair dados estruturados e gerar inteligência operacional.

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
IMÓVEL URBANO: matricula_imovel, cartorio, iptu, inscricao_cadastral, area_total, area_construida, descricao_imovel, padrao_construtivo, averbacao, onus, alienacao, hipoteca, penhora, inventario, liquidez_aparente, endereco_imovel, cidade_imovel, uf_imovel, titularidade
IMÓVEL RURAL: hectares, car, ccir, itr, georreferenciamento, atividade_explorada, benfeitorias, logistica, produtividade_aparente
VEÍCULO: marca, modelo, ano_veiculo, placa, renavam, alienacao_veiculo, debitos_veiculo

=== CAMADA 4: LEITURA OPERACIONAL ===
- perfil_patrimonial, perfil_financeiro
- grau_organizacao_documental: "alto"|"médio"|"baixo"
- complexidade_operacao: "simples"|"média"|"complexa"
- mitigadores_risco: [string]
- fragilidades: [string]
- aderencia_bancaria_aparente: "alta"|"média"|"baixa"

RETORNE JSON ESTRITAMENTE NESTE FORMATO:
{
  "documentos": [{"id": number, "nome": string, "semaforo": "verde"|"amarelo"|"vermelho", "tipo_identificado": string, "legivel": boolean, "pertence_ao_cliente": boolean|null, "observacao": string, "dados_extraidos": {"titular_identificado": string|null, "data_emissao": string|null, "validade": string|null, "numero_documento": string|null}}],
  "dados_extraidos_operacao": {"nome_completo": null, "cpf": null, "rg": null, "data_nascimento": null, "estado_civil": null, "telefone": null, "email": null, "endereco_residencial": null, "profissao": null, "empresa": null, "participacao_societaria": null, "renda_mensal_estimada": null, "faturamento_mensal": null, "saldo_medio_estimado": null, "movimentacao_financeira": null, "banco": null, "renda_declarada": null, "patrimonio_aparente": null, "matricula_imovel": null, "cartorio": null, "iptu": null, "inscricao_cadastral": null, "area_total": null, "area_construida": null, "descricao_imovel": null, "padrao_construtivo": null, "averbacao": null, "onus": null, "alienacao": null, "hipoteca": null, "penhora": null, "inventario": null, "liquidez_aparente": null, "endereco_imovel": null, "cidade_imovel": null, "uf_imovel": null, "titularidade": null, "hectares": null, "car": null, "ccir": null, "itr": null, "georreferenciamento": null, "atividade_explorada": null, "benfeitorias": null, "logistica": null, "produtividade_aparente": null, "marca": null, "modelo": null, "ano_veiculo": null, "placa": null, "renavam": null, "alienacao_veiculo": null, "debitos_veiculo": null},
  "leitura_operacional": {"perfil_patrimonial": null, "perfil_financeiro": null, "grau_organizacao_documental": null, "complexidade_operacao": null, "mitigadores_risco": [], "fragilidades": [], "aderencia_bancaria_aparente": null},
  "pendencias_criticas": [string],
  "pendencias_secundarias": [string],
  "documentos_ausentes": [string],
  "situacao_geral": "Completa"|"Pendências secundárias"|"Pendências relevantes"|"Necessita regularização"|"Pronta para análise sênior",
  "pode_prosseguir": boolean,
  "resumo_documental": string
}
REGRAS: pode_prosseguir=true apenas se sem documentos vermelhos críticos. NUNCA invente dados. Responda APENAS com JSON válido.`;

      const contentParts: any[] = [{
        type: "text",
        text: `Pré-análise documental da operação ${op.codigoOperacao}.
INFORMAÇÕES: Produto: ${op.produto} | Cliente: ${op.nomeCliente} (CPF: ${op.cpf}) | Estado Civil: ${op.estadoCivil} | Valor: R$ ${Number(op.valorSolicitado).toLocaleString("pt-BR")} | Prazo: ${op.prazo} meses | Finalidade: ${op.finalidade ?? "Não informada"}
CHECKLIST (${docsAtivos.length} ativos, ${docs.filter((d: any) => d.naoAplicavel).length} N/A):
${docsAtivos.map((d: any) => `- [${d.arquivoUrl ? "ENVIADO" : "PENDENTE"}] ID:${d.id} | ${d.nomeDocumento} (${d.categoria})`).join("\n")}
AUSENTES: ${docsPendentes.map((d: any) => d.nomeDocumento).join(", ") || "Nenhum"}`,
      }];

      let arquivosAdicionados = 0;
      for (const doc of docsEnviados) {
        if (arquivosAdicionados >= 10) break;
        const urls = todasVersoes[doc.id] ?? (doc.arquivoUrl ? [doc.arquivoUrl] : []);
        const urlRecente = urls[0];
        if (!urlRecente) continue;
        const publicUrl = buildPublicUrl(urlRecente);
        const mimeType = urlRecente.toLowerCase().includes(".pdf") ? "application/pdf" : undefined;
        if (mimeType) contentParts.push({ type: "file_url", file_url: { url: publicUrl, mime_type: mimeType } });
        else contentParts.push({ type: "image_url", image_url: { url: publicUrl, detail: "high" } });
        contentParts.push({ type: "text", text: `[Documento acima: ID=${doc.id} | ${doc.nomeDocumento} | Categoria: ${doc.categoria}]` });
        arquivosAdicionados++;
      }

      try {
        const response = await invokeLLM({ messages: [{ role: "system", content: systemPrompt }, { role: "user", content: contentParts }] });
        const rawContent = response?.choices?.[0]?.message?.content;
        const conteudo = typeof rawContent === "string" ? rawContent : (rawContent ? JSON.stringify(rawContent) : "{}");
        const resultado = extrairJSON(conteudo);

        const podeProsseguir = resultado.pode_prosseguir === true;
        const situacaoGeral = resultado.situacao_geral ?? (podeProsseguir ? "Pendências secundárias" : "Pendências relevantes");
        const novoStatusMacro = podeProsseguir ? "Documentação completa" : "Aguardando documentos";

        await updateOperacao(input.operacaoId, { statusValidacaoIa: podeProsseguir ? "Validado" : "Pendência encontrada", statusMacro: novoStatusMacro });
        await addHistoricoStatus({ operacaoId: input.operacaoId, statusAnterior: op.statusMacro, statusNovo: novoStatusMacro, alteradoPor: user.id });

        // Salvar dados extraídos no perfilExtraidoJson
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
            documentacao: { situacao_geral: resultado.situacao_geral, pode_prosseguir: resultado.pode_prosseguir, checklist_total: docsAtivos.length, checklist_concluidos: docsEnviados.length },
            risco: resultado.leitura_operacional ?? {},
            pendencias: { criticas: resultado.pendencias_criticas ?? [], secundarias: resultado.pendencias_secundarias ?? [], ausentes: resultado.documentos_ausentes ?? [] },
          };
          await updateOperacao(input.operacaoId, { perfilExtraidoJson: jsonEstruturado });
        }

        if (podeProsseguir) {
          const admins = await getAdmins();
          for (const admin of admins) {
            await createNotificacao({ usuarioId: admin.id, operacaoId: input.operacaoId, tipo: "documentacao_completa", mensagem: `Documentação de ${op.nomeCliente} (${op.codigoOperacao}) validada pela IA — pronta para análise.` });
          }
        }

        const documentosPorStatus = resultado.documentos?.length > 0
          ? resultado.documentos
          : [
              ...docsEnviados.map((d: any) => ({ id: d.id, nome: d.nomeDocumento, semaforo: "verde" as const, tipo_identificado: d.nomeDocumento, legivel: true, pertence_ao_cliente: null, observacao: "Documento recebido — análise automática não disponibilizada", dados_extraidos: { titular_identificado: null, data_emissao: null, validade: null, numero_documento: null } })),
              ...docsPendentes.map((d: any) => ({ id: d.id, nome: d.nomeDocumento, semaforo: "vermelho" as const, tipo_identificado: d.nomeDocumento, legivel: false, pertence_ao_cliente: null, observacao: "Documento não enviado", dados_extraidos: { titular_identificado: null, data_emissao: null, validade: null, numero_documento: null } })),
            ];

        return {
          aprovado: podeProsseguir,
          situacaoGeral,
          documentosPorStatus,
          dadosExtraidos: resultado.dados_extraidos_operacao ?? null,
          leituraOperacional: resultado.leitura_operacional ?? null,
          pendenciasCriticas: resultado.pendencias_criticas ?? [],
          pendenciasSecundarias: resultado.pendencias_secundarias ?? [],
          documentosAusentes: resultado.documentos_ausentes ?? [],
          resumo: resultado.resumo_documental ?? "",
          checklist_total: docsAtivos.length,
          checklist_concluidos: docsEnviados.length,
        };
      } catch (err: any) {
        console.error("[conferirDocumentos] Erro:", err.message);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na conferência documental: " + (err.message ?? "Erro desconhecido") });
      }
    }),

  // ─── Extrair perfil (consultor — Etapa 4) ──────────────────────────────────
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

      const promptText = `Extraia os dados do tomador e da garantia dos documentos da operação ${op.codigoOperacao}.
Cliente: ${op.nomeCliente} (CPF: ${op.cpf}), Produto: ${op.produto}
Estado Civil: ${(op as any).estadoCivil ?? "Não informado"}
Cônjuge: ${(op as any).nomeConjuge ? `${(op as any).nomeConjuge} (CPF: ${(op as any).cpfConjuge})` : "Não informado"}

Retorne JSON ESTRITAMENTE neste formato (use null para campos não encontrados):
{
  "cliente": { "nome_completo": null, "cpf": null, "rg": null, "data_nascimento": null, "estado_civil": null, "telefone": null, "email": null, "endereco_residencial": null, "profissao": null, "empresa": null, "participacao_societaria": null, "patrimonio_aparente": null },
  "financeiro": { "renda_mensal_estimada": null, "faturamento_mensal": null, "saldo_medio_estimado": null, "movimentacao_financeira": null, "renda_declarada": null, "banco": null },
  "garantia": { "matricula_imovel": null, "cartorio": null, "iptu": null, "area_total": null, "area_construida": null, "descricao_imovel": null, "onus": null, "alienacao": null, "hipoteca": null, "penhora": null, "liquidez_aparente": null, "hectares": null, "car": null, "marca": null, "modelo": null, "placa": null },
  "risco": { "perfil_patrimonial": null, "perfil_financeiro": null, "grau_organizacao_documental": null, "aderencia_bancaria_aparente": null, "mitigadores_risco": [], "fragilidades": [] }
}`;

      const contentParts: any[] = [{ type: "text", text: promptText }];
      for (const doc of docsEnviados.slice(0, 10)) {
        const url = buildPublicUrl(doc.arquivoUrl!);
        const ext = doc.arquivoUrl!.toLowerCase().split("?")[0].split(".").pop() ?? "";
        if (ext === "pdf") contentParts.push({ type: "file_url", file_url: { url, mime_type: "application/pdf" } });
        else contentParts.push({ type: "image_url", image_url: { url, detail: "high" } });
        contentParts.push({ type: "text", text: `[Documento: ${doc.nomeDocumento} | Categoria: ${doc.categoria}]` });
      }

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um analista de crédito sênior especializado em extração de dados de documentos. Retorne APENAS JSON válido no formato estruturado solicitado, sem markdown, sem código de bloco." },
            { role: "user", content: contentParts },
          ],
        });
        const rawContent = response?.choices?.[0]?.message?.content;
        let perfilBruto: any = {};
        if (!rawContent || (typeof rawContent === "string" && rawContent.trim() === "")) {
          perfilBruto = { cliente: { nome_completo: op.nomeCliente, cpf: op.cpf, estado_civil: (op as any).estadoCivil ?? null }, financeiro: {}, garantia: {}, risco: { grau_organizacao_documental: "baixo", mitigadores_risco: [], fragilidades: ["Documentos insuficientes para extração automática"] } };
        } else {
          const conteudo = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
          perfilBruto = extrairJSON(conteudo);
        }
        const perfilEstruturado = {
          cliente: perfilBruto.cliente ?? { nome_completo: op.nomeCliente, cpf: op.cpf },
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

  // ─── Gerar Defesa Comercial (consultor) ────────────────────────────────────
  gerarDefesaComercial: protectedProcedure
    .input(z.object({ operacaoId: z.number(), comentario: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      if (user.perfil !== "admin" && op.assessorId !== user.id) throw new TRPCError({ code: "FORBIDDEN" });

      const perfilJson = (op as any).perfilExtraidoJson ?? {};
      const cliente = perfilJson.cliente ?? perfilJson;
      const garantia = perfilJson.garantia ?? {};
      const financeiro = perfilJson.financeiro ?? {};
      const risco = perfilJson.risco ?? {};
      const pendencias = perfilJson.pendencias ?? {};

      const valorGarantia = (op as any).valorGarantia ?? "Não informado";
      const tipoGarantia = (op as any).tipoGarantiaDescricao ?? op.produto;
      const ltv = valorGarantia && op.valorSolicitado && !isNaN(parseFloat(valorGarantia))
        ? ((parseFloat(op.valorSolicitado) / parseFloat(valorGarantia)) * 100).toFixed(1) + "%"
        : "Não calculado";

      const garantiaOp = op as any;
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
        garantia.matricula_imovel || garantiaOp.matriculaImovel ? `Matrícula: ${garantia.matricula_imovel ?? garantiaOp.matriculaImovel}` : null,
        garantia.cartorio ? `Cartório: ${garantia.cartorio}` : null,
        garantia.iptu || garantiaOp.numeroIptu ? `IPTU: ${garantia.iptu ?? garantiaOp.numeroIptu}` : null,
        garantia.area_total || garantiaOp.metragemImovel ? `Área total: ${garantia.area_total ?? garantiaOp.metragemImovel}` : null,
        garantia.area_construida ? `Área construída: ${garantia.area_construida}` : null,
        garantia.descricao_imovel ? `Descrição: ${garantia.descricao_imovel}` : null,
        garantia.endereco_imovel || garantiaOp.enderecoImovel ? `Endereço: ${garantia.endereco_imovel ?? garantiaOp.enderecoImovel}` : null,
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

ESTRUTURA OBRIGATÓRIA:
1. PERFIL DO TOMADOR: Apresente o cliente com dados concretos (profissão, renda, patrimônio, histórico)
2. CAPACIDADE DE PAGAMENTO: Demonstre com números reais (renda, movimentação, saldo, faturamento)
3. GARANTIA: Descreva o bem com dados da matrícula/registro, área, localização, situação jurídica
4. LTV E PROPORCIONALIDADE: Argumente sobre o LTV e margem de segurança
5. FINALIDADE E COERÊNCIA: Conecte a finalidade ao perfil do tomador
6. REGULARIDADE DOCUMENTAL: Mencione a qualidade e completude da documentação
7. PARECER POSITIVO: Conclua com recomendação clara de aprovação

REGRAS: Tom SEMPRE positivo, técnico e institucional | Máximo 2.200 caracteres | NÃO invente informações | Use linguagem de crédito (LTV, CCB, alienação fiduciária, etc.) | Cite números reais quando disponíveis`;

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
        const response = await invokeLLM({ messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }] });
        const rawContent = response.choices[0]?.message?.content;
        const defesa = typeof rawContent === "string" ? rawContent : "";
        await updateOperacao(input.operacaoId, { defesaComercial: defesa } as any);
        return { success: true, defesa };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na geração da defesa: " + err.message });
      }
    }),

  // ─── Enviar para análise ────────────────────────────────────────────────────
  enviarParaAnalise: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      if (user.perfil !== "admin" && op.assessorId !== user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await updateOperacao(input.operacaoId, { statusMacro: "Em validação humana", statusRascunho: false, etapaAtual: 5 } as any);
      await addHistoricoStatus({ operacaoId: input.operacaoId, statusAnterior: op.statusMacro, statusNovo: "Em validação humana", alteradoPor: user.id });
      await notifyOwner({ title: `Nova operação para análise: ${op.codigoOperacao}`, content: `O consultor ${user.name ?? user.email} enviou a operação ${op.codigoOperacao} (${op.produto} — ${op.nomeCliente}) para validação humana.` });
      await addLog({ evento: "operacao_enviada_analise", detalhe: { id: input.operacaoId }, usuarioId: user.id, operacaoId: input.operacaoId });
      return { success: true };
    }),

  // ─── Gerar Defesa (admin — versão completa com análise documental) ──────────
  gerarDefesa: adminPerfilProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      const analises = await getAnalisesByOperacao(input.operacaoId);
      const analiseDocumental = analises.find((a) => a.camada === "documental" && a.statusProcessamento === "concluido");

      await createAnaliseIa({ operacaoId: input.operacaoId, camada: "analista", statusProcessamento: "processando", geradoPor: user.id, modeloUtilizado: "built-in-llm" });
      const analises2 = await getAnalisesByOperacao(input.operacaoId);
      const analiseId = analises2.find((a) => a.statusProcessamento === "processando" && a.camada === "analista")?.id;
      const inicio = Date.now();

      const systemPrompt = `Você é um Analista de Crédito Sênior da Ativa Soluções.
PAPEL: Gerar defesa comercial para apresentação às Instituições Financeiras. Responsabilidade final permanece humana.
RETORNE JSON: { "parte1": { valor_solicitado, valor_estimado_garantia, ltv_estimado, perfil_renda, finalidade, tipo_garantia, regiao, patrimonio_identificado, tipo_cliente, objetivo_financeiro }, "parte2": "Defesa comercial (máx 2000 chars)" }
REGRAS: Tom SEMPRE positivo. NÃO enfatize riscos. NUNCA invente informações.`;

      const userMessage = `Gere defesa comercial para a operação ${op.codigoOperacao}:
Produto: ${op.produto} | Cliente: ${op.nomeCliente} | Valor: R$ ${op.valorSolicitado} | Prazo: ${op.prazo} meses
Finalidade: ${op.finalidade} | Estado Civil: ${op.estadoCivil}
Contexto: ${op.contextoOperacao ?? "Nenhuma"}
Resultado Documental: ${analiseDocumental ? JSON.stringify(analiseDocumental.resultadoJson) : "Não disponível"}`;

      try {
        const response = await invokeLLM({ messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }] });
        const tempo = Date.now() - inicio;
        const rawContent = response.choices[0]?.message?.content;
        const conteudo = typeof rawContent === "string" ? rawContent : "{}";
        const resultado = extrairJSON(conteudo);
        const tokens = response.usage?.total_tokens ?? 0;
        if (analiseId) {
          await updateAnaliseIa(analiseId, { resultadoJson: resultado.parte1, resultadoTexto: resultado.parte2, tokensConsumidos: tokens, custoEstimado: String(tokens * 0.000003), tempoProcessamento: tempo, statusProcessamento: "concluido", modeloUtilizado: response.model ?? "llm" });
        }
        return { success: true, parte1: resultado.parte1, parte2: resultado.parte2 };
      } catch (err: any) {
        if (analiseId) await updateAnaliseIa(analiseId, { statusProcessamento: "erro", erroProcessamento: err.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na geração da defesa: " + err.message });
      }
    }),

  // ─── Revisão completa ───────────────────────────────────────────────────────
  gerarRevisaoCompleta: adminPerfilProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      const [analises, garantiasOp, docs] = await Promise.all([getAnalisesByOperacao(input.operacaoId), getGarantiasByOperacao(input.operacaoId), getDocumentosByOperacao(input.operacaoId)]);
      const analiseDocumental = analises.find((a) => a.camada === "documental" && a.statusProcessamento === "concluido");
      const garantia = garantiasOp[0];
      const docsEnviados = docs.filter((d) => d.arquivoUrl);
      const docsPendentes = docs.filter((d) => !d.arquivoUrl);

      await createAnaliseIa({ operacaoId: input.operacaoId, camada: "revisao", statusProcessamento: "processando", geradoPor: user.id, modeloUtilizado: "built-in-llm" });
      const analisesAtualizadas = await getAnalisesByOperacao(input.operacaoId);
      const analiseId = analisesAtualizadas.find((a) => a.statusProcessamento === "processando" && a.camada === "revisao")?.id;

      const systemPrompt = `Você é um Analista de Crédito Sênior da Ativa Soluções, especializado em operações de crédito com garantia real.
SUA MISSÃO: Gerar revisão completa e defesa de crédito profissional para apresentação em comitê de crédito.
PRINCÍPIOS: Tom SEMPRE comercial, positivo e institucional. A IA NÃO reprova operações — estrutura a melhor defesa possível. NUNCA invente dados.
ESTRUTURA OBRIGATÓRIA (10 seções): 1.Resumo da Operação 2.Perfil do Cliente 3.Finalidade do Crédito 4.Capacidade Financeira 5.Análise da Garantia 6.Situação Documental 7.Mitigadores de Risco 8.LTV Estimado 9.Pendências Identificadas 10.Parecer Preliminar
RETORNE JSON: { "resumoOperacional": string, "perfilCliente": string, "finalidadeCredito": string, "capacidadeFinanceira": string, "analiseGarantia": string, "situacaoDocumental": string, "mitigadoresRisco": string, "ltvEstimado": string, "pendenciasIdentificadas": [string], "parecerPreliminar": string, "defesaComercial": string }`;

      const userMessage = `Revisão completa — Operação ${op.codigoOperacao}:
Produto: ${op.produto} | Cliente: ${op.nomeCliente} (CPF: ${op.cpf}) | Valor: R$ ${op.valorSolicitado} | Prazo: ${op.prazo} meses
Finalidade: ${op.finalidade} | Estado Civil: ${op.estadoCivil}
Documentos enviados: ${docsEnviados.length}/${docs.length} | Pendentes: ${docsPendentes.map((d) => d.nomeDocumento).join(", ") || "Nenhum"}
Garantia: ${garantia ? `${garantia.tipoGarantia} | Matrícula: ${garantia.matricula} | Valor: R$ ${garantia.valorEstimado} | LTV: ${garantia.ltvEstimado}%` : "Não cadastrada"}
Análise documental prévia: ${analiseDocumental ? JSON.stringify(analiseDocumental.resultadoJson) : "Não disponível"}`;

      try {
        const response = await invokeLLM({ messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }] });
        const rawContent = response.choices[0]?.message?.content;
        const conteudo = typeof rawContent === "string" ? rawContent : "{}";
        const resultado = extrairJSON(conteudo);
        const tokens = response.usage?.total_tokens ?? 0;
        if (analiseId) {
          await updateAnaliseIa(analiseId, { resultadoJson: resultado, resultadoTexto: conteudo, tokensConsumidos: tokens, statusProcessamento: "concluido", modeloUtilizado: response.model ?? "llm" });
        }
        if (resultado.defesaComercial) await updateOperacao(input.operacaoId, { defesaComercial: resultado.defesaComercial } as any);
        return { success: true, resultado };
      } catch (err: any) {
        if (analiseId) await updateAnaliseIa(analiseId, { statusProcessamento: "erro", erroProcessamento: err.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro na revisão completa: " + err.message });
      }
    }),

  // ─── Classificar documentos em lote (IA por nome/tipo) ──────────────────────────────────────────────────
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
      });

      const rawContent = response.choices[0]?.message?.content ?? "{}";
      const parsed = extrairJSON(typeof rawContent === "string" ? rawContent : "{}");
      const classificacoes: Array<{ indiceArquivo: number; documentoId: number | null; confianca: string; motivo: string }> =
        parsed.classificacoes ?? input.arquivos.map((_: any, i: number) => ({ indiceArquivo: i, documentoId: null, confianca: "baixa", motivo: "Erro ao classificar" }));

      return { classificacoes, checklistItems };
    }),
});
