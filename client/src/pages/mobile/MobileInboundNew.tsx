import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Typography, Input, InputNumber, Space, Tag, message, Result, Descriptions, Modal, List, Select } from 'antd';
import { ArrowLeftOutlined, ScanOutlined } from '@ant-design/icons';
import BarcodeScanner from '../../components/BarcodeScanner';
import apiClient from '../../api/client';
import { getCategoryPath } from '../../utils/categoryTree';
import type { Location, Product } from '../../types';

interface CartItem {
  key: string;
  productId: number;
  product: Product;
  quantity: number;
  unitPrice?: number;
}

export default function MobileInboundNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<'scan-location' | 'add-items' | 'done'>('scan-location');
  const [location, setLocation] = useState<Location | null>(null);
  const [supplier, setSupplier] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastOrderNo, setLastOrderNo] = useState('');
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);

  const { data: contractsData } = useQuery({
    queryKey: ['mobile-contracts'],
    queryFn: () => apiClient.get('/contracts', { params: { status: 'active', pageSize: 9999 } }).then(r => r.data),
  });

  const { data: selectedContract } = useQuery({
    queryKey: ['mobile-contract', selectedContractId],
    queryFn: () => apiClient.get(`/contracts/${selectedContractId}`).then(r => r.data),
    enabled: !!selectedContractId,
  });

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['mobile-product-search', productSearch],
    queryFn: () => apiClient.get('/products', { params: { keyword: productSearch, pageSize: 30 } }).then(r => r.data.data as Product[]),
    enabled: productModalOpen,
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const items = cart.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, contractId: selectedContractId }));
      const createRes = await apiClient.post('/inbound', {
        warehouseId: location!.warehouseId,
        locationId: location!.id,
        supplier,
        items,
      });
      const confirmRes = await apiClient.put(`/inbound/${createRes.data.id}/confirm`);
      return confirmRes.data;
    },
    onSuccess: (data) => {
      setLastOrderNo(data.orderNo);
      setStep('done');
      queryClient.invalidateQueries({ queryKey: ['inbound'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-all'] });
      queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || '入库失败');
    },
  });

  const handleScanLocation = useCallback(async (code: string) => {
    try {
      const res = await apiClient.get(`/locations/code/${code}`);
      setLocation(res.data);
      setStep('add-items');
    } catch {
      message.error('未找到该库位，请检查二维码');
    }
  }, []);

  const handleScanProduct = useCallback(async (barcode: string) => {
    try {
      const res = await apiClient.get('/products', { params: { keyword: barcode } });
      const products = res.data.data as Product[];
      if (products.length === 0) {
        message.warning('未找到该商品');
        return;
      }
      const product = products[0];
      setCart(prev => {
        const existing = prev.find(i => i.productId === product.id);
        if (existing) {
          return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
        }
        return [...prev, { key: String(Date.now()), productId: product.id, product, quantity: 1 }];
      });
    } catch {
      message.error('查询商品失败');
    }
  }, []);

  const addFromContract = (ci: any) => {
    const remaining = ci.plannedQty - ci.receivedQty;
    if (remaining <= 0) return;
    setCart(prev => {
      const existing = prev.find(i => i.productId === ci.productId);
      if (existing) return prev;
      return [...prev, { key: String(Date.now()), productId: ci.productId, product: ci.product, quantity: Math.min(remaining, ci.plannedQty), contractId: selectedContractId } as any];
    });
  };

  const updateQuantity = (key: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.key !== key) return i;
      const q = i.quantity + delta;
      return q > 0 ? { ...i, quantity: q } : i;
    }));
  };

  const removeItem = (key: string) => {
    setCart(prev => prev.filter(i => i.key !== key));
  };

  const handleContinue = () => {
    setStep('scan-location');
    setLocation(null);
    setSupplier('');
    setCart([]);
    setSelectedContractId(null);
  };

  if (step === 'done') {
    return (
      <Result status="success" title="入库成功" subTitle={`单号: ${lastOrderNo}`}
        extra={[
          <Button key="continue" type="primary" onClick={handleContinue} icon={<ScanOutlined />} size="large" block>
            继续扫码入库
          </Button>,
          <Button key="back" onClick={() => navigate('/m/inbound')} block>返回列表</Button>,
        ]}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => step === 'add-items' ? setStep('scan-location') : navigate('/m/inbound')} />
        <Typography.Title level={5} style={{ margin: 0 }}>扫码入库</Typography.Title>
      </div>

      {step === 'scan-location' && (
        <Card title="步骤 1：扫描库位二维码" style={{ borderRadius: 8 }}>
          <BarcodeScanner onScan={handleScanLocation} />
        </Card>
      )}

      {step === 'add-items' && location && (
        <>
          <Card size="small" style={{ borderRadius: 8, marginBottom: 12, background: '#f6ffed' }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="库位">{location.name}</Descriptions.Item>
              <Descriptions.Item label="仓库">{location.warehouse?.name}</Descriptions.Item>
              <Descriptions.Item label="编码">{location.code}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="步骤 2：添加商品" style={{ borderRadius: 8, marginBottom: 12 }}>
            <BarcodeScanner onScan={handleScanProduct} />
            <Button type="link" onClick={() => setProductModalOpen(true)} style={{ marginTop: 4, padding: 0 }}>从商品列表选择</Button>
          </Card>

          {cart.length > 0 && (
            <Card title={`已添加 (${cart.length} 项)`} style={{ borderRadius: 8, marginBottom: 12 }}>
              <Space orientation="vertical" style={{ width: '100%' }} size={8}>
                {cart.map(item => (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <Typography.Text strong>{item.product.name}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                        {item.product.sku}
                      </Typography.Text>
                    </div>
                    <Button size="small" onClick={() => updateQuantity(item.key, -1)}>-</Button>
                    <InputNumber size="small" value={item.quantity} min={1} style={{ width: 60 }}
                      onChange={v => setCart(prev => prev.map(i => i.key === item.key ? { ...i, quantity: v || 1 } : i))} />
                    <Button size="small" onClick={() => updateQuantity(item.key, 1)}>+</Button>
                    <Button size="small" danger onClick={() => removeItem(item.key)}>删</Button>
                  </div>
                ))}
              </Space>
            </Card>
          )}

          <Card title="步骤 3：确认入库" style={{ borderRadius: 8, marginBottom: 12 }}>
            <Space orientation="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <Typography.Text type="secondary">供应商</Typography.Text>
                <Input placeholder="供应商名称" value={supplier} onChange={e => setSupplier(e.target.value)} size="large" />
              </div>
              <div>
                <Typography.Text type="secondary">关联合同（可选）</Typography.Text>
                <Select allowClear placeholder="选择合同" value={selectedContractId} onChange={(v) => setSelectedContractId(v ?? null)} style={{ width: '100%' }} size="large"
                  options={contractsData?.data?.map((c: any) => ({ label: `${c.contractNo} (${c.customer?.realName || c.customer?.username})`, value: c.id }))} />
              </div>
              {selectedContract && (
                <Card size="small" title={`合同 ${selectedContract.contractNo}`} style={{ background: '#fafafa' }}>
                  {selectedContract.items?.map((ci: any) => {
                    const remaining = ci.plannedQty - ci.receivedQty;
                    const inCart = cart.find(i => i.productId === ci.productId);
                    return (
                      <div key={ci.productId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Typography.Text style={{ flex: 1, fontSize: 14 }}>{ci.product?.name}</Typography.Text>
                        <Tag>{ci.receivedQty}/{ci.plannedQty}</Tag>
                        {inCart ? (
                          <Tag color="blue">已添加 x{inCart.quantity}</Tag>
                        ) : remaining > 0 ? (
                          <Button size="small" type="primary" onClick={() => addFromContract(ci)}>加入</Button>
                        ) : (
                          <Tag color="green">已完成</Tag>
                        )}
                      </div>
                    );
                  })}
                </Card>
              )}
              <Button type="primary" size="large" block loading={confirmMutation.isPending}
                disabled={cart.length === 0}
                onClick={() => confirmMutation.mutate()} style={{ height: 48, fontSize: 16 }}>
                确认入库（{cart.reduce((s, i) => s + i.quantity, 0)} 件）
              </Button>
            </Space>
          </Card>
        </>
      )}

      <Modal title="选择商品" open={productModalOpen}
        onCancel={() => { setProductModalOpen(false); setProductSearch(''); }}
        footer={null} style={{ maxWidth: 600 }}
      >
        <Input.Search placeholder="搜索商品名称/SKU/条码" value={productSearch}
          onChange={e => setProductSearch(e.target.value)} allowClear style={{ marginBottom: 12 }} />
        <List loading={loadingProducts} dataSource={productsData || []}
          style={{ maxHeight: '60vh', overflow: 'auto' }}
          renderItem={(product: Product) => (
            <List.Item onClick={() => {
              setCart(prev => {
                const existing = prev.find(i => i.productId === product.id);
                if (existing) {
                  return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
                }
                return [...prev, { key: String(Date.now()), productId: product.id, product, quantity: 1 }];
              });
              setProductModalOpen(false);
              setProductSearch('');
            }} style={{ cursor: 'pointer' }}>
              <List.Item.Meta
                title={<>{(() => { const cp = getCategoryPath(product.category || null); return cp !== '-' ? <span style={{fontSize:12,color:'#999'}}>{cp} - </span> : null; })()}{product.name}</>}
                description={`${product.sku}${product.spec ? ' · ' + product.spec : ''}${product.barcode ? ' · ' + product.barcode : ''}`} />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
}
