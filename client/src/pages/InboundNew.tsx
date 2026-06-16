import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Form, Input, Select, Button, Card, Typography, Space, InputNumber, DatePicker, message, Divider, Tag, AutoComplete, Modal, Upload } from 'antd';
import { CameraOutlined } from '@ant-design/icons';
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
  unitPrice?: number;
  locationId?: number | null;
  expiryDate?: string | null;
  contractId?: number | null;
  serialNumbers?: string[];
  images?: string[];
}

export default function InboundNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const isEdit = !!editId;
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemEntry[]>([]);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [supplierOptions, setSupplierOptions] = useState<{ value: string }[]>([]);
  const [locationErrors, setLocationErrors] = useState<Set<number>>(new Set());
  const [snModalIndex, setSnModalIndex] = useState<number | null>(null);
  const [snPasteText, setSnPasteText] = useState('');

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

  // 加载待编辑的订单
  const { data: editOrder } = useQuery({
    queryKey: ['inbound', editId],
    queryFn: () => apiClient.get(`/inbound/${editId}`).then(res => res.data),
    enabled: isEdit,
  });

  // 编辑模式：预填表单
  useEffect(() => {
    if (editOrder) {
      form.setFieldsValue({
        warehouseId: editOrder.warehouseId,
        supplier: editOrder.supplier || undefined,
        note: editOrder.note || undefined,
      });
      setItems(editOrder.items.map((i: any) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice ?? undefined,
        locationId: i.locationId ?? null,
        expiryDate: i.expiryDate ?? null,
        contractId: i.contractId ?? null,
        serialNumbers: i.serialNumbers ? JSON.parse(i.serialNumbers) : undefined,
      })));
    }
  }, [editOrder]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => isEdit
      ? apiClient.put(`/inbound/${editId}`, data)
      : apiClient.post('/inbound', data),
    onSuccess: (res) => {
      message.success(isEdit ? '入库单已更新' : '入库单已创建');
      queryClient.invalidateQueries({ queryKey: ['inbound'] });
      navigate(`/inbound/${res.data.id}`);
    },
    onError: (err: any) => message.error(err.response?.data?.error || (isEdit ? '更新失败' : '创建失败')),
  });

  const addItem = (productId: number) => {
    const p = allProducts?.find((pr: Product) => pr.id === productId);
    setItems([...items, { productId, quantity: 1, unitPrice: p?.costPrice ?? undefined, contractId: selectedContractId }]);
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
      setItems(prev => [...prev, { productId: p.id, quantity: 1, unitPrice: p.costPrice ?? undefined, contractId: selectedContractId }]);
    }
    if (products.length) message.success(`已添加 ${products.length} 个商品`);
    setSelectorOpen(false);
  };

  const getProduct = (id: number) => allProducts?.find((p: Product) => p.id === id);

  // 显示成本价（合同价 > 商品默认成本价）
  const getItemCostPrice = (item: ItemEntry) => {
    if (item.contractId && selectedContract?.items) {
      const ci = selectedContract.items.find((i: any) => i.productId === item.productId);
      if (ci?.unitPrice != null) return ci.unitPrice;
    }
    const p = getProduct(item.productId);
    return p?.costPrice ?? null;
  };

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>{isEdit ? '编辑入库单' : '新建入库单'}</Typography.Title>}>
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
            if (!sns.length) snErrors.push(`${p.name}: 请录入SN码`);
            else if (sns.length !== item.quantity) snErrors.push(`${p.name}: SN数量(${sns.length})与数量(${item.quantity})不一致`);
          }
        });
        if (snErrors.length > 0) { message.error(snErrors.join('; ')); return; }
        setLocationErrors(new Set());
        createMutation.mutate({ ...values, items });
      }}>
        <Space size="large" wrap style={{ width: '100%' }}>
          <Form.Item name="warehouseId" label="入库仓库" rules={[{ required: true }]} style={{ minWidth: 180 }}>
            <Select placeholder="选择仓库">{warehouses?.map((w: Warehouse) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="supplier" label="供应商"><AutoComplete options={supplierOptions} placeholder="输入或选择供应商" style={{ width: 200 }} allowClear filterOption={(inputValue, option) => option!.value.toLowerCase().includes(inputValue.toLowerCase())} /></Form.Item>
          {import.meta.env.VITE_STANDALONE !== 'true' && <Form.Item label="关联合同（可选）" style={{ minWidth: 240 }}>
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
          </Form.Item>}
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
          return (
            <Space key={idx} style={{ marginBottom: 8 }} wrap>
              <Typography.Text style={{ minWidth: 300 }}>{p ? `${getCategoryPath(p.category) !== '-' ? getCategoryPath(p.category) + ' · ' : ''}${p.sku} ${p.name}${p.spec ? ' · ' + p.spec : ''}${p.unit ? ' · ' + p.unit : ''}` : `商品 #${item.productId}`}</Typography.Text>
              <InputNumber min={1} value={item.quantity} onChange={(v) => updateItem(idx, 'quantity', v || 1)} placeholder="数量" style={{ width: 80 }} />
              {user?.operatorType !== 'warehouse' && (
                <InputNumber min={0} step={0.01} value={item.unitPrice} onChange={(v) => updateItem(idx, 'unitPrice', v)} placeholder="成本价" style={{ width: 100 }} prefix="¥" />
              )}
              <div>
                <Select allowClear placeholder="入库库位" value={item.locationId} onChange={(v) => { updateItem(idx, 'locationId', v ?? null); if (v) { const next = new Set(locationErrors); next.delete(idx); setLocationErrors(next); } }}
                  status={locationErrors.has(idx) ? 'error' : undefined}
                  style={{ width: 160 }} options={locations?.map((l: Location) => ({ label: l.name, value: l.id }))}
                  disabled={!selectedWarehouseId} notFoundContent={selectedWarehouseId ? '该仓库无库位' : '请先选择仓库'} />
                {locationErrors.has(idx) && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>请选择库位</div>}
              </div>
              {getProduct(item.productId)?.hasSn && (
                <Button size="small" onClick={() => { setSnModalIndex(idx); setSnPasteText((item.serialNumbers || []).join('\n')); }}
                  style={{ minWidth: 120 }}>
                  SN ({item.serialNumbers?.length || 0}/{item.quantity})
                </Button>
              )}
              <DatePicker allowClear placeholder="保质期至" value={item.expiryDate ? dayjs(item.expiryDate) : null}
                onChange={(d) => updateItem(idx, 'expiryDate', d ? d.toISOString() : null)} style={{ width: 140 }} />
              <Upload showUploadList={false} accept="image/*"
                customRequest={({ file, onSuccess }: any) => {
                  const formData = new FormData();
                  formData.append('image', file);
                  apiClient.post('/upload/item-image', formData).then(res => {
                    const cur = [...(item.images || []), res.data.url];
                    updateItem(idx, 'images', cur);
                    onSuccess?.(res.data, file);
                  }).catch(() => message.error('上传失败'));
                }}>
                <Button size="small" icon={<CameraOutlined />} title="上传图片" />
              </Upload>
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
      <Button type="primary" size="large" onClick={() => form.submit()} loading={createMutation.isPending} disabled={!items.length}>{isEdit ? '保存修改' : '保存入库单'}</Button>
      <Button style={{ marginLeft: 16 }} onClick={() => navigate('/inbound')}>取消</Button>

      <ProductSelector open={selectorOpen} onCancel={() => setSelectorOpen(false)} onOk={onProductsSelected} />

      <Modal title="录入SN码" open={snModalIndex !== null}
        onOk={() => {
          if (snModalIndex === null) return;
          const sns = snPasteText.split(/[\n,，\s]+/).map(s => s.trim()).filter(Boolean);
          updateItem(snModalIndex, 'serialNumbers', sns);
          setSnModalIndex(null);
        }}
        onCancel={() => setSnModalIndex(null)}
        okText={`确定 (${snPasteText.split(/[\n,，\s]+/).map(s => s.trim()).filter(Boolean).length}个)`}
        cancelText="取消"
        width={520}
      >
        <BarcodeScanner onScan={(code) => {
          setSnPasteText(prev => prev.trim() ? prev + '\n' + code : code);
        }} />
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          扫码自动追加，也可直接粘贴。共需 {snModalIndex !== null ? items[snModalIndex]?.quantity : 0} 个。
        </Typography.Text>
        <Input.TextArea
          placeholder={`SN001\nSN002\nSN003\n...`}
          value={snPasteText}
          onChange={e => setSnPasteText(e.target.value)}
          rows={8}
          style={{ marginTop: 8, fontFamily: 'monospace' }}
          autoFocus
        />
      </Modal>
    </Card>
  );
}
