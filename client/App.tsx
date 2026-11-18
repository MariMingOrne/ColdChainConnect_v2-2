import "./global.css";
import { lazy } from "react";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ConfirmDialogHost } from "@/lib/confirm";
import { installSessionGuard } from "@/lib/session-guard";

installSessionGuard();
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import type { ModulePermission } from "@shared/api";
import { useAuth } from "./hooks/useAuth";
import { Login } from "./pages/Login";
import { Topbar } from "./components/Topbar";
import { AdminMobileNavigation, AdminNavigation } from "./components/AdminNavigation";
import { PostLoginLoadingScreen } from "./components/auth/PostLoginLoadingScreen";
import { BottomNavBar } from "./components/BottomNavBar";
import NotFound from "./pages/NotFound";
import { RouteBoundary } from "./components/shared/RouteBoundary";

// Route-level code splitting: each role downloads only the screens it opens.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, key: K) =>
  lazy(() => load().then((module) => ({ default: module[key] })));
const Dashboard = named(() => import("./pages/Dashboard"), "Dashboard");
const InformationManagement = named(() => import("./pages/InformationManagement"), "InformationManagement");
const ManageAccounts = named(() => import("./pages/ManageAccounts"), "ManageAccounts");
const BookingDispatch = named(() => import("./pages/BookingDispatch"), "BookingDispatch");
const AuditLogPage = named(() => import("./pages/AuditLog"), "AuditLogPage");
const Reports = named(() => import("./pages/Reports"), "Reports");
const SearchResults = named(() => import("./pages/SearchResults"), "SearchResults");
const DriverSchedule = named(() => import("./pages/DriverSchedule"), "DriverSchedule");

const queryClient = new QueryClient();

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const { logout, user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar userName={user?.username || "User"} onLogout={logout} />
      <div className="flex min-h-0 flex-1">
        <AdminNavigation />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1">
            <div className="flex min-w-0 flex-1 flex-col bg-background pb-32 animate-fade-in md:pb-0">
              {children}
            </div>
          </div>
          <BottomNavBar onLogout={logout} />
        </div>
      </div>
    </div>
  );
};

/** Agent layout: topbar only, no bottom nav, no back-to-dashboard */
const AgentLayout = ({ children, agentMode = false }: { children: React.ReactNode; agentMode?: boolean }) => {
  const { logout, user } = useAuth();
  return (
    <div className={agentMode ? "flex h-dvh min-h-0 flex-col overflow-hidden" : "flex flex-col min-h-screen"}>
      <Topbar userName={user?.username || "User"} onLogout={logout} agentMode />
      <div className={`flex-1 flex flex-col bg-background min-w-0 animate-fade-in ${agentMode ? "min-h-0" : ""}`}>
        {children}
      </div>
    </div>
  );
};

const staffModulePaths: Record<ModulePermission, string> = {
  dashboard: "/",
  "product-customer": "/information-management",
  "order-fulfillment": "/booking-dispatch",
  "delivery-operations": "/booking-dispatch/delivery",
  "manage-accounts": "/manage-accounts/staff",
  reports: "/reports",
  administration: "/audit",
};

function StaffDispatchModule() {
  const { pathname } = useLocation();
  const deliveryPaths = ["/booking-dispatch/delivery", "/booking-dispatch/accounts", "/booking-dispatch/delivery-history", "/booking-dispatch/agent-returns"];
  const permission: ModulePermission = deliveryPaths.some((path) => pathname.startsWith(path)) ? "delivery-operations" : "order-fulfillment";
  return <StaffModule permission={permission}><AppLayout><BookingDispatch /></AppLayout></StaffModule>;
}

function StaffModule({ permission, children }: { permission: ModulePermission; children: React.ReactNode }) {
  const user = useAuth((state) => state.user);
  const allowed = user?.module_permissions ?? [];
  if (!allowed.includes(permission)) {
    const next = Object.keys(staffModulePaths).find((key) => allowed.includes(key as ModulePermission)) as ModulePermission | undefined;
    return next ? <Navigate to={staffModulePaths[next]} replace /> : <div className="p-8 text-center text-foreground">No modules are currently assigned to your account. Contact an administrator.</div>;
  }
  return <>{children}</>;
}

