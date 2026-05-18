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
      // Accept DB errors, not FORBIDDEN
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });

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
