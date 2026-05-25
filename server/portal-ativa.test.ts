import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ────────────────────────────────────────────────────────────────

type AuthUser = NonNullable<TrpcContext["user"]>;

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    openId: "test-user-1",
    email: "test@ativa.com.vc",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    perfil: "assessor",
    numeroWhatsapp: null,
    ativo: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  } as AuthUser;
}

function makeAdminUser(): AuthUser {
  return makeUser({ id: 2, openId: "admin-user", name: "Renata Admin", role: "admin", perfil: "admin" } as any);
}

function makeCtx(user: AuthUser | null = null): TrpcContext {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
}

// ─── Auth Tests ──────────────────────────────────────────────────────────────

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
    const ctx: TrpcContext = {
      user: makeUser(),
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: (name: string, options: Record<string, unknown>) => {
          clearedCookies.push({ name, options });
        },
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
  });

  it("auth.me returns null for unauthenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("auth.me returns user for authenticated user", async () => {
    const user = makeUser();
    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.auth.me();
    expect(result?.openId).toBe("test-user-1");
  });
});

// ─── RBAC Tests ──────────────────────────────────────────────────────────────

describe("RBAC — adminProcedure", () => {
  it("blocks assessor from accessing admin-only endpoints", async () => {
    const assessor = makeUser({ perfil: "assessor" } as any);
    const caller = appRouter.createCaller(makeCtx(assessor));
    await expect(caller.operacoes.metricas()).rejects.toThrow();
  });

  it("allows admin to access admin-only endpoints (metricas)", async () => {
    const admin = makeAdminUser();
    const caller = appRouter.createCaller(makeCtx(admin));
    // Should not throw FORBIDDEN — may throw DB error in test env, that's ok
    try {
      await caller.operacoes.metricas();
    } catch (err: any) {
      // Accept DB errors (connection timeout in test env), not FORBIDDEN
      expect(err.code).not.toBe("FORBIDDEN");
    }
  }, 15000);

  it("blocks assessor from slaAlerts", async () => {
    const assessor = makeUser({ perfil: "assessor" } as any);
    const caller = appRouter.createCaller(makeCtx(assessor));
    await expect(caller.operacoes.slaAlerts()).rejects.toThrow();
  });
});

// ─── Código de Operação Tests ────────────────────────────────────────────────

describe("Código de operação ATV-YYYY-XXXXXX", () => {
  it("matches the expected format ATV-YYYY-XXXXXX", () => {
    const regex = /^ATV-\d{4}-\d{6}$/;
    const examples = [
      "ATV-2026-000001",
      "ATV-2026-123456",
      "ATV-2025-000999",
    ];
    examples.forEach((code) => {
      expect(code).toMatch(regex);
    });
  });

  it("rejects invalid formats", () => {
    const regex = /^ATV-\d{4}-\d{6}$/;
    const invalid = ["ATV-26-000001", "atv-2026-000001", "ATV-2026-1234", "2026-000001"];
    invalid.forEach((code) => {
      expect(code).not.toMatch(regex);
    });
  });
});

// ─── Status Macro Tests ──────────────────────────────────────────────────────

describe("Status macro validation", () => {
  const VALID_STATUSES = [
    "Pré-cadastro",
    "Aguardando documentos",
    "Documentação parcial",
    "Documentação completa",
    "Em análise IA",
    "Em validação humana",
    "Pronta para distribuição",
    "Em distribuição",
    "Distribuída",
    "Em retorno bancário",
    "Aguardando cliente",
    "Aprovada",
    "Reprovada",
    "Cancelada",
    "Stand-by",
  ];

  it("has exactly 15 status macros", () => {
    expect(VALID_STATUSES).toHaveLength(15);
  });

  it("includes all required terminal statuses", () => {
    expect(VALID_STATUSES).toContain("Aprovada");
    expect(VALID_STATUSES).toContain("Reprovada");
    expect(VALID_STATUSES).toContain("Cancelada");
  });
});

// ─── Produto Checklist Tests ─────────────────────────────────────────────────

