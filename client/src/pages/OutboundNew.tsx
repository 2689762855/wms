import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Select, Button, Card, Typography, Space, InputNumber, message, Divider, Tag } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  batchNo?: string | null;
}

export default function OutboundNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemEntry[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null);
  const [selectedContractIds, setSelectedContractIds] = useState<number[]>([]);
  const [containerNoText, setContainerNoText] = useState('');

  useEffect(() => {
    if (user?.realName) form.setFieldValue('receiver', user.realName);
  }, [user, form]);

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => apiClient.get('/warehouses').then(r => r.data) });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => apiClient.get('/products', { params: { pageSize: 200 } }).then(r => r.data.data) });

  // 可选合同列表（进行中+已完成，排除已出完和已取消）
  const { data: contracts } = useQuery({
    queryKey: ['contracts-active'],
    queryFn: () => apiClient.get('/contracts', { params: { pageSize: 999, excludeShipped: true } }).then(r => r.data.data),
  });

  // 选中多合同后获取所有商品
  const { data: multiContractItems } = useQuery({
    queryKey: ['contracts', selectedContractIds, 'items'],
    queryFn: async () => {
      if (selectedContractIds.length === 0) return [];
      const results = await Promise.all(selectedContractIds.map(cid => apiClient.get(`/contracts/${cid}`).then(r => r.data)));
      return results;
    },
    enabled: selectedContractIds.length > 0,
  });

  const warehouseInventoryRef = useRef<InventoryItem[] | undefined>();

  // 选合同后自动填入商品（按批次库存，含库位；选排柜时跳过，由排柜逻辑接管）
  useEffect(() => {
    if (!selectedContainerId && multiContractItems && multiContractItems.length > 0) {
      setItems(prev => {
        const existingKeys = new Set(prev.map(i => `${i.productId}_${i.batchNo || 'null'}_${i.locationId || 0}`));
        const newItems: ItemEntry[] = [];
        const inv = warehouseInventoryRef.current;

        multiContractItems.forEach((ct: any) => {
          const ctBatchNos = new Set((ct.batchNos || []).filter(Boolean) as string[]);
          (ct.items || []).forEach((ci: any) => {
            if (inv && inv.length > 0) {
              // 只添加该合同关联批次的库存（每个库位单独一条）
              const batches = inv.filter(
                (x: InventoryItem) => x.productId === ci.productId && x.quantity > 0 && x.batchNo && ctBatchNos.has(x.batchNo)
              );
              if (batches.length > 0) {
                batches.forEach((b: InventoryItem) => {
                  const key = `${ci.productId}_${b.batchNo || 'null'}_${b.locationId || 0}`;
                  if (!existingKeys.has(key)) {
                    newItems.push({
                      productId: ci.productId,
                      quantity: b.quantity,
                      locationId: b.locationId,
                      contractId: ct.id,
                      batchNo: b.batchNo,
                    });
                    existingKeys.add(key);
                  }
                });
              }
            } else {
              // 未选仓库，按合同计划量添加
              const key = `${ci.productId}_null`;
              if (!existingKeys.has(key)) {
                newItems.push({ productId: ci.productId, quantity: ci.plannedQty || 1, contractId: ct.id });
                existingKeys.add(key);
              }
            }
          });
        });
        return newItems.length > 0 ? [...prev, ...newItems] : prev;
      });
    }
  }, [multiContractItems]);

  // 取消合同后自动删除该合同的商品
  useEffect(() => {
    setItems(prev => prev.filter(i => !i.contractId || selectedContractIds.includes(i.contractId)));
  }, [selectedContractIds]);

  const { data: containersData } = useQuery({ queryKey: ['containers'], queryFn: () => apiClient.get('/containers', { params: { pageSize: 9999 } }).then(r => r.data) });

  const { data: selectedContainer } = useQuery({
    queryKey: ['container', selectedContainerId],
    queryFn: () => apiClient.get(`/containers/${selectedContainerId}`).then(r => r.data),
    enabled: !!selectedContainerId,
  });

  // 选中排柜后获取其关联合同的商品
  const containerContractIds = (selectedContainer?.contracts || []).map((cc: any) => cc.contractId);
  const { data: containerContractItems } = useQuery({
    queryKey: ['container-contract-items', containerContractIds],
    queryFn: async () => {
      if (containerContractIds.length === 0) return [];
      const results = await Promise.all(containerContractIds.map((cid: number) => apiClient.get(`/contracts/${cid}`).then(r => r.data)));
      return results;
    },
    enabled: containerContractIds.length > 0,
  });

  // 选排柜后自动填入合同商品（减去已装柜数量）
  useEffect(() => {
    if (containerContractItems && containerContractItems.length > 0 && selectedContainerId && selectedContainer) {
      const loadedMap = new Map<number, number>();
      (selectedContainer.items || []).forEach((ci: any) => {
        loadedMap.set(ci.productId, (loadedMap.get(ci.productId) || 0) + (ci.plannedQty || 0));
      });
      const autoItems: ItemEntry[] = [];
      containerContractItems.forEach((ct: any) => {
        (ct.items || []).forEach((ci: any) => {
          const loaded = loadedMap.get(ci.productId) || 0;
          const remaining = ci.plannedQty - loaded;
          if (remaining > 0) {
            autoItems.push({ productId: ci.productId, quantity: remaining, contractId: ct.id });
          }
        });
      });
      if (autoItems.length > 0) {
        setItems(autoItems);
        message.info(`已从排柜关联合同自动填入 ${autoItems.length} 个商品`);
      }
    }
  }, [containerContractItems, selectedContainerId, selectedContainer]);

  const selectedWarehouseId: number | undefined = Form.useWatch('warehouseId', form);

  const { data: warehouseInventory } = useQuery({
    queryKey: ['inventory', selectedWarehouseId],
    queryFn: () => apiClient.get('/inventory', { params: { warehouseId: selectedWarehouseId } }).then(r => r.data),
    enabled: !!selectedWarehouseId,
  });

  useEffect(() => { warehouseInventoryRef.current = warehouseInventory; }, [warehouseInventory]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post('/outbound', data),
    onSuccess: (res) => { message.success('出库单已创建'); queryClient.invalidateQueries({ queryKey: ['outbound'] }); navigate(`/outbound/${res.data.id}`); },
    onError: (err: any) => message.error(err.response?.data?.error || '创建失败'),
  });

  const addItem = (productId: number) => {
    setItems([...items, { productId, quantity: 1, contractId: selectedContractIds[0] || null }]);
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
      setItems(prev => [...prev, { productId: p.id, quantity: 1, contractId: selectedContractIds[0] || null }]);
    }
    if (selected.length) message.success(`已添加 ${selected.length} 个商品`);
    setSelectorOpen(false);
  };

  const getProduct = (id: number) => products?.find((p: Product) => p.id === id);

  const getLocationsForProduct = (productId: number) => {
    if (!warehouseInventory) return [];
    return warehouseInventory
      .filter((inv: InventoryItem) => inv.productId === productId && inv.quantity > 0)
      .sort((a, b) => (a.batchNo || '').localeCompare(b.batchNo || '')) // FIFO
      .map((inv: InventoryItem) => ({
        label: `${inv.location?.name || '-'} [${inv.batchNo || '无批次'}] (库存: ${inv.quantity})`,
        value: JSON.stringify({ locationId: inv.locationId, batchNo: inv.batchNo }),
      }));
  };

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>新建出库单</Typography.Title>}>
      <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate({ ...values, items, containerId: selectedContainerId, containerNo: containerNoText || undefined })}>
        <Space size="large" wrap style={{ width: '100%' }}>
          <Form.Item name="warehouseId" label="出库仓库" rules={[{ required: true }]} style={{ minWidth: 180 }}>
            <Select placeholder="选择仓库">{warehouses?.map((w: Warehouse) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="receiver" label="领用人/部门"><Input style={{ width: 180 }} /></Form.Item>
          <Form.Item name="note" label="备注"><Input style={{ width: 260 }} /></Form.Item>
          <Form.Item label="排柜编号（可选）" style={{ minWidth: 180 }}>
            <Input placeholder="输入排柜编号，货柜新建时匹配" value={containerNoText} onChange={(e) => {
              const no = e.target.value;
              setContainerNoText(no);
              if (!no) { setSelectedContainerId(null); return; }
              const match = containersData?.data?.find((c: any) => c.containerNo === no && (c.status === 'pending' || c.status === 'loading'));
              setSelectedContainerId(match?.id ?? null);
            }} />
            {selectedContainerId && <Tag color="blue" style={{ marginTop: 4 }}>已匹配排柜 {selectedContainer?.containerNo}</Tag>}
          </Form.Item>
          <Form.Item label="关联合同（可选，可多选）" style={{ minWidth: 280 }}>
            <Select
              allowClear
              mode="multiple"
              placeholder="选择合同，自动填入商品"
              value={selectedContractIds}
              onChange={(v) => setSelectedContractIds(v || [])}
              options={(contracts || []).map((c: any) => ({
                label: `${c.contractNo} (${c.businessCustomer?.realName || c.customer?.realName})`,
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

      <Space orientation="vertical" style={{ width: '100%' }}>
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
                value={item.locationId != null ? JSON.stringify({ locationId: item.locationId, batchNo: item.batchNo }) : undefined}
                onChange={(v) => {
                  if (v) {
                    const parsed = JSON.parse(v);
                    const next = [...items]; next[idx] = { ...next[idx], locationId: parsed.locationId, batchNo: parsed.batchNo }; setItems(next);
                  } else {
                    const next = [...items]; next[idx] = { ...next[idx], locationId: null, batchNo: null }; setItems(next);
                  }
                }}
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
