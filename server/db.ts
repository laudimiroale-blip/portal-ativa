import { aliasedTable, and, desc, eq, getTableColumns, inArray, isNull, like, or, sql, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  analises_ia,
  documentos,
  documentosComplementares,
  garantias,
  historicoStatusOperacao,
  ifCadastros,
  ifCondicoes,
  ifDistribuicoes,
  instituicoesFinanceiras,
  logsAuditoria,
  notificacoes,
  operacoes,
  termosScr,
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

export async function updateUserPerfil(userId: number, perfil: "admin" | "operacional" | "assessor") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ perfil }).where(eq(users.id, userId));
}

// ─── Operações ───────────────────────────────────────────────────────────────

export async function gerarCodigoOperacao(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(operacoes);
  const count = Number(result[0]?.count ?? 0) + 1;
  const seq = String(count).padStart(6, "0");
  const year = new Date().getFullYear();
  return `ATV-${year}-${seq}`;
}

export async function createOperacao(data: typeof operacoes.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.insert(operacoes).values(data);
}

export async function getOperacoes(filters?: {
  assessorId?: number;
  statusMacro?: string;
  produto?: string;
  prioridade?: string;
  busca?: string;
  responsavelOperacionalId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: SQL[] = [isNull(operacoes.deletedAt) as SQL];
  if (filters?.assessorId) conditions.push(eq(operacoes.assessorId, filters.assessorId));
  if (filters?.statusMacro) conditions.push(eq(operacoes.statusMacro, filters.statusMacro as any));
  if (filters?.produto) conditions.push(eq(operacoes.produto, filters.produto as any));
  if (filters?.prioridade) conditions.push(eq(operacoes.prioridade, filters.prioridade as any));
  if (filters?.responsavelOperacionalId) conditions.push(eq(operacoes.responsavelOperacionalId, filters.responsavelOperacionalId));
  if (filters?.busca) {
    const busca = `%${filters.busca}%`;
    const orClause = or(
      like(operacoes.nomeCliente, busca),
      like(operacoes.cpf, busca),
      like(operacoes.codigoOperacao, busca)
    );
    if (orClause) conditions.push(orClause as SQL);
  }
  const responsavelAlias = aliasedTable(users, "responsavel");
  const rows = await db
    .select({
      ...getTableColumns(operacoes),
      responsavelOperacionalNome: responsavelAlias.name,
    })
    .from(operacoes)
    .leftJoin(responsavelAlias, eq(operacoes.responsavelOperacionalId, responsavelAlias.id))
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

// ─── Métricas por Consultor ──────────────────────────────────────────────────

export async function getMetricasPorConsultor() {
  const db = await getDb();
  if (!db) return [];

  // Buscar todos os assessores ativos
  const assessores = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.ativo, true), isNull(users.deletedAt)));

  const resultados = await Promise.all(
    assessores.map(async (a) => {
      const ops = await db
        .select({ statusMacro: operacoes.statusMacro, statusRascunho: operacoes.statusRascunho })
        .from(operacoes)
        .where(and(eq(operacoes.assessorId, a.id), isNull(operacoes.deletedAt)));

      if (ops.length === 0) return null;

      const total = ops.length;
      const emAnalise = ops.filter((o) =>
        ["Em análise IA", "Em validação humana", "Documentação completa"].includes(o.statusMacro)
      ).length;
      const aprovadas = ops.filter((o) => o.statusMacro === "Aprovada").length;
      const rascunhos = ops.filter((o) => o.statusRascunho).length;
      const pendentes = ops.filter((o) =>
        ["Aguardando documentos", "Documentação parcial", "Pré-cadastro"].includes(o.statusMacro)
      ).length;

      return {
        assessorId: a.id,
        nomeAssessor: a.name ?? "Consultor",
        total,
        emAnalise,
        aprovadas,
        rascunhos,
        pendentes,
      };
    })
  );

  return resultados.filter(Boolean) as NonNullable<(typeof resultados)[number]>[];
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
  return db.insert(documentos).values(data);
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
  return db.insert(analises_ia).values(data);
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
  const rows = await db
    .select()
    .from(historicoStatusOperacao)
    .where(eq(historicoStatusOperacao.operacaoId, operacaoId))
    .orderBy(desc(historicoStatusOperacao.createdAt));
  // Enriquecer com nome do usuário
  const userIds = [...new Set(rows.map((r) => r.alteradoPor).filter(Boolean))];
  const userMap: Record<number, string> = {};
  if (userIds.length > 0) {
    const usersResult = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds));
    usersResult.forEach((u) => { if (u.id) userMap[u.id] = u.name ?? "Usuário"; });
  }
  return rows.map((r) => ({
    ...r,
    alteradoPorNome: r.alteradoPor ? (userMap[r.alteradoPor] ?? "Usuário") : null,
  }));
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

