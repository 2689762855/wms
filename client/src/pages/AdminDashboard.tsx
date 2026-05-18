import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Statistic, Typography, Tag, Button, Space, Modal, message, Table } from 'antd';
import { TeamOutlined, BankOutlined, ShoppingOutlined, PlusOutlined, EyeOutlined, StopOutlined, PlayCircleOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import { useAuth } from '../stores/AuthContext';
import type { CustomerInfo } from '../types';
import CreateCustomerModal from '../components/CreateCustomerModal';

export default function AdminDashboard() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<CustomerInfo | null>(null);

  const { data: customers, isLoading } = useQuery<CustomerInfo[]>({
    queryKey: ['customers'],
    queryFn: () => apiClient.get('/customers').then(r => r.data),
  });

  const switchMutation = useMutation({
    mutationFn: (customerId: number) => apiClient.post('/auth/switch-customer', { customerId }),
    onSuccess: (res) => {
      login(res.data.token, res.data.user);
      message.success('已进入客户视角，可操作其仓库数据');
      navigate('/dashboard', { replace: true });
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

  const totalWarehouses = customers?.reduce((s, c) => s + (c.warehouses?.length || 0), 0) || 0;
  const totalProducts = customers?.reduce((s, c) => s + (c._count?.products || 0), 0) || 0;
  const activeCustomers = customers?.filter(c => c.status === 'active').length || 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>平台管理</Typography.Title>
          <Typography.Text type="secondary">{user?.realName || user?.username}，欢迎回来</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => setCreateOpen(true)}>
          开通新客户
        </Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card hoverable onClick={() => navigate('/settings/customers')}>
            <Statistic title="活跃客户" value={activeCustomers} prefix={<TeamOutlined />} suffix={`/ ${customers?.length || 0}`} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="客户仓库总数" value={totalWarehouses} prefix={<BankOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="客户商品总数" value={totalProducts} prefix={<ShoppingOutlined />} />
          </Card>
        </Col>
      </Row>

      <Typography.Title level={5}>客户列表</Typography.Title>
      <Table
        rowKey="id"
        dataSource={customers}
        loading={isLoading}
        pagination={false}
        columns={[
          {
            title: '客户', dataIndex: 'realName', key: 'name', width: 160,
            render: (v: string, r: CustomerInfo) => (
              <div>
                <div style={{ fontWeight: 600 }}>{v || r.username}</div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.username}</Typography.Text>
              </div>
            ),
          },
          { title: '开通人', key: 'creator', width: 80,
            render: (_: unknown, r: CustomerInfo) => r.createdByUser?.realName || r.createdByUser?.username || '-' },
          { title: '状态', dataIndex: 'status', key: 'status', width: 80,
            render: (v: string) => v === 'active' ? <Tag color="green">正常</Tag> : <Tag color="red">已暂停</Tag> },
          { title: '仓库', dataIndex: 'warehouses', key: 'warehouses', width: 200,
            render: (v: CustomerInfo['warehouses']) => v?.map(w => <Tag key={w.id}>{w.name}</Tag>) },
          { title: '仓库上限', dataIndex: 'maxWarehouses', key: 'max', width: 80 },
          { title: '商品数', key: 'products', width: 70,
            render: (_: unknown, r: CustomerInfo) => r._count?.products ?? 0 },
          { title: '有效期', key: 'expiry', width: 110,
            render: (_: unknown, r: any) => {
              if (!r.expiresAt) return <Tag color="purple">永久</Tag>;
              const days = Math.ceil((new Date(r.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
              if (days < 0) return <Tag color="red">已过期</Tag>;
              if (days <= 7) return <Tag color="orange">{days}天后到期</Tag>;
              if (days <= 30) return <Tag color="blue">{days}天</Tag>;
              return `${days}天`;
            }},
          { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 140,
            render: (v: string) => new Date(v).toLocaleDateString('zh-CN') },
          {
            title: '操作', key: 'actions', width: 240,
            render: (_: unknown, r: CustomerInfo) => (
              <Space>
                <Button size="small" type="primary" icon={<EyeOutlined />}
                  onClick={() => switchMutation.mutate(r.id)} loading={switchMutation.isPending}>
                  进入客户视角
                </Button>
                <Button size="small" icon={r.status === 'active' ? <StopOutlined /> : <PlayCircleOutlined />}
                  danger={r.status === 'active'}
                  onClick={() => toggleMutation.mutate({ id: r.id, status: r.status === 'active' ? 'suspended' : 'active' })}>
                  {r.status === 'active' ? '暂停' : '恢复'}
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <CreateCustomerModal open={createOpen} onClose={() => setCreateOpen(false)}
        onSuccess={() => { setCreateOpen(false); queryClient.invalidateQueries({ queryKey: ['customers'] }); }} />
    </div>
  );
}
