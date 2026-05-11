import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Typography, InputNumber, Space, Tag, message, Result, Descriptions } from 'antd';
import { ArrowLeftOutlined, ScanOutlined } from '@ant-design/icons';
import BarcodeScanner from '../../components/BarcodeScanner';
import apiClient from '../../api/client';
import type { Location, Product, InventoryItem } from '../../types';

interface TransferItem {
  productId: number;
  product: Product;
  available: number;
  quantity: number;
}

export default function MobileTransfer() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<'scan-from' | 'select-items' | 'scan-to' | 'done'>('scan-from');
  const [fromLocation, setFromLocation] = useState<Location | null>(null);
  const [toLocation, setToLocation] = useState<Location | null>(null);
  const [picks, setPicks] = useState<TransferItem[]>([]);
  const [lastMsg, setLastMsg] = useState('');

  const { data: fromInventory, isLoading: loadingInv } = useQuery({
    queryKey: ['location-inventory-transfer', fromLocation?.id],
    queryFn: () => apiClient.get(`/locations/${fromLocation!.id}/inventory`).then(r => r.data as InventoryItem[]),
    enabled: !!fromLocation && step === 'select-items',
  });

  const moveMutation = useMutation({
    mutationFn: async () => {
      const items = picks.filter(p => p.quantity > 0).map(p => ({ productId: p.productId, quantity: p.quantity }));
      return apiClient.post('/stock-move', { fromLocationId: fromLocation!.id, toLocationId: toLocation!.id, items }).then(r => r.data);
    },
    onSuccess: () => {
      setLastMsg(`${fromLocation?.name} → ${toLocation?.name}`);
      setStep('done');
      queryClient.invalidateQueries({ queryKey: ['location-inventory-transfer'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: any) => message.error(err.response?.data?.error || err.message || '转移失败'),
  });

  const handleScanFrom = useCallback(async (code: string) => {
    try {
      const res = await apiClient.get(`/locations/code/${code}`);
      setFromLocation(res.data);
      setPicks([]);
      setStep('select-items');
    } catch { message.error('未找到该库位'); }
  }, []);

  const updateQuantity = (productId: number, delta: number) => {
    setPicks(prev => prev.map(p => {
      if (p.productId !== productId) return p;
      const q = p.quantity + delta;
      if (q < 0 || q > p.available) return p;
      return { ...p, quantity: q };
    }));
  };

  const handleScanTo = useCallback(async (code: string) => {
    try {
      const res = await apiClient.get(`/locations/code/${code}`);
      const loc = res.data as Location;
      if (loc.id === fromLocation!.id) { message.warning('目标库位不能与源库位相同'); return; }
      setToLocation(loc);
    } catch { message.error('未找到该库位'); }
  }, [fromLocation]);

  const handleContinue = () => {
    setStep('scan-from');
    setFromLocation(null);
    setToLocation(null);
    setPicks([]);
  };

  if (step === 'done') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleContinue} />
          <Typography.Title level={5} style={{ margin: 0 }}>库位转移</Typography.Title>
        </div>
        <Result status="success" title="转移成功" subTitle={lastMsg}
          extra={[
            <Button key="continue" type="primary" onClick={handleContinue} icon={<ScanOutlined />} size="large" block>继续转移</Button>,
            <Button key="back" onClick={() => navigate('/m/inbound')} block>返回</Button>,
          ]}
        />
      </div>
    );
  }

  const activePicks = picks.filter(p => p.quantity > 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />}
          onClick={() => {
            if (step === 'select-items') { setStep('scan-from'); setPicks([]); }
            else if (step === 'scan-to') setStep('select-items');
            else navigate('/m/inbound');
          }}
        />
        <Typography.Title level={5} style={{ margin: 0 }}>库位转移</Typography.Title>
      </div>

      {/* Step 1 */}
      {step === 'scan-from' && (
        <Card title="步骤 1：扫描源库位二维码" style={{ borderRadius: 8 }}>
          <BarcodeScanner onScan={handleScanFrom} />
        </Card>
      )}

      {/* Step 2 */}
      {step === 'select-items' && fromLocation && (
        <>
          <Card size="small" style={{ borderRadius: 8, marginBottom: 12, background: '#fff7e6' }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="源库位">{fromLocation.name}</Descriptions.Item>
              <Descriptions.Item label="仓库">{fromLocation.warehouse?.name}</Descriptions.Item>
            </Descriptions>
          </Card>

          {loadingInv && <div style={{ textAlign: 'center', padding: 20 }}>加载库存...</div>}

          {fromInventory && fromInventory.length === 0 && (
            <Card style={{ borderRadius: 8, marginBottom: 12 }}><Typography.Text type="secondary">该库位暂无库存</Typography.Text></Card>
          )}

          {fromInventory && fromInventory.length > 0 && (
            <Card title={`库位库存 (${fromInventory.length} 项)`} style={{ borderRadius: 8, marginBottom: 12 }}>
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {fromInventory.map(inv => {
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
                          setPicks(prev => {
                            if (q === 0) return prev.filter(p => p.productId !== inv.productId);
                            const ex = prev.find(p => p.productId === inv.productId);
                            if (!ex) return [...prev, { productId: inv.productId, product: inv.product, available: inv.quantity, quantity: Math.min(q, inv.quantity) }];
                            return prev.map(p => p.productId === inv.productId ? { ...p, quantity: Math.min(q, p.available) } : p);
                          });
                        }}
                      />
                      <Button size="small" onClick={() => updateQuantity(inv.productId, 1)}>+</Button>
                    </div>
                  );
                })}
              </Space>
            </Card>
          )}

          {activePicks.length > 0 && (
            <Card size="small" style={{ borderRadius: 8, marginBottom: 12, background: '#e6f7ff' }}>
              <Typography.Text strong>待转移 ({activePicks.length} 项)：</Typography.Text>
              {activePicks.map(p => <Tag key={p.productId} style={{ margin: 2 }}>{p.product.name} ×{p.quantity}</Tag>)}
            </Card>
          )}

          <Button type="primary" size="large" block disabled={activePicks.length === 0}
            onClick={() => setStep('scan-to')} style={{ height: 48, fontSize: 16 }}>
            下一步：扫描目标库位
          </Button>
        </>
      )}

      {/* Step 3 */}
      {step === 'scan-to' && fromLocation && (
        <>
          <Card title="步骤 3：扫描目标库位二维码" style={{ borderRadius: 8, marginBottom: 12 }}>
            <BarcodeScanner onScan={handleScanTo} />
          </Card>

          {toLocation && (
            <Card size="small" style={{ borderRadius: 8, marginBottom: 12, background: '#f6ffed' }}>
              <Descriptions column={1} size="small">
                <Descriptions.Item label="目标库位">{toLocation.name}</Descriptions.Item>
                <Descriptions.Item label="仓库">{toLocation.warehouse?.name}</Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          <Card title="转移预览" size="small" style={{ borderRadius: 8, marginBottom: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <Tag color="orange">{fromLocation.name}</Tag> → <Tag color="green">{toLocation ? toLocation.name : '未选择'}</Tag>
            </div>
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              {activePicks.map(p => (
                <div key={p.productId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{p.product.name} <Typography.Text type="secondary">{p.product.sku}</Typography.Text></span>
                  <Typography.Text strong>×{p.quantity}</Typography.Text>
                </div>
              ))}
            </Space>
          </Card>

          <Button type="primary" size="large" block loading={moveMutation.isPending}
            disabled={!toLocation} onClick={() => moveMutation.mutate()}
            style={{ height: 48, fontSize: 16 }}>
            确认转移（{activePicks.reduce((s, p) => s + p.quantity, 0)} 件）
          </Button>
        </>
      )}
    </div>
  );
}
