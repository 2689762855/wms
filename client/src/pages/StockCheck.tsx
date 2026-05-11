import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, Input, Table, Card, Typography, Space, Tag, Spin, Empty, Grid, Form, Button, message } from 'antd';
import { SearchOutlined, BankOutlined, InboxOutlined, UserOutlined, LockOutlined } from '@ant-design/icons';
import publicApiClient from '../api/publicClient';
import { useCustomerAuth } from '../stores/CustomerAuthContext';
import { getCategoryLevelName } from '../utils/categoryTree';
import ServerConfigModal from '../components/ServerConfigModal';

const { useBreakpoint } = Grid;

interface WarehouseItem {
  id: number;
  name: string;
}

interface InventoryItem {
  id: number;
  productId: number;
  product: {
    id: number;
    sku: string;
    name: string;
    spec?: string;
    unit: string;
    barcode?: string;
    categoryId?: number;
    category?: { id: number; name: string };
  };
  warehouseId: number;
  warehouse: { id: number; name: string };
  locationId?: number;
  location?: { id: number; name: string; code: string };
  quantity: number;
}

function InventoryView() {
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [keyword, setKeyword] = useState('');
  const screens = useBreakpoint();
  const isMobile = Object.keys(screens).length > 0 && !screens.md;
  const { customer, logout } = useCustomerAuth();
  const isRestricted = !!customer?.warehouseId;

  const { data: warehouses, isLoading: whLoading, isError: whError } = useQuery<WarehouseItem[]>({
    queryKey: ['public-warehouses'],
    queryFn: () => publicApiClient.get('/warehouses').then(r => r.data),
    retry: 1,
  });

  const { data: inventory, isLoading: invLoading, isError: invError, refetch } = useQuery<InventoryItem[]>({
    queryKey: ['public-inventory', warehouseId, keyword],
    queryFn: () => publicApiClient.get('/inventory', { params: { warehouseId: isRestricted ? undefined : warehouseId, keyword: keyword || undefined } }).then(r => r.data),
    retry: 1,
  });

  const { data: categories } = useQuery<{ id: number; name: string; parentId?: number | null }[]>({
    queryKey: ['public-categories'],
    queryFn: () => publicApiClient.get('/categories').then(r => r.data),
    retry: 1,
  });

  const catMap = useMemo(() => {
    const map = new Map<number, { name: string; parentId?: number | null }>();
    categories?.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const grouped = useMemo(() => {
    if (!inventory) return [];
    const map = new Map<string, InventoryItem & { totalQty: number }>();
    for (const item of inventory) {
      const key = `${item.productId}-${item.warehouseId}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalQty += item.quantity;
      } else {
        map.set(key, { ...item, totalQty: item.quantity });
      }
    }
    return Array.from(map.values());
  }, [inventory]);

  const columns = [
    { title: 'SKU', dataIndex: ['product', 'sku'], key: 'sku', width: 130 },
    { title: '商品名称', dataIndex: ['product', 'name'], key: 'name', render: (v: string) => <strong>{v}</strong> },
    { title: '规格', dataIndex: ['product', 'spec'], key: 'spec', width: 100, render: (v: string) => v || '-' },
    { title: '条码', dataIndex: ['product', 'barcode'], key: 'barcode', width: 130, render: (v: string) => v || '-' },
    {
      title: '分类', dataIndex: ['product', 'category'], key: 'category', width: 120,
      render: (c: { name: string; parentId?: number | null } | undefined) => {
        const lv2 = getCategoryLevelName(c, 2, catMap);
        const lv3 = getCategoryLevelName(c, 3, catMap);
        const label = [lv2, lv3].filter(Boolean).join(' - ') || c?.name || '-';
        return <Tag>{label}</Tag>;
      },
    },
    {
      title: '仓库', dataIndex: ['warehouse', 'name'], key: 'warehouse', width: 110,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '库存', dataIndex: 'totalQty', key: 'quantity', width: 80, align: 'center' as const,
      render: (v: number) => (
        <Typography.Text strong style={{ color: v <= 5 ? '#fa8c16' : '#52c41a', fontSize: 16 }}>{v}</Typography.Text>
      ),
      sorter: (a: { totalQty: number }, b: { totalQty: number }) => a.totalQty - b.totalQty,
    },
    { title: '单位', dataIndex: ['product', 'unit'], key: 'unit', width: 60 },
  ];

  const content = invError || whError ? (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <Typography.Text type="danger">加载失败</Typography.Text>
      <br />
      <Button type="link" onClick={() => refetch()}>点击重试</Button>
    </div>
  ) : invLoading ? (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <Spin size="large" />
      <div style={{ marginTop: 12, color: '#999' }}>加载库存...</div>
    </div>
  ) : !grouped || grouped.length === 0 ? (
    <Empty description="未找到相关库存商品" style={{ padding: 60 }} image={Empty.PRESENTED_IMAGE_SIMPLE} />
  ) : isMobile ? (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      {grouped.map(item => (
        <Card key={`${item.productId}-${item.warehouseId}`} size="small" style={{ borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <Typography.Text strong style={{ fontSize: 15 }}>{item.product.name}</Typography.Text>
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                {item.product.sku}{item.product.spec ? ' · ' + item.product.spec : ''}
              </Typography.Text>
              {item.product.barcode && (
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  条码: {item.product.barcode}
                </Typography.Text>
              )}
              <Space size={4} style={{ marginTop: 4 }}>
                <Tag color="blue">{item.warehouse.name}</Tag>
                {item.product.category && (() => { const lv2 = getCategoryLevelName(item.product.category, 2, catMap); const lv3 = getCategoryLevelName(item.product.category, 3, catMap); const label = [lv2, lv3].filter(Boolean).join(' - ') || item.product.category.name; return <Tag>{label}</Tag>; })()}
              </Space>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Typography.Text strong style={{ fontSize: 22, color: (item as any).totalQty > 5 ? '#52c41a' : '#fa8c16' }}>
                {(item as any).totalQty}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                {item.product.unit}
              </Typography.Text>
            </div>
          </div>
        </Card>
      ))}
    </Space>
  ) : (
    <Table rowKey={(r: { productId: number; warehouseId: number }) => `${r.productId}-${r.warehouseId}`} columns={columns} dataSource={grouped}
      pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }}
      scroll={{ x: 900 }} size="small"
    />
  );

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#f5f5f5',
      padding: isMobile ? 12 : '24px 40px',
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto', background: '#fff',
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: isMobile ? '16px 20px' : '20px 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <InboxOutlined style={{ fontSize: 28, color: '#fff' }} />
            <div>
              <Typography.Title level={isMobile ? 5 : 4} style={{ color: '#fff', margin: 0 }}>
                库存查询
              </Typography.Title>
              {!isMobile && <Typography.Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>查看各仓库商品库存情况</Typography.Text>}
            </div>
          </div>
          <Space>
            <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
              {customer?.realName || customer?.username}
            </Typography.Text>
            <Typography.Link style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}
              onClick={() => { logout(); }}>退出</Typography.Link>
          </Space>
        </div>

        <div style={{ padding: isMobile ? '12px 16px' : '16px 32px', borderBottom: '1px solid #f0f0f0' }}>
          <Space wrap style={{ width: '100%' }}>
            {isRestricted ? (
              <Tag color="blue" style={{ padding: '4px 12px', fontSize: 14 }}>
                <BankOutlined /> {(warehouses || []).find(w => w.id === customer!.warehouseId)?.name || '指定仓库'}
              </Tag>
            ) : (
              <Select placeholder="全部仓库" allowClear
                style={{ width: isMobile ? 160 : 200 }} loading={whLoading}
                value={warehouseId} onChange={v => setWarehouseId(v)}
                options={warehouses?.map(w => ({ value: w.id, label: w.name }))}
                prefix={<BankOutlined />}
              />
            )}
            <Input.Search placeholder="搜索商品名称 / SKU / 条码" allowClear
              value={keyword} style={{ width: isMobile ? '100%' : 280 }}
              onChange={e => setKeyword(e.target.value)}
              onSearch={v => setKeyword(v)}
              enterButton={<><SearchOutlined /> 搜索</>}
            />
          </Space>
        </div>

        <div style={{ padding: isMobile ? '12px 16px' : '16px 32px 32px' }}>
          {content}
        </div>

        <div style={{ textAlign: 'center', padding: '12px 16px', borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            库存管理系统 · 数据仅供参考，实际库存以仓库为准
          </Typography.Text>
        </div>
      </div>
    </div>
  );
}

function CustomerLogin() {
  const [loading, setLoading] = useState(false);
  const { login } = useCustomerAuth();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await publicApiClient.post('/login', values);
      login(res.data.token, res.data.user);
      message.success('登录成功');
    } catch (err: any) {
      message.error(err.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100dvh', padding: '16px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: '100%', maxWidth: 360, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, right: 0 }}>
            <ServerConfigModal />
          </div>
          <InboxOutlined style={{ fontSize: 48, color: '#1677ff' }} />
          <Typography.Title level={4} style={{ marginTop: 12, marginBottom: 4 }}>库存查询</Typography.Title>
          <Typography.Text type="secondary">登录查看商品库存</Typography.Text>
        </div>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44, fontSize: 16 }}>
              登 录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default function StockCheck() {
  const { token, loading } = useCustomerAuth();
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', background: '#f5f5f5' }}>
      <Spin size="large" />
    </div>
  );
  if (!token) return <CustomerLogin />;
  return <InventoryView />;
}
