import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const isStandalone = import.meta.env.VITE_STANDALONE === 'true';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './stores/AuthContext';
import AppUpdateModal from './components/AppUpdateModal';
import { checkForUpdate, markVersionAsCurrent } from './utils/updateChecker';
import type { AppVersion } from './types';
import AppLayout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Warehouses from './pages/Warehouses';
import Categories from './pages/Categories';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import InventoryLogs from './pages/InventoryLogs';
import InboundList from './pages/InboundList';
import InboundNew from './pages/InboundNew';
import InboundDetail from './pages/InboundDetail';
import OutboundList from './pages/OutboundList';
import OutboundNew from './pages/OutboundNew';
import OutboundDetail from './pages/OutboundDetail';
import TransferList from './pages/TransferList';
import TransferNew from './pages/TransferNew';
import TransferDetail from './pages/TransferDetail';
import CheckTasks from './pages/CheckTasks';
import CheckTaskDetail from './pages/CheckTaskDetail';
import Alerts from './pages/Alerts';
import ReportsInOut from './pages/ReportsInOut';
import ReportsTurnover from './pages/ReportsTurnover';
import ReportsCustomerStats from './pages/ReportsCustomerStats';
import Login from './pages/Login';
import Claim from './pages/Claim';
import AdminDashboard from './pages/AdminDashboard';
import WarehouseLocations from './pages/WarehouseLocations';
import Users from './pages/Users';
import Customers from './pages/Customers';
import About from './pages/About';
import Contracts from './pages/Contracts';
import ContractDetail from './pages/ContractDetail';
import ContractReconciliation from './pages/ContractReconciliation';
import Containers from './pages/Containers';
import ContainerDetail from './pages/ContainerDetail';
import ContainerReport from './pages/ContainerReport';
import MobileWorkerLayout from './components/MobileWorkerLayout';
import MobileInboundList from './pages/mobile/MobileInboundList';
import MobileInboundNew from './pages/mobile/MobileInboundNew';
import MobileOutboundList from './pages/mobile/MobileOutboundList';
import MobileOutboundNew from './pages/mobile/MobileOutboundNew';
import MobileCheckList from './pages/mobile/MobileCheckList';
import MobileCheckDetail from './pages/mobile/MobileCheckDetail';
import MobileTransfer from './pages/mobile/MobileTransfer';
import MobileInboundDetail from './pages/mobile/MobileInboundDetail';
import MobileOutboundDetail from './pages/mobile/MobileOutboundDetail';
import MobileInventory from './pages/mobile/MobileInventory';
import MobileCustomers from './pages/mobile/MobileCustomers';

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
