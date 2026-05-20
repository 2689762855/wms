import { useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Space, Card, Typography, message, Popconfirm, Tag, Switch } from 'antd';
import { PlusOutlined, TeamOutlined, EditOutlined, StopOutlined, PlayCircleOutlined, DollarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { CustomerInfo } from '../types';
import dayjs from 'dayjs';

function ExpiryTag({ expiresAt, status }: { expiresAt: string | null; status: string }) {
  if (!expiresAt) return <Tag color="blue">永久</Tag>;
  const days = dayjs(expiresAt).diff(dayjs(), 'day');
  if (days < 0) return <Tag color="red">已过期 {Math.abs(days)} 天</Tag>;
  if (days <= 7) return <Tag color="orange">剩 {days} 天</Tag>;
  if (days <= 30) return <Tag color="gold">剩 {days} 天</Tag>;
  return <Tag color="green">{dayjs(expiresAt).format('YYYY-MM-DD')}</Tag>;
}

export default function Customers() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: autoApprove } = useQuery({
    queryKey: ['autoApprove'],
    queryFn: () => apiClient.get('/settings/auto-approve').then(r => r.data.enabled),
  });

  const autoApproveMutation = useMutation({
    mutationFn: (enabled: boolean) => apiClient.put('/settings/auto-approve', { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoApprove'] });
      message.success(autoApprove ? '已关闭自动审批' : '已开启自动审批');
    },
  });

  const { data: customers, isLoading } = useQuery<CustomerInfo[]>({
    queryKey: ['customers'],
    queryFn: () => apiClient.get('/customers').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (values: { username: string; password: string; realName?: string; maxWarehouses?: number }) =>
      apiClient.post('/customers', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('客户已创建，自动分配专属仓库 + 90 天免费试用');
      setOpen(false);
      form.resetFields();
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...values }: { id: number; status?: string; maxWarehouses?: number; password?: string; addWarehouseName?: string; realName?: string }) =>
      apiClient.put(`/customers/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('已更新');
      setEditId(null);
      editForm.resetFields();
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const renewMutation = useMutation({
    mutationFn: (id: number) => apiClient.put(`/customers/${id}/renew`, { days: 365 }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success(data.message || '已续费');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '续费失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('已删除客户及其所有数据');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const openEdit = (customer: CustomerInfo) => {
    setEditId(customer.id);
    editForm.setFieldsValue(customer);
  };

  const columns: any[] = [
    { title: '客户名称', dataIndex: 'realName', key: 'realName', width: 120,
      render: (v: string, r: CustomerInfo) => <><strong>{v || r.username}</strong><br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.username}</Typography.Text></> },
    { title: '状态', dataIndex: 'status', key: 'status', width: 70,
      render: (v: string) => {
        if (v === 'active') return <Tag color="green">正常</Tag>;
        if (v === 'pending') return <Tag color="gold">待审批</Tag>;
        return <Tag color="red">已暂停</Tag>;
      }},
    { title: '到期', key: 'expiry', width: 130,
      render: (_: unknown, r: CustomerInfo) => <ExpiryTag expiresAt={r.expiresAt} status={r.status} /> },
    { title: '仓库', dataIndex: 'warehouses', key: 'warehouses', width: 160,
      render: (v: CustomerInfo['warehouses']) => v?.map(w => <Tag key={w.id}>{w.name}</Tag>) },
    { title: '上限', dataIndex: 'maxWarehouses', key: 'maxWarehouses', width: 60 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 120,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm') },
    {
      title: '操作', key: 'actions', width: 220,
      render: (_: unknown, r: CustomerInfo) => (
        <Space>
          {r.status === 'pending' && (
            <Button size="small" type="primary" icon={<PlayCircleOutlined />}
              onClick={() => updateMutation.mutate({ id: r.id, status: 'active' })}
              loading={updateMutation.isPending}>审批通过</Button>
          )}
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>管理</Button>
          {r.status !== 'pending' && (
            <Button size="small" icon={<DollarOutlined />} type="primary"
              onClick={() => { if (confirm(`确认为「${r.realName || r.username}」续费一年？`)) renewMutation.mutate(r.id); }}
              loading={renewMutation.isPending}>续费</Button>
          )}
          {r.status !== 'pending' && (
            <Popconfirm
              title={r.status === 'active' ? '确认暂停此客户?' : '确认恢复此客户?'}
              onConfirm={() => updateMutation.mutate({ id: r.id, status: r.status === 'active' ? 'suspended' : 'active' })}
            >
              <Button size="small" icon={r.status === 'active' ? <StopOutlined /> : <PlayCircleOutlined />}
                danger={r.status === 'active'}>{r.status === 'active' ? '暂停' : '恢复'}</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>客户管理</Typography.Title>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <TeamOutlined />
            <Typography.Text type="secondary">新客户自动获得 90 天免费试用 · 续费按年收费 · 到期前 7 天提醒 · 到期后自动暂停</Typography.Text>
          </Space>
          <Space>
            <Switch checked={autoApprove} onChange={(v) => autoApproveMutation.mutate(v)} loading={autoApproveMutation.isPending} />
            <Typography.Text>自动通过注册审批</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>开启后新注册的客户无需手动审批，直接激活</Typography.Text>
          </Space>
        </Space>
      </Card>
      <Card extra={<Button type="primary" icon={<PlusOutlined />}
        onClick={() => { form.resetFields(); setOpen(true); }}>新增客户</Button>}>
        <Table rowKey="id" columns={columns} dataSource={customers} loading={isLoading}
          pagination={false} scroll={{ x: 900 }} />
      </Card>

      {/* 新增客户 */}
      <Modal title="新增客户（自动赠送 90 天免费试用）" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()}
        confirmLoading={createMutation.isPending} style={{ maxWidth: 420 }}
      >
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="username" label="登录用户名" rules={[{ required: true, message: '请输入' }]}>
            <Input placeholder="客户登录用户名" />
          </Form.Item>
          <Form.Item name="password" label="登录密码" rules={[{ required: true, message: '请输入' }]}>
            <Input.Password placeholder="至少6位" />
          </Form.Item>
          <Form.Item name="realName" label="客户名称" rules={[{ required: true, message: '请输入' }]}>
            <Input placeholder="如：科华公司" />
          </Form.Item>
          <Form.Item name="warehouseName" label="仓库名称">
            <Input placeholder="默认「客户名称主仓库」" />
          </Form.Item>
          <Form.Item name="maxWarehouses" label="仓库数量上限" initialValue={1}>
            <InputNumber min={1} max={50} placeholder="1" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 管理客户 */}
      <Modal title="管理客户" open={!!editId} onCancel={() => { setEditId(null); editForm.resetFields(); }}
        onOk={() => editForm.submit()} confirmLoading={updateMutation.isPending} style={{ maxWidth: 480 }}
      >
        {editId && customers && (() => {
          const c = customers.find(x => x.id === editId);
          return c ? (
            <Typography.Paragraph style={{ marginBottom: 12 }}>
              {!c.expiresAt ? '🎫 永久有效' :
                dayjs(c.expiresAt).isBefore(dayjs()) ? <span style={{ color: '#ff4d4f' }}>🔴 已过期 {Math.abs(dayjs(c.expiresAt).diff(dayjs(), 'day'))} 天</span> :
                <span>⏱ 到期：{dayjs(c.expiresAt).format('YYYY-MM-DD')}（剩 {dayjs(c.expiresAt).diff(dayjs(), 'day')} 天）</span>
              }
            </Typography.Paragraph>
          ) : null;
        })()}
        <Form form={editForm} layout="vertical" onFinish={(v) => updateMutation.mutate({ id: editId!, ...v })}>
          <Form.Item name="realName" label="客户名称">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={[{ value: 'active', label: '正常' }, { value: 'suspended', label: '已暂停' }]} />
          </Form.Item>
          <Form.Item name="password" label="重置密码">
            <Input.Password placeholder="留空不修改" />
          </Form.Item>
          <Form.Item name="maxWarehouses" label="仓库数量上限">
            <InputNumber min={1} max={50} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="addWarehouseName" label="追加仓库">
            <Input placeholder="如：科华原料仓" />
          </Form.Item>
          <Space>
            <Button icon={<DollarOutlined />} type="primary" loading={renewMutation.isPending}
              onClick={() => { if (confirm('确认续费一年？')) renewMutation.mutate(editId!); }}>续费一年</Button>
            <Popconfirm title="确认永久删除此客户及其所有数据?" onConfirm={() => {
              deleteMutation.mutate(editId!);
              setEditId(null);
            }}>
              <Button danger>删除客户及其所有数据</Button>
            </Popconfirm>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
