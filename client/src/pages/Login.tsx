import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Checkbox } from 'antd';
import { UserOutlined, LockOutlined, InboxOutlined } from '@ant-design/icons';
import apiClient from '../api/client';
import { useAuth } from '../stores/AuthContext';
import ServerConfigModal from '../components/ServerConfigModal';

function encode(str: string) { return btoa(unescape(encodeURIComponent(str))); }
function decode(str: string) { return decodeURIComponent(escape(atob(str))); }

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoTried = useRef(false);

  const [form] = Form.useForm();

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason) {
      const stored = getStored();
      if (stored) {
        form.setFieldsValue({ username: stored.username, password: stored.password, remember: true });
        message.warning(reason + '，正在自动重新登录...', 2);
        setTimeout(() => onFinish({ username: stored.username, password: stored.password }), 800);
        return;
      }
      message.error(reason, 5);
    }
    const isDemo = searchParams.get('demo');
    if (isDemo === '1') {
      form.setFieldsValue({ username: 'fjmfjm', password: 'fjmfjm123', remember: false });
      message.info('演示账号已填入，点击"登录"即可体验', 3);
      return;
    }
    // 记住密码自动登录
    const stored = getStored();
    if (stored && !autoTried.current) {
      autoTried.current = true;
      form.setFieldsValue({ username: stored.username, password: stored.password, remember: true });
      onFinish({ username: stored.username, password: stored.password });
    }
  }, []);

  function getStored() {
    try {
      const raw = localStorage.getItem('remembered_credentials');
      if (!raw) return null;
      const cred = JSON.parse(raw);
      if (cred.u && cred.p) return { username: decode(cred.u), password: decode(cred.p) };
    } catch {}
    return null;
  }

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.();
      const isMobileDevice = isCapacitor || window.matchMedia('(max-width: 991px)').matches;
      const res = await apiClient.post('/auth/login', { ...values, device: isMobileDevice ? 'mobile' : 'desktop' });

      if (res.data.serverRedirect) {
        message.info('正在跳转到您的专属服务器...');
        window.location.href = `${res.data.serverRedirect}/claim?token=${encodeURIComponent(res.data.transferToken)}`;
        return;
      }

      login(res.data.token, res.data.user);

      // 记住密码
      if (remember || form.getFieldValue('remember')) {
        localStorage.setItem('remembered_credentials', JSON.stringify({
          u: encode(values.username),
          p: encode(values.password),
        }));
      } else {
        localStorage.removeItem('remembered_credentials');
      }

      message.success('登录成功');
      if (res.data.expiryWarning) {
        message.warning(res.data.expiryWarning, 5);
      }
      if (res.data.user.role === 'super_admin') {
        const isMobile = window.matchMedia('(max-width: 991px)').matches;
        navigate(isMobile ? '/m/admin' : '/admin', { replace: true });
      } else {
        const isMobile = window.matchMedia('(max-width: 991px)').matches;
        navigate(isMobile ? '/m/inbound' : '/', { replace: true });
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '登录失败');
      // 自动登录失败时清除记住的密码（密码可能改了）
      if (autoTried.current) {
        localStorage.removeItem('remembered_credentials');
        form.setFieldsValue({ password: '' });
        message.warning('自动登录失败，请检查密码后重新登录', 3);
      }
    } finally {
      setLoading(false);
      autoTried.current = false;
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '16px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{
        width: '100%',
        maxWidth: 380,
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, right: 0 }}>
            <ServerConfigModal />
          </div>
          <InboxOutlined style={{ fontSize: 56, color: '#1677ff' }} />
          <Typography.Title level={3} style={{ marginTop: 12, marginBottom: 0 }}>库存管理系统</Typography.Title>
          <Typography.Text type="secondary">仓库管理 · 移动端</Typography.Text>
        </div>

        <Form form={form} onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Checkbox onChange={(e) => setRemember(e.target.checked)}>记住密码（下次自动登录）</Checkbox>
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44, fontSize: 16 }}>
              登 录
            </Button>
          </Form.Item>
        </Form>

        {import.meta.env.DEV && (
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 12, marginTop: 8 }}>
            超管: admin / admin123 | 客户: kehua / 123456
          </Typography.Text>
        )}
      </Card>
    </div>
  );
}
