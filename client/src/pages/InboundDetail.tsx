import { useParams, useNavigate } from 'react-router-dom';
import { Card, Typography, Descriptions, Table, Tag, Button, Space, message, Popconfirm } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import { getCategoryPath } from '../utils/categoryTree';
import { useAuth } from '../stores/AuthContext';
import dayjs from 'dayjs';

export default function InboundDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: order, isLoading } = useQuery({
    queryKey: ['inbound', id],
    queryFn: () => apiClient.get(`/inbound/${id}`).then(res => res.data),
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiClient.put(`/inbound/${id}/confirm`),
    onSuccess: () => {
      message.success('入库已确认，库存已更新');
      queryClient.invalidateQueries({ queryKey: ['inbound'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-all'] });
      queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
      queryClient.invalidateQueries({ queryKey: ['reports-in-out'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err: any) => message.error(err.response?.data?.error || '确认失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/inbound/${id}`),
    onSuccess: () => {
      message.success('已删除');
      queryClient.invalidateQueries({ queryKey: ['inbound'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-all'] });
      queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
      navigate('/inbound');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '删除失败'),
  });

  const itemColumns = [
    { title: '一级分类', key: 'rootCat', width: 100, render: (_: unknown, r: any) => { const p = getCategoryPath(r.product?.category || null); return p === '-' ? '-' : p.split(' - ')[0]; } },
    { title: 'SKU', dataIndex: ['product', 'sku'], key: 'sku', width: 140 },
    { title: '商品名称', dataIndex: ['product', 'name'], key: 'name' },
    { title: '规格', dataIndex: ['product', 'spec'], key: 'spec', width: 80, render: (v: string) => v || '-' },
    { title: '单位', dataIndex: ['product', 'unit'], key: 'unit', width: 60, render: (v: string) => v || '-' },
    { title: '入库库位', key: 'location', width: 120, render: (_: unknown, r: any) => r.location?.name || (order as any)?.location?.name || '-' },
    { title: '保质期至', key: 'expiryDate', width: 110, render: (_: unknown, r: any) => r.expiryDate ? dayjs(r.expiryDate).format('YYYY-MM-DD') : '-' },
    { title: '批次号', dataIndex: 'batchNo', key: 'batchNo', width: 140, render: (v: string | null) => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: '图片', dataIndex: 'images', key: 'images', width: 100,
      render: (v: string | null) => {
        if (!v) return '-';
        try {
          const imgs = JSON.parse(v) as string[];
          return <Space size={4}>{imgs.map((url, i) => <img key={i} src={url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }} onClick={() => window.open(url)} />)}</Space>;
        } catch { return '-'; }
      }
    },
    { title: 'SN码', dataIndex: 'serialNumbers', key: 'serialNumbers', width: 180,
      render: (v: string | null) => {
        if (!v) return '-';
        try {
          const sns = JSON.parse(v) as string[];
          return <Space wrap size={[2, 2]}>{sns.map((sn, i) => <Tag key={i} color="geekblue">{sn}</Tag>)}</Space>;
        } catch { return '-'; }
      }
    },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 60 },
    ...(user?.operatorType !== 'warehouse' ? [
      { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 80, render: (v: number) => v ? `¥${v.toFixed(2)}` : '-' },
      { title: '小计', key: 'total', width: 80, render: (_: unknown, r: { quantity: number; unitPrice?: number }) => r.unitPrice ? `¥${(r.quantity * r.unitPrice).toFixed(2)}` : '-' },
    ] : []),
  ];

  if (isLoading) return <Card loading />;

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>入库单详情</Typography.Title>}
      extra={
        <Space>
          {order?.status === 'draft' && (
            <>
              <Button type="primary" onClick={() => confirmMutation.mutate()} loading={confirmMutation.isPending}>确认入库</Button>
              <Button onClick={() => navigate(`/inbound/new?id=${id}`)}>编辑</Button>
              <Popconfirm title="确认删除该入库单？" onConfirm={() => deleteMutation.mutate()}>
                <Button danger loading={deleteMutation.isPending}>删除</Button>
              </Popconfirm>
            </>
          )}
          <Button onClick={() => navigate('/inbound')}>返回</Button>
        </Space>
      }
    >
      <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small" style={{ marginBottom: 24 }}>
        <Descriptions.Item label="单号">{order?.orderNo}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag color={order?.status === 'confirmed' ? 'green' : 'default'}>{order?.status === 'confirmed' ? '已确认' : '草稿'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="仓库">{order?.warehouse?.name}</Descriptions.Item>
        <Descriptions.Item label="供应商">{order?.supplier || '-'}</Descriptions.Item>
        {import.meta.env.VITE_STANDALONE !== 'true' && <Descriptions.Item label="关联合同">{(() => { const items = order?.items || []; const contracts = [...new Set(items.filter((i: any) => i.contract).map((i: any) => `${i.contract.contractNo}|${i.contract.id}`))]; return contracts.length > 0 ? contracts.map((s: string) => { const [no, cid] = s.split('|'); return <Tag key={cid} color="blue"><a onClick={() => navigate(`/contracts/${cid}`)} style={{cursor:'pointer'}}>{no}</a></Tag>; }) : '-'; })()}</Descriptions.Item>}
        <Descriptions.Item label="备注">{order?.note || '-'}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{dayjs(order?.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5}>商品明细</Typography.Title>
      <Table rowKey="id" columns={itemColumns} dataSource={order?.items} pagination={false} scroll={{ x: 500 }} />
    </Card>
  );
}
