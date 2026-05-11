import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Typography, Input, InputNumber, Space, Tag, message, Result, Descriptions, Modal, List } from 'antd';
import { ArrowLeftOutlined, ScanOutlined } from '@ant-design/icons';
import BarcodeScanner from '../../components/BarcodeScanner';
import apiClient from '../../api/client';
import { useAuth } from '../../stores/AuthContext';
import type { Location, Product, InventoryItem } from '../../types';

interface PickItem {
  productId: number;
  product: Product;
  available: number;
  quantity: number;
}

export default function MobileOutboundNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { user } = useAuth();
  const [step, setStep] = useState<'scan-location' | 'pick-items' | 'done'>('scan-location');
  const [location, setLocation] = useState<Location | null>(null);
  const [receiver, setReceiver] = useState(user?.realName || '');
  const [picks, setPicks] = useState<PickItem[]>([]);
  const [lastOrderNo, setLastOrderNo] = useState('');
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);

  // load inventory at scanned location
  const { data: locationInventory, isLoading: loadingInv } = useQuery({
    queryKey: ['location-inventory', location?.id],
    queryFn: () => apiClient.get(`/locations/${location!.id}/inventory`).then(r => r.data as InventoryItem[]),
    enabled: !!location && step === 'pick-items',
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const items = picks.filter(p => p.quantity > 0).map(p => ({ productId: p.productId, quantity: p.quantity }));
      if (items.length === 0) throw new Error('请选择商品');
      const createRes = await apiClient.post('/outbound', {
        warehouseId: location!.warehouseId,
        locationId: location!.id,
        receiver,
        items,
      });
      const confirmRes = await apiClient.put(`/outbound/${createRes.data.id}/confirm`);
      return confirmRes.data;
    },
    onSuccess: (data) => {
      setLastOrderNo(data.orderNo);
      setStep('done');
      queryClient.invalidateQueries({ queryKey: ['outbound'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || err.message || '出库失败');
    },
  });

  const handleScanLocation = useCallback(async (code: string) => {
    try {
      const res = await apiClient.get(`/locations/code/${code}`);
      setLocation(res.data);
      setStep('pick-items');
    } catch {
      message.error('未找到该库位，请检查二维码');
    }
  }, []);

  const handleScanProduct = useCallback((barcode: string) => {
    // Find matching inventory item by barcode
    if (!locationInventory) return;
    const inv = locationInventory.find(i => i.product.barcode === barcode || i.product.sku === barcode);
    if (!inv) {
      message.warning('该库位未找到此商品');
      return;
    }
    // Increment pick quantity
    setPicks(prev => {
      const existing = prev.find(p => p.productId === inv.productId);
      if (existing) {
        const q = existing.quantity + 1;
        if (q > existing.available) { message.warning('不能超过库位库存'); return prev; }
        return prev.map(p => p.productId === inv.productId ? { ...p, quantity: q } : p);
      }
      return [...prev, { productId: inv.productId, product: inv.product, available: inv.quantity, quantity: 1 }];
    });
  }, [locationInventory]);

  const updateQuantity = (productId: number, delta: number) => {
    setPicks(prev => prev.map(p => {
      if (p.productId !== productId) return p;
      const q = p.quantity + delta;
      if (q < 0 || q > p.available) return p;
      return { ...p, quantity: q };
    }));
  };

  const handleContinue = () => {
    setStep('scan-location');
    setLocation(null);
    setReceiver('');
    setPicks([]);
  };

  if (step === 'done') {
    return (
      <Result status="success" title="出库成功" subTitle={`单号: ${lastOrderNo}`}
        extra={[
          <Button key="continue" type="primary" onClick={handleContinue} icon={<ScanOutlined />} size="large" block>
            继续扫码出库
          </Button>,
          <Button key="back" onClick={() => navigate('/m/outbound')} block>返回列表</Button>,
        ]}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />}
          onClick={() => step === 'pick-items' ? setStep('scan-location') : navigate('/m/outbound')} />
        <Typography.Title level={5} style={{ margin: 0 }}>扫码出库</Typography.Title>
      </div>

      {step === 'scan-location' && (
        <Card title="步骤 1：扫描库位二维码" style={{ borderRadius: 8 }}>
          <BarcodeScanner onScan={handleScanLocation} />
        </Card>
      )}

      {step === 'pick-items' && location && (
        <>
          <Card size="small" style={{ borderRadius: 8, marginBottom: 12, background: '#fff7e6' }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="库位">{location.name}</Descriptions.Item>
              <Descriptions.Item label="仓库">{location.warehouse?.name}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="步骤 2：添加商品" style={{ borderRadius: 8, marginBottom: 12 }}>
            <BarcodeScanner onScan={handleScanProduct} />
            <Button type="link" onClick={() => setInventoryModalOpen(true)} style={{ marginTop: 4, padding: 0 }}
              disabled={!locationInventory || locationInventory.length === 0}>从库位库存选择</Button>
          </Card>

          {loadingInv && <div style={{ textAlign: 'center', padding: 20 }}>加载库位库存...</div>}

          {locationInventory && locationInventory.length === 0 && (
            <Card style={{ borderRadius: 8, marginBottom: 12 }}>
              <Typography.Text type="secondary">该库位暂无库存</Typography.Text>
            </Card>
          )}

          {locationInventory && locationInventory.length > 0 && (
            <Card title={`库位库存 (${locationInventory.length} 项)`} style={{ borderRadius: 8, marginBottom: 12 }}>
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {locationInventory.map(inv => {
                  const pick = picks.find(p => p.productId === inv.productId);
                  return (
                    <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <Typography.Text strong>{inv.product.name}</Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                          {inv.product.sku} · 库存 {inv.quantity}
                        </Typography.Text>
                      </div>
                      <Button size="small" onClick={() => updateQuantity(inv.productId, -1)}>-</Button>
                      <InputNumber size="small" value={pick?.quantity || 0} min={0} max={inv.quantity} style={{ width: 60 }}
                        onChange={v => {
                          const q = v || 0;
                          if (q === 0) {
                            setPicks(prev => prev.filter(p => p.productId !== inv.productId));
                          } else {
                            setPicks(prev => {
                              const ex = prev.find(p => p.productId === inv.productId);
                              if (!ex) {
                                return [...prev, { productId: inv.productId, product: inv.product, available: inv.quantity, quantity: Math.min(q, inv.quantity) }];
                              }
                              return prev.map(p => p.productId === inv.productId ? { ...p, quantity: Math.min(q, p.available) } : p);
                            });
                          }
                        }} />
                      <Button size="small" onClick={() => {
                        if (inv.quantity === 0) return;
                        setPicks(prev => {
                          const ex = prev.find(p => p.productId === inv.productId);
                          if (!ex) {
                            return [...prev, { productId: inv.productId, product: inv.product, available: inv.quantity, quantity: 1 }];
                          }
                          return prev.map(p => p.productId === inv.productId ? { ...p, quantity: Math.min(p.quantity + 1, p.available) } : p);
                        });
                      }}>+</Button>
                    </div>
                  );
                })}
              </Space>
            </Card>
          )}

          <Card title="步骤 3：确认出库" style={{ borderRadius: 8, marginBottom: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <Typography.Text type="secondary">领用人</Typography.Text>
                <Input placeholder="领用人/部门" value={receiver} onChange={e => setReceiver(e.target.value)} size="large" />
              </div>
              <Button type="primary" size="large" block loading={confirmMutation.isPending}
                disabled={picks.reduce((s, p) => s + p.quantity, 0) === 0}
                onClick={() => confirmMutation.mutate()} style={{ height: 48, fontSize: 16 }}>
                确认出库（{picks.reduce((s, p) => s + p.quantity, 0)} 件）
              </Button>
            </Space>
          </Card>
        </>
      )}

      <Modal title="选择库位库存商品" open={inventoryModalOpen}
        onCancel={() => setInventoryModalOpen(false)} footer={null} style={{ maxWidth: 600 }}
      >
        <List dataSource={locationInventory || []}
          style={{ maxHeight: '60vh', overflow: 'auto' }}
          renderItem={(inv) => (
            <List.Item onClick={() => {
              setPicks(prev => {
                const existing = prev.find(p => p.productId === inv.productId);
                if (existing) {
                  const q = existing.quantity + 1;
                  if (q > existing.available) { message.warning('不能超过库位库存'); return prev; }
                  return prev.map(p => p.productId === inv.productId ? { ...p, quantity: q } : p);
                }
                return [...prev, { productId: inv.productId, product: inv.product, available: inv.quantity, quantity: 1 }];
              });
              setInventoryModalOpen(false);
            }} style={{ cursor: 'pointer' }}>
              <List.Item.Meta
                title={<>{inv.product.category?.parent?.parent?.name && <span style={{fontSize:12,color:'#999'}}>{inv.product.category.parent.parent.name} - </span>}{inv.product.category?.parent?.name && <span style={{fontSize:12,color:'#999'}}>{inv.product.category.parent.name} - </span>}{inv.product.name}</>}
                description={`${inv.product.sku} · 库存 ${inv.quantity}`} />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
}
