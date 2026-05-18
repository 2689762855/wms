import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Tag, Button, message, Dropdown } from 'antd';
import { PlusOutlined, TeamOutlined, EyeOutlined, StopOutlined, PlayCircleOutlined, LogoutOutlined, UserOutlined, InboxOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { useAuth } from '../../stores/AuthContext';
import type { CustomerInfo } from '../../types';
import CreateCustomerModal from '../../components/CreateCustomerModal';
import PullToRefresh from '../../components/PullToRefresh';
import ErrorBoundary from '../../components/ErrorBoundary';

export default function MobileCustomers() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: customers, isLoading } = useQuery<CustomerInfo[]>({
    queryKey: ['customers'],
    queryFn: () => apiClient.get('/customers').then(r => r.data),
  });

  const switchMutation = useMutation({
    mutationFn: (customerId: number) => apiClient.post('/auth/switch-customer', { customerId }),
    onSuccess: (res) => {
      login(res.data.token, res.data.user);
      message.success('已进入客户视角');
      navigate('/m/inbound', { replace: true });
    },
    onError: (err: any) => message.error(err.response?.data?.error || '切换失败'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiClient.put(`/customers/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('状态已更新');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const activeCount = customers?.filter(c => c.status === 'active').length || 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', background: '#fff', height: 48,
        borderBottom: '1px solid #f0f0f0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <InboxOutlined style={{ fontSize: 22, color: '#1677ff' }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>平台管理</span>
        </div>
        <Dropdown menu={{ items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout }] }}>
          <Button type="text" icon={<UserOutlined />} size="small">
            {user?.realName || user?.username}
          </Button>
        </Dropdown>
      </div>

      <PullToRefresh>
        <ErrorBoundary>
        <div style={{ padding: 12 }}>
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 12, padding: '16px 20px', marginBottom: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            color: '#fff',
          }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>活跃客户 / 总客户</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {activeCount} <span style={{ fontSize: 16, opacity: 0.6 }}>/ {customers?.length || 0}</span>
              </div>
            </div>
            <TeamOutlined style={{ fontSize: 40, opacity: 0.3 }} />
          </div>

          <Button
            type="primary" icon={<PlusOutlined />} size="large" block
            style={{ height: 48, fontSize: 16, marginBottom: 16, borderRadius: 10 }}
            onClick={() => setCreateOpen(true)}
          >
            开通新客户
          </Button>

          {isLoading ? (
            <Typography.Text type="secondary">加载中...</Typography.Text>
          ) : (
            customers?.map(c => {
              const creatorName = c.createdByUser?.realName || c.createdByUser?.username;
              return (
                <Card key={c.id} size="small" style={{ marginBottom: 10, borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{c.realName || c.username}</span>
                        <Tag color={c.status === 'active' ? 'green' : 'red'} style={{ margin: 0, fontSize: 11 }}>
                          {c.status === 'active' ? '正常' : '已暂停'}
                        </Tag>
                      </div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {c.username}
                        {creatorName && <span> · 开通人：{creatorName}</span>}
                      </Typography.Text>
                      <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Tag>{c.warehouses?.length || 0} 个仓库</Tag>
                        <Tag>{c._count?.products || 0} 个商品</Tag>
                        {(() => {
                          if (!c.expiresAt) return <Tag color="purple">永久</Tag>;
                          const days = Math.ceil((new Date(c.expiresAt).getTime() - Date.now()) / 86400000);
                          if (days < 0) return <Tag color="red">已过期</Tag>;
                          if (days <= 7) return <Tag color="orange">{days}天后到期</Tag>;
                          return <Tag color="blue">{days}天</Tag>;
                        })()}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    <Button size="small" type="primary" icon={<EyeOutlined />} block
                      onClick={() => switchMutation.mutate(c.id)}
                      loading={switchMutation.isPending}>
                      进入客户视角
                    </Button>
                    <Button size="small" block
                      danger={c.status === 'active'}
                      icon={c.status === 'active' ? <StopOutlined /> : <PlayCircleOutlined />}
                      onClick={() => toggleMutation.mutate({ id: c.id, status: c.status === 'active' ? 'suspended' : 'active' })}>
                      {c.status === 'active' ? '暂停' : '恢复'}
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
          {customers?.length === 0 && !isLoading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              暂无客户，点击上方按钮开通第一个
            </div>
          )}
        </div>
        </ErrorBoundary>
      </PullToRefresh>

      <CreateCustomerModal open={createOpen} onClose={() => setCreateOpen(false)}
        onSuccess={() => { setCreateOpen(false); queryClient.invalidateQueries({ queryKey: ['customers'] }); }} />
    </div>
  );
}