const AppContent = () => {
  const { isAuthenticated, user } = useAuth();
  const isAgent = user?.role === "agent";
  const isDriver = user?.role === "driver";
  const isStaff = user?.role === "staff";

  if (isAuthenticated && isStaff) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<StaffModule permission="dashboard"><AppLayout><Dashboard /></AppLayout></StaffModule>} />
        <Route path="/information-management/*" element={<StaffModule permission="product-customer"><AppLayout><InformationManagement /></AppLayout></StaffModule>} />
        <Route path="/booking-dispatch/*" element={<StaffDispatchModule />} />
        <Route path="/manage-accounts/*" element={<StaffModule permission="manage-accounts"><AppLayout><ManageAccounts /></AppLayout></StaffModule>} />
        <Route path="/audit" element={<StaffModule permission="administration"><AppLayout><AuditLogPage /></AppLayout></StaffModule>} />
        <Route path="/reports" element={<StaffModule permission="reports"><AppLayout><Reports /></AppLayout></StaffModule>} />
        <Route path="/search" element={<StaffModule permission="order-fulfillment"><AppLayout><SearchResults /></AppLayout></StaffModule>} />
        <Route path="*" element={<Navigate to={staffModulePaths["dashboard"]} replace />} />
      </Routes>
    );
  }

  // ── Driver: only their delivery schedule is accessible ──────────
  if (isAuthenticated && isDriver) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/driver-schedule" element={<AgentLayout><DriverSchedule /></AgentLayout>} />
        <Route path="*" element={<Navigate to="/driver-schedule" replace />} />
      </Routes>
    );
  }

  // ── Agent: only booking-dispatch is accessible ──────────────────
  if (isAuthenticated && isAgent) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/booking-dispatch/*"
          element={
            <AgentLayout agentMode>
              <BookingDispatch />
            </AgentLayout>
          }
        />
        <Route path="/search" element={<AgentLayout><SearchResults /></AgentLayout>} />
        {/* Everything else → booking-dispatch */}
        <Route path="*" element={<Navigate to="/booking-dispatch/order-summary" replace />} />
      </Routes>
    );
  }

  // ── Admin: full access ───────────────────────────────────────────
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={isAuthenticated ? <AppLayout><Dashboard /></AppLayout> : <Login />} />
      <Route path="/information-management/*" element={isAuthenticated ? <AppLayout><InformationManagement /></AppLayout> : <Login />} />
      <Route path="/manage-accounts/*" element={isAuthenticated ? <AppLayout><ManageAccounts /></AppLayout> : <Login />} />
      <Route path="/booking-dispatch/*" element={isAuthenticated ? <AppLayout><BookingDispatch /></AppLayout> : <Login />} />
      <Route path="/audit" element={isAuthenticated ? <AppLayout><AuditLogPage /></AppLayout> : <Login />} />
      <Route path="/reports" element={isAuthenticated ? <AppLayout><Reports /></AppLayout> : <Login />} />
      <Route path="/search" element={isAuthenticated ? <AppLayout><SearchResults /></AppLayout> : <Login />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

function PostLoginLoadingGate() {
  const isPostLoginLoading = useAuth((state) => state.isPostLoginLoading);
  return isPostLoginLoading ? <PostLoginLoadingScreen /> : null;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="ccc-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-center" richColors closeButton />
        <ConfirmDialogHost />
        <BrowserRouter>
          <RouteBoundary>
            <AppContent />
          </RouteBoundary>
          <PostLoginLoadingGate />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

const rootElement = document.getElementById("root");
if (rootElement && !rootElement.hasChildNodes()) {
  createRoot(rootElement).render(<App />);
}
