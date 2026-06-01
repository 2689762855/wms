import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const isStandalone = import.meta.env.VITE_STANDALONE === 'true';
import { ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './stores/AuthContext';
import AppUpdateModal from './components/AppUpdateModal';
import { checkForUpdate, markVersionAsCurrent } from './utils/updateChecker';
import type { AppVersion } from './types';
import AppLayout from './components/Layout';
import MobileWorkerLayout from './components/MobileWorkerLayout';
import Login from './pages/Login';
import Claim from './pages/Claim';

const Lazy = (fn: () => Promise<any>) => {
  const C = lazy(fn);
  return (props: any) => <Suspense fallback={<Spin style={{ display: 'block', padding: 80, textAlign: 'center' }} />}><C {...props} /></Suspense>;
};

const Dashboard = Lazy(() => import('./pages/Dashboard'));
const Warehouses = Lazy(() => import('./pages/Warehouses'));
const Categories = Lazy(() => import('./pages/Categories'));
const Products = Lazy(() => import('./pages/Products'));
const Inventory = Lazy(() => import('./pages/Inventory'));
const InventoryLogs = Lazy(() => import('./pages/InventoryLogs'));
const InboundList = Lazy(() => import('./pages/InboundList'));
const InboundNew = Lazy(() => import('./pages/InboundNew'));
const InboundDetail = Lazy(() => import('./pages/InboundDetail'));
const OutboundList = Lazy(() => import('./pages/OutboundList'));
const OutboundNew = Lazy(() => import('./pages/OutboundNew'));
const OutboundDetail = Lazy(() => import('./pages/OutboundDetail'));
const TransferList = Lazy(() => import('./pages/TransferList'));
const TransferNew = Lazy(() => import('./pages/TransferNew'));
const TransferDetail = Lazy(() => import('./pages/TransferDetail'));
const CheckTasks = Lazy(() => import('./pages/CheckTasks'));
const CheckTaskDetail = Lazy(() => import('./pages/CheckTaskDetail'));
const Alerts = Lazy(() => import('./pages/Alerts'));
const ReportsInOut = Lazy(() => import('./pages/ReportsInOut'));
const ReportsTurnover = Lazy(() => import('./pages/ReportsTurnover'));
const ReportsCustomerStats = Lazy(() => import('./pages/ReportsCustomerStats'));
const AdminDashboard = Lazy(() => import('./pages/AdminDashboard'));
const WarehouseLocations = Lazy(() => import('./pages/WarehouseLocations'));
const Users = Lazy(() => import('./pages/Users'));
const Customers = Lazy(() => import('./pages/Customers'));
const About = Lazy(() => import('./pages/About'));
const Contracts = Lazy(() => import('./pages/Contracts'));
const ContractDetail = Lazy(() => import('./pages/ContractDetail'));
const ContractReconciliation = Lazy(() => import('./pages/ContractReconciliation'));
const Containers = Lazy(() => import('./pages/Containers'));
const ContainerDetail = Lazy(() => import('./pages/ContainerDetail'));
const ContainerReport = Lazy(() => import('./pages/ContainerReport'));
const MobileInboundList = Lazy(() => import('./pages/mobile/MobileInboundList'));
const MobileInboundNew = Lazy(() => import('./pages/mobile/MobileInboundNew'));
const MobileOutboundList = Lazy(() => import('./pages/mobile/MobileOutboundList'));
const MobileOutboundNew = Lazy(() => import('./pages/mobile/MobileOutboundNew'));
const MobileCheckList = Lazy(() => import('./pages/mobile/MobileCheckList'));
const MobileCheckDetail = Lazy(() => import('./pages/mobile/MobileCheckDetail'));
const MobileTransfer = Lazy(() => import('./pages/mobile/MobileTransfer'));
const MobileInboundDetail = Lazy(() => import('./pages/mobile/MobileInboundDetail'));
const MobileOutboundDetail = Lazy(() => import('./pages/mobile/MobileOutboundDetail'));
const MobileInventory = Lazy(() => import('./pages/mobile/MobileInventory'));
const MobileCustomers = Lazy(() => import('./pages/mobile/MobileCustomers'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading, user } = useAuth();
  const loc = window.location.pathname;
  if (loading) return null;
  if (!token) return <Navigate to="/login" replace />;
  // 文员仅合同管理
  if (user?.operatorType === 'clerk' && !loc.startsWith('/contracts') && !loc.startsWith('/m')) {
    return <Navigate to="/contracts" replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { user } = useAuth();
  const isMobile = window.matchMedia('(max-width: 991px)').matches;
  if (!isStandalone && user?.role === 'super_admin') {
    return <Navigate to={isMobile ? '/m/admin' : '/admin'} replace />;
  }
  if (isMobile) return <Navigate to="/m/inbound" replace />;
  if (user?.operatorType === 'warehouse') return <Navigate to="/inbound" replace />;
  if (user?.operatorType === 'clerk') return <Navigate to="/contracts" replace />;
  return <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/claim" element={<Claim />} />
      {!isStandalone && <Route path="/m/admin" element={<ProtectedRoute><MobileCustomers /></ProtectedRoute>} />}
      <Route path="/m" element={<ProtectedRoute><MobileWorkerLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/m/inbound" replace />} />
        <Route path="inbound" element={<MobileInboundList />} />
        <Route path="inbound/new" element={<MobileInboundNew />} />
        <Route path="inbound/:id" element={<MobileInboundDetail />} />
        <Route path="outbound" element={<MobileOutboundList />} />
        <Route path="outbound/new" element={<MobileOutboundNew />} />
        <Route path="outbound/:id" element={<MobileOutboundDetail />} />
        <Route path="check" element={<MobileCheckList />} />

        <Route path="check/:id" element={<MobileCheckDetail />} />
        <Route path="transfer" element={<MobileTransfer />} />
        <Route path="inventory" element={<MobileInventory />} />
      </Route>
      <Route path="/transfer/:id" element={<ProtectedRoute><AppLayout><TransferDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/warehouses/:id/locations" element={<ProtectedRoute><AppLayout><WarehouseLocations /></AppLayout></ProtectedRoute>} />
      <Route path="/contracts/:id" element={<ProtectedRoute><AppLayout><ContractDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/contracts/:id/reconciliation" element={<ProtectedRoute><AppLayout><ContractReconciliation /></AppLayout></ProtectedRoute>} />
      <Route path="/containers/:id" element={<ProtectedRoute><AppLayout><ContainerDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/containers/:id/report" element={<ProtectedRoute><ContainerReport /></ProtectedRoute>} />
      {!isStandalone && <Route path="/admin" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
      </Route>}
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<HomeRedirect />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="warehouses" element={<Warehouses />} />
        <Route path="products/categories" element={<Categories />} />
        <Route path="products" element={<Products />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="inventory/logs" element={<InventoryLogs />} />
        <Route path="inbound" element={<InboundList />} />
        <Route path="inbound/new" element={<InboundNew />} />
        <Route path="inbound/:id" element={<InboundDetail />} />
        <Route path="outbound" element={<OutboundList />} />
        <Route path="outbound/new" element={<OutboundNew />} />
        <Route path="outbound/:id" element={<OutboundDetail />} />
        <Route path="transfer" element={<TransferList />} />
        <Route path="transfer/new" element={<TransferNew />} />
        <Route path="check-tasks" element={<CheckTasks />} />
        <Route path="check-tasks/:id" element={<CheckTaskDetail />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="reports/in-out" element={<ReportsInOut />} />
        <Route path="reports/turnover" element={<ReportsTurnover />} />
        <Route path="reports/customer-stats" element={<ReportsCustomerStats />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="containers" element={<Containers />} />
        <Route path="settings/users" element={<Users />} />
        {!isStandalone && <Route path="settings/customers" element={<Customers />} />}
        <Route path="settings/about" element={<About />} />
      </Route>
    </Routes>
  );
}

function AppContent() {
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<AppVersion | null>(null);
  const [updateForce, setUpdateForce] = useState(false);

  useEffect(() => {
    let isCapacitor = false;
    try { isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.(); } catch {}
    if (!isCapacitor) return;
    const timer = setTimeout(() => {
      checkForUpdate().then((result) => {
        if (result.hasUpdate && result.serverVersion) {
          setUpdateVersion(result.serverVersion);
          setUpdateForce(result.forceUpdate);
          setUpdateOpen(true);
        }
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {updateVersion && (
        <AppUpdateModal
          open={updateOpen}
          serverVersion={updateVersion}
          forceUpdate={updateForce}
          onDismiss={() => { setUpdateOpen(false); if (updateVersion) markVersionAsCurrent(updateVersion.versionCode); }}
        />
      )}
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
