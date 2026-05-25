import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { exportacoesDossie, documentos, documentosComplementares, operacoes, garantias, users } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { storagePut, storageGetSignedUrl } from "../storage";
// archiver v8 é ESM puro — importar via dynamic import para compatibilidade
type ZipArchiveInstance = {
  on(event: "data", cb: (chunk: Buffer) => void): void;
  on(event: "end", cb: () => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  append(source: NodeJS.ReadableStream | Buffer | string, data: { name: string }): void;
  finalize(): Promise<void>;
};
async function createZipArchive(opts: { zlib: { level: number } }): Promise<ZipArchiveInstance> {
  const mod = await import("archiver");
  const ZipArchiveClass = (mod as any).ZipArchive;
  return new ZipArchiveClass(opts) as ZipArchiveInstance;
}
import PDFDocument from "pdfkit";
import { Readable } from "stream";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Remove acentos, cedilhas, espaços e caracteres especiais */
function sanitizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .replace(/[^a-zA-Z0-9_.\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Determina a pasta e nome canônico do arquivo baseado na categoria e nome do documento */
function resolverPastaENome(
  nomeDocumento: string,
  categoria: string,
  estadoCivil: string | null,
  produto: string,
  indice: number,
): { pasta: string; nomeBase: string } {
  const cat = (categoria || "").toLowerCase();
  const nome = nomeDocumento.toLowerCase();

  // Pasta 04 — Cliente
  if (
    cat.includes("cliente") ||
    cat.includes("tomador") ||
    cat.includes("pessoal") ||
    nome.includes("rg") ||
    nome.includes("cnh") ||
    nome.includes("cpf") ||
    nome.includes("irpf") ||
    nome.includes("extrato") ||
    nome.includes("comprovante de resid") ||
    nome.includes("certid") ||
    nome.includes("holerite") ||
    nome.includes("comprovante de renda")
  ) {
    return { pasta: "04_Documentos_Cliente", nomeBase: sanitizeName(nomeDocumento) };
  }

  // Pasta 05 — Cônjuge
  if (cat.includes("njuge") || nome.includes("njuge")) {
    return { pasta: "05_Documentos_Conjuge", nomeBase: sanitizeName(nomeDocumento) };
  }

  // Pasta 07 — PJ
  if (
    cat.includes("empresarial") ||
    cat.includes("pj") ||
    nome.includes("contrato social") ||
    nome.includes("cnpj") ||
    nome.includes("balan") ||
    nome.includes("faturamento")
  ) {
    return { pasta: "07_Documentos_PJ", nomeBase: sanitizeName(nomeDocumento) };
  }

  // Renomeação canônica: Matrícula atualizada do imóvel → Matricula_Imovel
  if (
    nome.includes("matrícula atualizada") ||
    nome.includes("matricula atualizada") ||
    nome.includes("matrícula do terreno") ||
    nome.includes("matricula do terreno")
  ) {
    return { pasta: "06_Documentos_Garantia", nomeBase: "Matricula_Imovel" };
  }

  // Pasta 06 — Garantia (padrão para documentos de imóvel/veículo/rural)
  return { pasta: "06_Documentos_Garantia", nomeBase: sanitizeName(nomeDocumento) };
}

/** Gera o PDF do Resumo Operacional usando pdfkit */
async function gerarPdfResumo(op: any, garantia: any, pendencias: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const GOLD = "#C9A84C";
    const DARK = "#1A1A1A";
    const GRAY = "#555555";

    // Cabeçalho
    doc.rect(0, 0, doc.page.width, 80).fill(DARK);
    doc.fillColor(GOLD).fontSize(22).font("Helvetica-Bold").text("PORTAL ATIVA", 50, 25);
    doc.fillColor("#AAAAAA").fontSize(10).font("Helvetica").text("DOSSIÊ OPERACIONAL — USO INTERNO E CONFIDENCIAL", 50, 52);

    doc.moveDown(3);

    const section = (title: string) => {
      doc.moveDown(0.5);
      doc.fillColor(GOLD).fontSize(11).font("Helvetica-Bold").text(title.toUpperCase());
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor(GOLD).lineWidth(0.5).stroke();
      doc.moveDown(0.3);
    };

    const field = (label: string, value: string | null | undefined) => {
      if (!value) return;
      doc.fillColor(GRAY).fontSize(9).font("Helvetica-Bold").text(`${label}: `, { continued: true });
      doc.fillColor(DARK).fontSize(9).font("Helvetica").text(value || "—");
    };

    const ltv = op.valorSolicitado && op.valorGarantia
      ? ((Number(op.valorSolicitado) / Number(op.valorGarantia)) * 100).toFixed(1) + "%"
      : "—";

    const fmt = (v: any) =>
      v ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";

    // Dados da Operação
    section("Dados da Operação");
    field("Código ATV", op.codigoOperacao);
    field("Data de Exportação", new Date().toLocaleDateString("pt-BR"));
    field("Produto", op.produto);
    field("Finalidade", op.finalidade);
    field("Valor Solicitado", fmt(op.valorSolicitado));
    field("Valor da Garantia", fmt(op.valorGarantia));
    field("LTV", ltv);
    field("Prazo", op.prazo ? `${op.prazo} meses` : "—");
    field("Consultor Responsável", op.consultor?.nome || "—");

    // Dados do Cliente
    section("Dados do Cliente");
    field("Nome Completo", op.nomeCliente);
    field("CPF", op.cpfTomador);
    field("Estado Civil", op.estadoCivil);
    field("Profissão", op.profissaoTomador);

    // Dados do Cônjuge
    if (op.nomeConjuge) {
      section("Dados do Cônjuge");
      field("Nome Completo", op.nomeConjuge);
      field("CPF", op.cpfConjuge);
    }

    // Dados da Garantia
    if (garantia) {
      section("Dados da Garantia");
      field("Tipo", garantia.tipoGarantia);
      field("Endereço / Localização", garantia.endereco);
      field("Matrícula", garantia.matricula);
      field("Metragem Total", garantia.metragem);
      field("Cidade / Estado", [garantia.cidade, garantia.estado].filter(Boolean).join(" / ") || null);
      if (garantia.dadosExtrasJson) {
        const extras = typeof garantia.dadosExtrasJson === "string"
          ? JSON.parse(garantia.dadosExtrasJson)
          : garantia.dadosExtrasJson;
        if (extras?.numeroIptu) field("Número IPTU", extras.numeroIptu);
        if (extras?.areaTerreno) field("Área do Terreno", extras.areaTerreno);
        if (extras?.areaConstruida) field("Área Construída", extras.areaConstruida);
        if (extras?.observacoes) field("Observações", extras.observacoes);
      }
    }

    // Resumo Inteligente
    if (op.resumoInteligente) {
      section("Resumo Inteligente da Operação");
      doc.fillColor(DARK).fontSize(9).font("Helvetica").text(op.resumoInteligente, { lineGap: 3 });
    }

    // Pendências
    if (pendencias.length > 0) {
      section("Pendências Documentais");
      pendencias.forEach((p) => {
        doc.fillColor("#CC4444").fontSize(9).font("Helvetica").text(`• ${p}`);
      });
    }

    // Rodapé
    const footerY = doc.page.height - 40;
    doc.moveTo(50, footerY - 5).lineTo(doc.page.width - 50, footerY - 5).strokeColor("#CCCCCC").lineWidth(0.3).stroke();
    doc
      .fillColor(GRAY)
      .fontSize(8)
      .font("Helvetica")
      .text(
        "Documento gerado pelo Portal Ativa Soluções — uso interno e confidencial.",
        50,
        footerY,
        { align: "center", width: doc.page.width - 100 },
      );

    doc.end();
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const distribuicaoRouter = router({
  // ─── Exportar Dossiê ─────────────────────────────────────────────────────
  exportarDossie: protectedProcedure
    .input(z.object({ operacaoId: z.number(), forcarMesmoComPendencias: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx.user as any).id;

      // 1. Buscar operação completa
      const db = (await getDb())!;
      const [op] = await db
        .select()
        .from(operacoes)
        .where(and(eq(operacoes.id, input.operacaoId), isNull(operacoes.deletedAt)));
      if (!op) throw new TRPCError({ code: "NOT_FOUND", message: "Operação não encontrada" });

      // Buscar consultor
      const [consultor] = await db.select({ id: users.id, nome: users.name }).from(users).where(eq(users.id, op.assessorId));
      const opComConsultor = { ...op, consultor };

      // 2. Buscar documentos
      const docs = await db
        .select()
        .from(documentos)
        .where(and(eq(documentos.operacaoId, input.operacaoId), isNull(documentos.deletedAt)));

      // 3. Identificar pendências
      const docsPendentes = docs.filter(
        (d) => !d.naoAplicavel && !d.opcional && (d.estado === "Pendente" || d.estado === "Reprovado" || d.estado === "Ilegível"),
      );
      const pendencias = docsPendentes.map((d) => d.nomeDocumento);

      if (pendencias.length > 0 && !input.forcarMesmoComPendencias) {
        return { success: false, pendencias, requerConfirmacao: true };
      }

      // 4. Buscar garantia
      const [garantia] = await db
        .select()
        .from(garantias)
        .where(and(eq(garantias.operacaoId, input.operacaoId), isNull(garantias.deletedAt)));

      // 5. Montar ZIP em memória
      const archive = await createZipArchive({ zlib: { level: 9 } });
      const zipChunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        archive.on("data", (chunk: Buffer) => zipChunks.push(chunk));
        archive.on("end", resolve);
        archive.on("error", reject);

        const addBuffer = (buf: Buffer, path: string) => {
          const readable = Readable.from(buf);
          archive.append(readable, { name: path });
        };

        // Função assíncrona interna para montar o ZIP
        (async () => {
          try {
            // 01 — Defesa de Crédito
            if (op.defesaComercial) {
              const defesaPdf = await gerarPdfTexto("DEFESA DE CRÉDITO\n\n" + op.defesaComercial, "Defesa de Crédito");
              addBuffer(defesaPdf, "01_Defesa_de_Credito.pdf");
            }

            // 02 — Resumo da Operação
            const resumoPdf = await gerarPdfResumo(opComConsultor, garantia, pendencias);
            addBuffer(resumoPdf, "02_Resumo_da_Operacao.pdf");

            // 03 — Termo SCR (se disponível — placeholder)
            // Futuramente: buscar termoScr assinado e adicionar aqui

            // Mapear documentos por pasta com renomeação
            const contagemPorNome: Record<string, number> = {};
            const docsComArquivo = docs.filter((d) => d.arquivoKey && !d.naoAplicavel);

            for (const doc of docsComArquivo) {
              const { pasta, nomeBase } = resolverPastaENome(
                doc.nomeDocumento,
                doc.categoria,
                op.estadoCivil,
                op.produto,
                0,
              );

              // Determinar extensão do arquivo
              const ext = (doc.arquivoKey || "").split(".").pop()?.toLowerCase() || "pdf";

              // Controle de duplicatas
              contagemPorNome[nomeBase] = (contagemPorNome[nomeBase] || 0) + 1;
              const sufixo = contagemPorNome[nomeBase] > 1 ? `_${String(contagemPorNome[nomeBase]).padStart(2, "0")}` : "";
              const nomeArquivo = `${nomeBase}${sufixo}.${ext}`;

              // Baixar arquivo do S3
              try {
                const signedUrl = await storageGetSignedUrl(doc.arquivoKey!);
                const resp = await fetch(signedUrl);
                if (resp.ok) {
                  const buf = Buffer.from(await resp.arrayBuffer());
                  addBuffer(buf, `${pasta}/${nomeArquivo}`);
                }
              } catch {
                // Arquivo não disponível — pular silenciosamente
              }
            }

            // Documentos complementares
            const docsCompl = await (await getDb())!
              .select()
              .from(documentosComplementares)
              .where(and(eq(documentosComplementares.operacaoId, input.operacaoId), isNull(documentosComplementares.deletedAt)));

            for (const dc of docsCompl) {
              if (!dc.arquivoKey) continue;
              const ext = dc.arquivoKey.split(".").pop()?.toLowerCase() || "pdf";
              const nomeBase = sanitizeName(dc.nomeArquivo.replace(/\.[^.]+$/, ""));
              try {
                const signedUrl = await storageGetSignedUrl(dc.arquivoKey);
                const resp = await fetch(signedUrl);
                if (resp.ok) {
                  const buf = Buffer.from(await resp.arrayBuffer());
                  addBuffer(buf, `08_Documentos_Complementares/${nomeBase}.${ext}`);
                }
              } catch {
                // pular
              }
            }

            archive.finalize();
          } catch (err) {
            reject(err);
          }
        })();
      });

      // 6. Upload do ZIP para S3
      const zipBuffer = Buffer.concat(zipChunks);
      const nomeCliente = sanitizeName(op.nomeCliente.split(" ").slice(0, 2).join("_"));
      const produto = sanitizeName(op.produto);
      const data = new Date().toISOString().slice(0, 10);
      const zipFileName = `dossies/Operacao_${nomeCliente}_${produto}_${data}.zip`;

      const { key: zipKey, url: zipUrl } = await storagePut(zipFileName, zipBuffer, "application/zip");

      // 7. Registrar no histórico
      await (await getDb())!.insert(exportacoesDossie).values({
        operacaoId: input.operacaoId,
        userId,
        status: pendencias.length > 0 ? "com_pendencias" : "completa",
        zipKey,
        zipUrl,
        totalDocs: docs.filter((d) => d.arquivoKey).length,
        pendencias: pendencias.length > 0 ? pendencias : null,
      });

      return { success: true, zipUrl, pendencias, requerConfirmacao: false };
    }),


  // ─── Preview do PDF do Resumo ─────────────────────────────────────────────
  gerarPdfPreview: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [op] = await db
        .select()
        .from(operacoes)
        .where(and(eq(operacoes.id, input.operacaoId), isNull(operacoes.deletedAt)));
      if (!op) throw new TRPCError({ code: "NOT_FOUND", message: "Operação não encontrada" });

      const [consultor] = await db.select({ id: users.id, nome: users.name }).from(users).where(eq(users.id, op.assessorId));
      const opComConsultor = { ...op, consultor };

      const docs = await db
        .select()
        .from(documentos)
        .where(and(eq(documentos.operacaoId, input.operacaoId), isNull(documentos.deletedAt)));

      const docsPendentes = docs.filter(
        (d) => !d.naoAplicavel && !d.opcional && (d.estado === "Pendente" || d.estado === "Reprovado" || d.estado === "Ilegível"),
      );
      const pendencias = docsPendentes.map((d) => d.nomeDocumento);

      const [garantia] = await db
        .select()
        .from(garantias)
        .where(and(eq(garantias.operacaoId, input.operacaoId), isNull(garantias.deletedAt)));

      // Gerar PDF do resumo
      const pdfBuffer = await gerarPdfResumo(opComConsultor, garantia, pendencias);

      // Salvar no S3 como arquivo temporário de preview
      const nomeCliente = sanitizeName(op.nomeCliente.split(" ").slice(0, 2).join("_"));
      const ts = Date.now();
      const pdfKey = `previews/Resumo_${nomeCliente}_${ts}.pdf`;
      const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf");

      return { pdfUrl, pendencias };
    }),

  // ─── Listar Exportações ───────────────────────────────────────────────────
  listarExportacoes: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db
        .select({
          id: exportacoesDossie.id,
          status: exportacoesDossie.status,
          zipUrl: exportacoesDossie.zipUrl,
          totalDocs: exportacoesDossie.totalDocs,
          pendencias: exportacoesDossie.pendencias,
          createdAt: exportacoesDossie.createdAt,
          userId: exportacoesDossie.userId,
          nomeUsuario: users.name,
        })
        .from(exportacoesDossie)
        .leftJoin(users, eq(exportacoesDossie.userId, users.id))
        .where(eq(exportacoesDossie.operacaoId, input.operacaoId))
        .orderBy(exportacoesDossie.createdAt);

      return rows.reverse(); // mais recente primeiro
    }),
});

// ─── Helper: gerar PDF simples de texto ──────────────────────────────────────
async function gerarPdfTexto(texto: string, titulo: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, doc.page.width, 60).fill("#1A1A1A");
    doc.fillColor("#C9A84C").fontSize(16).font("Helvetica-Bold").text("PORTAL ATIVA", 50, 18);
    doc.fillColor("#AAAAAA").fontSize(9).font("Helvetica").text(titulo.toUpperCase(), 50, 40);
    doc.moveDown(3);
    doc.fillColor("#1A1A1A").fontSize(10).font("Helvetica").text(texto, { lineGap: 4 });

    const footerY = doc.page.height - 40;
    doc.fillColor("#888888").fontSize(8).text(
      "Documento gerado pelo Portal Ativa Soluções — uso interno e confidencial.",
      50, footerY, { align: "center", width: doc.page.width - 100 },
    );
    doc.end();
  });
}
