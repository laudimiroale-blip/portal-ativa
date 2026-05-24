import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createIFCadastrada,
  getAllIFsCadastradas,
  getIFsAtivas,
  getIFsAtivasPorProduto,
  getMetricasPorIF,
  getHistoricoDistribuicoesByIF,
  getIFCadastradaById,
  updateIFCadastrada,
  softDeleteIFCadastrada,
  getCondicoesByIF,
  upsertCondicaoIF,
  deleteCondicaoIF,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const adminPerfilProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user as any).perfil !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

export const ifCadastrosRouter = router({
  listar: protectedProcedure.query(async () => getAllIFsCadastradas()),
  listarAtivas: protectedProcedure.query(async () => getIFsAtivas()),
  listarAtivasPorProduto: protectedProcedure
    .input(z.object({ produto: z.string().optional() }))
    .query(async ({ input }) => getIFsAtivasPorProduto(input.produto)),
  metricasPorIF: protectedProcedure
    .input(z.object({ ifId: z.number() }))
    .query(async ({ input }) => getMetricasPorIF(input.ifId)),
  historicoDistribuicoes: protectedProcedure
    .input(z.object({ ifId: z.number() }))
    .query(async ({ input }) => getHistoricoDistribuicoesByIF(input.ifId)),
  obter: adminPerfilProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => getIFCadastradaById(input.id)),

  criar: adminPerfilProcedure
    .input(z.object({
      nome: z.string().min(2),
      cnpj: z.string().min(14),
      contatoNome: z.string().optional(),
      contatoEmail: z.string().email().optional(),
      contatoTel: z.string().optional(),
      status: z.enum(["Ativa", "Inativa", "Em negociação"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await createIFCadastrada(input as any);
      return { success: true };
    }),

  atualizar: adminPerfilProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().min(2).optional(),
      cnpj: z.string().optional(),
      contatoNome: z.string().optional(),
      contatoEmail: z.string().optional(),
      contatoTel: z.string().optional(),
      status: z.enum(["Ativa", "Inativa", "Em negociação"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateIFCadastrada(id, data as any);
      return { success: true };
    }),

  deletar: adminPerfilProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await softDeleteIFCadastrada(input.id);
      return { success: true };
    }),

  listarCondicoes: protectedProcedure
    .input(z.object({ ifId: z.number() }))
    .query(async ({ input }) => getCondicoesByIF(input.ifId)),

  salvarCondicao: adminPerfilProcedure
    .input(z.object({
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
    }))
    .mutation(async ({ input }) => {
      await upsertCondicaoIF(input as any);
      return { success: true };
    }),

  deletarCondicao: adminPerfilProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteCondicaoIF(input.id);
      return { success: true };
    }),

  // ─── Motor de distribuição bancária inteligente ────────────────────────────────────────────────────────
  listarCompativeis: protectedProcedure
    .input(z.object({
      produto: z.string(),
      valorSolicitado: z.number().optional(),  // em reais
      ltv: z.number().optional(),              // em percentual (ex: 45.5)
      prazo: z.number().optional(),            // em meses
    }))
    .query(async ({ input }) => {
      const todasIFs = await getAllIFsCadastradas();
      const ativasComProduto = todasIFs.filter((if_: any) => !if_.deletedAt && if_.status === "Ativa");

      // Buscar condições de cada IF para o produto solicitado
      const resultado: Array<{
        id: number;
        nome: string;
        cnpj: string;
        compativel: boolean;
        motivoIncompatibilidade?: string;
        taxaMinima?: string | null;
        taxaMaxima?: string | null;
        ltvMaximo?: string | null;
        prazoMinimo?: number | null;
        prazoMaximo?: number | null;
        valorMinimo?: string | null;
        valorMaximo?: string | null;
      }> = [];

      for (const if_ of ativasComProduto as any[]) {
        const condicoes = await getCondicoesByIF(if_.id);
        const condicaoProduto = condicoes.find((c: any) => c.produto === input.produto);

        if (!condicaoProduto) {
          resultado.push({
            id: if_.id,
            nome: if_.nome,
            cnpj: if_.cnpj ?? "",
            compativel: false,
            motivoIncompatibilidade: `Produto "${input.produto}" não aceito por esta IF`,
          });
          continue;
        }

        const motivos: string[] = [];

        // Verificar LTV
        if (input.ltv !== undefined && condicaoProduto.ltvMaximo) {
          const ltvMax = parseFloat(String(condicaoProduto.ltvMaximo));
          if (!isNaN(ltvMax) && input.ltv > ltvMax) {
            motivos.push(`LTV ${input.ltv.toFixed(1)}% acima do limite de ${ltvMax}%`);
          }
        }

        // Verificar valor mínimo
        if (input.valorSolicitado !== undefined && condicaoProduto.valorMinimo) {
          const valMin = parseFloat(String(condicaoProduto.valorMinimo));
          if (!isNaN(valMin) && input.valorSolicitado < valMin) {
            motivos.push(`Valor R$ ${input.valorSolicitado.toLocaleString("pt-BR")} abaixo do mínimo de R$ ${valMin.toLocaleString("pt-BR")}`);
          }
        }

        // Verificar valor máximo
        if (input.valorSolicitado !== undefined && condicaoProduto.valorMaximo) {
          const valMax = parseFloat(String(condicaoProduto.valorMaximo));
          if (!isNaN(valMax) && input.valorSolicitado > valMax) {
            motivos.push(`Valor R$ ${input.valorSolicitado.toLocaleString("pt-BR")} acima do máximo de R$ ${valMax.toLocaleString("pt-BR")}`);
          }
        }

        // Verificar prazo mínimo
        if (input.prazo !== undefined && condicaoProduto.prazoMinimo) {
          if (input.prazo < condicaoProduto.prazoMinimo) {
            motivos.push(`Prazo ${input.prazo} meses abaixo do mínimo de ${condicaoProduto.prazoMinimo} meses`);
          }
        }

        // Verificar prazo máximo
        if (input.prazo !== undefined && condicaoProduto.prazoMaximo) {
          if (input.prazo > condicaoProduto.prazoMaximo) {
            motivos.push(`Prazo ${input.prazo} meses acima do máximo de ${condicaoProduto.prazoMaximo} meses`);
          }
        }

        resultado.push({
          id: if_.id,
          nome: if_.nome,
          cnpj: if_.cnpj ?? "",
          compativel: motivos.length === 0,
          motivoIncompatibilidade: motivos.length > 0 ? motivos.join(" · ") : undefined,
          taxaMinima: condicaoProduto.taxaMinima,
          taxaMaxima: condicaoProduto.taxaMaxima,
          ltvMaximo: condicaoProduto.ltvMaximo,
          prazoMinimo: condicaoProduto.prazoMinimo,
          prazoMaximo: condicaoProduto.prazoMaximo,
          valorMinimo: condicaoProduto.valorMinimo,
          valorMaximo: condicaoProduto.valorMaximo,
        });
      }

      // Ordenar: compatíveis primeiro, depois incompatíveis
      return resultado.sort((a, b) => {
        if (a.compativel && !b.compativel) return -1;
        if (!a.compativel && b.compativel) return 1;
        return a.nome.localeCompare(b.nome);
      });
    }),
});