export async function updateGarantia(id: number, data: Partial<typeof garantias.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(garantias).set(data).where(eq(garantias.id, id));
}

// ─── Termos SCR ──────────────────────────────────────────────────────────────

export async function getTermoScrByOperacao(operacaoId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(termosScr)
    .where(eq(termosScr.operacaoId, operacaoId))
    .orderBy(desc(termosScr.createdAt))
    .limit(1);
  return result[0] ?? null;
}

export async function createTermoScr(data: typeof termosScr.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(termosScr).values(data);
}

export async function updateTermoScr(id: number, data: Partial<typeof termosScr.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(termosScr).set(data).where(eq(termosScr.id, id));
}

export async function getTermoScrByToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(termosScr).where(eq(termosScr.token, token)).limit(1);
  return result[0] ?? null;
}

// ─── Métricas Dashboard ──────────────────────────────────────────────────────

export async function getMetricasDashboard() {
  const db = await getDb();
  if (!db) return null;

  const [total, rascunhos, aprovadas, emAnalise, pendentes] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(operacoes).where(isNull(operacoes.deletedAt)),
    db.select({ count: sql<number>`COUNT(*)` }).from(operacoes).where(and(eq(operacoes.statusRascunho, true), isNull(operacoes.deletedAt))),
    db.select({ count: sql<number>`COUNT(*)` }).from(operacoes).where(and(eq(operacoes.statusMacro, "Aprovada"), isNull(operacoes.deletedAt))),
    db.select({ count: sql<number>`COUNT(*)` }).from(operacoes).where(and(eq(operacoes.statusMacro, "Em análise IA"), isNull(operacoes.deletedAt))),
    db.select({ count: sql<number>`COUNT(*)` }).from(operacoes).where(
      and(
        isNull(operacoes.deletedAt),
        or(
          eq(operacoes.statusMacro, "Aguardando documentos"),
          eq(operacoes.statusMacro, "Documentação parcial"),
          eq(operacoes.statusMacro, "Pré-cadastro")
        ) as SQL
      )
    ),
  ]);

  return {
    total: Number(total[0]?.count ?? 0),
    rascunhos: Number(rascunhos[0]?.count ?? 0),
    aprovadas: Number(aprovadas[0]?.count ?? 0),
    emAnalise: Number(emAnalise[0]?.count ?? 0),
    pendentes: Number(pendentes[0]?.count ?? 0),
  };
}

export async function getOperacoesComSlaAlert() {
  const db = await getDb();
  if (!db) return [];
  const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
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

export async function getOperacoesComSlaAlerts() {
  const db = await getDb();
  if (!db) return { paradas24h: [], docs48h: [], prazoBancarioVencido: [], paradas7dias: [] };

  const agora = Date.now();
  const limite24h = new Date(agora - 24 * 60 * 60 * 1000);
  const limite48h = new Date(agora - 48 * 60 * 60 * 1000);
  const limite7dias = new Date(agora - 7 * 24 * 60 * 60 * 1000);

  const statusAtivos = [
    "Pré-cadastro", "Aguardando documentos", "Documentação parcial",
    "Documentos ilegíveis", "Aguardando SCR", "Documentação completa",
    "Em análise IA", "Em validação humana", "Pronta para distribuição",
    "Em distribuição", "Distribuída", "Em retorno bancário", "Aguardando cliente",
  ];

  const statusDocPendente = ["Aguardando documentos", "Documentação parcial", "Documentos ilegíveis"];
  const statusDistribuicao = ["Em distribuição", "Distribuída", "Em retorno bancário"];

  // 1. Operações ativas sem movimentação há mais de 24h
  const paradas24h = await db
    .select()
    .from(operacoes)
    .where(and(
      isNull(operacoes.deletedAt),
      sql`${operacoes.statusMacro} IN (${sql.join(statusAtivos.map((s) => sql`${s}`), sql`, `)})`,
      sql`${operacoes.ultimaMovimentacaoEm} < ${limite24h}`,
      sql`${operacoes.ultimaMovimentacaoEm} >= ${limite48h}`,
    ))
    .orderBy(operacoes.ultimaMovimentacaoEm)
    .limit(15);

  // 2. Operações com docs pendentes há mais de 48h
  const docs48h = await db
    .select()
    .from(operacoes)
    .where(and(
      isNull(operacoes.deletedAt),
      sql`${operacoes.statusMacro} IN (${sql.join(statusDocPendente.map((s) => sql`${s}`), sql`, `)})`,
      sql`${operacoes.ultimaMovimentacaoEm} < ${limite48h}`,
    ))
    .orderBy(operacoes.ultimaMovimentacaoEm)
    .limit(15);

  // 3. Operações em distribuição com prazo de retorno vencido
  const prazoBancarioVencido = await db
    .select()
    .from(operacoes)
    .leftJoin(instituicoesFinanceiras, eq(instituicoesFinanceiras.operacaoId, operacoes.id))
    .where(and(
      isNull(operacoes.deletedAt),
      sql`${operacoes.statusMacro} IN (${sql.join(statusDistribuicao.map((s) => sql`${s}`), sql`, `)})`,
      sql`${instituicoesFinanceiras.prazoRetornoEstimado} IS NOT NULL`,
      sql`${instituicoesFinanceiras.prazoRetornoEstimado} < NOW()`,
      sql`${instituicoesFinanceiras.status} NOT IN ('Aprovado', 'Reprovado')`,
    ))
    .orderBy(operacoes.ultimaMovimentacaoEm)
    .limit(15);

  // 4. Operações paradas há mais de 7 dias (qualquer status ativo)
  const paradas7dias = await db
    .select()
    .from(operacoes)
    .where(and(
      isNull(operacoes.deletedAt),
      sql`${operacoes.statusMacro} IN (${sql.join(statusAtivos.map((s) => sql`${s}`), sql`, `)})`,
      sql`${operacoes.ultimaMovimentacaoEm} < ${limite7dias}`,
    ))
    .orderBy(operacoes.ultimaMovimentacaoEm)
    .limit(10);

  return {
    paradas24h,
    docs48h,
    prazoBancarioVencido: prazoBancarioVencido.map((r) => (r as any).operacoes ?? r),
    paradas7dias,
  };
}

// ─── IFs Parceiras (Cadastro Global) ────────────────────────────────────────

export async function getAllIFsCadastradas() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ifCadastros)
    .where(isNull(ifCadastros.deletedAt))
    .orderBy(ifCadastros.nome);
}

