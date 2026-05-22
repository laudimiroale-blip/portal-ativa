import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import React from "react";
import { getLoginUrl } from "@/const";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Home,
  LogOut,
  Menu,
  Shield,
  Users,
  X,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  hideForAssessor?: boolean;
  badge?: string;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home, hideForAssessor: true },
  { label: "Operações", href: "/operacoes", icon: FolderOpen },
  { label: "Fila Operacional", href: "/fila", icon: BarChart3, adminOnly: true },
  { label: "Inst. Financeiras", href: "/ifs", icon: Building2, hideForAssessor: true },
  { label: "Usuários", href: "/usuarios", icon: Users, adminOnly: true },
];

// ─── Sino de Notificações ─────────────────────────────────────────────────────

function NotificacoesSino() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: notifs, refetch } = trpc.notificacoes.listar.useQuery(undefined, {
    refetchInterval: 30000, // poll a cada 30s
  });
  const marcarLidaMutation = trpc.notificacoes.marcarLida.useMutation({ onSuccess: () => refetch() });
  const marcarTodasMutation = trpc.notificacoes.marcarTodasLidas.useMutation({ onSuccess: () => refetch() });

  const naoLidas = (notifs ?? []).filter((n) => !n.lida).length;

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const tipoIcon: Record<string, string> = {
    nova_operacao: "📋",
    documentacao_completa: "✅",
    pronta_analise: "🤖",
    pronta_distribuicao: "🏦",
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Notificações"
      >
        <Bell className="w-5 h-5" />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header do dropdown */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Notificações</span>
            {naoLidas > 0 && (
              <button
                onClick={() => marcarTodasMutation.mutate()}
                className="text-xs text-primary hover:underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
            {(notifs ?? []).length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                <Bell className="w-6 h-6 mx-auto mb-2 opacity-30" />
                Nenhuma notificação.
              </div>
            ) : (
              (notifs ?? []).slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3 px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer",
                    !n.lida && "bg-primary/5"
                  )}
                  onClick={() => {
                    if (!n.lida) marcarLidaMutation.mutate({ id: n.id });
                  }}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">
                    {tipoIcon[n.tipo] ?? "🔔"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs leading-snug", !n.lida ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {n.mensagem}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(n.createdAt), { locale: ptBR, addSuffix: true })}
                    </p>
                  </div>
                  {!n.lida && (
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Layout Principal ─────────────────────────────────────────────────────────

interface AtivaDashboardLayoutProps {
  children: React.ReactNode;
}

export default function AtivaDashboardLayout({ children }: AtivaDashboardLayoutProps) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = (user as any)?.perfil === "admin";

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando Portal Ativa...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  const isAssessor = (user as any)?.perfil === "assessor";
  const filteredNav = navItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.hideForAssessor && isAssessor) return false;
    return true;
  });

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-5 border-b border-sidebar-border",
        collapsed && "justify-center px-2"
      )}>
        <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0">
          <Shield className="w-4 h-4 text-primary" />
        </div>
        {!collapsed && (
          <div>
            <p className="font-bold text-sm text-primary tracking-wider">ATIVA</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
              {isAdmin ? "Administrador" : (user as any)?.perfil === "operacional" ? "Operacional" : "Assessor"}
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150 group",
                collapsed && "justify-center px-2",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/25"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
              )}
            >
              <Icon className={cn(
                "w-4 h-4 flex-shrink-0",
                isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )} />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.badge && (
                <span className="ml-auto text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full border border-primary/30">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className={cn(
        "border-t border-sidebar-border p-3",
        collapsed && "px-2"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-3 px-2 py-2 mb-2 rounded-md bg-sidebar-accent/50">
            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-primary">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{user?.name || "Usuário"}</p>
              <p className="text-[10px] text-muted-foreground capitalize">
                {isAdmin ? "Administrador" : (user as any)?.perfil === "operacional" ? "Operacional" : "Assessor"}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={() => logout()}
          className={cn(
            "flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors",
            collapsed && "justify-center px-2"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 flex-shrink-0",
          collapsed ? "w-14" : "w-56"
        )}
      >
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-1/2 -right-3 w-6 h-6 bg-sidebar border border-sidebar-border rounded-full flex items-center justify-center text-muted-foreground hover:text-primary transition-colors z-10"
          style={{ transform: "translateY(-50%)" }}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-sidebar border-r border-sidebar-border">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm text-primary tracking-wider">ATIVA</span>
          </div>
          <NotificacoesSino />
        </header>

        {/* Desktop topbar com sino */}
        <div className="hidden lg:flex items-center justify-end px-4 py-2 border-b border-border bg-card/30">
          <NotificacoesSino />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
