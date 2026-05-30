import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, InputNumber, Space, Typography, Tag, message, Modal, Descriptions, Select } from 'antd';
import { ArrowLeftOutlined, LockOutlined, PrinterOutlined, InboxOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import dayjs from 'dayjs';

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '待装柜' },
  loading: { color: 'processing', label: '装柜中' },
  sealed: { color: 'success', label: '已封柜' },
};

export default function ContainerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actualQs, setActualQs] = useState<Record<string, number>>({});
  const [returnLocations, setReturnLocations] = useState<Record<string, number | null>>({});

  const { data: container, isLoading } = useQuery({
    queryKey: ['container', id],
    queryFn: () => apiClient.get(`/containers/${id}`).then((r) => r.data),
  });

  // 获取仓库库位列表（用于甩柜归还选择）
  // 关联合同（直接从货柜的 contractId 获取 + 出库单兜底）
  const linkedContractId = container?.contractId;
  const { data: linkedContract } = useQuery({
    queryKey: ['container-linked-contract', linkedContractId],
    queryFn: () => apiClient.get(`/contracts/${linkedContractId}`).then(r => r.data),
    enabled: !!linkedContractId,
  });

  const firstItem = container?.items?.[0];
  const { data: warehouseLocations } = useQuery({
    queryKey: ['container-return-locations', firstItem?.outboundId],
    queryFn: async () => {
      if (!firstItem?.outboundId) return [];
      const outbound = await apiClient.get(`/outbound/${firstItem.outboundId}`).then(r => r.data);
      if (!outbound?.warehouseId) return [];
      return apiClient.get('/locations', { params: { warehouseId: outbound.warehouseId } }).then(r => r.data);
    },
    enabled: !!firstItem?.outboundId,
  });

  // 合并同商品
  const mergedItems = useMemo(() => {
    if (!container?.items) return [];
    const map = new Map<number, { product: any; plannedQty: number; rawActualQty: number; locationId?: number | null }>();
    for (const item of container.items) {
      const pid = item.productId;
      const existing = map.get(pid);
      if (existing) {
        existing.plannedQty += item.plannedQty;
        existing.rawActualQty += (item.actualQty ?? 0);
      } else {
        map.set(pid, {
          product: item.product,
          plannedQty: item.plannedQty,
          rawActualQty: (item.actualQty ?? 0),
          locationId: item.locationId,
        });
      }
    }
    return Array.from(map.entries()).map(([pid, data]) => {
      // actualQs 覆盖表示用户手调后的总实装数，否则用原始合计
      const totalActual = actualQs[`${pid}`] != null ? actualQs[`${pid}`] : data.rawActualQty;
      return {
        productId: pid,
        product: data.product,
        plannedQty: data.plannedQty,
        actualQty: totalActual,
        returnedQty: Math.max(0, data.plannedQty - totalActual),
        locationId: data.locationId,
      };
    });
  }, [container?.items, actualQs]);

  const loadMutation = useMutation({
    mutationFn: (items: any[]) => apiClient.put(`/containers/${id}/load`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['container', id] });
      message.success('装柜数据已保存');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '保存失败'),
  });

  const sealMutation = useMutation({
    mutationFn: async (vars: { items: any[]; returnLocs: Record<string, number> }) => {
      await apiClient.put(`/containers/${id}/load`, { items: vars.items });
      await apiClient.put(`/containers/${id}/seal`, { returnLocations: vars.returnLocs });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['container', id] });
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      message.success('已封柜');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '封柜失败'),
  });

  const adjustMutation = useMutation({
    mutationFn: (items: { productId: number; actualQty: number }[]) =>
      apiClient.put(`/containers/${id}/adjust`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['container', id] });
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      setActualQs({});
      message.success('装柜数量已更新，库存已同步调整');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '调整失败'),
  });

  const handleLoad = () => {
    if (!container) return;
    const items = (container.items || []).map((i: any) => {
      const merged = mergedItems.find(m => m.productId === i.productId);
      if (!merged) return { outboundId: i.outboundId, productId: i.productId, plannedQty: i.plannedQty, actualQty: i.actualQty ?? 0, locationId: i.locationId };
      // 按计划数比例分配合并后的实装数到各条目
      const ratio = merged.plannedQty > 0 ? i.plannedQty / merged.plannedQty : 0;
      return {
        outboundId: i.outboundId,
        productId: i.productId,
        plannedQty: i.plannedQty,
        actualQty: Math.round(merged.actualQty * ratio),
        locationId: i.locationId,
      };
    });
    loadMutation.mutate(items);
  };

  const handleSeal = () => {
    if (!container) return;
    // 构建当前实装数（从合并视图展开到原始条目）
    const items = (container.items || []).map((i: any) => {
      const merged = mergedItems.find(m => m.productId === i.productId);
      if (!merged) return { outboundId: i.outboundId, productId: i.productId, plannedQty: i.plannedQty, actualQty: i.actualQty ?? 0, locationId: i.locationId };
      const ratio = merged.plannedQty > 0 ? i.plannedQty / merged.plannedQty : 0;
      return { outboundId: i.outboundId, productId: i.productId, plannedQty: i.plannedQty, actualQty: Math.round(merged.actualQty * ratio), locationId: i.locationId };
    });
    const returnLocs: Record<string, number> = {};
    for (const [k, v] of Object.entries(returnLocations)) {
      if (v != null) returnLocs[k] = v;
    }
    const hasReturn = mergedItems.some((m: any) => m.returnedQty > 0);
    Modal.confirm({
      title: '确认封柜？',
      content: hasReturn ? '有甩柜商品，请确认归还库位已选择。封柜后不可修改。' : '封柜后将按实装数记录流水。封柜后不可修改。',
      onOk: () => sealMutation.mutate({ items, returnLocs }),
    });
  };

  const printReport = () => { window.open(`/containers/${id}/report`, '_blank'); };

  const locationOptions = (warehouseLocations || []).map((l: any) => ({ label: l.name, value: l.id }));

  const columns = [
    { title: 'SKU', dataIndex: ['product', 'sku'], width: 100 },
    { title: '商品', dataIndex: ['product', 'name'] },
    { title: '规格', dataIndex: ['product', 'spec'] },
    { title: '计划装柜', dataIndex: 'plannedQty', width: 80 },
    {
      title: '实装数量', dataIndex: 'actualQty', width: 120,
      render: (v: number, r: any) => {
        const key = `${r.productId}`;
        const val = actualQs[key] != null ? actualQs[key] : (v ?? 0);
        return (
          <InputNumber
            min={0}
            value={val}
            onChange={(n) => setActualQs((prev) => ({ ...prev, [key]: n || 0 }))}
            style={{ width: 80 }}
          />
        );
      },
    },
    {
      title: '甩柜', key: 'returned', width: 60,
      render: (_: any, r: any) => {
        const returned = r.returnedQty;
        return returned > 0 ? <Tag color="orange">{returned}</Tag> : <span>-</span>;
      },
    },
    {
      title: '甩柜归还库位', key: 'returnLoc', width: 160,
      render: (_: any, r: any) => {
        if (container?.status === 'sealed') {
          // 已封柜：显示实际归还库位
          const returnLoc = container.items?.find((i: any) => i.productId === r.productId && i.returnLocation)?.returnLocation;
          return returnLoc ? <Tag>{returnLoc.name}</Tag> : <span>-</span>;
        }
        if (r.returnedQty <= 0) return <span>-</span>;
        return (
          <Select
            allowClear
            placeholder="选择归还库位"
            value={returnLocations[`${r.productId}`] ?? undefined}
            onChange={(v) => setReturnLocations(prev => ({ ...prev, [`${r.productId}`]: v ?? null }))}
            style={{ width: 140 }}
            size="small"
            options={locationOptions}
          />
        );
      },
    },
    { title: '单位', dataIndex: ['product', 'unit'], width: 50 },
  ];

  if (isLoading) return <Card loading />;
  if (!container) return null;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/containers')}>返回</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>货柜 {container.containerNo}</Typography.Title>
        <Tag color={statusMap[container.status]?.color}>{statusMap[container.status]?.label}</Tag>
      </Space>

      <Descriptions bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="客户">{container.businessCustomer?.realName || container.customer?.realName || container.customer?.username}</Descriptions.Item>
        <Descriptions.Item label="关联合同">{linkedContract ? <Tag color="blue"><a onClick={() => navigate(`/contracts/${linkedContract.id}`)} style={{cursor:'pointer'}}>{linkedContract.contractNo}</a></Tag> : '-'}</Descriptions.Item>
        <Descriptions.Item label="到柜时间">{container.toYardTime ? dayjs(container.toYardTime).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
        <Descriptions.Item label="封柜时间">{container.sealTime ? dayjs(container.sealTime).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
        <Descriptions.Item label="备注">{container.note || '-'}</Descriptions.Item>
      </Descriptions>

      {container.status !== 'sealed' && (
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<InboxOutlined />} onClick={handleLoad} loading={loadMutation.isPending}>保存装柜数据</Button>
          {container.status === 'loading' && (
            <Button type="primary" danger icon={<LockOutlined />} onClick={handleSeal} loading={sealMutation.isPending}>封柜</Button>
          )}
        </Space>
      )}

      {container.status === 'sealed' && (
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<PrinterOutlined />} onClick={printReport}>打印装柜报表</Button>
          <Button
            type="primary"
            onClick={() => {
              const adjItems = mergedItems
                .filter((m: any) => {
                  const key = `${m.productId}`;
                  return actualQs[key] != null && actualQs[key] !== m.actualQty;
                })
                .map((m: any) => ({ productId: m.productId, actualQty: actualQs[`${m.productId}`] }));
              if (adjItems.length === 0) { message.info('无变更'); return; }
              Modal.confirm({
                title: '确认调整装柜数量？',
                content: `将修改 ${adjItems.length} 个商品的实装数，系统会自动调整库存。`,
                onOk: () => adjustMutation.mutate(adjItems),
              });
            }}
            loading={adjustMutation.isPending}
          >保存调整</Button>
        </Space>
      )}

      <Card title="装柜明细">
        <Table rowKey="productId" columns={columns} dataSource={mergedItems} pagination={false} size="small"
          summary={() => {
            const totalPlanned = mergedItems.reduce((s: number, i: any) => s + i.plannedQty, 0);
            const totalActual = mergedItems.reduce((s: number, i: any) => s + i.actualQty, 0);
            const totalReturned = Math.max(0, totalPlanned - totalActual);
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}><Typography.Text strong>合计</Typography.Text></Table.Summary.Cell>
                <Table.Summary.Cell index={1}><Typography.Text strong>{totalPlanned}</Typography.Text></Table.Summary.Cell>
                <Table.Summary.Cell index={2}><Typography.Text strong>{totalActual}</Typography.Text></Table.Summary.Cell>
                <Table.Summary.Cell index={3}>{totalReturned > 0 && <Tag color="orange">{totalReturned}</Tag>}</Table.Summary.Cell>
                <Table.Summary.Cell index={4} />
                <Table.Summary.Cell index={5} />
              </Table.Summary.Row>
            );
          }}
        />
      </Card>    </div>
  );
}
