import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input, Card, Tag, Typography, Space, Spin, Empty } from 'antd';
import { SearchOutlined, EnvironmentOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import type { InventoryItem } from '../../types';

export default function MobileInventory() {
  const [keyword, setKeyword] = useState('');

  const { data: items, isLoading, isError } = useQuery({
    queryKey: ['inventory-search', keyword],
    queryFn: () => apiClient.get('/inventory', { params: { keyword: keyword || undefined, pageSize: 200 } })
      .then(r => r.data as InventoryItem[]),
    enabled: keyword.length > 0,
  });

  // 按商品分组
  const grouped = new Map<number, { product: InventoryItem['product']; locations: { wh: string; loc: string; qty: number }[] }>();
  items?.forEach(item => {
    if (!grouped.has(item.productId)) {
      grouped.set(item.productId, { product: item.product, locations: [] });
    }
    grouped.get(item.productId)!.locations.push({
      wh: item.warehouse.name,
      loc: item.location?.name || '无库位',
      qty: item.quantity,
    });
  });

  return (
    <div>
      <Typography.Title level={5} style={{ margin: '0 0 12px' }}>库存查询</Typography.Title>

      <Input.Search
        placeholder="搜索商品名称 / SKU / 条码"
        allowClear
        value={keyword}
        onChange={e => setKeyword(e.target.value)}
        onSearch={v => setKeyword(v)}
        enterButton={<><SearchOutlined /> 搜索</>}
        size="large"
        style={{ marginBottom: 12 }}
      />

      {!keyword && (
        <Empty description="输入商品名称或扫码搜索" image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: 40 }} />
      )}

      {isLoading && <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>}

      {isError && <Empty description="加载失败" style={{ padding: 20 }} />}

      {keyword && !isLoading && grouped.size === 0 && (
        <Empty description={`未找到包含"${keyword}"的商品`} style={{ padding: 20 }} />
      )}

      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        {Array.from(grouped.entries()).map(([id, { product, locations }]) => (
          <Card key={id} size="small" style={{ borderRadius: 8 }}>
            <Typography.Text strong style={{ fontSize: 15 }}>{product.name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {product.sku}{product.spec ? ' · ' + product.spec : ''}
            </Typography.Text>
            {product.barcode && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>条码: {product.barcode}</Typography.Text>
            )}
            <div style={{
              marginTop: 8, padding: 8, background: '#fafafa', borderRadius: 6,
            }}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                {locations.map((loc, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography.Text style={{ fontSize: 13 }}>
                      <EnvironmentOutlined style={{ marginRight: 4, color: '#999' }} />
                      {loc.wh} · {loc.loc}
                    </Typography.Text>
                    <Tag color="blue" style={{ fontSize: 13 }}>{loc.qty}</Tag>
                  </div>
                ))}
              </Space>
            </div>
            <div style={{ marginTop: 4, textAlign: 'right' }}>
              <Typography.Text strong style={{ fontSize: 13, color: '#1677ff' }}>
                合计: {locations.reduce((s, l) => s + l.qty, 0)}
              </Typography.Text>
            </div>
          </Card>
        ))}
      </Space>
    </div>
  );
}
