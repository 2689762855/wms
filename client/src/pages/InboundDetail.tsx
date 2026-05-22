import { useParams, useNavigate } from 'react-router-dom';
import { Card, Typography, Descriptions, Table, Tag, Button, Space, message, Popconfirm } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import dayjs from 'dayjs';

export default function InboundDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ['inbound', id],
    queryFn: () => apiClient.get(`/inbound/${id}`).then(res => res.data),
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiClient.put(`/inbound/${id}/confirm`),
    onSuccess: () => {
      message.success('入库已确认，库存已更新');
      queryClient.invalidateQueries({ queryKey: ['inbound', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: any) => message.error(err.response?.data?.error || '确认失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/inbound/${id}`),
    onSuccess: () => {
      message.success('已删除');
      queryClient.invalidateQueries({ queryKey: ['inbound'] });
      navigate('/inbound');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '删除失败'),
  });

  const itemColumns = [
    { title: '一级分类', key: 'rootCat', width: 100, render: (_: unknown, r: any) => r.product?.category?.parent?.parent?.name || '-' },
    { title: 'SKU', dataIndex: ['product', 'sku'], key: 'sku', width: 140 },
    { title: '商品名称', dataIndex: ['product', 'name'], key: 'name' },
    { title: '入库库位', key: 'location', width: 120, render: (_: unknown, r: any) => r.location?.name || '-' },
    { title: '保质期至', key: 'expiryDate', width: 110, render: (_: unknown, r: any) => r.expiryDate ? dayjs(r.expiryDate).format('YYYY-MM-DD') : '-' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 60 },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 80, render: (v: number) => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '小计', key: 'total', width: 80, render: (_: unknown, r: { quantity: number; unitPrice?: number }) => r.unitPrice ? `¥${(r.quantity * r.unitPrice).toFixed(2)}` : '-' },
  ];

  if (isLoading) return <Card loading />;

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>入库单详情</Typography.Title>}
      extra={
        <Space>
          {order?.status === 'draft' && (
            <>
              <Button type="primary" onClick={() => confirmMutation.mutate()} loading={confirmMutation.isPending}>确认入库</Button>
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
        <Descriptions.Item label="备注">{order?.note || '-'}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{dayjs(order?.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5}>商品明细</Typography.Title>
      <Table rowKey="id" columns={itemColumns} dataSource={order?.items} pagination={false} scroll={{ x: 500 }} />
    </Card>
  );
}
