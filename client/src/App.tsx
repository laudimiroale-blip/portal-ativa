import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Operacoes from "./pages/Operacoes";
import NovaOperacao from "./pages/NovaOperacao";
import DetalheOperacao from "./pages/DetalheOperacao";
import FilaOperacional from "./pages/FilaOperacional";
import GestaoIFs from "./pages/GestaoIFs";
import GestaoUsuarios from "./pages/GestaoUsuarios";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/operacoes" component={Operacoes} />
      <Route path="/operacoes/nova" component={NovaOperacao} />
      <Route path="/operacoes/:id" component={DetalheOperacao} />
      <Route path="/fila" component={FilaOperacional} />
      <Route path="/ifs" component={GestaoIFs} />
      <Route path="/usuarios" component={GestaoUsuarios} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: "oklch(11% 0 0)",
                border: "1px solid oklch(20% 0 0)",
                color: "oklch(98% 0 0)",
              },
            }}
          />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
