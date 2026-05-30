import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Space, Card, Typography, message, Tag, Popconfirm, List } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';

export default function Contracts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [selectedProducts, setSelectedProducts] = useState<{ productId?: number; plannedQty: number; unitPrice?: number }[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [bizCustFilter, setBizCustFilter] = useState<number | undefined>();
  const [custMgrOpen, setCustMgrOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', statusFilter, bizCustFilter],
    queryFn: () => apiClient.get('/contracts', {
      params: { ...(statusFilter ? { status: statusFilter } : {}), ...(bizCustFilter ? { businessCustomerId: bizCustFilter } : {}) },
    }).then((r) => r.data),
  });

  const { data: products } = useQuery<any[]>({
    queryKey: ['products-all'],
    queryFn: () => apiClient.get('/products', { params: { pageSize: 9999 } }).then((r) => r.data.data),
  });

  const { data: businessCustomers, refetch: refetchCustomers } = useQuery<{ id: number; realName: string }[]>({
    queryKey: ['business-customers'],
    queryFn: () => apiClient.get('/contracts/business-customers').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (values: any) => {
      const payload = { ...values, items: selectedProducts.filter((p) => p.productId) };
      return apiClient.post('/contracts', payload);
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      message.success('已创建');
      setOpen(false);
      setSelectedProducts([]);
      form.resetFields();
      navigate(`/contracts/${res.data.id}`);
    },
    onError: (err: any) => message.error(err.response?.data?.error || '创建失败'),
  });

  const createCustMutation = useMutation({
    mutationFn: (realName: string) => apiClient.post('/contracts/business-customers', { realName }),
    onSuccess: () => {
      refetchCustomers();
      message.success('客户已创建');
      setNewCustName('');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '创建失败'),
  });

  const deleteCustMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/contracts/business-customers/${id}`),
    onSuccess: () => { refetchCustomers(); message.success('已删除'); },
    onError: (err: any) => message.error(err.response?.data?.error || '删除失败'),
  });

  const columns = [
    { title: '合同号', dataIndex: 'contractNo', render: (v: string, r: any) => <a onClick={() => navigate(`/contracts/${r.id}`)}>{v}</a> },
    { title: '客户', render: (_: any, r: any) => r.businessCustomer?.realName || r.customer?.realName },
    { title: '状态', dataIndex: 'status', render: (v: string) => {
      const m: Record<string, { color: string; label: string }> = { active: { color: 'processing', label: '进行中' }, completed: { color: 'success', label: '已完成' }, cancelled: { color: 'default', label: '已取消' } };
      return <Tag color={m[v]?.color}>{m[v]?.label || v}</Tag>;
    }},
    { title: '商品数', key: 'items', render: (_: any, r: any) => r.items?.length || 0 },
    { title: '创建时间', dataIndex: 'createdAt', render: (v: string) => v?.substring(0, 10) },
    { title: '操作', render: (_: any, r: any) => <Button size="small" onClick={() => navigate(`/contracts/${r.id}`)}>详情</Button> },
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>合同管理</Typography.Title>}
      extra={<Space>
        <Select allowClear placeholder="状态筛选" style={{ width: 120 }} value={statusFilter || undefined} onChange={(v) => setStatusFilter(v || '')} options={[{ label: '进行中', value: 'active' }, { label: '已完成', value: 'completed' }, { label: '已取消', value: 'cancelled' }]} />
        <Select allowClear placeholder="客户筛选" style={{ width: 150 }} value={bizCustFilter} onChange={(v) => setBizCustFilter(v)} showSearch optionFilterProp="label"
          options={businessCustomers?.map((c) => ({ label: c.realName, value: c.id }))} />
        <Button onClick={() => setCustMgrOpen(true)}>客户管理</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setSelectedProducts([]); form.resetFields(); setOpen(true); }}>新建合同</Button>
      </Space>}>
      <Table rowKey="id" columns={columns} dataSource={data?.data} loading={isLoading}
        pagination={{ total: data?.total, pageSize: 20, showSizeChanger: false }} />

      <Modal title="新建合同" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)} width={700}>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="contractNo" label="合同号" rules={[{ required: true }]}>
            <Input placeholder="如: CON-2026-001" />
          </Form.Item>
          <Form.Item name="customerName" label="客户" rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder="选择生意客户名（先去客户管理创建）"
              optionFilterProp="label"
              options={businessCustomers?.map((c) => ({ label: c.realName, value: c.realName }))}
            />
          </Form.Item>
          <Typography.Text strong>商品明细</Typography.Text>
          <div style={{ marginTop: 8 }}>
            {selectedProducts.map((sp, idx) => (
              <Space key={idx} style={{ display: 'flex', marginBottom: 8 }}>
                <Select style={{ width: 300 }} placeholder="选择商品" showSearch optionFilterProp="label"
                  value={sp.productId}
                  onChange={(v) => { const next = [...selectedProducts]; next[idx] = { ...next[idx], productId: v }; setSelectedProducts(next); }}
                  options={products?.map((p: any) => ({ label: `${p.sku} | ${p.name}`, value: p.id }))} />
                <InputNumber min={1} placeholder="计划数量" value={sp.plannedQty}
                  onChange={(v) => { const next = [...selectedProducts]; next[idx] = { ...next[idx], plannedQty: v || 0 }; setSelectedProducts(next); }} />
                <InputNumber min={0} step={0.01} placeholder="单价" value={sp.unitPrice} style={{ width: 100 }}
                  onChange={(v) => { const next = [...selectedProducts]; next[idx] = { ...next[idx], unitPrice: v ?? undefined }; setSelectedProducts(next); }} />
                <Button danger size="small" onClick={() => setSelectedProducts(selectedProducts.filter((_, i) => i !== idx))}>删除</Button>
              </Space>
            ))}
            <Button type="dashed" onClick={() => setSelectedProducts([...selectedProducts, { productId: undefined, plannedQty: 0 }])} block>+ 添加商品</Button>
          </div>
        </Form>
      </Modal>

      <Modal title="客户管理" open={custMgrOpen} onCancel={() => setCustMgrOpen(false)} footer={null} width={400}>
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input placeholder="新客户名称" value={newCustName} onChange={(e) => setNewCustName(e.target.value)}
            onPressEnter={() => newCustName && createCustMutation.mutate(newCustName)} />
          <Button type="primary" onClick={() => newCustName && createCustMutation.mutate(newCustName)}>新建</Button>
        </Space.Compact>
        <List
          dataSource={businessCustomers}
          renderItem={(item) => (
            <List.Item actions={[
              <Popconfirm title="确定删除？" onConfirm={() => deleteCustMutation.mutate(item.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ]}>
              {item.realName}
            </List.Item>
          )}
          locale={{ emptyText: '暂无客户' }}
        />
      </Modal>
    </Card>
  );
}