export async function getIFCadastradaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(ifCadastros).where(eq(ifCadastros.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createIFCadastrada(data: typeof ifCadastros.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(ifCadastros).values(data);
}

export async function updateIFCadastrada(id: number, data: Partial<typeof ifCadastros.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(ifCadastros).set({ ...data, updatedAt: new Date() }).where(eq(ifCadastros.id, id));
}

export async function softDeleteIFCadastrada(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(ifCadastros).set({ deletedAt: new Date() }).where(eq(ifCadastros.id, id));
}

// ─── Condições por Produto por IF ────────────────────────────────────────────

export async function getCondicoesByIF(ifId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ifCondicoes).where(eq(ifCondicoes.ifId, ifId));
}

export async function upsertCondicaoIF(data: typeof ifCondicoes.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Check if exists
  const existing = await db
    .select()
    .from(ifCondicoes)
    .where(and(eq(ifCondicoes.ifId, data.ifId), eq(ifCondicoes.produto, data.produto as any)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(ifCondicoes).set({ ...data, updatedAt: new Date() }).where(eq(ifCondicoes.id, existing[0].id));
  } else {
    await db.insert(ifCondicoes).values(data);
  }
}

export async function deleteCondicaoIF(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(ifCondicoes).where(eq(ifCondicoes.id, id));
}

// ─── Distribuições de Operações para IFs ─────────────────────────────────────

export async function getDistribuicoesByOperacao(operacaoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      dist: ifDistribuicoes,
      ifNome: ifCadastros.nome,
      ifContato: ifCadastros.contatoNome,
      ifEmail: ifCadastros.contatoEmail,
    })
    .from(ifDistribuicoes)
    .leftJoin(ifCadastros, eq(ifDistribuicoes.ifId, ifCadastros.id))
    .where(eq(ifDistribuicoes.operacaoId, operacaoId))
    .orderBy(ifDistribuicoes.dataEnvio);
}

export async function createDistribuicao(data: typeof ifDistribuicoes.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(ifDistribuicoes).values(data);
}

export async function updateDistribuicao(id: number, data: Partial<typeof ifDistribuicoes.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(ifDistribuicoes).set({ ...data, updatedAt: new Date() }).where(eq(ifDistribuicoes.id, id));
}

// ─── Notificações ────────────────────────────────────────────────────────────

export async function createNotificacao(data: typeof notificacoes.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notificacoes).values(data);
}

export async function getNotificacoesByUser(usuarioId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notificacoes)
    .where(eq(notificacoes.usuarioId, usuarioId))
    .orderBy(notificacoes.createdAt)
    .limit(50);
}

export async function marcarNotificacaoLida(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notificacoes).set({ lida: true }).where(eq(notificacoes.id, id));
}

export async function marcarTodasNotificacoesLidas(usuarioId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notificacoes).set({ lida: true }).where(eq(notificacoes.usuarioId, usuarioId));
}

// ─── Gestão de Usuários (Admin) ───────────────────────────────────────────────

export async function getAllUsuarios() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(users.name);
}

