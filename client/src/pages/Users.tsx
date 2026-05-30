import { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Card, Typography, message, Popconfirm } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../stores/AuthContext';
import apiClient from '../api/client';
import type { User, Warehouse } from '../types';

export default function Users() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.role === 'super_admin';
  const isOperator = me?.role === 'operator';
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState('operator');
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/users').then(res => res.data),
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiClient.get('/warehouses').then(res => res.data),
  });

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      editing
        ? apiClient.put(`/users/${editing!.id}`, values)
        : apiClient.post('/users', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success(editing ? '已保存' : '已创建');
      setOpen(false);
      form.resetFields();
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
    onError: (err: any) => message.error(err.response?.data?.error || '删除失败'),
      queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success('已删除');
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setSelectedRole('operator');
    form.setFieldsValue({ role: 'operator' });
    setOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setSelectedRole(user.role);
    form.setFieldsValue(user);
    setOpen(true);
  };

  const columns = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '姓名', dataIndex: 'realName', key: 'realName' },
    { title: '手机', dataIndex: 'phone', key: 'phone' },
    { title: '所属仓库', dataIndex: ['warehouse', 'name'], key: 'warehouse' },
    ...(isSuperAdmin ? [
      {
        title: '角色', dataIndex: 'role', key: 'role',
        render: (r: string) => {
          const map: Record<string, string> = { super_admin: '超级管理员', warehouse_admin: '仓库管理员', operator: '操作员' };
          return map[r] || r;
        },
      },
      {
        title: '创建人', key: 'createdBy',
        render: (_: unknown, record: User) => record.createdBy?.realName || record.createdBy?.username || '—',
      },
    ] : []),
    {
      title: '操作', key: 'actions',
      render: (_: unknown, record: User) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          {!isOperator && record.id !== me?.id && (
            <Popconfirm title="确认删除?" onConfirm={() => deleteMutation.mutate(record.id)}>
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>用户管理</Typography.Title>} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增用户</Button>}>
      <Table rowKey="id" columns={columns} dataSource={users} loading={isLoading} pagination={false} scroll={{ x: 700 }} />

      <Modal title={editing ? '编辑用户' : '新增用户'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={saveMutation.isPending}>
        <Form form={form} layout="vertical" onFinish={(values) => {
          if (!isSuperAdmin) delete values.warehouseId;
          saveMutation.mutate(values);
        }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="password" label={editing ? '新密码（留空不修改）' : '密码'} rules={editing ? [] : [{ required: true, message: '请输入密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="realName" label="姓名">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机">
            <Input />
          </Form.Item>
          {isSuperAdmin && (
            <Form.Item name="role" label="角色" rules={[{ required: true }]}>
              <Select onChange={(v) => setSelectedRole(v)}>
                <Select.Option value="super_admin">超级管理员</Select.Option>
                <Select.Option value="warehouse_admin">仓库管理员</Select.Option>
                <Select.Option value="operator">操作员</Select.Option>
              </Select>
            </Form.Item>
          )}
          {isSuperAdmin && (selectedRole === 'warehouse_admin' || selectedRole === 'operator') && (
            <Form.Item name="warehouseId" label="所属仓库">
              <Select allowClear placeholder="选择仓库">
                {warehouses?.map((w: Warehouse) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
              </Select>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  );
}
