import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Select, Button, Card, Typography, Space, InputNumber, message, Divider, Tag } from 'antd';
import { useQuery, useMutation } from '@tanstack/react-query';
import apiClient from '../api/client';
import BarcodeScanner from '../components/BarcodeScanner';
import ProductSelector from '../components/ProductSelector';
import { useAuth } from '../stores/AuthContext';
import { getCategoryPath } from '../utils/categoryTree';
import type { Warehouse, Product, InventoryItem } from '../types';

interface ItemEntry {
  productId: number;
  quantity: number;
  locationId?: number | null;
  contractId?: number | null;
}

export default function OutboundNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemEntry[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);

  useEffect(() => {
    if (user?.realName) form.setFieldValue('receiver', user.realName);
  }, [user, form]);

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => apiClient.get('/warehouses').then(r => r.data) });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => apiClient.get('/products', { params: { pageSize: 200 } }).then(r => r.data.data) });

  // 可选合同列表（active 状态）
  const { data: contracts } = useQuery({
    queryKey: ['contracts-active'],
    queryFn: () => apiClient.get('/contracts', { params: { status: 'completed', pageSize: 999 } }).then(r => r.data.data),
  });

  // 选中合同后获取其商品列表
  const { data: contractItems } = useQuery({
    queryKey: ['contract', selectedContractId, 'items'],
    queryFn: () => apiClient.get(`/contracts/${selectedContractId}`).then(r => r.data.items),
    enabled: !!selectedContractId,
  });

  // 选合同后自动填入商品
  useEffect(() => {
    if (contractItems && contractItems.length > 0 && selectedContractId) {
      setItems(contractItems.map((ci: any) => ({
        productId: ci.productId,
        quantity: ci.plannedQty || 1,
        contractId: selectedContractId,
      })));
    }
  }, [contractItems, selectedContractId]);
  const { data: containersData } = useQuery({ queryKey: ['containers'], queryFn: () => apiClient.get('/containers', { params: { pageSize: 9999 } }).then(r => r.data) });

  const { data: selectedContainer } = useQuery({
    queryKey: ['container', selectedContainerId],
    queryFn: () => apiClient.get(`/containers/${selectedContainerId}`).then(r => r.data),
    enabled: !!selectedContainerId,
  });

  const selectedWarehouseId: number | undefined = Form.useWatch('warehouseId', form);

  const { data: warehouseInventory } = useQuery({
    queryKey: ['inventory', selectedWarehouseId],
    queryFn: () => apiClient.get('/inventory', { params: { warehouseId: selectedWarehouseId } }).then(r => r.data),
    enabled: !!selectedWarehouseId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post('/outbound', data),
    onSuccess: (res) => { message.success('出库单已创建'); navigate(`/outbound/${res.data.id}`); },
    onError: (err: any) => message.error(err.response?.data?.error || '创建失败'),
  });

  const addItem = (productId: number) => {
    setItems([...items, { productId, quantity: 1, contractId: selectedContractId }]);
  };

  const updateItem = (idx: number, field: keyof ItemEntry, value: number | null) => {
    const newItems = [...items];
    (newItems[idx] as Record<string, unknown>)[field] = value;
    setItems(newItems);
  };

  const onScan = (barcode: string) => {
    const product = products?.find((p: Product) => p.barcode === barcode);
    if (product) { addItem(product.id); message.success(`已扫码: ${product.name}`); }
    else message.error('未找到对应商品');
  };

  const onProductsSelected = (selected: Product[]) => {
    for (const p of selected) {
      setItems(prev => [...prev, { productId: p.id, quantity: 1, contractId: selectedContractId }]);
    }
    if (selected.length) message.success(`已添加 ${selected.length} 个商品`);
    setSelectorOpen(false);
  };

  const getProduct = (id: number) => products?.find((p: Product) => p.id === id);

  const getLocationsForProduct = (productId: number) => {
    if (!warehouseInventory) return [];
    return warehouseInventory
      .filter((inv: InventoryItem) => inv.productId === productId && inv.quantity > 0)
      .map((inv: InventoryItem) => ({
        label: `${inv.location?.name || '-'} (库存: ${inv.quantity})`,
        value: inv.locationId,
      }));
  };

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>新建出库单</Typography.Title>}>
      <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate({ ...values, items, containerId: selectedContainerId })}>
        <Space size="large" wrap style={{ width: '100%' }}>
          <Form.Item name="warehouseId" label="出库仓库" rules={[{ required: true }]} style={{ minWidth: 180 }}>
            <Select placeholder="选择仓库">{warehouses?.map((w: Warehouse) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="receiver" label="领用人/部门"><Input style={{ width: 180 }} /></Form.Item>
          <Form.Item name="note" label="备注"><Input style={{ width: 260 }} /></Form.Item>
          <Form.Item label="关联货柜（可选）" style={{ minWidth: 240 }}>
            <Select
              allowClear
              placeholder="选择货柜，出库商品关联到货柜"
              value={selectedContainerId}
              onChange={(v) => setSelectedContainerId(v ?? null)}
              options={containersData?.data?.filter((c: any) => c.status === 'pending' || c.status === 'loading').map((c: any) => ({
                label: `${c.containerNo} (${c.customer?.realName || c.customer?.username}) [${c.status}]`,
                value: c.id,
              }))}
            />
          </Form.Item>
          <Form.Item label="关联合同批次（可选）" style={{ minWidth: 240 }}>
            <Select
              allowClear
              placeholder="选择合同，按批次定价"
              value={selectedContractId}
              onChange={(v) => setSelectedContractId(v ?? null)}
              options={(contracts || []).map((c: any) => ({
                label: `${c.contractNo} (${c.customer?.realName || c.customer?.username})`,
                value: c.id,
              }))}
            />
          </Form.Item>
        </Space>
      </Form>

      {selectedContainer && (
        <Card size="small" title={`货柜 ${selectedContainer.containerNo} 详情`} style={{ marginBottom: 16, background: '#fafafa' }}>
          <Space wrap>
            <Tag color={selectedContainer.status === 'pending' ? 'default' : selectedContainer.status === 'loading' ? 'processing' : 'success'}>
              {selectedContainer.status === 'pending' ? '待装柜' : selectedContainer.status === 'loading' ? '装柜中' : '已封柜'}
            </Tag>
            {selectedContainer.items?.length > 0 ? (
              selectedContainer.items.map((ci: any) => (
                <div key={ci.productId} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Typography.Text>{ci.product?.name} ({ci.product?.sku})</Typography.Text>
                  <Tag>计划 {ci.plannedQty}</Tag>
                  <Tag color="blue">实装 {ci.actualQty || 0}</Tag>
                  {ci.returnedQty > 0 && <Tag color="orange">甩柜 {ci.returnedQty}</Tag>}
                </div>
              ))
            ) : (
              <Typography.Text type="secondary">货柜暂无商品，出库确认后可在此装柜</Typography.Text>
            )}
          </Space>
        </Card>
      )}

      <Divider />

      <Space direction="vertical" style={{ width: '100%' }}>
        <BarcodeScanner onScan={onScan} />

        <Typography.Text strong>商品明细 {selectedContainerId && <Tag color="blue">关联货柜</Tag>}</Typography.Text>
        {items.map((item, idx) => {
          const p = getProduct(item.productId);
          const locOptions = getLocationsForProduct(item.productId);
          return (
            <Space key={idx} style={{ marginBottom: 8 }} wrap>
              <Typography.Text style={{ minWidth: 300 }}>{p ? `${getCategoryPath(p.category) !== '-' ? getCategoryPath(p.category) + ' · ' : ''}${p.sku} ${p.name}` : `商品 #${item.productId}`}</Typography.Text>
              <InputNumber min={1} value={item.quantity} onChange={(v) => updateItem(idx, 'quantity', v || 1)} style={{ width: 80 }} />
              <Select
                allowClear
                placeholder="出库库位"
                value={item.locationId}
                onChange={(v) => updateItem(idx, 'locationId', v ?? null)}
                style={{ width: 200 }}
                options={locOptions}
                disabled={!selectedWarehouseId}
                notFoundContent={selectedWarehouseId ? '该商品无库存' : '请先选择仓库'}
              />
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
      <Button type="primary" size="large" onClick={() => form.submit()} loading={createMutation.isPending} disabled={!items.length}>保存出库单</Button>
      <Button style={{ marginLeft: 16 }} onClick={() => navigate('/outbound')}>取消</Button>

      <ProductSelector
        open={selectorOpen}
        onCancel={() => setSelectorOpen(false)}
        onOk={onProductsSelected}
      />
    </Card>
  );
}
