import { useState, useMemo } from 'react';
import { Table, Select, Input, Card, Typography, Space, Tag, Button, Modal, message, InputNumber } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import { getCategoryLevelName } from '../utils/categoryTree';
import { getServerUrl } from '../utils/serverConfig';
import type { Warehouse, InventoryItem, Category, Location, ProductWarehouse } from '../types';

function toFullUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return (getServerUrl() || '') + path;
}

function InlineSafetyStock({ productId, warehouseId, currentValue }: { productId: number; warehouseId: number; currentValue?: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number>(currentValue ?? 0);

  const saveMutation = useMutation({
    mutationFn: (safetyStock: number) =>
      safetyStock > 0
        ? apiClient.put('/product-warehouses', { productId, warehouseId, safetyStock })
        : apiClient.delete('/product-warehouses', { data: { productId, warehouseId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productWarehouses'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setEditing(false);
    },
    onError: (err: any) => message.error(err.response?.data?.error || '保存失败'),
  });

  if (editing) {
    return (
      <Space size={4}>
        <InputNumber size="small" min={0} value={value} onChange={(v) => setValue(v || 0)} style={{ width: 80 }} autoFocus onPressEnter={() => saveMutation.mutate(value)} />
        <Button size="small" type="primary" loading={saveMutation.isPending} onClick={() => saveMutation.mutate(value)}>确定</Button>
        <Button size="small" onClick={() => { setEditing(false); setValue(currentValue ?? 0); }}>取消</Button>
      </Space>
    );
  }

  if (currentValue != null && currentValue > 0) {
    return <Tag color="blue" style={{ cursor: 'pointer' }} onClick={() => { setValue(currentValue); setEditing(true); }}>{currentValue}</Tag>;
  }
  return <Tag style={{ cursor: 'pointer' }} onClick={() => { setValue(0); setEditing(true); }}>未配置</Tag>;
}

function LocationDetail({ productId, warehouseId }: { productId: number; warehouseId?: number }) {
  const queryClient = useQueryClient();
  const [assignModal, setAssignModal] = useState<{ open: boolean; invId: number; invQty: number }>({ open: false, invId: 0, invQty: 0 });
  const [targetLocationId, setTargetLocationId] = useState<number | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', { productId, warehouseId }],
    queryFn: () => apiClient.get('/inventory', { params: { productId, warehouseId } }).then(r => r.data as InventoryItem[]),
  });

  // 加载该仓库的库位列表
  const { data: locations } = useQuery({
    queryKey: ['locations', warehouseId],
    queryFn: () => apiClient.get('/locations', { params: { warehouseId } }).then(r => r.data as Location[]),
    enabled: !!warehouseId,
  });

  const assignMutation = useMutation({
    mutationFn: () => apiClient.post('/stock-move/assign-location', { inventoryId: assignModal.invId, toLocationId: targetLocationId }),
    onSuccess: () => {
      message.success('已分配库位');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setAssignModal({ open: false, invId: 0, invQty: 0 });
      setTargetLocationId(undefined);
    },
    onError: (err: any) => message.error(err.response?.data?.error || '分配失败'),
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
          { title: '库位名称', dataIndex: ['location', 'name'], key: 'loc', render: (v: string | undefined) => v || <span style={{ color: '#ff7a00' }}>⚠ 无库位</span> },
          { title: '库位编码', dataIndex: ['location', 'code'], key: 'code', render: (v: string | undefined) => v || '-' },
          { title: '数量', dataIndex: 'quantity', key: 'qty', render: (v: number) => <strong>{v}</strong> },
          { title: '', key: 'action', width: 100, render: (_: unknown, r: InventoryItem) =>
            !r.location && (
              <Button size="small" type="primary" onClick={() => { setAssignModal({ open: true, invId: r.id, invQty: r.quantity }); setTargetLocationId(undefined); }}>
                分配库位
              </Button>
            )
          },
        ]}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}><strong>合计</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={1} />
            <Table.Summary.Cell index={2}><strong>{total}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={3} />
          </Table.Summary.Row>
        )}
      />
      <Modal
        title="分配库位"
        open={assignModal.open}
        onCancel={() => setAssignModal({ open: false, invId: 0, invQty: 0 })}
        onOk={() => assignMutation.mutate()}
        confirmLoading={assignMutation.isPending}
        okButtonProps={{ disabled: !targetLocationId }}
      >
        <Typography.Paragraph>将 <strong>{assignModal.invQty}</strong> 件商品分配到指定库位</Typography.Paragraph>
        <Select placeholder="选择目标库位" style={{ width: '100%' }} onChange={setTargetLocationId} value={targetLocationId}>
          {locations?.map((l: Location) => <Select.Option key={l.id} value={l.id}>{l.name}</Select.Option>)}
        </Select>
      </Modal>
    </div>
  );
}

