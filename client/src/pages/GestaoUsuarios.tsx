import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import AtivaDashboardLayout from "@/components/AtivaDashboardLayout";
import {
  AlertTriangle,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const PERFIL_LABELS: Record<string, string> = {
  admin: "Admin",
  operacional: "Operacional",
  assessor: "Assessor",
};

const PERFIL_COLORS: Record<string, string> = {
  admin: "bg-[#C9A84C]/20 text-[#C9A84C] border-[#C9A84C]/30",
  operacional: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  assessor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

export default function GestaoUsuarios() {
  const { user } = useAuth();
  const isAdmin = (user as any)?.perfil === "admin";

  const { data: usuarios, refetch } = trpc.usuarios.listar.useQuery();
  const setPerfil = trpc.usuarios.setPerfil.useMutation({
    onSuccess: () => { refetch(); toast.success("Perfil atualizado!"); setConfirmModal(null); },
    onError: (e) => toast.error(e.message),
  });
  const setAtivo = trpc.usuarios.setAtivo.useMutation({
    onSuccess: () => { refetch(); toast.success("Status atualizado!"); },
    onError: (e) => toast.error(e.message),
  });
  const deletar = trpc.usuarios.deletar.useMutation({
    onSuccess: () => { refetch(); toast.success("Usuário removido!"); setConfirmDeletar(null); },
    onError: (e) => toast.error(e.message),
  });

  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState("Todos");
  const [confirmModal, setConfirmModal] = useState<{ userId: number; nome: string; novoPerfil: string } | null>(null);
  const [confirmDeletar, setConfirmDeletar] = useState<{ userId: number; nome: string } | null>(null);

  if (!isAdmin) {
    return (
      <AtivaDashboardLayout>
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <Shield className="w-16 h-16 text-[#C9A84C] mb-4 opacity-50" />
          <h2 className="text-xl font-semibold text-[#FAFAFA] mb-2">Acesso Restrito</h2>
          <p className="text-[#888] mb-4">Esta área é exclusiva para administradores.</p>
          <Link href="/dashboard">
            <Button className="bg-[#C9A84C] hover:bg-[#B8973B] text-black font-semibold">Voltar ao Dashboard</Button>
          </Link>
        </div>
      </AtivaDashboardLayout>
    );
  }

  const usuariosFiltrados = (usuarios ?? []).filter((u) => {
    const matchBusca = !busca
      || (u.name ?? "").toLowerCase().includes(busca.toLowerCase())
      || (u.email ?? "").toLowerCase().includes(busca.toLowerCase());
    const matchPerfil = filtroPerfil === "Todos" || u.perfil === filtroPerfil;
    return matchBusca && matchPerfil;
  });

  const totalAdmin = (usuarios ?? []).filter((u) => u.perfil === "admin").length;
  const totalOperacional = (usuarios ?? []).filter((u) => u.perfil === "operacional").length;
  const totalAssessor = (usuarios ?? []).filter((u) => u.perfil === "assessor").length;
  const totalAtivos = (usuarios ?? []).filter((u) => u.ativo).length;

  return (
    <AtivaDashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#FAFAFA]">Gestão de Usuários</h1>
            <p className="text-sm text-[#888] mt-1">Gerencie os acessos e perfis da equipe</p>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Ativos", value: totalAtivos, color: "text-green-400" },
            { label: "Admins", value: totalAdmin, color: "text-[#C9A84C]" },
            { label: "Operacionais", value: totalOperacional, color: "text-blue-400" },
            { label: "Assessores", value: totalAssessor, color: "text-purple-400" },
          ].map((m) => (
            <Card key={m.label} className="bg-[#111] border-[#C9A84C]/20">
              <CardContent className="p-4">
                <p className="text-xs text-[#888]">{m.label}</p>
                <p className={`text-2xl font-bold mt-1 ${m.color}`}>{m.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555]" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="pl-9 bg-[#111] border-[#333] text-[#FAFAFA] placeholder:text-[#555]"
            />
          </div>
          <Select value={filtroPerfil} onValueChange={setFiltroPerfil}>
            <SelectTrigger className="w-48 bg-[#111] border-[#333] text-[#FAFAFA]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111] border-[#333] text-[#FAFAFA]">
              <SelectItem value="Todos">Todos os perfis</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="operacional">Operacional</SelectItem>
              <SelectItem value="assessor">Assessor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Lista */}
        {usuariosFiltrados.length === 0 ? (
          <div className="text-center py-16 text-[#555]">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Cabeçalho */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-[#555] uppercase tracking-wide">
              <div className="col-span-4">Usuário</div>
              <div className="col-span-2">Perfil</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Membro desde</div>
              <div className="col-span-2 text-right">Ações</div>
            </div>

            {usuariosFiltrados.map((u) => {
              const isCurrentUser = (user as any)?.id === u.id;
              const nomeDisplay = u.name ?? u.email ?? "Usuário";
              return (
                <Card key={u.id} className={`bg-[#111] border-[#C9A84C]/20 hover:border-[#C9A84C]/40 transition-colors ${!u.ativo ? "opacity-60" : ""}`}>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-12 gap-4 items-center">
                      {/* Usuário */}
                      <div className="col-span-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#C9A84C]/10 border border-[#C9A84C]/30 flex items-center justify-center text-[#C9A84C] font-semibold text-sm">
                          {nomeDisplay.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#FAFAFA]">
                            {nomeDisplay}
                            {isCurrentUser && <span className="ml-2 text-xs text-[#C9A84C]">(você)</span>}
                          </p>
                          <p className="text-xs text-[#555]">{u.email ?? "—"}</p>
                        </div>
                      </div>

                      {/* Perfil */}
                      <div className="col-span-2">
                        {isCurrentUser ? (
                          <Badge className={`text-xs border ${PERFIL_COLORS[u.perfil] ?? ""}`}>
                            {PERFIL_LABELS[u.perfil] ?? u.perfil}
                          </Badge>
                        ) : (
                          <Select
                            value={u.perfil}
                            onValueChange={(novoPerfil) => setConfirmModal({ userId: u.id, nome: nomeDisplay, novoPerfil })}
                          >
                            <SelectTrigger className="h-7 text-xs bg-transparent border-[#333] text-[#FAFAFA] w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#111] border-[#333] text-[#FAFAFA]">
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="operacional">Operacional</SelectItem>
                              <SelectItem value="assessor">Assessor</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      {/* Status */}
                      <div className="col-span-2">
                        <Badge className={`text-xs border ${u.ativo ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                          {u.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>

                      {/* Data */}
                      <div className="col-span-2 text-xs text-[#555]">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("pt-BR") : "—"}
                      </div>

                      {/* Ações */}
                      <div className="col-span-2 flex items-center justify-end gap-2">
                        {!isCurrentUser && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`h-7 w-7 p-0 ${u.ativo ? "text-[#888] hover:text-red-400" : "text-[#888] hover:text-green-400"}`}
                              onClick={() => setAtivo.mutate({ userId: u.id, ativo: !u.ativo })}
                              title={u.ativo ? "Desativar usuário" : "Ativar usuário"}
                            >
                              {u.ativo ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-[#888] hover:text-red-400"
                              onClick={() => setConfirmDeletar({ userId: u.id, nome: nomeDisplay })}
                              title="Remover usuário"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal confirmar mudança de perfil */}
      <Dialog open={!!confirmModal} onOpenChange={() => setConfirmModal(null)}>
        <DialogContent className="bg-[#111] border-[#C9A84C]/30 text-[#FAFAFA] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#C9A84C] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Confirmar Alteração de Perfil
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#FAFAFA]">
            Deseja alterar o perfil de <strong>{confirmModal?.nome}</strong> para{" "}
            <strong className="text-[#C9A84C]">{PERFIL_LABELS[confirmModal?.novoPerfil ?? ""] ?? confirmModal?.novoPerfil}</strong>?
          </p>
          <p className="text-xs text-[#888]">Esta ação altera imediatamente os acessos do usuário no portal.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmModal(null)} className="text-[#888]">Cancelar</Button>
            <Button
              onClick={() => confirmModal && setPerfil.mutate({ userId: confirmModal.userId, perfil: confirmModal.novoPerfil as any })}
              disabled={setPerfil.isPending}
              className="bg-[#C9A84C] hover:bg-[#B8973B] text-black font-semibold"
            >
              {setPerfil.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal confirmar exclusão */}
      <Dialog open={!!confirmDeletar} onOpenChange={() => setConfirmDeletar(null)}>
        <DialogContent className="bg-[#111] border-red-500/30 text-[#FAFAFA] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Remover Usuário
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#FAFAFA]">
            Tem certeza que deseja remover <strong>{confirmDeletar?.nome}</strong>?
          </p>
          <p className="text-xs text-[#888]">O usuário será desativado e não poderá mais acessar o portal. Esta ação pode ser revertida pelo banco de dados.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeletar(null)} className="text-[#888]">Cancelar</Button>
            <Button
              onClick={() => confirmDeletar && deletar.mutate({ userId: confirmDeletar.userId })}
              disabled={deletar.isPending}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              {deletar.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AtivaDashboardLayout>
  );
}
