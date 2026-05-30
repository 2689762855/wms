import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input, Card, Tag, Typography, Space, Spin, Empty, Modal } from 'antd';
import { SearchOutlined, EnvironmentOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { getServerUrl } from '../../utils/serverConfig';
import type { InventoryItem } from '../../types';

function toFullUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return (getServerUrl() || '') + path;
}

export default function MobileInventory() {
  const [keyword, setKeyword] = useState('');
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  const { data: items, isLoading, isError } = useQuery({
    queryKey: ['inventory-search', keyword],
    queryFn: () => apiClient.get('/inventory', { params: { keyword: keyword || undefined, pageSize: 200 } })
      .then(r => r.data as InventoryItem[]),
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

      {isLoading && <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>}

      {isError && <Empty description="加载失败" style={{ padding: 20 }} />}

      {!isLoading && grouped.size === 0 && (
        <Empty description="暂无库存数据" style={{ padding: 20 }} />
      )}

      <Space orientation="vertical" style={{ width: '100%' }} size={8}>
        {Array.from(grouped.entries()).map(([id, { product, locations }]) => (
          <Card key={id} size="small" style={{ borderRadius: 8 }}>
            <Space size={8} align="start">
              {toFullUrl((product as any).imageUrl) && (
                <div style={{ width: 48, height: 48, background: `url(${toFullUrl((product as any).imageUrl)}) center/cover`, borderRadius: 6, flexShrink: 0, cursor: 'pointer' }} onClick={() => setPreviewImage({ url: toFullUrl((product as any).imageUrl)!, name: product.name })} />
              )}
              <div style={{ flex: 1 }}>
                <Typography.Link strong style={{ fontSize: 15 }} onClick={() => toFullUrl((product as any).imageUrl) && setPreviewImage({ url: toFullUrl((product as any).imageUrl)!, name: product.name })}>
                  {product.name}
                </Typography.Link>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {product.sku}{product.spec ? ' · ' + product.spec : ''}
            </Typography.Text>
            {product.barcode && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>条码: {product.barcode}</Typography.Text>
            )}
            <div style={{
              marginTop: 8, padding: 8, background: '#fafafa', borderRadius: 6,
            }}>
              <Space orientation="vertical" size={4} style={{ width: '100%' }}>
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
              </div>
            </Space>
          </Card>
        ))}
      </Space>
      <Modal
        open={!!previewImage}
        title={previewImage?.name || '商品图片'}
        footer={null}
        onCancel={() => setPreviewImage(null)}
        width="auto"
        centered
      >
        {previewImage && <img src={previewImage.url} alt={previewImage.name} style={{ maxWidth: '80vw', maxHeight: '70vh', display: 'block' }} />}
      </Modal>
    </div>
  );
}
