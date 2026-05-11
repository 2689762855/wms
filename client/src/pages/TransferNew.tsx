import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Select, Button, Card, Typography, Space, InputNumber, Input, message, Divider } from 'antd';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../stores/AuthContext';
import apiClient from '../api/client';
import ProductSelector from '../components/ProductSelector';
import type { Warehouse, Product } from '../types';

interface ItemEntry {
  productId: number;
  quantity: number;
}

export default function TransferNew() {
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemEntry[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => apiClient.get('/warehouses').then(r => r.data) });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => apiClient.get('/products', { params: { pageSize: 200 } }).then(r => r.data.data) });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post('/transfer', data),
    onSuccess: () => { message.success('调拨单已创建，需目标仓库审批'); navigate('/transfer'); },
    onError: (err: any) => message.error(err.response?.data?.error || '创建失败'),
  });

  const isSuperAdmin = me?.role === 'super_admin';

  const updateItem = (idx: number, value: number) => {
    const n = [...items];
    n[idx].quantity = value || 1;
    setItems(n);
  };

  const onProductsSelected = (selected: Product[]) => {
    for (const p of selected) {
      setItems(prev => [...prev, { productId: p.id, quantity: 1 }]);
    }
    if (selected.length) message.success(`已添加 ${selected.length} 个商品`);
    setSelectorOpen(false);
  };

  const getProduct = (id: number) => products?.find((p: Product) => p.id === id);

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>新建调拨单</Typography.Title>}>
      <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate({ ...values, items })}>
        <Space size="large" wrap style={{ width: '100%' }}>
          <Form.Item name="fromWarehouseId" label="源仓库" rules={[{ required: true }]} style={{ minWidth: 180 }}
            initialValue={isSuperAdmin ? undefined : me?.warehouseId}
          >
            <Select disabled={!isSuperAdmin}>
              {warehouses?.map((w: Warehouse) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="toWarehouseId" label="目标仓库" rules={[{ required: true }]} style={{ minWidth: 180 }}>
            <Select>
              {warehouses?.filter((w: Warehouse) => w.id !== me?.warehouseId || isSuperAdmin).map((w: Warehouse) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="note" label="备注"><Input style={{ width: 260 }} /></Form.Item>
        </Space>
      </Form>

      <Divider />

      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text strong>商品明细</Typography.Text>
        {items.map((item, idx) => {
          const p = getProduct(item.productId);
          return (
            <Space key={idx} style={{ marginBottom: 8 }} wrap>
              <Typography.Text style={{ minWidth: 300 }}>{p ? `${p.category?.parent?.parent?.name || '-'} · ${p.sku} ${p.name}` : `商品 #${item.productId}`}</Typography.Text>
              <InputNumber min={1} value={item.quantity} onChange={(v) => updateItem(idx, v || 1)} style={{ width: 80 }} />
              <Button danger size="small" onClick={() => setItems(items.filter((_, i) => i !== idx))}>删除</Button>
            </Space>
          );
        })}
        <Space>
          <Button type="dashed" onClick={() => setSelectorOpen(true)}>添加商品</Button>
          <Typography.Text type="secondary">共 {items.length} 项</Typography.Text>
        </Space>
      </Space>

      <Divider />
      <Button type="primary" size="large" onClick={() => form.submit()} loading={createMutation.isPending} disabled={!items.length}>保存调拨单</Button>
      <Button style={{ marginLeft: 16 }} onClick={() => navigate('/transfer')}>取消</Button>

      <ProductSelector
        open={selectorOpen}
        onCancel={() => setSelectorOpen(false)}
        onOk={onProductsSelected}
      />
    </Card>
  );
}
