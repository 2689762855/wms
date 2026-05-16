import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Tabs, message } from 'antd';
import { UserOutlined, LockOutlined, InboxOutlined, TeamOutlined } from '@ant-design/icons';
import apiClient from '../api/client';
import { useAuth } from '../stores/AuthContext';
import PWAInstallPrompt from '../components/PWAInstallPrompt';
import ServerConfigModal from '../components/ServerConfigModal';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'staff' | 'tenant'>('staff');
  const { login } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const endpoint = tab === 'tenant' ? '/auth/tenant/login' : '/auth/login';
      const res = await apiClient.post(endpoint, values);
      login(res.data.token, res.data.user);
      message.success('登录成功');
      const isMobile = window.innerWidth < 992;
      navigate(isMobile ? '/m/inbound' : '/dashboard', { replace: true });
    } catch (err: any) {
      message.error(err.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100dvh',
      padding: '16px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{
        width: '100%',
        maxWidth: 380,
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 16, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, right: 0 }}>
            <ServerConfigModal />
          </div>
          <InboxOutlined style={{ fontSize: 48, color: '#1677ff' }} />
          <Typography.Title level={3} style={{ marginTop: 8, marginBottom: 0 }}>库存管理系统</Typography.Title>
          <Typography.Text type="secondary">仓库管理 · 移动端</Typography.Text>
        </div>

        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as 'staff' | 'tenant')}
          centered
          items={[
            { key: 'staff', label: <><UserOutlined /> 管理员登录</> },
            { key: 'tenant', label: <><TeamOutlined /> 客户登录</> },
          ]}
        />

        <Form onFinish={onFinish} size="large" key={tab}>
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44, fontSize: 16 }}>
              登 录
            </Button>
          </Form.Item>
        </Form>

        {import.meta.env.DEV && (
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 12 }}>
            {tab === 'staff' ? '默认: admin / admin123' : '示例: kehua / 123456'}
          </Typography.Text>
        )}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Typography.Link onClick={() => navigate('/stock')}>查看库存</Typography.Link>
        </div>
      </Card>
      <PWAInstallPrompt />
    </div>
  );
}
