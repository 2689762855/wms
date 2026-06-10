import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Select, Button, Card, Typography, Space, InputNumber, DatePicker, message, Divider, Tag, AutoComplete } from 'antd';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import { useAuth } from '../stores/AuthContext';
import BarcodeScanner from '../components/BarcodeScanner';
import ProductSelector from '../components/ProductSelector';
import { getCategoryPath } from '../utils/categoryTree';
import type { Warehouse, Product, Location } from '../types';

interface ItemEntry {
  productId: number;
  quantity: number;
  locationId?: number | null;
  expiryDate?: string | null;
  contractId?: number | null;
}

export default function InboundNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemEntry[]>([]);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [supplierOptions, setSupplierOptions] = useState<{ value: string }[]>([]);

  useEffect(() => {
    apiClient.get('/suppliers').then(res => {
      setSupplierOptions(res.data.map((s: any) => ({ value: s.name })));
    }).catch(() => {});
  }, []);

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => apiClient.get('/warehouses').then(res => res.data) });
  const { data: allProducts } = useQuery({ queryKey: ['products'], queryFn: () => apiClient.get('/products', { params: { pageSize: 200 } }).then(res => res.data.data) });

  const selectedWarehouseId: number | undefined = Form.useWatch('warehouseId', form);

  const { data: locations } = useQuery({
    queryKey: ['locations', selectedWarehouseId],
    queryFn: () => apiClient.get('/locations', { params: { warehouseId: selectedWarehouseId } }).then(r => r.data),
    enabled: !!selectedWarehouseId,
  });

  const { data: contractsData } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => apiClient.get('/contracts', { params: { pageSize: 500 } }).then(r => r.data),
  });

  // 选中合同的详情
  const { data: selectedContract } = useQuery({
    queryKey: ['contract', selectedContractId],
    queryFn: () => apiClient.get(`/contracts/${selectedContractId}`).then(r => r.data),
    enabled: !!selectedContractId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post('/inbound', data),
    onSuccess: (res) => {
      message.success('入库单已创建');
      queryClient.invalidateQueries({ queryKey: ['inbound'] });
      navigate(`/inbound/${res.data.id}`);
    },
    onError: (err: any) => message.error(err.response?.data?.error || '创建失败'),
  });

  const addItem = (productId: number) => {
    setItems([...items, { productId, quantity: 1, contractId: selectedContractId }]);
  };

  const updateItem = (idx: number, field: keyof ItemEntry, value: unknown) => {
    const newItems = [...items];
    (newItems[idx] as Record<string, unknown>)[field] = value;
    setItems(newItems);
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  // 从合同添加商品
  const addFromContract = (contractItem: any) => {
    const remaining = contractItem.plannedQty - contractItem.receivedQty;
    setItems([...items, {
      productId: contractItem.productId,
      quantity: Math.max(1, remaining),
      contractId: selectedContractId,
    }]);
  };

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
      setItems(prev => [...prev, { productId: p.id, quantity: 1, contractId: selectedContractId }]);
    }
    if (products.length) message.success(`已添加 ${products.length} 个商品`);
    setSelectorOpen(false);
  };

  const getProduct = (id: number) => allProducts?.find((p: Product) => p.id === id);

  // 显示将自动带入的单价（合同价 > 商品默认售价）
  const getItemPrice = (item: ItemEntry) => {
    if (item.contractId && selectedContract?.items) {
      const ci = selectedContract.items.find((i: any) => i.productId === item.productId);
      if (ci?.unitPrice != null) return ci.unitPrice;
    }
    const p = getProduct(item.productId);
    return p?.salePrice ?? null;
  };

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>新建入库单</Typography.Title>}>
      <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate({ ...values, items })}>
        <Space size="large" wrap style={{ width: '100%' }}>
          <Form.Item name="warehouseId" label="入库仓库" rules={[{ required: true }]} style={{ minWidth: 180 }}>
            <Select placeholder="选择仓库">{warehouses?.map((w: Warehouse) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="supplier" label="供应商"><AutoComplete options={supplierOptions} placeholder="输入或选择供应商" style={{ width: 200 }} allowClear filterOption={(inputValue, option) => option!.value.toLowerCase().includes(inputValue.toLowerCase())} /></Form.Item>
          <Form.Item label="关联合同（可选）" style={{ minWidth: 240 }}>
            <Select
              allowClear
              placeholder="选择合同，自动关联入库数量"
              value={selectedContractId}
              onChange={(v) => setSelectedContractId(v ?? null)}
              options={contractsData?.data?.filter((c: any) => {
                if (c.status !== 'active') return false;
                // 全部商品已入库完毕 → 不显示
                if (c.items?.length && c.items.every((ci: any) => ci.receivedQty >= ci.plannedQty)) return false;
                return true;
              }).map((c: any) => ({
                label: `${c.contractNo} (${c.customer?.realName || c.customer?.username})`,
                value: c.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="note" label="备注"><Input style={{ width: 260 }} /></Form.Item>
        </Space>
      </Form>

      {/* 合同商品概览 */}
      {selectedContract && (
        <Card size="small" title={`合同 ${selectedContract.contractNo} 商品进度`} style={{ marginBottom: 16, background: '#fafafa' }}>
          {selectedContract.items?.map((ci: any) => {
            const remaining = ci.plannedQty - ci.receivedQty;
            const isOver = remaining < 0;
            const isDone = remaining === 0;
            return (
              <div key={ci.productId} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Typography.Text style={{ minWidth: 200 }}>{ci.product?.name} ({ci.product?.sku})</Typography.Text>
                <Tag>计划 {ci.plannedQty}</Tag>
                <Tag color={isOver ? 'red' : isDone ? 'green' : 'blue'}>
                  已入库 {ci.receivedQty}
                </Tag>
                <Tag color={isOver ? 'red' : 'default'}>
                  {isOver ? `超出 ${Math.abs(remaining)}` : isDone ? '已完成' : `剩余 ${remaining}`}
                </Tag>
                {!isDone && !isOver && (
                  <Button size="small" type="link" onClick={() => addFromContract(ci)}>
                    添加入库
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <Divider />

      <Space orientation="vertical" style={{ width: '100%' }}>
        <Typography.Text strong>扫码录入</Typography.Text>
        <BarcodeScanner onScan={onScan} />
        {scannedProduct && <Typography.Text type="secondary">最近扫描: {scannedProduct.name} ({scannedProduct.sku})</Typography.Text>}

        <Typography.Text strong style={{ marginTop: 16, display: 'block' }}>
          商品明细 {selectedContractId && <Tag color="blue">合同关联</Tag>}
        </Typography.Text>

        {items.map((item, idx) => {
          const p = getProduct(item.productId);
          const price = getItemPrice(item);
          return (
            <Space key={idx} style={{ marginBottom: 8 }} wrap>
              <Typography.Text style={{ minWidth: 300 }}>{p ? `${getCategoryPath(p.category) !== '-' ? getCategoryPath(p.category) + ' · ' : ''}${p.sku} ${p.name}` : `商品 #${item.productId}`}</Typography.Text>
              <InputNumber min={1} value={item.quantity} onChange={(v) => updateItem(idx, 'quantity', v || 1)} placeholder="数量" style={{ width: 80 }} />
              {price != null && user?.operatorType !== 'warehouse' && <Tag color="green">¥{price.toFixed(2)}</Tag>}
              <Select allowClear placeholder="入库库位" value={item.locationId} onChange={(v) => updateItem(idx, 'locationId', v ?? null)}
                style={{ width: 160 }} options={locations?.map((l: Location) => ({ label: l.name, value: l.id }))}
                disabled={!selectedWarehouseId} notFoundContent={selectedWarehouseId ? '该仓库无库位' : '请先选择仓库'} />
              <DatePicker allowClear placeholder="保质期至" value={item.expiryDate ? dayjs(item.expiryDate) : null}
                onChange={(d) => updateItem(idx, 'expiryDate', d ? d.toISOString() : null)} style={{ width: 140 }} />
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

      <ProductSelector open={selectorOpen} onCancel={() => setSelectorOpen(false)} onOk={onProductsSelected} />
    </Card>
  );
}
