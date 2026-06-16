import { useState } from 'react';
import { Table, Button, Modal, Form, Input, Space, Card, Typography, message, Popconfirm, Tag, Statistic, Row, Col } from 'antd';
import { PlusOutlined, BankOutlined, TeamOutlined, InboxOutlined, SwapOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/AuthContext';
import apiClient from '../api/client';

export default function Warehouses() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOperator = user?.role === 'operator';
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: warehouses, isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiClient.get('/warehouses').then(res => res.data),
  });

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      editing
        ? apiClient.put(`/warehouses/${editing!.id}`, values)
        : apiClient.post('/warehouses', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      message.success(editing ? '已保存' : '已创建');
      setOpen(false);
      form.resetFields();
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/warehouses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      message.success('已删除');
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || '删除失败');
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };

  const openEdit = (w: any) => {
    setEditing(w);
    form.setFieldsValue(w);
    setOpen(true);
  };

  const columns = [
    {
      title: '仓库名称', dataIndex: 'name', key: 'name', width: 150,
      render: (name: string) => <strong>{name}</strong>,
    },
    { title: '地址', dataIndex: 'address', key: 'address', ellipsis: true },
    { title: '库存品类', dataIndex: 'inventoryCount', key: 'invCount', width: 80, align: 'center' as const },
    { title: '库存总量', dataIndex: 'totalQuantity', key: 'totalQty', width: 80, align: 'center' as const },
    { title: '人员数', dataIndex: 'userCount', key: 'users', width: 70, align: 'center' as const },
    { title: '入库/出库单', key: 'orders', width: 100, align: 'center' as const,
      render: (_: unknown, r: any) => <span>{r.totalInbound || 0} / {r.totalOutbound || 0}</span>,
    },
    {
      title: '操作', key: 'actions', width: 130,
      render: (_: unknown, record: any) => (
        isOperator ? <span style={{ color: '#999' }}>—</span> : (
        <Space size={4}>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button size="small" onClick={() => navigate(`/warehouses/${record.id}/locations`)}>库位</Button>
        </Space>
        )
      ),
    },
  ];

  const totalQty = warehouses?.reduce((s: number, w: any) => s + w.totalQuantity, 0) || 0;
  const totalUsers = warehouses?.reduce((s: number, w: any) => s + w.userCount, 0) || 0;

  return (
    <div>
      <Typography.Title level={4}>仓库管理</Typography.Title>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="仓库总数" value={warehouses?.length || 0} prefix={<BankOutlined />} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="库存总计" value={totalQty} suffix="件" prefix={<InboxOutlined />} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="仓库人员" value={totalUsers} suffix="人" prefix={<TeamOutlined />} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="出入库单" value={warehouses?.reduce((s: number, w: any) => s + (w.totalInbound || 0) + (w.totalOutbound || 0), 0) || 0} prefix={<SwapOutlined />} /></Card>
        </Col>
      </Row>

      <Card extra={!isOperator && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增仓库</Button>}>
        <Table rowKey="id" columns={columns} dataSource={warehouses} loading={isLoading} pagination={false}
          scroll={{ x: 900 }}
          expandable={{
            expandedRowRender: (record) => (
              <div style={{ padding: '8px 0' }}>
                {record.users?.length > 0 ? (
                  <Space wrap>
                    <Typography.Text strong>仓库人员：</Typography.Text>
                    {record.users.map((u: any) => (
                      <Tag key={u.id} color={u.role === 'warehouse_admin' ? 'blue' : 'default'}>
                        {u.realName || u.id} ({u.role === 'warehouse_admin' ? '管理员' : '操作员'})
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <Typography.Text type="secondary">暂无人员分配</Typography.Text>
                )}
              </div>
            ),
            rowExpandable: (r) => r.userCount > 0,
          }}
        />
      </Card>

      <Modal title={editing ? '编辑仓库' : '新增仓库'} open={open} onCancel={() => setOpen(false)}
        style={{ maxWidth: 500 }}
        footer={[
          <Button key="cancel" onClick={() => setOpen(false)}>取消</Button>,
          editing && (
            <Popconfirm key="delete" title="确认删除此仓库?" onConfirm={() => { deleteMutation.mutate(editing.id); setOpen(false); }}>
              <Button danger>删除仓库</Button>
            </Popconfirm>
          ),
          <Button key="submit" type="primary" loading={saveMutation.isPending} onClick={() => form.submit()}>保存</Button>,
        ]}
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="name" label="仓库名称" rules={[{ required: true, message: '请输入仓库名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="地址">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
