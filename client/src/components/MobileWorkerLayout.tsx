import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Button, Dropdown, Space, Alert, Tag } from 'antd';
import {
  ImportOutlined,
  ExportOutlined,
  CheckSquareOutlined,
  SwapOutlined,
  SearchOutlined,
  UserOutlined,
  LogoutOutlined,
  InboxOutlined,
  RollbackOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import PullToRefresh from './PullToRefresh';
import ServerConfigModal from './ServerConfigModal';
import ErrorBoundary from './ErrorBoundary';
import ChangePasswordModal from './ChangePasswordModal';
import { useAuth } from '../stores/AuthContext';

const tabs = [
  { key: 'inbound', label: '入库', icon: <ImportOutlined />, path: '/m/inbound' },
  { key: 'outbound', label: '出库', icon: <ExportOutlined />, path: '/m/outbound' },
  { key: 'check', label: '盘点', icon: <CheckSquareOutlined />, path: '/m/check' },
  { key: 'transfer', label: '转移', icon: <SwapOutlined />, path: '/m/transfer' },
  { key: 'inventory', label: '库存', icon: <SearchOutlined />, path: '/m/inventory' },
];

export default function MobileWorkerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const isTenant = user?.role === 'tenant_admin';
  const isClerk = user?.operatorType === 'clerk';
  const isInCustomerView = isTenant && !!localStorage.getItem('admin_token');
  const plan = isTenant && user?.maxWarehouses != null ? (user.maxWarehouses >= 3 ? 'professional' : 'standard') : null;
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [changePwdOpen, setChangePwdOpen] = useState(false);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') setKeyboardOpen(true);
    };
    const onFocusOut = () => setKeyboardOpen(false);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  const activeTab = tabs.find(t => location.pathname.startsWith(t.path))?.key || 'inbound';

  if (isClerk) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f5f5f5' }}>
          <InboxOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }} />
          <span style={{ fontSize: 16, color: '#999', marginBottom: 24 }}>文员账号仅限桌面端操作</span>
          <Button type="primary" onClick={() => navigate('/login')}>切换到桌面端</Button>
        </div>
      );
    }

    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5', maxWidth: '100vw', overflow: 'hidden' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', background: '#fff',
        borderBottom: '1px solid #f0f0f0', height: 48,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <InboxOutlined style={{ fontSize: 22, color: '#1677ff' }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>仓储操作</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {isInCustomerView && (
            <Button size="small" icon={<RollbackOutlined />} onClick={async () => { await logout(); navigate('/m/admin'); }} style={{ color: '#1677ff' }}>
              返回平台
            </Button>
          )}
          <ServerConfigModal />
          <Dropdown menu={{ items: [
            ...(user?.role !== 'operator' ? [{ key: 'change-pwd', icon: <KeyOutlined />, label: '修改密码', onClick: () => setChangePwdOpen(true) }] : []),
            { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout },
          ] }}>
            <Button type="text" icon={<UserOutlined />} size="small"
              style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
              {user?.realName || user?.username}
              {plan === 'standard' && <Tag color="blue" style={{ marginLeft: 2, fontSize: 9, lineHeight: '14px' }}>标准</Tag>}
              {plan === 'professional' && <Tag color="gold" style={{ marginLeft: 2, fontSize: 9, lineHeight: '14px' }}>专业</Tag>}
            </Button>
          </Dropdown>
        </div>
      </div>

      {isInCustomerView && (
        <Alert
          message={`正在管理「${user?.realName || user?.username}」的数据`}
          type="info" showIcon closable={false}
          style={{ borderRadius: 0, borderLeft: 0, borderRight: 0 }}
        />
      )}

      <div style={{ padding: 8, paddingBottom: 64, overflow: 'auto' }}>
        <PullToRefresh>
          <div style={{ background: '#fff', borderRadius: 8, padding: 12, minHeight: 'calc(100vh - 128px)' }}>
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
            <ChangePasswordModal open={changePwdOpen} onClose={() => setChangePwdOpen(false)} />
          </div>
        </PullToRefresh>
      </div>

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        display: keyboardOpen ? 'none' : 'flex',
        background: '#fff', borderTop: '1px solid #f0f0f0',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)',
        height: 56,
      }}>
        {tabs.map(item => (
          <div
            key={item.key}
            onClick={() => navigate(item.path)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', overflow: 'hidden',
              color: activeTab === item.key ? '#1677ff' : '#8c8c8c',
              transition: 'color 0.2s',
            }}
          >
            <div style={{ fontSize: 22, lineHeight: 1 }}>{item.icon}</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
