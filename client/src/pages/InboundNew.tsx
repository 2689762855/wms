import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Select, Button, Card, Typography, Space, InputNumber, message, Divider } from 'antd';
import { useQuery, useMutation } from '@tanstack/react-query';
import apiClient from '../api/client';
import BarcodeScanner from '../components/BarcodeScanner';
import ProductSelector from '../components/ProductSelector';
import type { Warehouse, Product, Location } from '../types';

interface ItemEntry {
  productId: number;
  quantity: number;
  unitPrice?: number;
  locationId?: number | null;
}

export default function InboundNew() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemEntry[]>([]);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => apiClient.get('/warehouses').then(res => res.data) });
  const { data: allProducts } = useQuery({ queryKey: ['products'], queryFn: () => apiClient.get('/products', { params: { pageSize: 200 } }).then(res => res.data.data) });

  const selectedWarehouseId: number | undefined = Form.useWatch('warehouseId', form);

  const { data: locations } = useQuery({
    queryKey: ['locations', selectedWarehouseId],
    queryFn: () => apiClient.get('/locations', { params: { warehouseId: selectedWarehouseId } }).then(r => r.data),
    enabled: !!selectedWarehouseId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post('/inbound', data),
    onSuccess: (res) => {
      message.success('入库单已创建');
      navigate(`/inbound/${res.data.id}`);
    },
    onError: (err: any) => message.error(err.response?.data?.error || '创建失败'),
  });

  const addItem = (productId: number) => {
    setItems([...items, { productId, quantity: 1 }]);
  };

  const updateItem = (idx: number, field: keyof ItemEntry, value: number | null) => {
    const newItems = [...items];
    (newItems[idx] as Record<string, unknown>)[field] = value;
    setItems(newItems);
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const onScan = (barcode: string) => {
    const product = allProducts?.find((p: Product) => p.barcode === barcode);
    if (product) {
      addItem(product.id);
      setScannedProduct(product);
      message.success(`已扫码: ${product.name}`);
    } else {
      message.error('未找到对应商品');
    }
  };

  const onProductsSelected = (products: Product[]) => {
    for (const p of products) {
      setItems(prev => [...prev, { productId: p.id, quantity: 1 }]);
    }
    if (products.length) message.success(`已添加 ${products.length} 个商品`);
    setSelectorOpen(false);
  };

  const getProduct = (id: number) => allProducts?.find((p: Product) => p.id === id);

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>新建入库单</Typography.Title>}>
      <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate({ ...values, items })}>
        <Space size="large" wrap style={{ width: '100%' }}>
          <Form.Item name="warehouseId" label="入库仓库" rules={[{ required: true }]} style={{ minWidth: 180 }}>
            <Select placeholder="选择仓库">{warehouses?.map((w: Warehouse) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="supplier" label="供应商"><Input style={{ width: 180 }} /></Form.Item>
          <Form.Item name="note" label="备注"><Input style={{ width: 260 }} /></Form.Item>
        </Space>
      </Form>

      <Divider />

      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text strong>扫码录入</Typography.Text>
        <BarcodeScanner onScan={onScan} />
        {scannedProduct && <Typography.Text type="secondary">最近扫描: {scannedProduct.name} ({scannedProduct.sku})</Typography.Text>}

        <Typography.Text strong style={{ marginTop: 16, display: 'block' }}>商品明细</Typography.Text>

        {items.map((item, idx) => {
          const p = getProduct(item.productId);
          return (
            <Space key={idx} style={{ marginBottom: 8 }} wrap>
              <Typography.Text style={{ minWidth: 300 }}>{p ? `${p.category?.parent?.parent?.name || '-'} · ${p.sku} ${p.name}` : `商品 #${item.productId}`}</Typography.Text>
              <InputNumber min={1} value={item.quantity} onChange={(v) => updateItem(idx, 'quantity', v || 1)} placeholder="数量" style={{ width: 80 }} />
              <InputNumber min={0} precision={2} value={item.unitPrice} onChange={(v) => updateItem(idx, 'unitPrice', v || 0)} placeholder="单价" prefix="¥" style={{ width: 110 }} />
              <Select
                allowClear
                placeholder="入库库位"
                value={item.locationId}
                onChange={(v) => updateItem(idx, 'locationId', v ?? null)}
                style={{ width: 160 }}
                options={locations?.map((l: Location) => ({ label: l.name, value: l.id }))}
                disabled={!selectedWarehouseId}
                notFoundContent={selectedWarehouseId ? '该仓库无库位' : '请先选择仓库'}
              />
              <Button danger onClick={() => removeItem(idx)} size="small">删除</Button>
            </Space>
          );
        })}
        <Space>
          <Button type="dashed" onClick={() => setSelectorOpen(true)}>添加商品</Button>
          <Typography.Text type="secondary">共 {items.length} 项</Typography.Text>
        </Space>
      </Space>

      <Divider />
      <Button type="primary" size="large" onClick={() => form.submit()} loading={createMutation.isPending} disabled={!items.length}>保存入库单</Button>
      <Button style={{ marginLeft: 16 }} onClick={() => navigate('/inbound')}>取消</Button>

      <ProductSelector
        open={selectorOpen}
        onCancel={() => setSelectorOpen(false)}
        onOk={onProductsSelected}
      />
    </Card>
  );
}
