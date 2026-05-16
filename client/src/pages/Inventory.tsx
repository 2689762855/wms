import { useState, useMemo } from 'react';
import { Table, Select, Input, Card, Typography, Space, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import { getCategoryLevelName } from '../utils/categoryTree';
import type { Warehouse, InventoryItem, Category } from '../types';

function LocationDetail({ productId, warehouseId }: { productId: number; warehouseId?: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', { productId, warehouseId }],
    queryFn: () => apiClient.get('/inventory', { params: { productId, warehouseId } }).then(r => r.data as InventoryItem[]),
  });

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].filter(item => item.quantity > 0).sort((a, b) => b.quantity - a.quantity);
  }, [data]);

  const total = sorted.reduce((s, item) => s + item.quantity, 0);

  return (
    <div style={{ padding: '8px 0' }}>
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={sorted}
        pagination={false}
        columns={[
          { title: '库位名称', dataIndex: ['location', 'name'], key: 'loc', render: (v: string | undefined) => v || <span style={{ color: '#999' }}>无库位</span> },
          { title: '库位编码', dataIndex: ['location', 'code'], key: 'code', render: (v: string | undefined) => v || '-' },
          { title: '数量', dataIndex: 'quantity', key: 'qty', render: (v: number) => <strong>{v}</strong> },
        ]}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}><strong>合计</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={1} />
            <Table.Summary.Cell index={2}><strong>{total}</strong></Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </div>
  );
}

export default function Inventory() {
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [keyword, setKeyword] = useState('');

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => apiClient.get('/warehouses').then(r => r.data) });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.get('/categories').then(r => r.data) });
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', warehouseId, keyword],
    queryFn: () => apiClient.get('/inventory', { params: { warehouseId, keyword } }).then(r => r.data),
  });

  const catMap = useMemo(() => {
    const map = new Map<number, Category>();
    categories?.forEach((c: Category) => map.set(c.id, c));
    return map;
  }, [categories]);

  // 按 productId + warehouseId 合并，同一个商品不同库位汇总显示
  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, InventoryItem & { totalQty: number; locationCount: number }>();
    for (const item of data) {
      const key = `${item.productId}-${item.warehouseId}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalQty += item.quantity;
        existing.locationCount += 1;
        if (item.updatedAt > existing.updatedAt) existing.updatedAt = item.updatedAt;
      } else {
        map.set(key, { ...item, totalQty: item.quantity, locationCount: 1 });
      }
    }
    return Array.from(map.values()).filter(item => item.totalQty > 0);
  }, [data]);

  const columns = [
    { title: 'SKU', dataIndex: ['product', 'sku'], key: 'sku', width: 130 },
    { title: '商品名称', key: 'name', render: (_: unknown, r: InventoryItem & { locationCount?: number }) => {
      const lv2 = getCategoryLevelName(r.product?.category, 2, catMap);
      return <span>{lv2 ? <><span style={{ color: '#888' }}>{lv2}</span> - </> : null}{r.product?.name}</span>;
    } },
    { title: '规格', dataIndex: ['product', 'spec'], key: 'spec' },
    { title: '仓库', dataIndex: ['warehouse', 'name'], key: 'warehouse' },
    {
      title: '库存数量', key: 'quantity', sorter: (a: { totalQty: number }, b: { totalQty: number }) => a.totalQty - b.totalQty,
      render: (_: unknown, r: { totalQty: number; locationCount: number; product?: { safetyStock?: number } }) => (
        <Space>
          <span style={{ fontWeight: 'bold' }}>{r.totalQty}</span>
          {r.locationCount > 1 && <Tag>{r.locationCount} 个库位</Tag>}
          {r.totalQty <= (r.product?.safetyStock || 0) && <Tag color="red">低库存</Tag>}
        </Space>
      ),
    },
    { title: '安全库存', dataIndex: ['product', 'safetyStock'], key: 'safetyStock' },
    { title: '最近更新', dataIndex: 'updatedAt', key: 'updatedAt', render: (t: string) => new Date(t).toLocaleString('zh-CN') },
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>库存查询</Typography.Title>}>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select placeholder="选择仓库" allowClear style={{ width: 160 }} onChange={setWarehouseId}>
          {warehouses?.map((w: Warehouse) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
        </Select>
        <Input.Search placeholder="搜索商品名称" allowClear onSearch={setKeyword} style={{ width: 220 }} />
      </Space>
      <Table rowKey={(r: { productId: number; warehouseId: number }) => `${r.productId}-${r.warehouseId}`} columns={columns} dataSource={grouped} loading={isLoading}
        pagination={{ pageSize: 50, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 900 }}
        size="small"
        expandable={{
          expandedRowRender: (r: { productId: number; warehouseId: number }) => (
            <LocationDetail productId={r.productId} warehouseId={r.warehouseId} />
          ),
          rowExpandable: (r: InventoryItem) => r.quantity > 0,
        }}
      />
    </Card>
  );
}
