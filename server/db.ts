import { and, desc, eq, isNull, like, or, sql, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  analises_ia,
  documentos,
  documentosComplementares,
  garantias,
  historicoStatusOperacao,
  instituicoesFinanceiras,
  logsAuditoria,
  operacoes,
  users,
  versoesDocumento,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Usuários ────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }

  // Owner gets admin + admin perfil automatically
  if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    values.perfil = "admin";
    updateSet.role = "admin";
    updateSet.perfil = "admin";
  } else if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getAllAssessores() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(and(eq(users.ativo, true), isNull(users.deletedAt)));
}

export async function updateUserPerfil(userId: number, perfil: "admin" | "assessor") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ perfil }).where(eq(users.id, userId));
}

// ─── Operações ───────────────────────────────────────────────────────────────

export async function gerarCodigoOperacao(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Gera sequencial: ATV-2026-000001
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(operacoes);
  const count = Number(result[0]?.count ?? 0) + 1;
  const seq = String(count).padStart(6, "0");
  const year = new Date().getFullYear();
  return `ATV-${year}-${seq}`;
}

export async function createOperacao(data: typeof operacoes.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(operacoes).values(data);
  return result;
}

export async function getOperacoes(filters?: {
  assessorId?: number;
  statusMacro?: string;
  produto?: string;
  prioridade?: string;
  busca?: string;
  includeRascunho?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: SQL[] = [isNull(operacoes.deletedAt) as SQL];

  if (filters?.assessorId) {
    conditions.push(eq(operacoes.assessorId, filters.assessorId));
  }
  if (filters?.statusMacro) {
    conditions.push(eq(operacoes.statusMacro, filters.statusMacro as any));
  }
  if (filters?.produto) {
    conditions.push(eq(operacoes.produto, filters.produto as any));
  }
  if (filters?.prioridade) {
    conditions.push(eq(operacoes.prioridade, filters.prioridade as any));
  }
  if (filters?.busca) {
    const busca = `%${filters.busca}%`;
    const orClause = or(
      like(operacoes.nomeCliente, busca),
      like(operacoes.cpf, busca),
      like(operacoes.codigoOperacao, busca)
    );
    if (orClause) conditions.push(orClause as SQL);
  }

  const rows = await db
    .select()
    .from(operacoes)
    .where(and(...conditions))
    .orderBy(desc(operacoes.ultimaMovimentacaoEm));

  return rows;
}

export async function getOperacaoById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(operacoes)
    .where(and(eq(operacoes.id, id), isNull(operacoes.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

export async function updateOperacao(id: number, data: Partial<typeof operacoes.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(operacoes)
    .set({ ...data, ultimaMovimentacaoEm: new Date() })
    .where(eq(operacoes.id, id));
}

export async function softDeleteOperacao(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(operacoes).set({ deletedAt: new Date() }).where(eq(operacoes.id, id));
}

// ─── Documentos ──────────────────────────────────────────────────────────────

export async function getDocumentosByOperacao(operacaoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(documentos)
    .where(and(eq(documentos.operacaoId, operacaoId), isNull(documentos.deletedAt)));
}

export async function createDocumento(data: typeof documentos.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(documentos).values(data);
  return result;
}

export async function updateDocumento(id: number, data: Partial<typeof documentos.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(documentos).set(data).where(eq(documentos.id, id));
}

export async function createVersaoDocumento(data: typeof versoesDocumento.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(versoesDocumento).values(data);
}

export async function getVersoesDocumento(documentoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(versoesDocumento)
    .where(eq(versoesDocumento.documentoId, documentoId))
    .orderBy(desc(versoesDocumento.versao));
}

export async function getDocumentosComplementares(operacaoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(documentosComplementares)
    .where(and(eq(documentosComplementares.operacaoId, operacaoId), isNull(documentosComplementares.deletedAt)));
}

export async function createDocumentoComplementar(data: typeof documentosComplementares.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(documentosComplementares).values(data);
}

// ─── Análises IA ─────────────────────────────────────────────────────────────

export async function getAnalisesByOperacao(operacaoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(analises_ia)
    .where(eq(analises_ia.operacaoId, operacaoId))
    .orderBy(desc(analises_ia.createdAt));
}

export async function createAnaliseIa(data: typeof analises_ia.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(analises_ia).values(data);
  return result;
}

export async function updateAnaliseIa(id: number, data: Partial<typeof analises_ia.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(analises_ia).set(data).where(eq(analises_ia.id, id));
}

// ─── Instituições Financeiras ────────────────────────────────────────────────

export async function getIFsByOperacao(operacaoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(instituicoesFinanceiras)
    .where(and(eq(instituicoesFinanceiras.operacaoId, operacaoId), isNull(instituicoesFinanceiras.deletedAt)));
}

export async function createIF(data: typeof instituicoesFinanceiras.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(instituicoesFinanceiras).values(data);
}

export async function updateIF(id: number, data: Partial<typeof instituicoesFinanceiras.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(instituicoesFinanceiras).set(data).where(eq(instituicoesFinanceiras.id, id));
}

// ─── Histórico de Status ─────────────────────────────────────────────────────

export async function getHistoricoByOperacao(operacaoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(historicoStatusOperacao)
    .where(eq(historicoStatusOperacao.operacaoId, operacaoId))
    .orderBy(desc(historicoStatusOperacao.createdAt));
}

export async function addHistoricoStatus(data: typeof historicoStatusOperacao.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(historicoStatusOperacao).values(data);
}

// ─── Logs de Auditoria ───────────────────────────────────────────────────────

export async function addLog(data: typeof logsAuditoria.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(logsAuditoria).values(data).catch(() => {});
}

// ─── Garantias ───────────────────────────────────────────────────────────────

export async function getGarantiasByOperacao(operacaoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(garantias)
    .where(and(eq(garantias.operacaoId, operacaoId), isNull(garantias.deletedAt)));
}

export async function createGarantia(data: typeof garantias.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(garantias).values(data);
}

// ─── Métricas Dashboard ──────────────────────────────────────────────────────

export async function getMetricasDashboard() {
  const db = await getDb();
  if (!db) return null;

  const [total, rascunhos, aprovadas, emAnalise] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(operacoes).where(isNull(operacoes.deletedAt)),
    db.select({ count: sql<number>`COUNT(*)` }).from(operacoes).where(and(eq(operacoes.statusRascunho, true), isNull(operacoes.deletedAt))),
    db.select({ count: sql<number>`COUNT(*)` }).from(operacoes).where(and(eq(operacoes.statusMacro, "Aprovada"), isNull(operacoes.deletedAt))),
    db.select({ count: sql<number>`COUNT(*)` }).from(operacoes).where(and(eq(operacoes.statusMacro, "Em análise IA"), isNull(operacoes.deletedAt))),
  ]);

  return {
    total: Number(total[0]?.count ?? 0),
    rascunhos: Number(rascunhos[0]?.count ?? 0),
    aprovadas: Number(aprovadas[0]?.count ?? 0),
    emAnalise: Number(emAnalise[0]?.count ?? 0),
  };
}

export async function getOperacoesComSlaAlert() {
  const db = await getDb();
  if (!db) return [];

  const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const limite7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return db
    .select()
    .from(operacoes)
    .where(
      and(
        isNull(operacoes.deletedAt),
        sql`${operacoes.ultimaMovimentacaoEm} < ${limite24h}`
      )
    )
    .orderBy(operacoes.ultimaMovimentacaoEm)
    .limit(20);
}
