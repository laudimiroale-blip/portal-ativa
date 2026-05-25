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

// ─── Rate Limiting em memória para procedures de IA ────────────────────────
// Máx 3 chamadas por usuário por minuto
const IA_RATE_LIMIT = 3;
const IA_RATE_WINDOW_MS = 60_000;
const iaRateLimitMap = new Map<number, { count: number; resetAt: number }>();

function checkIaRateLimit(userId: number): void {
  const now = Date.now();
  const entry = iaRateLimitMap.get(userId);
  if (!entry || now >= entry.resetAt) {
    iaRateLimitMap.set(userId, { count: 1, resetAt: now + IA_RATE_WINDOW_MS });
    return;
  }
  if (entry.count >= IA_RATE_LIMIT) {
    const restante = Math.ceil((entry.resetAt - now) / 1000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Limite de chamadas de IA atingido. Aguarde ${restante}s antes de tentar novamente.`,
    });
  }
  entry.count++;
}

// Limpar entradas expiradas a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  Array.from(iaRateLimitMap.entries()).forEach(([key, val]) => {
    if (now >= val.resetAt) iaRateLimitMap.delete(key);
  });
}, 300_000);

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
        const rawContent = response?.choices?.[0]?.message?.content;
        const conteudo = typeof rawContent === "string" ? rawContent : (rawContent ? JSON.stringify(rawContent) : "{}");
        const resultadoJson = extrairJSON(conteudo);
        const tokens = response?.usage?.total_tokens ?? 0;
        if (analiseId) {
          await updateAnaliseIa(analiseId, { resultadoJson, resultadoTexto: conteudo, tokensConsumidos: tokens, custoEstimado: String(tokens * 0.000003), tempoProcessamento: tempo, statusProcessamento: "concluido", modeloUtilizado: response?.model ?? "llm" });
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
        const rawContent = response?.choices?.[0]?.message?.content;
        const conteudo = typeof rawContent === "string" ? rawContent : "{}";
        const resultado = extrairJSON(conteudo);
        const tokens = response?.usage?.total_tokens ?? 0;
        if (analiseId) await updateAnaliseIa(analiseId, { resultadoJson: resultado, resultadoTexto: conteudo, tokensConsumidos: tokens, statusProcessamento: "concluido", modeloUtilizado: response?.model ?? "llm" });

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

  // ─── Status da conferência assíncrona ────────────────────────────────────────
  statusConferencia: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      if (user.perfil !== "admin" && (op as any).assessorId !== user.id) throw new TRPCError({ code: "FORBIDDEN" });

      // Buscar última análise documental
      const analises = await getAnalisesByOperacao(input.operacaoId);
      const analiseAtiva = analises
        .filter((a) => a.camada === "documental")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      return {
        analisandoIa: (op as any).analisandoIa ?? false,
        progressoIa: (op as any).progressoIa ?? 0,
        statusProcessamento: analiseAtiva?.statusProcessamento ?? "idle",
        resultado: analiseAtiva?.statusProcessamento === "concluido" ? analiseAtiva.resultadoJson : null,
        erro: analiseAtiva?.statusProcessamento === "erro" ? analiseAtiva.erroProcessamento : null,
      };
    }),

  // ─── Iniciar conferência assíncrona (não bloqueia UI) ───────────────────────
  iniciarConferencia: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      checkIaRateLimit(user.id);
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      if (user.perfil !== "admin" && (op as any).assessorId !== user.id) throw new TRPCError({ code: "FORBIDDEN" });

      // Verificar se já está analisando
      if ((op as any).analisandoIa) {
        return { iniciado: false, mensagem: "Análise já em andamento" };
      }

      const docs = await getDocumentosByOperacao(input.operacaoId);
      const docsAtivos = docs.filter((d: any) => !d.naoAplicavel);
      const docsEnviados = docsAtivos.filter((d: any) => d.arquivoUrl);

      if (docsEnviados.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum documento enviado. Envie os documentos antes de conferir." });
      }

      // Marcar como analisando e retornar imediatamente
      await updateOperacao(input.operacaoId, { analisandoIa: true, progressoIa: 5 } as any);
      await createAnaliseIa({ operacaoId: input.operacaoId, camada: "documental", statusProcessamento: "processando", geradoPor: user.id, modeloUtilizado: "built-in-llm" });

      // Disparar análise em background (sem await)
      setImmediate(async () => {
        try {
          // Progresso: 10% — buscando versões
          await updateOperacao(input.operacaoId, { progressoIa: 10 } as any);

          const todasVersoes: Record<number, string[]> = {};
          for (const doc of docsEnviados) {
            try {
              const versoes = await getVersoesDocumento(doc.id);
              todasVersoes[doc.id] = versoes.map((v: any) => v.arquivoUrl).filter(Boolean);
            } catch {
              todasVersoes[doc.id] = doc.arquivoUrl ? [doc.arquivoUrl] : [];
            }
          }

          // Progresso: 25% — preparando análise
          await updateOperacao(input.operacaoId, { progressoIa: 25 } as any);

          const docsPendentes = docsAtivos.filter((d: any) => !d.arquivoUrl);

          const systemPrompt = `Você é um Analista Documental Sênior da Ativa Soluções, especializado em crédito com garantia real (Home Equity, Auto Equity, Rural Equity, Imóvel em Construção).

SUA MISSÃO: Realizar pré-análise documental completa, extrair dados estruturados e gerar inteligência operacional.

INSTRUÇÃO FUNDAMENTAL: Você receberá os arquivos reais dos documentos (PDFs e imagens). Leia o CONTEÚDO REAL de cada arquivo — não apenas o nome do campo. Identifique o tipo real do documento pelo seu conteúdo. NUNCA avalie apenas pelo nome do campo.

=== CAMADA 1: ANÁLISE DOCUMENTAL ===
PARA CADA DOCUMENTO ANALISE:
1. Tipo real: leia o conteúdo e identifique o tipo real (CNH, RG, CPF, Matrícula, IPTU, Extrato Bancário, Holerite, IRPF, Certidão, Escritura, etc.)
2. Correspondência: o documento enviado é realmente o que o campo solicita?
3. Legibilidade: está legível, sem cortes, sem partes ilegíveis?
4. Validade: está dentro do prazo? (Matrícula: máx 30 dias; IPTU: exercício atual; Extrato: últimos 3 meses; CNH/RG: não vencido)
5. Pertinência ao titular: CPF/nome bate com o tomador?
6. Completude: está completo ou faltam páginas?
7. Duplicidade: o mesmo documento foi enviado em campos diferentes?

SEMÁFORO: verde=válido | amarelo=ressalva | vermelho=ausente/vencido/ilegível/incorreto

=== CAMADA 2: PERFILAMENTO DO TOMADOR ===
Extraia: nome_completo, cpf, rg, data_nascimento, estado_civil, telefone, email, endereco_residencial, profissao, empresa, participacao_societaria, renda_mensal_estimada, faturamento_mensal, saldo_medio_estimado, movimentacao_financeira, banco, renda_declarada, patrimonio_aparente

=== CAMADA 3: PERFILAMENTO DA GARANTIA ===
IMÓVEL: matricula_imovel, cartorio, iptu, area_total, area_construida, onus, alienacao, hipoteca, penhora, liquidez_aparente, endereco_imovel, cidade_imovel, uf_imovel, titularidade
RURAL: hectares, car, ccir, itr, atividade_explorada, produtividade_aparente
VEÍCULO: marca, modelo, ano_veiculo, placa, renavam, alienacao_veiculo, debitos_veiculo

=== CAMADA 4: LEITURA OPERACIONAL ===
perfil_patrimonial, perfil_financeiro, grau_organizacao_documental (alto/médio/baixo), complexidade_operacao (simples/média/complexa), mitigadores_risco [], fragilidades [], aderencia_bancaria_aparente (alta/média/baixa)

RETORNE JSON ESTRITAMENTE NESTE FORMATO:
{"documentos":[{"id":0,"nome":"","semaforo":"verde","tipo_identificado":"","legivel":true,"pertence_ao_cliente":null,"observacao":"","dados_extraidos":{"titular_identificado":null,"data_emissao":null,"validade":null,"numero_documento":null}}],"dados_extraidos_operacao":{"nome_completo":null,"cpf":null,"rg":null,"data_nascimento":null,"estado_civil":null,"telefone":null,"email":null,"endereco_residencial":null,"profissao":null,"empresa":null,"participacao_societaria":null,"renda_mensal_estimada":null,"faturamento_mensal":null,"saldo_medio_estimado":null,"movimentacao_financeira":null,"banco":null,"renda_declarada":null,"patrimonio_aparente":null,"matricula_imovel":null,"cartorio":null,"iptu":null,"area_total":null,"area_construida":null,"onus":null,"alienacao":null,"hipoteca":null,"penhora":null,"liquidez_aparente":null,"endereco_imovel":null,"cidade_imovel":null,"uf_imovel":null,"titularidade":null,"hectares":null,"car":null,"ccir":null,"itr":null,"atividade_explorada":null,"produtividade_aparente":null,"marca":null,"modelo":null,"ano_veiculo":null,"placa":null,"renavam":null,"alienacao_veiculo":null,"debitos_veiculo":null},"leitura_operacional":{"perfil_patrimonial":null,"perfil_financeiro":null,"grau_organizacao_documental":null,"complexidade_operacao":null,"mitigadores_risco":[],"fragilidades":[],"aderencia_bancaria_aparente":null},"pendencias_criticas":[],"pendencias_secundarias":[],"documentos_ausentes":[],"situacao_geral":"Pendências secundárias","pode_prosseguir":true,"resumo_documental":""}
RESPONDA APENAS com JSON válido.`;

          const contentParts: any[] = [{
            type: "text",
            text: `Pré-análise documental da operação ${(op as any).codigoOperacao}.\nProduto: ${(op as any).produto} | Cliente: ${(op as any).nomeCliente} (CPF: ${(op as any).cpf}) | Estado Civil: ${(op as any).estadoCivil} | Valor: R$ ${Number((op as any).valorSolicitado).toLocaleString("pt-BR")}\nCHECKLIST (${docsAtivos.length} ativos):\n${docsAtivos.map((d: any) => `- [${d.arquivoUrl ? "ENVIADO" : "PENDENTE"}] ID:${d.id} | ${d.nomeDocumento}`).join("\n")}\nAUSENTES: ${docsPendentes.map((d: any) => d.nomeDocumento).join(", ") || "Nenhum"}`,
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
            contentParts.push({ type: "text", text: `[Documento: ID=${doc.id} | ${doc.nomeDocumento}]` });
            arquivosAdicionados++;
          }

          // Progresso: 40% — chamando IA
          await updateOperacao(input.operacaoId, { progressoIa: 40 } as any);

          const response = await invokeLLM({ messages: [{ role: "system", content: systemPrompt }, { role: "user", content: contentParts }] });

          // Progresso: 80% — processando resultado
          await updateOperacao(input.operacaoId, { progressoIa: 80 } as any);

          const rawContent = response?.choices?.[0]?.message?.content;
          const conteudo = typeof rawContent === "string" ? rawContent : (rawContent ? JSON.stringify(rawContent) : "{}");
          const resultado = extrairJSON(conteudo);

          const podeProsseguir = resultado.pode_prosseguir === true;
          const novoStatusMacro = podeProsseguir ? "Documentação completa" : "Aguardando documentos";

          await updateOperacao(input.operacaoId, {
            statusValidacaoIa: podeProsseguir ? "Validado" : "Pendência encontrada",
            statusMacro: novoStatusMacro,
            analisandoIa: false,
            progressoIa: 100,
          } as any);
          await addHistoricoStatus({ operacaoId: input.operacaoId, statusAnterior: (op as any).statusMacro, statusNovo: novoStatusMacro, alteradoPor: user.id });

          // Salvar dados extraídos
          if (resultado.dados_extraidos_operacao || resultado.leitura_operacional) {
            const jsonEstruturado = {
              cliente: resultado.dados_extraidos_operacao ?? {},
              garantia: { matricula_imovel: resultado.dados_extraidos_operacao?.matricula_imovel, cartorio: resultado.dados_extraidos_operacao?.cartorio, iptu: resultado.dados_extraidos_operacao?.iptu, area_total: resultado.dados_extraidos_operacao?.area_total, onus: resultado.dados_extraidos_operacao?.onus, alienacao: resultado.dados_extraidos_operacao?.alienacao, hectares: resultado.dados_extraidos_operacao?.hectares, car: resultado.dados_extraidos_operacao?.car, marca: resultado.dados_extraidos_operacao?.marca, modelo: resultado.dados_extraidos_operacao?.modelo, placa: resultado.dados_extraidos_operacao?.placa },
              financeiro: { renda_mensal_estimada: resultado.dados_extraidos_operacao?.renda_mensal_estimada, faturamento_mensal: resultado.dados_extraidos_operacao?.faturamento_mensal, saldo_medio_estimado: resultado.dados_extraidos_operacao?.saldo_medio_estimado, renda_declarada: resultado.dados_extraidos_operacao?.renda_declarada, banco: resultado.dados_extraidos_operacao?.banco },
              documentacao: { situacao_geral: resultado.situacao_geral, pode_prosseguir: resultado.pode_prosseguir, checklist_total: docsAtivos.length, checklist_concluidos: docsEnviados.length },
              risco: resultado.leitura_operacional ?? {},
              pendencias: { criticas: resultado.pendencias_criticas ?? [], secundarias: resultado.pendencias_secundarias ?? [], ausentes: resultado.documentos_ausentes ?? [] },
            };
            await updateOperacao(input.operacaoId, { perfilExtraidoJson: jsonEstruturado } as any);
          }

          // Salvar resultado na análise
          const analisesAtual = await getAnalisesByOperacao(input.operacaoId);
          const analiseId = analisesAtual.filter((a) => a.statusProcessamento === "processando" && a.camada === "documental").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.id;
          if (analiseId) {
            await updateAnaliseIa(analiseId, { resultadoJson: resultado, resultadoTexto: conteudo, tokensConsumidos: response?.usage?.total_tokens ?? 0, statusProcessamento: "concluido", modeloUtilizado: response?.model ?? "llm" });
          }

          if (podeProsseguir) {
            const admins = await getAdmins();
            for (const admin of admins) {
              await createNotificacao({ usuarioId: admin.id, operacaoId: input.operacaoId, tipo: "documentacao_completa", mensagem: `Documentação de ${(op as any).nomeCliente} (${(op as any).codigoOperacao}) validada pela IA.` });
            }
          }
        } catch (err: any) {
          console.error("[iniciarConferencia] Erro em background:", err.message);
          await updateOperacao(input.operacaoId, { analisandoIa: false, progressoIa: 0 } as any);
          const analisesErr = await getAnalisesByOperacao(input.operacaoId);
          const analiseErrId = analisesErr.filter((a) => a.statusProcessamento === "processando" && a.camada === "documental").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.id;
          if (analiseErrId) await updateAnaliseIa(analiseErrId, { statusProcessamento: "erro", erroProcessamento: err.message });
        }
      });

      return { iniciado: true, mensagem: "Análise iniciada em background. Use statusConferencia para acompanhar o progresso." };
    }),

  // ─── Conferência documental (consultor — Etapa 3) ──────────────────────────
  conferirDocumentos: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      checkIaRateLimit(user.id);
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

INSTRUÇÃO FUNDAMENTAL: Você receberá os arquivos reais dos documentos (PDFs e imagens). Leia o CONTEÚO REAL de cada arquivo — não apenas o nome do campo. Identifique o tipo real do documento pelo seu conteúdo (ex: se o arquivo tem "CARTEIRA NACIONAL DE HABILITAÇÃO" impresso, é uma CNH; se tem "MATRÍCULA DO IMÓVEL" e número de matrícula, é uma matrícula). NUNCA avalie apenas pelo nome do campo.

=== CAMADA 1: ANÁLISE DOCUMENTAL ===
PARA CADA DOCUMENTO ANALISE:
1. Tipo real: leia o conteúdo e identifique o tipo real do documento (CNH, RG, CPF, Matrícula, IPTU, Extrato Bancário, Holerite, IRPF, Certidão, Escritura, etc.)
2. Correspondência: o documento enviado é realmente o que o campo solicita?
3. Legibilidade: está legível, sem cortes, sem partes ilegíveis, sem borramentos?
4. Validade: está dentro do prazo? (Matrícula: máx 30 dias; IPTU: exercício atual; Extrato: últimos 3 meses; CNH/RG: não vencido; Certidões: máx 90 dias)
5. Pertinência ao titular: o CPF/nome no documento bate com o tomador ou cônjuge declarado?
6. Completude: está completo ou faltam páginas/verso?
7. Consistência: dados do documento batem com os demais documentos da operação?
8. Duplicidade: o mesmo documento foi enviado em campos diferentes?

DETECÇÃO AUTOMÁTICA:
- Documento vencido: marcar semaforo=vermelho com motivo "Documento vencido em [data]"
- CPF/nome divergente: marcar semaforo=vermelho com motivo "CPF/nome não corresponde ao titular"
- Documento ilegível: marcar semaforo=vermelho com motivo "Imagem ilegível — [detalhe]"
- Documento incorreto (ex: enviou extrato no campo de matrícula): marcar semaforo=vermelho com motivo "Documento incorreto: enviado [tipo real], esperado [tipo correto]"
- Documento duplicado: marcar semaforo=amarelo com motivo "Possível duplicata do documento [campo]"

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

      const systemPrompt = `Você é um analista de crédito sênior especializado em operações com garantia real. Sua função é gerar uma DEFESA DE CRÉDITO institucional, técnica, objetiva e persuasiva, semelhante às utilizadas por assessorias premium, bancos, fundos, FIDCs e securitizadoras.

REGRAS OBRIGATÓRIAS:
- Nunca inventar informações
- Nunca criar renda inexistente
- Nunca mencionar documentos não enviados
- Não usar emojis, bullet points ou tópicos
- Não usar linguagem comercial agressiva
- Não usar linguagem informal
- Máximo de 2.000 caracteres (preferencialmente entre 1.200 e 1.800)

ESTILO:
- Linguagem bancária e institucional
- Tom de underwriting profissional
- Parágrafos curtos e fluidos
- Alta densidade de informação relevante
- Semelhante a parecer bancário ou análise financeira consultiva

ESTRUTURA OBRIGATÓRIA (nesta ordem):
1. ABERTURA: valor solicitado, finalidade e objetivo econômico da operação (capital de giro, reorganização financeira, expansão, fortalecimento operacional, etc.)
2. PERFIL DO CLIENTE: profissão, atividade econômica, renda, faturamento, capacidade financeira, estabilidade operacional. Se rural: atividade agropecuária, produtividade, exploração. Se PJ: faturamento, recorrência de receitas, estrutura empresarial.
3. GARANTIA OFERTADA: tipo, localização, características, estrutura, padrão, liquidez, potencial patrimonial. Se rural: hectares, benfeitorias, acesso, produtividade. Se construção: estágio da obra, alvará, ART/RRT, padrão construtivo.
4. RELAÇÃO GARANTIA X CRÉDITO: calcular LTV automaticamente (valor solicitado ÷ valor da garantia × 100). Enfatizar quando a operação for conservadora e a garantia superior ao crédito. Exemplo: "resultando em uma operação conservadora sob o ponto de vista patrimonial."
5. REGULARIDADE DOCUMENTAL: mencionar apenas os documentos efetivamente enviados (matrícula, IPTU, CAR, CCIR, ITR, IRPF, extratos bancários, contrato social, balanços, etc.)
6. MITIGAÇÃO DE RISCO: reforçar patrimônio sólido, renda recorrente, garantia robusta, baixo LTV, liquidez da garantia.
7. FECHAMENTO: compatibilidade financeira, solidez da operação, suficiência da garantia, capacidade compatível com o crédito.

ADAPTAÇÃO POR PRODUTO:
- Home Equity: focar no imóvel urbano, liquidez, localização
- Auto Equity: focar no veículo, ano, conservação, alienação
- Rural Equity: focar na atividade agropecuária, produtividade, CAR
- Crédito para Construção / Término de Obra: focar no estágio da obra, documentação técnica
- PF: capacidade de pagamento pessoal
- PJ/Empresário: faturamento e estrutura empresarial
- Produtor Rural: exploração econômica e produtividade`;

      // Buscar documentos aprovados para listar na defesa
      const { getDocumentosByOperacao } = await import("../db");
      const documentos = await getDocumentosByOperacao(input.operacaoId);
      const docsAprovados = documentos
        .filter((d: any) => d.estado === "Aprovado" || d.estado === "Enviado")
        .map((d: any) => d.nomeDocumento)
        .join(", ");

      const conjugeInfo = (op as any).nomeConjuge
        ? `Cônjuge: ${(op as any).nomeConjuge} | CPF: ${(op as any).cpfConjuge ?? "N/I"} | Nascimento: ${(op as any).nascimentoConjuge ?? "N/I"} | Profissão: ${(op as any).profissaoConjuge ?? "N/I"}`
        : null;

      const userMessage = `DADOS DA OPERAÇÃO:
Código: ${op.codigoOperacao} | Produto: ${op.produto}
Cliente: ${op.nomeCliente}
Valor Solicitado: R$ ${op.valorSolicitado} | Prazo: ${op.prazo} meses
Finalidade: ${op.finalidade}
Tipo de Garantia: ${tipoGarantia} | Valor da Garantia: R$ ${valorGarantia}
LTV Estimado: ${ltv}
Estado Civil: ${op.estadoCivil ?? "Não informado"}
${conjugeInfo ? `${conjugeInfo}` : ""}
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

DOCUMENTOS EFETIVAMENTE ENVIADOS:
${docsAprovados || "Nenhum documento aprovado até o momento"}
${input.comentario ? `\nComentário do consultor: ${input.comentario}` : ""}`;

      try {
        const response = await invokeLLM({ messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }] });
        const rawContent = response?.choices?.[0]?.message?.content;
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
        const rawContent = response?.choices?.[0]?.message?.content;
        const conteudo = typeof rawContent === "string" ? rawContent : "{}";
        const resultado = extrairJSON(conteudo);
        const tokens = response?.usage?.total_tokens ?? 0;
        if (analiseId) {
          await updateAnaliseIa(analiseId, { resultadoJson: resultado.parte1, resultadoTexto: resultado.parte2, tokensConsumidos: tokens, custoEstimado: String(tokens * 0.000003), tempoProcessamento: tempo, statusProcessamento: "concluido", modeloUtilizado: response?.model ?? "llm" });
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
        const rawContent = response?.choices?.[0]?.message?.content;
        const conteudo = typeof rawContent === "string" ? rawContent : "{}";
        const resultado = extrairJSON(conteudo);
        const tokens = response?.usage?.total_tokens ?? 0;
        if (analiseId) {
          await updateAnaliseIa(analiseId, { resultadoJson: resultado, resultadoTexto: conteudo, tokensConsumidos: tokens, statusProcessamento: "concluido", modeloUtilizado: response?.model ?? "llm" });
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

      const rawContent = response?.choices?.[0]?.message?.content ?? "{}";
      const parsed = extrairJSON(typeof rawContent === "string" ? rawContent : "{}");
      const classificacoes: Array<{ indiceArquivo: number; documentoId: number | null; confianca: string; motivo: string }> =
        parsed.classificacoes ?? input.arquivos.map((_: any, i: number) => ({ indiceArquivo: i, documentoId: null, confianca: "baixa", motivo: "Erro ao classificar" }));

      return { classificacoes, checklistItems };
    }),

  gerarResumoInteligente: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      checkIaRateLimit((ctx.user as any).id);
      const op = await getOperacaoById(input.operacaoId);
      if (!op) throw new TRPCError({ code: "NOT_FOUND" });
      const user = ctx.user as any;
      if (user.perfil !== "admin" && op.assessorId !== user.id) throw new TRPCError({ code: "FORBIDDEN" });

      const docs = await getDocumentosByOperacao(input.operacaoId);
      const docsAprovados = docs.filter((d: any) => d.estado === "Aprovado" || d.estado === "Validado");
      const docsPendentes = docs.filter((d: any) => d.estado === "Pendente" || d.estado === "Pendência encontrada");

      const perfil = (op as any).perfilExtraidoJson as any;
      const clienteData = perfil?.cliente ?? {};
      const financeiroData = perfil?.financeiro ?? {};

      const systemPrompt = `Você é um analista de crédito sênior da Ativa Soluções Financeiras.
Sua tarefa é gerar um RESUMO EXECUTIVO da operação de crédito para uso interno.
O resumo deve ser objetivo, profissional e ter no máximo 250 palavras.
Estrutura obrigatória:
1. Identificação da Operação (produto, valor, prazo, LTV)
2. Perfil do Tomador (nome, profissão, renda estimada, estado civil)
3. Garantia Ofertada (tipo, valor, situação)
4. Situação Documental (documentos aprovados vs pendentes)
5. Observações Relevantes (pontos de atenção ou diferenciais)
Não use markdown, bullets ou emojis. Use parágrafos curtos e diretos.`;

      const ltv = (op as any).valorSolicitado && (op as any).valorGarantia
        ? ((parseFloat((op as any).valorSolicitado) / parseFloat((op as any).valorGarantia)) * 100).toFixed(1) + "%"
        : "N/D";

      const userMessage = `Operação: ${(op as any).codigoOperacao}
Produto: ${(op as any).produto ?? "N/D"}
Valor Solicitado: R$ ${(op as any).valorSolicitado ?? "N/D"}
Prazo: ${(op as any).prazo ?? "N/D"} meses
LTV: ${ltv}
Finalidade: ${(op as any).finalidade ?? "N/D"}
Tomador: ${(op as any).nomeCliente ?? "N/D"}
CPF: ${(op as any).cpf ?? "N/D"}
Estado Civil: ${(op as any).estadoCivil ?? "N/D"}
Profissão: ${clienteData.profissao ?? "N/D"}
Renda Estimada: ${financeiroData.renda_mensal_estimada ?? "N/D"}
Garantia: ${(op as any).tipoGarantiaDescricao ?? "N/D"} — R$ ${(op as any).valorGarantia ?? "N/D"}
Documentos Aprovados: ${docsAprovados.length}
Documentos Pendentes: ${docsPendentes.length}
Contexto: ${(op as any).contextoOperacao ?? "Não informado"}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });
      const resumo = response?.choices?.[0]?.message?.content ?? "";
      const resumoTexto = typeof resumo === "string" ? resumo : JSON.stringify(resumo);
      await updateOperacao(input.operacaoId, { resumoInteligente: resumoTexto } as any);
      await addLog({ evento: "resumo_inteligente_gerado", detalhe: { operacaoId: input.operacaoId }, usuarioId: user.id, operacaoId: input.operacaoId });
      return { resumo: resumoTexto };
    }),
});
