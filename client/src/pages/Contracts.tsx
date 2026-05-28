import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Space, Card, Typography, message, Tag, AutoComplete } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import { useAuth } from '../stores/AuthContext';
import type { CustomerInfo } from '../types';

export default function Contracts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [selectedProducts, setSelectedProducts] = useState<{ productId?: number; plannedQty: number; unitPrice?: number }[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<number | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', statusFilter, customerFilter],
    queryFn: () => apiClient.get('/contracts', {
      params: { ...(statusFilter ? { status: statusFilter } : {}), ...(customerFilter ? { customerId: customerFilter } : {}) },
    }).then((r) => r.data),
  });

  const { data: products } = useQuery<any[]>({
    queryKey: ['products-all'],
    queryFn: () => apiClient.get('/products', { params: { pageSize: 9999 } }).then((r) => r.data.data),
  });

  const { data: customers } = useQuery<CustomerInfo[]>({
    queryKey: ['customers'],
    queryFn: () => apiClient.get('/customers').then((r) => r.data),
    enabled: user?.role !== 'operator',
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

  const columns = [
    { title: '合同号', dataIndex: 'contractNo', render: (v: string, r: any) => <a onClick={() => navigate(`/contracts/${r.id}`)}>{v}</a> },
    { title: '客户', dataIndex: ['customer', 'realName'] },
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
        <Select allowClear placeholder="客户筛选" style={{ width: 160 }} showSearch optionFilterProp="label" value={customerFilter} onChange={(v) => setCustomerFilter(v)} options={customers?.map((c) => ({ label: c.realName || c.username, value: c.id }))} />
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
            <AutoComplete
              placeholder="输入生意客户名，新客户自动创建"
              filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
              options={customers?.map((c) => ({ label: c.realName || c.username, value: c.id }))}
              onChange={(_val, opt: any) => form.setFieldValue('customerId', opt?.value ?? null)}
            >
              <Input />
            </AutoComplete>
          </Form.Item>
          <Form.Item name="customerId" hidden><Input /></Form.Item>
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
    </Card>
  );
}
