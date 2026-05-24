import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  getAllAssessores,
  getAllUsuarios,
  getUsuariosAdminOperacional,
  softDeleteUsuario,
  updateUserPerfil,
  updateUsuario,
} from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

// Reexportar adminProcedure com verificação de perfil (compatível com o sistema atual)
const adminPerfilProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user as any).perfil !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

export const usuariosRouter = router({
  listar: adminPerfilProcedure.query(async () => getAllUsuarios()),

  listarAssessores: protectedProcedure.query(async () => getAllAssessores()),

  listarAdminOperacional: protectedProcedure.query(async () => getUsuariosAdminOperacional()),

  setPerfil: adminPerfilProcedure
    .input(z.object({ userId: z.number(), perfil: z.enum(["admin", "operacional", "assessor"]) }))
    .mutation(async ({ input }) => {
      await updateUserPerfil(input.userId, input.perfil);
      return { success: true };
    }),

  setAtivo: adminPerfilProcedure
    .input(z.object({ userId: z.number(), ativo: z.boolean() }))
    .mutation(async ({ input }) => {
      await updateUsuario(input.userId, { ativo: input.ativo });
      return { success: true };
    }),

  deletar: adminPerfilProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      await softDeleteUsuario(input.userId);
      return { success: true };
    }),

  convidar: adminPerfilProcedure
    .input(z.object({
      nome: z.string().min(2),
      email: z.string().email(),
      perfil: z.enum(["admin", "operacional", "assessor"]),
    }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("../db");
      const { users } = await import("../../drizzle/schema");
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
      const { getDb } = await import("../db");
      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const [usuario] = await db.select().from(users).where(eq(users.conviteToken, input.token)).limit(1);
      if (!usuario) throw new TRPCError({ code: "NOT_FOUND", message: "Token de convite inválido ou expirado." });
      if (usuario.conviteStatus !== "Convidado") throw new TRPCError({ code: "BAD_REQUEST", message: "Este convite já foi utilizado." });
      await db.update(users).set({ name: input.nome, conviteStatus: "Ativo", ativo: true, conviteToken: null }).where(eq(users.id, usuario.id));
      return { success: true, email: usuario.email, perfil: usuario.perfil };
    }),

  obterConvite: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const { getDb } = await import("../db");
      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const [usuario] = await db.select({ nome: users.name, email: users.email, perfil: users.perfil, status: users.conviteStatus }).from(users).where(eq(users.conviteToken, input.token)).limit(1);
      if (!usuario) throw new TRPCError({ code: "NOT_FOUND", message: "Token de convite inválido ou expirado." });
      if (usuario.status !== "Convidado") throw new TRPCError({ code: "BAD_REQUEST", message: "Este convite já foi utilizado." });
      return usuario;
    }),

  revogarConvite: adminPerfilProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("../db");
      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const [usuario] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!usuario) throw new TRPCError({ code: "NOT_FOUND" });
      if (usuario.conviteStatus !== "Convidado") throw new TRPCError({ code: "BAD_REQUEST", message: "Este usuário não tem convite pendente." });
      await db.delete(users).where(eq(users.id, input.userId));
      return { success: true };
    }),
});
