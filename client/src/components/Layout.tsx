import { useState, useEffect, type ReactNode } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Layout as AntLayout, Menu, Button, theme, Dropdown, Alert, Tag } from 'antd';
import {
  DashboardOutlined,
  BankOutlined,
  AppstoreOutlined,
  InboxOutlined,
  ImportOutlined,
  ExportOutlined,
  SwapOutlined,
  CheckSquareOutlined,
  AlertOutlined,
  BarChartOutlined,
  SettingOutlined,
  KeyOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TeamOutlined,
  InfoCircleOutlined,
  RollbackOutlined,
  FileTextOutlined,
  ContainerOutlined,
} from '@ant-design/icons';

const isStandalone = import.meta.env.VITE_STANDALONE === 'true';
import { useAuth } from '../stores/AuthContext';
import ErrorBoundary from './ErrorBoundary';
import ChangePasswordModal from './ChangePasswordModal';

const { Header, Sider, Content } = AntLayout;

export default function AppLayout({ children }: { children?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { token: themeToken } = theme.useToken();
  // matchMedia 比 useBreakpoint 更快，无初始空对象导致的桌面布局闪烁
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 991px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 991px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const isSuperAdmin = !isStandalone && user?.role === 'super_admin';
  const isTenant = user?.role === 'tenant_admin';
  const isClerk = user?.operatorType === 'clerk';
  const isWarehouse = user?.operatorType === 'warehouse';
  const isInCustomerView = isTenant && !!localStorage.getItem('admin_token');
  const plan = isTenant && user?.maxWarehouses != null ? (user.maxWarehouses >= 3 ? 'professional' : 'standard') : null;
  const canManageUsers = isSuperAdmin || user?.role === 'warehouse_admin';

  // 超管菜单：平台管理 + 客户管理 + 用户管理
  const adminMenuItems = [
    { key: 'admin-dashboard', label: '平台管理', icon: <DashboardOutlined />, path: '/admin' },
    { key: 'settings-customers', label: '客户管理', icon: <TeamOutlined />, path: '/settings/customers' },
    { key: 'settings-users', label: '用户管理', icon: <UserOutlined />, path: '/settings/users' },
    { key: 'settings-about', label: '关于我们', icon: <InfoCircleOutlined />, path: '/settings/about' },
  ];

  // 仓库操作菜单：超管以外的所有角色
  const opsMenuItems = [
    { key: 'dashboard', label: '仪表盘', icon: <DashboardOutlined />, path: '/dashboard' },
    { key: 'warehouses', label: '仓库与库位', icon: <BankOutlined />, path: '/warehouses' },
    {
      label: '商品管理',
      icon: <AppstoreOutlined />,
      children: [
        { key: 'products-categories', label: '商品分类', path: '/products/categories' },
        { key: 'products-list', label: '商品列表', path: '/products' },
      ],
    },
    {
      key: 'inventory-group',
      label: '库存管理',
      icon: <InboxOutlined />,
      children: [
        { key: 'inventory-list', label: '库存查询', path: '/inventory' },
        { key: 'inventory-logs', label: '库存流水', path: '/inventory/logs' },
      ],
    },
    { key: 'inbound', label: '入库管理', icon: <ImportOutlined />, path: '/inbound' },
    { key: 'outbound', label: '出库管理', icon: <ExportOutlined />, path: '/outbound' },
    { key: 'transfer', label: '调拨管理', icon: <SwapOutlined />, path: '/transfer' },
    { key: 'check-tasks', label: '盘点管理', icon: <CheckSquareOutlined />, path: '/check-tasks' },
    { key: 'alerts', label: '库存预警', icon: <AlertOutlined />, path: '/alerts' },
    { key: 'contracts', label: '合同管理', icon: <FileTextOutlined />, path: '/contracts' },
    { key: 'containers', label: '货柜管理', icon: <ContainerOutlined />, path: '/containers' },
    {
      key: 'reports-group',
      label: '报表统计',
      icon: <BarChartOutlined />,
      children: [
        { key: 'reports-in-out', label: '出入库报表', path: '/reports/in-out' },
        { key: 'reports-turnover', label: '周转率报表', path: '/reports/turnover' },
        { key: 'reports-customer-stats', label: '客户统计', path: '/reports/customer-stats' },
      ],
    },
    ...(canManageUsers || isTenant ? [{
      key: 'settings-group',
      label: '系统设置',
      icon: <SettingOutlined />,
      children: [
        ...(canManageUsers ? [{ key: 'settings-users', label: '用户管理', path: '/settings/users' }] : []),
        ...(isTenant ? [{ key: 'settings-users', label: '我的操作员', path: '/settings/users' }] : []),
        ...(isSuperAdmin ? [{ key: 'settings-customers', label: '客户管理', path: '/settings/customers' }] : []),
        { key: 'settings-about', label: '关于我们', path: '/settings/about' },
      ],
    }] : []),
  ];

  // 文员菜单：仅合同管理
  const clerkMenuItems = [
    { key: 'contracts', label: '合同管理', icon: <FileTextOutlined />, path: '/contracts' },
  ];

  // 库人员桌面菜单：库存/出入库/盘点/预警/排柜
  const warehouseMenuItems = [
    {
      key: 'inventory-group',
      label: '库存管理',
      icon: <InboxOutlined />,
      children: [
        { key: 'inventory-list', label: '库存查询', path: '/inventory' },
        { key: 'inventory-logs', label: '库存流水', path: '/inventory/logs' },
      ],
    },
    { key: 'inbound', label: '入库管理', icon: <ImportOutlined />, path: '/inbound' },
    { key: 'outbound', label: '出库管理', icon: <ExportOutlined />, path: '/outbound' },
    { key: 'check-tasks', label: '盘点管理', icon: <CheckSquareOutlined />, path: '/check-tasks' },
    { key: 'alerts', label: '库存预警', icon: <AlertOutlined />, path: '/alerts' },
    { key: 'containers', label: '排柜管理', icon: <ContainerOutlined />, path: '/containers' },
  ];

  const menuItems = isSuperAdmin ? adminMenuItems : isClerk ? clerkMenuItems : isWarehouse ? warehouseMenuItems : opsMenuItems;

  const getSelectedKeys = () => {
    const path = location.pathname;
    if (path === '/admin') return ['admin-dashboard'];
    if (path.startsWith('/products/categories')) return ['products-categories'];
    if (path.startsWith('/products')) return ['products-list'];
    if (path.startsWith('/inventory/logs')) return ['inventory-logs'];
    if (path.startsWith('/inventory')) return ['inventory-list'];
    if (path.startsWith('/contracts')) return ['contracts'];
    if (path.startsWith('/containers')) return ['containers'];
    if (path.startsWith('/reports/in-out')) return ['reports-in-out'];
    if (path.startsWith('/reports/turnover')) return ['reports-turnover'];
    if (path.startsWith('/reports/customer-stats')) return ['reports-customer-stats'];
    if (path.startsWith('/settings/users')) return ['settings-users'];
    if (path.startsWith('/settings/customers')) return ['settings-customers'];
    if (path.startsWith('/settings/about')) return ['settings-about'];
    if (path === '/dashboard') return ['dashboard'];
    return [path.replace('/', '')];
  };

  const findPath = (items: typeof menuItems, key: string): string | undefined => {
    for (const item of items) {
      if (item.key === key && 'path' in item) return item.path;
      if ('children' in item && item.children) {
        const found = findPath(item.children, key);
        if (found) return found;
      }
    }
    return undefined;
  };

  const onNavigate = (key: string) => {
    const path = findPath(menuItems, key) || `/${key}`;
    navigate(path);
  };

  const contentNode = children || <Outlet />;

  // ── Mobile → redirect to worker UI (super admin 有自己的移动端) ──
  if (isMobile && user?.role !== 'super_admin') {
    return <Navigate to="/m/inbound" replace />;
  }

  // ── Desktop layout ──
  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: collapsed ? 16 : 20, fontWeight: 'bold' }}>
          {collapsed ? 'WMS' : '库存管理系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={getSelectedKeys()}
          items={menuItems}
          onClick={({ key }) => onNavigate(key)}
        />
      </Sider>
      <AntLayout>
        <Header style={{ padding: '0 24px', background: themeToken.colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
          <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isInCustomerView && (
              <Button size="small" icon={<RollbackOutlined />} onClick={() => { logout(); navigate('/admin'); }} style={{ color: '#1677ff' }}>
                返回平台管理
              </Button>
            )}
            <Dropdown menu={{ items: [
              { key: 'change-pwd', icon: <KeyOutlined />, label: '修改密码', onClick: () => setChangePwdOpen(true) },
              { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout },
            ] }}>
              <Button type="text" icon={<UserOutlined />}>
                {user?.realName || user?.username}
                {plan === 'standard' && <Tag color="blue" style={{ marginLeft: 6, fontSize: 11, lineHeight: '18px' }}>标准版</Tag>}
                {plan === 'professional' && <Tag color="gold" style={{ marginLeft: 6, fontSize: 11, lineHeight: '18px' }}>专业版</Tag>}
              </Button>
            </Dropdown>
          </div>
        </Header>
        {isInCustomerView && (
          <Alert message={`正在管理「${user?.realName || user?.username}」的数据，操作将影响该客户`} type="info" showIcon closable={false}
            style={{ borderRadius: 0, borderLeft: 0, borderRight: 0 }} />
        )}
        <Content style={{ margin: 16, padding: 24, background: themeToken.colorBgContainer, borderRadius: themeToken.borderRadiusLG }}>
          <ErrorBoundary>{contentNode}</ErrorBoundary>
          <ChangePasswordModal open={changePwdOpen} onClose={() => setChangePwdOpen(false)} />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