export async function updateUsuario(id: number, data: Partial<typeof users.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function softDeleteUsuario(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(users).set({ deletedAt: new Date(), ativo: false }).where(eq(users.id, id));
}
// ─── IFs: helpers adicionais ─────────────────────────────────────────────────
export async function getUsuariosAdminOperacional() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: users.id, name: users.name, perfil: users.perfil })
    .from(users)
    .where(and(
      or(eq(users.perfil, "admin"), eq(users.perfil, "operacional")),
      eq(users.ativo, true),
      isNull(users.deletedAt)
    ))
    .orderBy(users.name);
}
export async function getAdmins() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.perfil, "admin"), eq(users.ativo, true), isNull(users.deletedAt)));
}
export async function getIFsAtivas() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: ifCadastros.id, nome: ifCadastros.nome, cnpj: ifCadastros.cnpj })
    .from(ifCadastros)
    .where(and(eq(ifCadastros.status, "Ativa"), isNull(ifCadastros.deletedAt)))
    .orderBy(ifCadastros.nome);
}

/**
 * Retorna IFs ativas que possuem condições cadastradas para o produto informado.
 * Se nenhum produto for informado, retorna todas as IFs ativas (comportamento legado).
 */
export async function getIFsAtivasPorProduto(produto?: string) {
  const db = await getDb();
  if (!db) return [];
  if (!produto) return getIFsAtivas();

  // Busca condições do produto (com taxa e prazo) para cada IF
  const condicoes = await db
    .select({
      ifId: ifCondicoes.ifId,
      taxaMinima: ifCondicoes.taxaMinima,
      prazoMaximo: ifCondicoes.prazoMaximo,
    })
    .from(ifCondicoes)
    .where(eq(ifCondicoes.produto, produto as any));

  const ifIdsComProduto = Array.from(new Set(condicoes.map((c) => c.ifId)));

  if (ifIdsComProduto.length === 0) {
    return [];
  }

  // Mapa de ifId -> condições para enriquecer o retorno
  const condicoesMap = new Map(
    condicoes.map((c) => [c.ifId, { taxaMinima: c.taxaMinima, prazoMaximo: c.prazoMaximo }])
  );

  const ifs = await db
    .select({ id: ifCadastros.id, nome: ifCadastros.nome, cnpj: ifCadastros.cnpj })
    .from(ifCadastros)
    .where(
      and(
        eq(ifCadastros.status, "Ativa"),
        isNull(ifCadastros.deletedAt),
        sql`${ifCadastros.id} IN (${sql.join(ifIdsComProduto.map((id) => sql`${id}`), sql`, `)})`
      )
    )
    .orderBy(ifCadastros.nome);

  // Enriquece cada IF com taxa mínima e prazo máximo do produto
  return ifs.map((if_) => ({
    ...if_,
    taxaMinima: condicoesMap.get(if_.id)?.taxaMinima ?? null,
    prazoMaximo: condicoesMap.get(if_.id)?.prazoMaximo ?? null,
  }));
}
export async function getMetricasPorIF(ifId: number) {
  const db = await getDb();
  if (!db) return null;
  const distribs = await db
    .select()
    .from(ifDistribuicoes)
    .where(eq(ifDistribuicoes.ifId, ifId));
  const totalEnviadas = distribs.length;
  const totalAprovadas = distribs.filter((d) => d.statusRetorno === "Aprovada").length;
  const totalReprovadas = distribs.filter((d) => d.statusRetorno === "Reprovada").length;
  // SLA médio: horas entre dataEnvio e updatedAt para distribuições com retorno
  const comRetorno = distribs.filter((d) => d.statusRetorno === "Aprovada" || d.statusRetorno === "Reprovada");
  const slaMedioHoras = comRetorno.length > 0
    ? Math.round(comRetorno.reduce((acc, d) => {
        const horas = (new Date(d.updatedAt).getTime() - new Date(d.dataEnvio).getTime()) / (1000 * 60 * 60);
        return acc + horas;
      }, 0) / comRetorno.length)
    : null;
  return { totalEnviadas, totalAprovadas, totalReprovadas, slaMedioHoras };
}
export async function getHistoricoDistribuicoesByIF(ifId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      dist: ifDistribuicoes,
      codigoOperacao: operacoes.codigoOperacao,
      nomeCliente: operacoes.nomeCliente,
      produto: operacoes.produto,
      valorSolicitado: operacoes.valorSolicitado,
      statusMacro: operacoes.statusMacro,
    })
    .from(ifDistribuicoes)
    .leftJoin(operacoes, eq(ifDistribuicoes.operacaoId, operacoes.id))
    .where(eq(ifDistribuicoes.ifId, ifId))
    .orderBy(desc(ifDistribuicoes.dataEnvio));
}
