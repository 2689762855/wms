import { useState, useMemo } from 'react';
import { Table, Select, Card, Typography, Tag, Space, Tooltip } from 'antd';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import { getCategoryLevelName } from '../utils/categoryTree';
import type { Warehouse, Category } from '../types';

interface AlertItem {
  product: { id: number; sku: string; name: string; spec?: string; unit: string; barcode?: string; category?: Category | null };
  warehouseId: number;
  warehouseName: string;
  currentQty: number;
  safetyStock: number;
  shortage: number;
  locations: { name: string; code: string; qty: number }[];
}

export default function Alerts() {
  const [warehouseId, setWarehouseId] = useState<number | undefined>();

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => apiClient.get('/warehouses').then(r => r.data) });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.get('/categories').then(r => r.data) });
  const { data = [], isLoading } = useQuery({
    queryKey: ['alerts', warehouseId],
    queryFn: () => apiClient.get('/alerts', { params: { warehouseId } }).then(r => r.data as AlertItem[]),
  });

  const catMap = useMemo(() => {
    const map = new Map<number, Category>();
    categories?.forEach((c: Category) => map.set(c.id, c));
    return map;
  }, [categories]);

  const columns = [
    { title: 'SKU', dataIndex: ['product', 'sku'], key: 'sku', width: 130 },
    { title: '商品名称', key: 'name', render: (_: unknown, r: AlertItem) => {
      const lv2 = getCategoryLevelName(r.product?.category, 2, catMap);
      return <span>{lv2 ? <><span style={{ color: '#888' }}>{lv2}</span> - </> : null}{r.product?.name}</span>;
    } },
    { title: '仓库', dataIndex: 'warehouseName', key: 'warehouse' },
    { title: '安全库存', dataIndex: 'safetyStock', key: 'safetyStock' },
    { title: '当前库存', key: 'currentQty', render: (_: unknown, r: AlertItem) => {
      const locTip = r.locations.length > 0
        ? r.locations.map(l => `${l.name}(${l.code || '-'}): ${l.qty}`).join(', ')
        : '';
      return (
        <Tooltip title={locTip || undefined}>
          <Space>
            <span style={{ color: r.currentQty === 0 ? '#ff4d4f' : '#faad14', fontWeight: 'bold' }}>{r.currentQty}</span>
            {r.locations.length > 1 && <Tag>{r.locations.length} 个库位</Tag>}
          </Space>
        </Tooltip>
      );
    } },
    { title: '缺少数量', key: 'shortage', render: (_: unknown, r: AlertItem) => <Tag color={r.currentQty === 0 ? 'red' : 'orange'}>{r.shortage}</Tag> },
    { title: '建议', key: 'suggestion', render: (_: unknown, r: AlertItem) => r.currentQty === 0 ? <span style={{ color: '#ff4d4f' }}>缺货！需补货 {r.shortage} 件</span> : `需补货 ${r.shortage} 件` },
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>库存预警 <Tag color="red">{data.length} 项低于安全库存</Tag></Typography.Title>}>
      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="筛选仓库" allowClear style={{ width: 160 }} onChange={setWarehouseId}>
          {warehouses?.map((w: Warehouse) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
        </Select>
      </Space>
      <Table rowKey={(r: AlertItem) => `${r.product.id}-${r.warehouseId}`} columns={columns} dataSource={data} loading={isLoading} pagination={false} scroll={{ x: 800 }} />
    </Card>
  );
}
