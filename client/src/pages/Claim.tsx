import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Typography, Spin, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import apiClient from '../api/client';
import { useAuth } from '../stores/AuthContext';

export default function Claim() {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const transferToken = searchParams.get('token');
    if (!transferToken) {
      setError('缺少中转凭证');
      return;
    }
    apiClient.post('/auth/claim', { transferToken })
      .then(async (res) => {
        const { token } = res.data;
        localStorage.setItem('token', token);
        // 获取用户信息
        try {
          const meRes = await apiClient.get('/auth/me');
          login(token, meRes.data);
          message.success('登录成功');
          const isMobile = window.matchMedia('(max-width: 991px)').matches;
          navigate(isMobile ? '/m/inbound' : '/dashboard', { replace: true });
        } catch {
          setError('获取用户信息失败');
        }
      })
      .catch((err) => {
        setError(err.response?.data?.error || '中转登录失败');
      });
  }, []);

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Card style={{ maxWidth: 400, textAlign: 'center' }}>
          <Typography.Title level={5} style={{ color: '#ff4d4f' }}>登录失败</Typography.Title>
          <Typography.Text type="secondary">{error}</Typography.Text>
          <div style={{ marginTop: 16 }}>
            <a href="/login">返回登录</a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <Spin size="large" />
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16 }}>正在登录...</Typography.Text>
      </div>
    </div>
  );
}
