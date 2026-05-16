import { useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Space, Card, Typography, message, Popconfirm, Tag, Descriptions } from 'antd';
import { PlusOutlined, TeamOutlined, EditOutlined, StopOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { CustomerInfo } from '../types';

export default function Customers() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: customers, isLoading } = useQuery<CustomerInfo[]>({
    queryKey: ['customers'],
    queryFn: () => apiClient.get('/customers').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (values: { username: string; password: string; realName?: string; maxWarehouses?: number }) =>
      apiClient.post('/customers', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('客户已创建，自动分配专属仓库');
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
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => v === 'active' ? <Tag color="green">正常</Tag> : <Tag color="red">已暂停</Tag> },
    { title: '仓库', dataIndex: 'warehouses', key: 'warehouses', width: 200,
      render: (v: CustomerInfo['warehouses']) => v?.map(w => <Tag key={w.id}>{w.name}</Tag>) },
    { title: '商品数', dataIndex: '_count', key: 'products', width: 70,
      render: (v: { products: number } | undefined) => v?.products ?? 0 },
    { title: '仓库上限', dataIndex: 'maxWarehouses', key: 'maxWarehouses', width: 80 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 160,
      render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    {
      title: '操作', key: 'actions', width: 160,
      render: (_: unknown, r: CustomerInfo) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>管理</Button>
          <Popconfirm
            title={r.status === 'active' ? '确认暂停此客户?' : '确认恢复此客户?'}
            onConfirm={() => updateMutation.mutate({ id: r.id, status: r.status === 'active' ? 'suspended' : 'active' })}
          >
            <Button size="small" icon={r.status === 'active' ? <StopOutlined /> : <PlayCircleOutlined />}
              danger={r.status === 'active'}>{r.status === 'active' ? '暂停' : '恢复'}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>客户管理</Typography.Title>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <TeamOutlined />
          <Typography.Text type="secondary">管理系统客户 — 创建客户时自动分配专属仓库，客户登录后可独立管理自己的仓库</Typography.Text>
        </Space>
      </Card>
      <Card extra={<Button type="primary" icon={<PlusOutlined />}
        onClick={() => { form.resetFields(); setOpen(true); }}>新增客户</Button>}>
        <Table rowKey="id" columns={columns} dataSource={customers} loading={isLoading}
          pagination={false} scroll={{ x: 870 }} />
      </Card>

      {/* 新增客户 */}
      <Modal title="新增客户" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()}
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
          <Space direction="vertical" style={{ width: '100%' }}>
            <Popconfirm title="确认永久删除此客户及其所有数据?" onConfirm={() => {
              deleteMutation.mutate(editId!);
              setEditId(null);
            }}>
              <Button danger block>删除客户及其所有数据</Button>
            </Popconfirm>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