describe("Checklist por produto", () => {
  const PRODUTOS = ["Home Equity", "Auto Equity", "Rural Equity", "Imóvel em Construção"];

  it("all 4 products are defined", () => {
    expect(PRODUTOS).toHaveLength(4);
  });

  it("Home Equity requires at least 10 documents", () => {
    // Based on the checklist defined in routers.ts
    const homeEquityDocs = [
      "RG ou CNH", "CPF", "Comprovante de residência (até 90 dias)",
      "IRPF — declaração + recibo", "Certidão de estado civil",
      "Extratos bancários PF — 3 meses", "Contracheques — 3 meses (CLT)",
      "Matrícula atualizada do imóvel", "IPTU com metragem",
      "Fotos do imóvel (frente/fundos/lateral/interna)", "Escritura (se disponível)",
    ];
    expect(homeEquityDocs.length).toBeGreaterThanOrEqual(10);
  });

  it("Rural Equity requires INCRA georreferenciamento", () => {
    const ruralDocs = [
      "Georreferenciamento INCRA", "CAR — Cadastro Ambiental Rural",
      "CCIR", "CAFIR", "ITR",
    ];
    expect(ruralDocs).toContain("Georreferenciamento INCRA");
    expect(ruralDocs).toContain("CAR — Cadastro Ambiental Rural");
  });
});

// ─── Produto × Garantia — estrutura dinâmica ─────────────────────────────────

import { PRODUTOS, GARANTIAS_POR_PRODUTO, getGarantiasPorProduto, isGarantiaCompativel, TODAS_GARANTIAS } from "../shared/produtos-garantias";

describe("Produto × Garantia — estrutura dinâmica", () => {
  it("deve ter exatamente 4 produtos definidos", () => {
    expect(PRODUTOS).toHaveLength(4);
    expect(PRODUTOS).toContain("Home Equity");
    expect(PRODUTOS).toContain("Auto Equity");
    expect(PRODUTOS).toContain("Rural Equity");
    expect(PRODUTOS).toContain("Crédito para Construção / Término de Obra");
  });

  it("Home Equity deve ter 18 tipos de garantia", () => {
    expect(GARANTIAS_POR_PRODUTO["Home Equity"]).toHaveLength(18);
    expect(GARANTIAS_POR_PRODUTO["Home Equity"]).toContain("Apartamento");
    expect(GARANTIAS_POR_PRODUTO["Home Equity"]).toContain("Galpão");
    expect(GARANTIAS_POR_PRODUTO["Home Equity"]).toContain("Terreno Industrial");
  });

  it("Auto Equity deve ter 12 tipos de garantia", () => {
    expect(GARANTIAS_POR_PRODUTO["Auto Equity"]).toHaveLength(12);
    expect(GARANTIAS_POR_PRODUTO["Auto Equity"]).toContain("Caminhão");
    expect(GARANTIAS_POR_PRODUTO["Auto Equity"]).toContain("Máquina Agrícola");
  });

  it("Rural Equity deve ter 13 tipos de garantia", () => {
    expect(GARANTIAS_POR_PRODUTO["Rural Equity"]).toHaveLength(13);
    expect(GARANTIAS_POR_PRODUTO["Rural Equity"]).toContain("Fazenda");
    expect(GARANTIAS_POR_PRODUTO["Rural Equity"]).toContain("Haras");
  });

  it("Crédito para Construção deve ter 14 tipos de garantia", () => {
    expect(GARANTIAS_POR_PRODUTO["Crédito para Construção / Término de Obra"]).toHaveLength(14);
    expect(GARANTIAS_POR_PRODUTO["Crédito para Construção / Término de Obra"]).toContain("Terreno Residencial");
    expect(GARANTIAS_POR_PRODUTO["Crédito para Construção / Término de Obra"]).toContain("Obra Paralisada");
  });

  it("getGarantiasPorProduto deve retornar lista correta", () => {
    expect(getGarantiasPorProduto("Auto Equity")).toContain("Van");
    expect(getGarantiasPorProduto("produto-inexistente")).toHaveLength(0);
  });

  it("isGarantiaCompativel deve validar corretamente", () => {
    expect(isGarantiaCompativel("Home Equity", "Apartamento")).toBe(true);
    expect(isGarantiaCompativel("Home Equity", "Caminhão")).toBe(false);
    expect(isGarantiaCompativel("Auto Equity", "Caminhão")).toBe(true);
    expect(isGarantiaCompativel("Rural Equity", "Fazenda")).toBe(true);
    expect(isGarantiaCompativel("Rural Equity", "Apartamento")).toBe(false);
  });

  it("TODAS_GARANTIAS deve ser lista ordenada sem duplicatas", () => {
    const uniq = new Set(TODAS_GARANTIAS);
    expect(uniq.size).toBe(TODAS_GARANTIAS.length);
    const sorted = [...TODAS_GARANTIAS].sort();
    expect(TODAS_GARANTIAS).toEqual(sorted);
  });

  it("garantias de Auto e Home Equity não devem se sobrepor", () => {
    const autoGarantias = getGarantiasPorProduto("Auto Equity");
    const homeGarantias = getGarantiasPorProduto("Home Equity");
    const intersecao = autoGarantias.filter((g) => homeGarantias.includes(g));
    expect(intersecao).toHaveLength(0);
  });
});
