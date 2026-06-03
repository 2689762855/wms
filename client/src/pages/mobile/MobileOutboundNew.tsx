import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Typography, Input, InputNumber, Space, Tag, message, Result, Modal, Select, List } from 'antd';
import { ArrowLeftOutlined, ScanOutlined } from '@ant-design/icons';
import BarcodeScanner from '../../components/BarcodeScanner';
import apiClient from '../../api/client';
import { useAuth } from '../../stores/AuthContext';
import { getCategoryPath } from '../../utils/categoryTree';
import type { Location, Product, InventoryItem } from '../../types';

interface CartItem {
  key: string;
  productId: number;
  productName: string;
  productSku: string;
  quantity: number;
  locationId: number;
  locationName: string;
  batchNo?: string | null;
  contractId?: number | null;
}

export default function MobileOutboundNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [step, setStep] = useState<'scan-add' | 'confirm' | 'done'>('scan-add');
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastOrderNo, setLastOrderNo] = useState('');
  const [receiver, setReceiver] = useState(user?.realName || '');
  const [note, setNote] = useState('');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['mobile-outbound-products', productSearch],
    queryFn: () => apiClient.get('/products', { params: { keyword: productSearch, pageSize: 30 } }).then(r => r.data.data as Product[]),
    enabled: selectorOpen,
  });

  // 排柜匹配
  const [containerNoText, setContainerNoText] = useState('');
  const [matchedContainerId, setMatchedContainerId] = useState<number | null>(null);

  // 合同多选
  const [selectedContractIds, setSelectedContractIds] = useState<number[]>([]);

  const { data: containersData } = useQuery({
    queryKey: ['mobile-containers'],
    queryFn: () => apiClient.get('/containers', { params: { pageSize: 500 } }).then(r => r.data),
  });

  const { data: contracts } = useQuery({
    queryKey: ['contracts-active'],
    queryFn: () => apiClient.get('/contracts', { params: { pageSize: 999, excludeShipped: true } }).then(r => r.data.data),
  });

  // 选中合同后获取详情
  const { data: multiContractItems } = useQuery({
    queryKey: ['contracts', selectedContractIds, 'items'],
    queryFn: async () => {
      if (selectedContractIds.length === 0) return [];
      return Promise.all(selectedContractIds.map(cid => apiClient.get(`/contracts/${cid}`).then(r => r.data)));
    },
    enabled: selectedContractIds.length > 0,
  });

  // 当前库位的库存
  const { data: locationInventory } = useQuery({
    queryKey: ['location-inventory', currentLocation?.id],
    queryFn: () => apiClient.get(`/locations/${currentLocation!.id}/inventory`).then(r => r.data as InventoryItem[]),
    enabled: !!currentLocation,
  });

  // 全部仓库库存（合同自动填商品用，不需要先扫库位）
  const { data: allInventory } = useQuery({
    queryKey: ['all-inventory-outbound'],
    queryFn: () => apiClient.get('/inventory', { params: { pageSize: 2000 } }).then(r => r.data as InventoryItem[]),
  });

  // 匹配排柜号
  useEffect(() => {
    const containers = containersData?.data || [];
    const matched = containers.find((c: any) => c.containerNo === containerNoText && (c.status === 'pending' || c.status === 'loading'));
    setMatchedContainerId(matched ? matched.id : null);
  }, [containerNoText, containersData]);

  // 选合同后自动填商品（从全部库存取数，含库位和批次）
  useEffect(() => {
    if (multiContractItems && multiContractItems.length > 0) {
      const inv = allInventory;
      setCart(prev => {
        // 先移除同一合同的旧占位项（locationId=0 的），后续会用库存数据替换
        const contractIds = new Set(multiContractItems.map(c => c.id));
        let base = inv ? prev.filter(i => !(i.contractId && contractIds.has(i.contractId) && i.locationId === 0)) : prev;
        const existingKeys = new Set(base.map(i => `${i.productId}_${i.batchNo || 'null'}_${i.locationId}`));
        const newItems: CartItem[] = [];
        multiContractItems.forEach((ct: any) => {
          const ctBatchNos = new Set((ct.batchNos || []).filter(Boolean) as string[]);
          (ct.items || []).forEach((ci: any) => {
            if (inv && inv.length > 0) {
              const batches = inv.filter(
                (x: InventoryItem) => x.productId === ci.productId && x.quantity > 0 && x.batchNo && ctBatchNos.has(x.batchNo)
              );
              if (batches.length > 0) {
                batches.forEach((b: InventoryItem) => {
                  const key = `${ci.productId}_${b.batchNo || 'null'}_${b.locationId}`;
                  if (!existingKeys.has(key)) {
                    newItems.push({
                      key: String(Date.now()) + Math.random(),
                      productId: ci.productId,
                      productName: b.product?.name || ci.product?.name || '',
                      productSku: b.product?.sku || '',
                      quantity: Math.min(b.quantity, ci.plannedQty),
                      locationId: b.locationId,
                      locationName: b.location?.name || '',
                      batchNo: b.batchNo,
                      contractId: ct.id,
                    });
                    existingKeys.add(key);
                  }
                });
              }
              // 无匹配批次的不自动添加，跳过
            }
          });
        });
        return newItems.length > 0 ? [...base, ...newItems] : base;
      });
    }
  }, [multiContractItems, allInventory]);

  // 取消合同后移除对应商品
  useEffect(() => {
    setCart(prev => prev.filter(i => !i.contractId || selectedContractIds.includes(i.contractId)));
  }, [selectedContractIds]);

  // 扫码库位
  const handleScanLocation = useCallback(async (code: string) => {
    try {
      const res = await apiClient.get(`/locations/code/${code}`);
      setCurrentLocation(res.data);
      message.success(`已切换到库位: ${res.data.name}`);
    } catch {
      message.error('未找到该库位');
    }
  }, []);

  // 扫码商品（没选合同跳过有批次商品）
  const handleScanProduct = useCallback((barcode: string) => {
    if (!currentLocation) {
      message.warning('请先扫描库位');
      return;
    }
    if (!locationInventory) return;
    let matches = locationInventory.filter(
      i => i.product.barcode === barcode || i.product.sku === barcode
    );
    if (selectedContractIds.length === 0) {
      matches = matches.filter(i => !i.batchNo);
    }
    if (matches.length === 0) {
      message.warning('当前库位未找到此商品');
      return;
    }
    const inv = matches[0];
    setCart(prev => {
      const key = `${inv.productId}_${inv.batchNo || 'null'}_${inv.locationId}`;
      const existing = prev.find(i => `${i.productId}_${i.batchNo || 'null'}_${i.locationId}` === key);
      if (existing) {
        return prev.map(i => i.key === existing.key ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        key: String(Date.now()) + Math.random(),
        productId: inv.productId,
        productName: inv.product.name,
        productSku: inv.product.sku,
        quantity: 1,
        locationId: inv.locationId,
        locationName: currentLocation.name,
        batchNo: inv.batchNo,
      }];
    });
  }, [currentLocation, locationInventory, selectedContractIds]);

  // 手机版商品选择：只显示扫描库位的商品，没选合同时跳过有批次商品
  const handleSelectProduct = (product: Product) => {
    const inv = currentLocation ? (locationInventory || []) : (allInventory || []);
    let batches = inv.filter(x => x.productId === product.id && x.quantity > 0);
    // 没选合同时只取无批次库存
    if (selectedContractIds.length === 0) {
      batches = batches.filter(x => !x.batchNo);
    }
    setCart(prev => {
      const existingKeys = new Set(prev.map(i => `${i.productId}_${i.batchNo || 'null'}_${i.locationId}`));
      let updated = prev;
      if (batches.length > 0) {
        batches.forEach(b => {
          const key = `${product.id}_${b.batchNo || 'null'}_${b.locationId}`;
          if (!existingKeys.has(key)) {
            updated = [...updated, {
              key: String(Date.now()) + Math.random(),
              productId: product.id, productName: product.name, productSku: product.sku,
              quantity: b.quantity, locationId: b.locationId,
              locationName: b.location?.name || currentLocation?.name || '',
              batchNo: b.batchNo,
            }];
            existingKeys.add(key);
          }
        });
      } else {
        const key = `${product.id}_null_0`;
        if (!existingKeys.has(key)) {
          updated = [...updated, {
            key: String(Date.now()) + Math.random(),
            productId: product.id, productName: product.name, productSku: product.sku,
            quantity: 1, locationId: 0, locationName: currentLocation?.name || '',
          }];
        }
      }
      return updated;
    });
    setSelectorOpen(false);
    setProductSearch('');
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const items = cart.filter(c => c.quantity > 0).map(c => ({
        productId: c.productId, quantity: c.quantity,
        locationId: c.locationId || null, batchNo: c.batchNo || null,
        contractId: c.contractId || null,
      }));
      if (items.length === 0) throw new Error('请添加商品');
      const createRes = await apiClient.post('/outbound', {
        warehouseId: currentLocation!.warehouseId,
        receiver, note: note || undefined,
        items, containerId: matchedContainerId,
        containerNo: containerNoText || undefined,
      });
      const confirmRes = await apiClient.put(`/outbound/${createRes.data.id}/confirm`);
      return confirmRes.data;
    },
    onSuccess: (data) => {
      setLastOrderNo(data.orderNo);
      setStep('done');
      queryClient.invalidateQueries({ queryKey: ['outbound'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-all'] });
      queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || err.message || '出库失败');
    },
  });

  const handleContinue = () => {
    setStep('scan-add');
    setCurrentLocation(null);
    setCart([]);
    setReceiver(user?.realName || '');
    setNote('');
    setContainerNoText('');
    setMatchedContainerId(null);
    setSelectedContractIds([]);
  };

  if (step === 'done') {
    return (
      <Result status="success" title="出库成功" subTitle={`单号: ${lastOrderNo}`}
        extra={[
          <Button key="continue" type="primary" onClick={handleContinue} icon={<ScanOutlined />} size="large" block>继续扫码出库</Button>,
          <Button key="back" onClick={() => navigate('/m/outbound')} block>返回列表</Button>,
        ]}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />}
          onClick={() => step === 'confirm' ? setStep('scan-add') : navigate('/m/outbound')} />
        <Typography.Title level={5} style={{ margin: 0 }}>扫码出库</Typography.Title>
      </div>

      {step === 'scan-add' && (
        <>
          {/* 排柜 + 合同 选择 */}
          <Card size="small" style={{ borderRadius: 8, marginBottom: 12, background: '#fafafa' }}>
            <Space orientation="vertical" style={{ width: '100%' }} size={8}>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>排柜编号（可选）</Typography.Text>
                <Input placeholder="输入排柜号自动匹配" value={containerNoText}
                  onChange={e => setContainerNoText(e.target.value)} allowClear size="small" />
                {matchedContainerId && <Tag color="blue" style={{ marginTop: 4 }}>已匹配排柜 #{containerNoText}</Tag>}
              </div>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>关联合同（可选，可多选）</Typography.Text>
                <Select mode="multiple" allowClear placeholder="选择合同自动填商品" value={selectedContractIds}
                  onChange={v => setSelectedContractIds(v)} style={{ width: '100%' }} size="small"
                  maxTagCount={1}
                  options={contracts?.map((c: any) => ({ label: `${c.contractNo} (${c.businessCustomer?.realName || c.customer?.realName || ''})`, value: c.id }))} />
              </div>
            </Space>
          </Card>

          {/* 扫码区：未扫库位时扫库位，已扫库位时扫商品 */}
          <Card title={currentLocation ? '扫码商品' : '扫码库位'} size="small" style={{ borderRadius: 8, marginBottom: 12 }}>
            <BarcodeScanner onScan={currentLocation ? handleScanProduct : handleScanLocation} />
            {currentLocation && (
              <div style={{ marginTop: 8, background: '#f6ffed', padding: 8, borderRadius: 6 }}>
                <Typography.Text>当前库位：<strong>{currentLocation.name}</strong>（{currentLocation.warehouse?.name}）</Typography.Text>
                <Button type="link" size="small" onClick={() => setCurrentLocation(null)} style={{ padding: 0, marginLeft: 8 }}>切换库位</Button>
              </div>
            )}
          </Card>

          {/* 商品列表选择 */}
          {currentLocation && (
            <Card size="small" style={{ borderRadius: 8, marginBottom: 12 }}>
              <Space style={{ marginTop: 8 }}>
                <Button size="small" onClick={() => setSelectorOpen(true)}>从商品列表选择</Button>
              </Space>
            </Card>
          )}

          {/* 购物车 */}
          {cart.length > 0 && (
            <Card title={`已添加 ${cart.length} 项`} size="small" style={{ borderRadius: 8, marginBottom: 12 }}>
              {cart.map(item => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Text strong style={{ fontSize: 13 }} ellipsis>{item.productName}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                      {item.productSku}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      库位: {item.locationName || '未指定'}
                      {item.batchNo && <Tag color="geekblue" style={{ fontSize: 10, marginLeft: 4 }}>{item.batchNo}</Tag>}
                      {item.contractId && <Tag color="orange" style={{ fontSize: 10, marginLeft: 4 }}>合同</Tag>}
                    </Typography.Text>
                  </div>
                  <Space size={4}>
                    <Button size="small" onClick={() => setCart(prev => prev.map(i => i.key === item.key ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i))}>-</Button>
                    <InputNumber size="small" value={item.quantity} min={0} style={{ width: 50 }}
                      onChange={v => setCart(prev => prev.map(i => i.key === item.key ? { ...i, quantity: v || 0 } : i))} />
                    <Button size="small" onClick={() => setCart(prev => prev.map(i => i.key === item.key ? { ...i, quantity: i.quantity + 1 } : i))}>+</Button>
                    <Button size="small" danger onClick={() => setCart(prev => prev.filter(i => i.key !== item.key))}>删</Button>
                  </Space>
                </div>
              ))}
              <Button type="primary" block size="large"
                onClick={() => setStep('confirm')}
                style={{ height: 44, fontSize: 15, marginTop: 8 }}>
                下一步：确认出库（{cart.reduce((s, i) => s + i.quantity, 0)} 件）
              </Button>
            </Card>
          )}
        </>
      )}

      {step === 'confirm' && (
        <Card title="确认出库" style={{ borderRadius: 8 }}>
          <Space orientation="vertical" style={{ width: '100%' }} size={12}>
            <div>
              <Typography.Text type="secondary">领用人</Typography.Text>
              <Input placeholder="领用人/部门" value={receiver} onChange={e => setReceiver(e.target.value)} size="large" />
            </div>
            <div>
              <Typography.Text type="secondary">备注</Typography.Text>
              <Input placeholder="备注（可选）" value={note} onChange={e => setNote(e.target.value)} size="large" />
            </div>
            <div style={{ background: '#fafafa', padding: 12, borderRadius: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>出库明细</Typography.Text>
              {cart.filter(c => c.quantity > 0).map(item => (
                <div key={item.key} style={{ fontSize: 13, padding: '4px 0' }}>
                  {item.productName} × {item.quantity}
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}> {item.locationName}{item.batchNo ? ` [${item.batchNo}]` : ''}</Typography.Text>
                </div>
              ))}
            </div>
            <Button type="primary" size="large" block loading={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()} style={{ height: 48, fontSize: 16 }}>
              确认出库（{cart.reduce((s, i) => s + i.quantity, 0)} 件）
            </Button>
          </Space>
        </Card>
      )}

      <Modal title="选择商品" open={selectorOpen}
        onCancel={() => { setSelectorOpen(false); setProductSearch(''); }}
        footer={null} style={{ top: 20 }}
      >
        <Input.Search placeholder="搜索商品名称/SKU/条码" value={productSearch}
          onChange={e => setProductSearch(e.target.value)} allowClear style={{ marginBottom: 12 }} />
        <List loading={loadingProducts}
          dataSource={(productsData || []).filter(p => {
            if (!currentLocation || !locationInventory) return true; // 未扫库位显示全部
            return locationInventory.some(inv => inv.productId === p.id);
          })}
          style={{ maxHeight: '60vh', overflow: 'auto' }}
          renderItem={(product: Product) => (
            <List.Item onClick={() => handleSelectProduct(product)} style={{ cursor: 'pointer' }}>
              <List.Item.Meta
                title={product.name}
                description={`${product.sku || ''}${product.spec ? ' · ' + product.spec : ''}${product.barcode ? ' · ' + product.barcode : ''}`} />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
}
