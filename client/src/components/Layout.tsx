import { useState, type ReactNode } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Layout as AntLayout, Menu, Button, theme, Dropdown, Grid } from 'antd';
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
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useAuth } from '../stores/AuthContext';

const { Header, Sider, Content } = AntLayout;
const { useBreakpoint } = Grid;

export default function AppLayout({ children }: { children?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const screens = useBreakpoint();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { token: themeToken } = theme.useToken();
  const isMobile = Object.keys(screens).length > 0 && !screens.lg;
  const isSuperAdmin = user?.role === 'super_admin';
  const isTenant = user?.role === 'tenant_admin';
  const canManageUsers = isSuperAdmin || user?.role === 'warehouse_admin';

  const fullMenuItems = [
    { key: 'dashboard', label: '仪表盘', icon: <DashboardOutlined />, path: '/dashboard' },
    ...(isTenant ? [] : [{ key: 'warehouses', label: '仓库管理', icon: <BankOutlined />, path: '/warehouses' }]),
    {
      key: 'products-group',
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
    {
      key: 'reports-group',
      label: '报表统计',
      icon: <BarChartOutlined />,
      children: [
        { key: 'reports-in-out', label: '出入库报表', path: '/reports/in-out' },
        { key: 'reports-turnover', label: '周转率报表', path: '/reports/turnover' },
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

  const getSelectedKeys = () => {
    const path = location.pathname;
    if (path.startsWith('/products/categories')) return ['products-categories'];
    if (path.startsWith('/products')) return ['products-list'];
    if (path.startsWith('/inventory/logs')) return ['inventory-logs'];
    if (path.startsWith('/inventory')) return ['inventory-list'];
    if (path.startsWith('/reports/in-out')) return ['reports-in-out'];
    if (path.startsWith('/reports/turnover')) return ['reports-turnover'];
    if (path.startsWith('/settings/users')) return ['settings-users'];
    if (path.startsWith('/settings/customers')) return ['settings-customers'];
    if (path.startsWith('/settings/about')) return ['settings-about'];
    if (path === '/dashboard') return ['dashboard'];
    return [path.replace('/', '')];
  };

  const findPath = (items: typeof fullMenuItems, key: string): string | undefined => {
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
    const path = findPath(fullMenuItems, key) || `/${key}`;
    navigate(path);
  };

  const contentNode = children || <Outlet />;

  // ── Mobile → redirect to worker UI ──
  if (isMobile) {
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
          items={fullMenuItems}
          onClick={({ key }) => onNavigate(key)}
        />
      </Sider>
      <AntLayout>
        <Header style={{ padding: '0 24px', background: themeToken.colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
          <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} />
          <Dropdown menu={{ items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout }] }}>
            <Button type="text" icon={<UserOutlined />}>{user?.realName || user?.username}</Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 16, padding: 24, background: themeToken.colorBgContainer, borderRadius: themeToken.borderRadiusLG }}>
          {contentNode}
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
