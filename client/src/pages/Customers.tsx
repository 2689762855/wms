import { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Card, Typography, message, Popconfirm, Tag } from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';

interface Customer {
  id: number;
  username: string;
  realName?: string;
  warehouseId?: number;
  createdAt: string;
}

interface Warehouse {
  id: number;
  name: string;
}

export default function Customers() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => apiClient.get('/customers').then(r => r.data),
  });

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: () => apiClient.get('/warehouses').then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (values: { username: string; password: string; realName?: string; warehouseId?: number }) =>
      apiClient.post('/customers', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('已创建');
      setOpen(false);
      form.resetFields();
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('已删除');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const columns: any[] = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 140,
      render: (v: string) => <strong>{v}</strong> },
    { title: '姓名', dataIndex: 'realName', key: 'realName', width: 100, render: (v: string) => v || '-' },
    {
      title: '可见仓库', dataIndex: 'warehouseId', key: 'warehouse', width: 140,
      render: (v: number | undefined) =>
        v ? <Tag color="blue">{(warehouses || []).find(w => w.id === v)?.name || '—'}</Tag> : <Tag color="green">全部仓库</Tag>,
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170,
      render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    {
      title: '操作', key: 'actions', width: 70,
      render: (_: unknown, r: Customer) => (
        <Popconfirm title="确认删除此客户?" onConfirm={() => deleteMutation.mutate(r.id)}>
          <Button size="small" danger>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>客户管理</Typography.Title>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <TeamOutlined />
          <Typography.Text type="secondary">管理库存查询页面的客户登录账号</Typography.Text>
        </Space>
      </Card>
      <Card extra={<Button type="primary" icon={<PlusOutlined />}
        onClick={() => { form.resetFields(); setOpen(true); }}>新增客户</Button>}>
        <Table rowKey="id" columns={columns} dataSource={customers} loading={isLoading}
          pagination={false} scroll={{ x: 620 }} />
      </Card>

      <Modal title="新增客户" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending} style={{ maxWidth: 420 }}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="客户登录用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="至少6位" />
          </Form.Item>
          <Form.Item name="realName" label="姓名">
            <Input placeholder="可选，用于显示" />
          </Form.Item>
          <Form.Item name="warehouseId" label="可见仓库" initialValue={null}>
            <Select allowClear placeholder="全部仓库（可查看所有仓库库存）"
              options={[
                { value: null, label: '全部仓库' },
                ...(warehouses || []).map(w => ({ value: w.id, label: w.name })),
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