export default function Inventory() {
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [keyword, setKeyword] = useState('');
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => apiClient.get('/warehouses').then(r => r.data) });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.get('/categories').then(r => r.data) });
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', warehouseId, keyword],
    queryFn: () => apiClient.get('/inventory', { params: { warehouseId, keyword } }).then(r => r.data),
  });

  const { data: productWarehouses } = useQuery({
    queryKey: ['productWarehouses', warehouseId],
    queryFn: () => apiClient.get('/product-warehouses', { params: { warehouseId } }).then(r => r.data as ProductWarehouse[]),
  });

  const catMap = useMemo(() => {
    const map = new Map<number, Category>();
    categories?.forEach((c: Category) => map.set(c.id, c));
    return map;
  }, [categories]);

  // 按 productId + warehouseId 合并，同一个商品不同库位汇总显示
  const grouped = useMemo(() => {
    if (!data) return [];
    // 仓库安全库存 Map
    const pwMap = new Map<string, number>();
    productWarehouses?.forEach((pw: ProductWarehouse) => {
      pwMap.set(`${pw.productId}-${pw.warehouseId}`, pw.safetyStock);
    });
    const map = new Map<string, InventoryItem & { totalQty: number; locationCount: number; perWarehouseSafetyStock?: number }>();
    for (const item of data) {
      const key = `${item.productId}-${item.warehouseId}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalQty += item.quantity;
        existing.locationCount += 1;
        if (item.updatedAt > existing.updatedAt) existing.updatedAt = item.updatedAt;
      } else {
        map.set(key, { ...item, totalQty: item.quantity, locationCount: 1, perWarehouseSafetyStock: pwMap.get(key) });
      }
    }
    return Array.from(map.values()).filter(item => item.totalQty > 0);
  }, [data, productWarehouses]);

  const columns = [
    { title: 'SKU', dataIndex: ['product', 'sku'], key: 'sku', width: 130 },
    { title: '商品名称', key: 'name', render: (_: unknown, r: InventoryItem & { locationCount?: number }) => {
      const lv2 = getCategoryLevelName(r.product?.category, 2, catMap);
      const imgUrl = toFullUrl((r.product as any)?.imageUrl);
      return (
        <Space size={4}>
          {imgUrl && <span style={{ width: 24, height: 24, display: 'inline-block', background: `url(${imgUrl}) center/cover`, borderRadius: 2, cursor: 'pointer' }} onClick={() => setPreviewImage({ url: imgUrl, name: r.product?.name || '' })} />}
          <Typography.Link onClick={() => imgUrl && setPreviewImage({ url: imgUrl, name: r.product?.name || '' })}>
            {lv2 ? <><span style={{ color: '#888' }}>{lv2}</span> - </> : null}{r.product?.name}
          </Typography.Link>
        </Space>
      );
    } },
    { title: '规格', dataIndex: ['product', 'spec'], key: 'spec' },
    { title: '仓库', dataIndex: ['warehouse', 'name'], key: 'warehouse' },
    {
      title: '库存数量', key: 'quantity', sorter: (a: { totalQty: number }, b: { totalQty: number }) => a.totalQty - b.totalQty,
      render: (_: unknown, r: { totalQty: number; locationCount: number; perWarehouseSafetyStock?: number }) => (
        <Space>
          <span style={{ fontWeight: 'bold' }}>{r.totalQty}</span>
          {r.locationCount > 1 && <Tag>{r.locationCount} 个库位</Tag>}
          {r.perWarehouseSafetyStock != null && r.totalQty <= r.perWarehouseSafetyStock && <Tag color="red">低库存</Tag>}
        </Space>
      ),
    },
    { title: '安全库存', key: 'safetyStock', width: 120,
      render: (_: unknown, r: { productId: number; warehouseId: number; perWarehouseSafetyStock?: number }) => (
        <InlineSafetyStock
          productId={r.productId}
          warehouseId={r.warehouseId}
          currentValue={r.perWarehouseSafetyStock}
        />
      ),
    },
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
    </Card>
  );
}
