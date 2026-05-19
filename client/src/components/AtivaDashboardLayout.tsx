import { useAuth } from "@/_core/hooks/useAuth";
import React from "react";
import { getLoginUrl } from "@/const";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Home,
  LogOut,
  Menu,
  Plus,
  Shield,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  badge?: string;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Operações", href: "/operacoes", icon: FolderOpen },
  { label: "Nova Operação", href: "/operacoes/nova", icon: Plus },
  { label: "Fila Operacional", href: "/fila", icon: BarChart3, adminOnly: true },
  { label: "Instituições", href: "/instituicoes", icon: Building2, adminOnly: true },
  { label: "Relatórios", href: "/relatorios", icon: FileText, adminOnly: true },
];

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

  const filteredNav = navItems.filter((item) => !item.adminOnly || isAdmin);

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
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Portal Operacional</p>
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
                {isAdmin ? "Administrador" : "Assessor"}
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
          <div className="w-9" />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
