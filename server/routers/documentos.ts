import { z } from "zod";
import {
  addLog,
  createDocumento,
  createDocumentoComplementar,
  createVersaoDocumento,
  getDocumentosComplementares,
  getDocumentosByOperacao,
  getOperacaoById,
  getVersoesDocumento,
  updateDocumento,
  updateOperacao,
  addHistoricoStatus,
} from "../db";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

const adminPerfilProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user as any).perfil !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

const sanitizeFileName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

export const documentosRouter = router({
  listar: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .query(async ({ input }) => getDocumentosByOperacao(input.operacaoId)),

  upload: protectedProcedure
    .input(z.object({
      operacaoId: z.number(),
      documentoId: z.number().optional(),
      nomeDocumento: z.string(),
      categoria: z.string(),
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const buffer = Buffer.from(input.fileBase64, "base64");
      const safeFileName = sanitizeFileName(input.fileName);
      const key = `operacoes/${input.operacaoId}/docs/${Date.now()}-${safeFileName}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      if (input.documentoId) {
        const doc = await getDocumentosByOperacao(input.operacaoId);
        const existing = doc.find((d) => d.id === input.documentoId);
        const novaVersao = (existing?.versaoAtual ?? 0) + 1;
        await createVersaoDocumento({ documentoId: input.documentoId, arquivoUrl: url, arquivoKey: key, versao: novaVersao, enviadoPor: user.id });
        await updateDocumento(input.documentoId, { arquivoUrl: url, arquivoKey: key, versaoAtual: novaVersao, estado: "Enviado", enviadoPor: user.id });
      } else {
        await createDocumento({ operacaoId: input.operacaoId, nomeDocumento: input.nomeDocumento, categoria: input.categoria, estado: "Enviado", arquivoUrl: url, arquivoKey: key, versaoAtual: 1, enviadoPor: user.id });
      }

      const op = await getOperacaoById(input.operacaoId);
      if (op && op.statusMacro === "Pré-cadastro") {
        await updateOperacao(input.operacaoId, { statusMacro: "Documentação parcial" });
        await addHistoricoStatus({ operacaoId: input.operacaoId, statusAnterior: op.statusMacro, statusNovo: "Documentação parcial", alteradoPor: user.id });
      }
      await addLog({ evento: "documento_enviado", detalhe: { nomeDocumento: input.nomeDocumento }, usuarioId: user.id, operacaoId: input.operacaoId });
      return { success: true, url };
    }),

  atualizarEstado: adminPerfilProcedure
    .input(z.object({
      documentoId: z.number(),
      estado: z.enum(["Pendente", "Enviado", "Validado", "Pendência encontrada", "Ilegível", "Vencido", "Em Análise", "Aprovado", "Reprovado", "Reenviar"]),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await updateDocumento(input.documentoId, { estado: input.estado, observacao: input.observacao });
      return { success: true };
    }),

  versoes: protectedProcedure
    .input(z.object({ documentoId: z.number() }))
    .query(async ({ input }) => getVersoesDocumento(input.documentoId)),

  marcarNaoAplicavel: protectedProcedure
    .input(z.object({ documentoId: z.number(), naoAplicavel: z.boolean(), observacao: z.string().optional() }))
    .mutation(async ({ input }) => {
      await updateDocumento(input.documentoId, {
        naoAplicavel: input.naoAplicavel,
        estado: "Pendente",
        ...(input.observacao !== undefined ? { observacao: input.observacao } : {}),
      } as any);
      return { success: true };
    }),

  listarFotos: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .query(async ({ input }) => {
      const docs = await getDocumentosByOperacao(input.operacaoId);
      // Filtrar documentos que são fotos: nome contém "foto" OU categoria é de garantia/veículo/obra
      return docs.filter((d) => {
        const nome = (d.nomeDocumento ?? "").toLowerCase();
        const cat = (d.categoria ?? "").toLowerCase();
        const isImagem = d.arquivoUrl
          ? /\.(jpg|jpeg|png|heic|webp)(\?.*)?$/i.test(d.arquivoUrl)
          : false;
        const isFotoNome = nome.includes("foto");
        const isFotoCat = [
          "imóvel", "imovel", "veículo", "veiculo",
          "obra", "imóvel rural", "imovel rural",
        ].some((c) => cat.includes(c));
        return d.arquivoUrl && (isImagem || isFotoNome || isFotoCat);
      });
    }),

  complementares: router({
    listar: protectedProcedure
      .input(z.object({ operacaoId: z.number() }))
      .query(async ({ input }) => getDocumentosComplementares(input.operacaoId)),

    upload: protectedProcedure
      .input(z.object({
        operacaoId: z.number(),
        nomeArquivo: z.string(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        observacao: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const buffer = Buffer.from(input.fileBase64, "base64");
        const safeFileName = sanitizeFileName(input.fileName);
        const key = `operacoes/${input.operacaoId}/complementares/${Date.now()}-${safeFileName}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        await createDocumentoComplementar({ operacaoId: input.operacaoId, nomeArquivo: input.nomeArquivo, arquivoUrl: url, arquivoKey: key, observacao: input.observacao, enviadoPor: user.id });
        return { success: true, url };
      }),
  }),
});
