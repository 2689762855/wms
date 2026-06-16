import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Form, Input, Select, AutoComplete, Button, Card, Typography, Space, InputNumber, message, Divider, Tag, Modal, Upload, Image } from 'antd';
import { CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import BarcodeScanner from '../components/BarcodeScanner';
import ProductSelector from '../components/ProductSelector';
import CustomerManager from '../components/CustomerManager';
import { useAuth } from '../stores/AuthContext';
import { getCategoryPath } from '../utils/categoryTree';
import type { Warehouse, Product, InventoryItem } from '../types';

interface ItemEntry {
  productId: number;
  quantity: number;
  unitPrice?: number;
  locationId?: number | null;
  contractId?: number | null;
  batchNo?: string | null;
  serialNumbers?: string[];
  images?: string[];
}

export default function OutboundNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const isEdit = !!editId;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemEntry[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null);
  const [selectedContractIds, setSelectedContractIds] = useState<number[]>([]);
  const [containerNoText, setContainerNoText] = useState('');
  const [locationErrors, setLocationErrors] = useState<Set<number>>(new Set());
  const [snOptions, setSnOptions] = useState<Record<number, { value: string; label: string }[]>>({});
  const [snModalIndex, setSnModalIndex] = useState<number | null>(null);

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => apiClient.get('/warehouses').then(r => r.data) });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => apiClient.get('/products', { params: { pageSize: 200 } }).then(r => r.data.data) });
  const { data: customerList } = useQuery({ queryKey: ['customers'], queryFn: () => apiClient.get('/customers').then(r => r.data) });

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
    if (multiContractItems && multiContractItems.length > 0) {
      setItems(prev => {
        const existingKeys = new Set(prev.map(i => `${i.productId}_${i.batchNo || 'null'}_${i.locationId || 0}`));
        const newItems: ItemEntry[] = [];
        const inv = warehouseInventoryRef.current;

        multiContractItems.forEach((ct: any) => {
          const ctBatchNos = new Set((ct.batchNos || []).filter(Boolean) as string[]);
          (ct.items || []).forEach((ci: any) => {
            if (inv && inv.length > 0 && ci.remainingQty !== 0) {
              const remaining = ci.remainingQty ?? ci.plannedQty ?? 1;
              if (remaining <= 0) return;
              // 优先匹配合同批次库存
              let batches = inv.filter(
                (x: InventoryItem) => x.productId === ci.productId && x.quantity > 0 && x.batchNo && ctBatchNos.has(x.batchNo)
              );
              // 若无匹配批次，取该商品所有库存
              if (batches.length === 0) {
                batches = inv.filter(
                  (x: InventoryItem) => x.productId === ci.productId && x.quantity > 0
                );
              }
              let added = 0;
              for (const b of batches) {
                if (added >= remaining) break;
                const key = `${ci.productId}_${b.batchNo || 'null'}_${b.locationId || 0}`;
                if (!existingKeys.has(key)) {
                  const take = Math.min(b.quantity, remaining - added);
                  newItems.push({
                    productId: ci.productId, quantity: take,
                    locationId: b.locationId, contractId: ct.id, batchNo: b.batchNo,
                  });
                  existingKeys.add(key);
                  added += take;
                }
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

  const { data: containersData } = useQuery({ queryKey: ['containers'], queryFn: () => apiClient.get('/containers', { params: { pageSize: 500 } }).then(r => r.data) });

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

  // 预取 hasSn 商品的可用 SN 列表
  useEffect(() => {
    if (!selectedWarehouseId || !products) return;
    const ids = items.map(i => i.productId).filter((v, i, a) => a.indexOf(v) === i);
    ids.forEach(pid => {
      const p = getProduct(pid);
      if (p?.hasSn && !snOptions[pid]) {
        apiClient.get('/outbound/serial-numbers', { params: { productId: pid, warehouseId: selectedWarehouseId } }).then(res => {
          setSnOptions(prev => ({ ...prev, [pid]: (res.data || []).map((s: any) => ({ value: s.sn, label: s.sn })) }));
        }).catch(() => {});
      }
    });
  }, [selectedWarehouseId, products, items.map(i => i.productId).join(',')]);

  // 加载待编辑的订单
  const { data: editOrder } = useQuery({
    queryKey: ['outbound', editId],
    queryFn: () => apiClient.get(`/outbound/${editId}`).then(res => res.data),
    enabled: isEdit,
  });

  // 编辑模式：预填表单
  useEffect(() => {
    if (editOrder) {
      form.setFieldsValue({
        warehouseId: editOrder.warehouseId,
        receiver: editOrder.receiver || undefined,
        receiverPhone: editOrder.receiverPhone || undefined,
        receiverName2: editOrder.receiverName2 || undefined,
        receiverPhone2: editOrder.receiverPhone2 || undefined,
        receiverAddress: editOrder.receiverAddress || undefined,
        note: editOrder.note || undefined,
      });
      setItems(editOrder.items.map((i: any) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice ?? undefined,
        locationId: i.locationId ?? null,
        contractId: i.contractId ?? null,
        batchNo: i.batchNo ?? null,
        serialNumbers: i.serialNumbers ? JSON.parse(i.serialNumbers) : undefined,
      })));
    }
  }, [editOrder]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => isEdit
      ? apiClient.put(`/outbound/${editId}`, data)
      : apiClient.post('/outbound', data),
    onSuccess: (res) => { message.success(isEdit ? '出库单已更新' : '出库单已创建'); queryClient.invalidateQueries({ queryKey: ['outbound'] }); navigate(`/outbound/${res.data.id}`); },
    onError: (err: any) => message.error(err.response?.data?.error || (isEdit ? '更新失败' : '创建失败')),
  });

  const addItem = (productId: number) => {
    const p = products?.find((pr: Product) => pr.id === productId);
    setItems([...items, { productId, quantity: 1, unitPrice: p?.salePrice ?? undefined, contractId: selectedContractIds[0] || null }]);
  };

  const updateItem = (idx: number, field: keyof ItemEntry, value: unknown) => {
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
      setItems(prev => [...prev, { productId: p.id, quantity: 1, unitPrice: p.salePrice ?? undefined, contractId: selectedContractIds[0] || null }]);
    }
    if (selected.length) message.success(`已添加 ${selected.length} 个商品`);
    setSelectorOpen(false);
  };

  const getProduct = (id: number) => products?.find((p: Product) => p.id === id);

  // 显示将自动带入的单价（合同价 > 商品默认售价）
  const getItemPrice = (item: ItemEntry) => {
    if (item.contractId && multiContractItems) {
      for (const ct of multiContractItems as any[]) {
        const ci = (ct.items || []).find((i: any) => i.productId === item.productId);
        if (ci?.unitPrice != null) return ci.unitPrice;
      }
    }
    const p = getProduct(item.productId);
    return p?.salePrice ?? null;
  };

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
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>{isEdit ? '编辑出库单' : '新建出库单'}</Typography.Title>}>
      <Form form={form} layout="vertical" onFinish={(values) => {
        const errors = new Set<number>();
        items.forEach((item, idx) => { if (!item.locationId) errors.add(idx); });
        if (errors.size > 0) { setLocationErrors(errors); message.warning('请为每个商品选择库位，或指定整单默认库位'); return; }
        // SN 校验
        const snErrors: string[] = [];
        items.forEach((item) => {
          const p = getProduct(item.productId);
          if (p?.hasSn) {
            const sns = item.serialNumbers || [];
            if (!sns.length) snErrors.push(`${p.name}: 请选择SN码`);
            else if (sns.length !== item.quantity) snErrors.push(`${p.name}: SN数量(${sns.length})与数量(${item.quantity})不一致`);
          }
        });
        if (snErrors.length > 0) { message.error(snErrors.join('; ')); return; }
        setLocationErrors(new Set());
        createMutation.mutate({ ...values, items, containerId: selectedContainerId, containerNo: containerNoText || undefined });
      }}>
        <Space size="large" wrap style={{ width: '100%' }}>
          <Form.Item name="warehouseId" label="出库仓库" rules={[{ required: true }]} style={{ minWidth: 180 }}>
            <Select placeholder="选择仓库">{warehouses?.map((w: Warehouse) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item label="选择顾客" style={{ minWidth: 160 }}>
            <AutoComplete
              placeholder="输入顾客名搜索"
              options={(customerList || []).map((c: any) => ({ value: c.name, label: `${c.name}${c.phone ? ' · ' + c.phone : ''}` }))}
              onSelect={(value) => {
                const c = (customerList || []).find((x: any) => x.name === value);
                if (c) {
                  form.setFieldValue('receiver', c.name);
                  form.setFieldValue('receiverPhone', c.phone || '');
                  form.setFieldValue('receiverName2', c.name2 || '');
                  form.setFieldValue('receiverPhone2', c.phone2 || '');
                  form.setFieldValue('receiverAddress', c.address || '');
                }
              }}
              style={{ width: 200 }}
              allowClear
            />
          </Form.Item>
          <Form.Item name="receiver" label="顾客姓名"><Input style={{ width: 120 }} placeholder="选填" /></Form.Item>
          <Form.Item name="receiverPhone" label="顾客电话"><Input style={{ width: 140 }} placeholder="选填" /></Form.Item>
          <Form.Item name="receiverName2" label="备用联系人"><Input style={{ width: 110 }} placeholder="选填" /></Form.Item>
          <Form.Item name="receiverPhone2" label="备用电话"><Input style={{ width: 130 }} placeholder="选填" /></Form.Item>
          <Form.Item name="receiverAddress" label="顾客地址"><Input style={{ width: 200 }} placeholder="选填" /></Form.Item>
          <Form.Item name="note" label="备注"><Input style={{ width: 260 }} /></Form.Item>
          {import.meta.env.VITE_STANDALONE !== 'true' && <Form.Item label="排柜编号（可选）" style={{ minWidth: 180 }}>
            <Input placeholder="输入排柜编号，货柜新建时匹配" value={containerNoText} onChange={(e) => {
              const no = e.target.value;
              setContainerNoText(no);
              if (!no) { setSelectedContainerId(null); return; }
              const match = containersData?.data?.find((c: any) => c.containerNo === no && (c.status === 'pending' || c.status === 'loading'));
              setSelectedContainerId(match?.id ?? null);
            }} />
            {selectedContainerId && <Tag color="blue" style={{ marginTop: 4 }}>已匹配排柜 {selectedContainer?.containerNo}</Tag>}
          </Form.Item>}
          {import.meta.env.VITE_STANDALONE !== 'true' && <Form.Item label="关联合同（可选，可多选）" style={{ minWidth: 280 }}>
            <Select
              allowClear
              mode="multiple"
              disabled={!selectedWarehouseId}
              placeholder={selectedWarehouseId ? "选择合同，自动填入商品" : "请先选择仓库"}
              value={selectedContractIds}
              onChange={(v) => setSelectedContractIds(v || [])}
              options={(contracts || []).map((c: any) => ({
                label: `${c.contractNo} (${c.businessCustomer?.realName || c.customer?.realName})`,
                value: c.id,
              }))}
            />
          </Form.Item>}
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
              <Typography.Text style={{ minWidth: 300 }}>{p ? `${getCategoryPath(p.category) !== '-' ? getCategoryPath(p.category) + ' · ' : ''}${p.sku} ${p.name}${p.spec ? ' · ' + p.spec : ''}${p.unit ? ' · ' + p.unit : ''}` : `商品 #${item.productId}`}</Typography.Text>
              <InputNumber min={1} value={item.quantity} onChange={(v) => updateItem(idx, 'quantity', v || 1)} style={{ width: 80 }} />
              {user?.operatorType !== 'warehouse' && (
                <InputNumber min={0} step={0.01} value={item.unitPrice} onChange={(v) => updateItem(idx, 'unitPrice', v)} placeholder="售价" style={{ width: 100 }} prefix="¥" />
              )}
              <div>
                <Select
                  allowClear
                  placeholder="出库库位"
                  value={item.locationId != null ? JSON.stringify({ locationId: item.locationId, batchNo: item.batchNo }) : undefined}
                  onChange={(v) => {
                    if (v) {
                      const parsed = JSON.parse(v);
                      const next = [...items]; next[idx] = { ...next[idx], locationId: parsed.locationId, batchNo: parsed.batchNo }; setItems(next);
                      const errs = new Set(locationErrors); errs.delete(idx); setLocationErrors(errs);
                    } else {
                      const next = [...items]; next[idx] = { ...next[idx], locationId: null, batchNo: null }; setItems(next);
                    }
                  }}
                  status={locationErrors.has(idx) ? 'error' : undefined}
                  style={{ width: 200 }}
                  options={locOptions}
                  disabled={!selectedWarehouseId}
                  notFoundContent={selectedWarehouseId ? '该商品无库存' : '请先选择仓库'}
                />
                {locationErrors.has(idx) && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>请选择库位</div>}
              </div>
              {getProduct(item.productId)?.hasSn && (
                <Button size="small" onClick={() => setSnModalIndex(idx)}
                  style={{ minWidth: 120 }}>
                  SN ({item.serialNumbers?.length || 0}/{item.quantity})
                </Button>
              )}
              <Space size={4}>
                {(item.images || []).map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: 32, height: 32, borderRadius: 4, overflow: 'hidden', border: '1px solid #d9d9d9' }}>
                    <Image src={url} width={32} height={32} style={{ objectFit: 'cover' }} preview={{ mask: false }} />
                    <Button size="small" type="text" danger icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                      style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, minWidth: 14, padding: 0, background: '#fff', borderRadius: '50%' }}
                      onClick={() => {
                        const idx2 = idx; const i2 = i;
                        setItems(prev => {
                          const next = [...prev];
                          next[idx2] = { ...next[idx2], images: (next[idx2].images || []).filter((_, j) => j !== i2) };
                          return next;
                        });
                      }} />
                  </div>
                ))}
                <Upload showUploadList={false} accept="image/*" multiple
                  customRequest={({ file, onSuccess }: any) => {
                    const formData = new FormData();
                    formData.append('image', file);
                    const idx2 = idx;
                    apiClient.post('/upload/item-image', formData).then(res => {
                      setItems(prev => {
                        const next = [...prev];
                        next[idx2] = { ...next[idx2], images: [...(next[idx2].images || []), res.data.url] };
                        return next;
                      });
                      onSuccess?.(res.data, file);
                      message.success('上传成功');
                    }).catch(() => message.error('上传失败'));
                  }}>
                  <Button size="small" icon={<CameraOutlined />} title="上传图片" />
                </Upload>
              </Space>
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
      <Button type="primary" size="large" onClick={() => form.submit()} loading={createMutation.isPending} disabled={!items.length}>{isEdit ? '保存修改' : '保存出库单'}</Button>
      <Button style={{ marginLeft: 16 }} onClick={() => navigate('/outbound')}>取消</Button>

      <ProductSelector
        open={selectorOpen}
        onCancel={() => setSelectorOpen(false)}
        onOk={onProductsSelected}
      />

      <Modal title="选择SN码" open={snModalIndex !== null}
        onCancel={() => setSnModalIndex(null)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setSnModalIndex(null)}>
            确定 ({snModalIndex !== null ? items[snModalIndex]?.serialNumbers?.length || 0 : 0}个)
          </Button>
        ]}
        width={500}
      >
        {snModalIndex !== null && (
          <>
            <BarcodeScanner onScan={(code) => {
              const available = snOptions[items[snModalIndex].productId] || [];
              if (available.some(s => s.value === code)) {
                const cur = items[snModalIndex].serialNumbers || [];
                if (!cur.includes(code)) {
                  updateItem(snModalIndex, 'serialNumbers', [...cur, code]);
                }
              } else {
                message.warning(`SN ${code} 不在可用列表中`);
              }
            }} />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              扫码自动匹配。共需 {items[snModalIndex].quantity} 个。
            </Typography.Text>
            <Select
              mode="multiple"
              style={{ width: '100%', marginTop: 8 }}
              placeholder="选择要出库的SN码（扫码或手动选）"
              value={items[snModalIndex].serialNumbers || []}
              onChange={(vals) => updateItem(snModalIndex, 'serialNumbers', vals)}
              options={snOptions[items[snModalIndex].productId] || []}
              notFoundContent="暂无可选SN"
            />
          </>
        )}
      </Modal>
    </Card>
  );
}
