import { useParams, useNavigate } from 'react-router-dom';
import { Card, Typography, Descriptions, Table, Tag, Button, Space, message, Popconfirm } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import { getCategoryPath } from '../utils/categoryTree';
import dayjs from 'dayjs';

export default function OutboundDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ['outbound', id],
    queryFn: () => apiClient.get(`/outbound/${id}`).then(res => res.data),
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiClient.put(`/outbound/${id}/confirm`),
    onSuccess: () => {
      message.success('出库已确认，库存已更新');
      queryClient.invalidateQueries({ queryKey: ['outbound', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: any) => message.error(err.response?.data?.error || '确认失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/outbound/${id}`),
    onSuccess: () => {
      message.success('已删除');
      queryClient.invalidateQueries({ queryKey: ['outbound'] });
      navigate('/outbound');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '删除失败'),
  });

  const itemColumns = [
    { title: '一级分类', key: 'rootCat', width: 100, render: (_: unknown, r: any) => { const p = getCategoryPath(r.product?.category || null); return p === '-' ? '-' : p.split(' - ')[0]; } },
    { title: 'SKU', dataIndex: ['product', 'sku'], key: 'sku', width: 140 },
    { title: '商品名称', dataIndex: ['product', 'name'], key: 'name' },
    { title: '出库库位', key: 'location', width: 120, render: (_: unknown, r: any) => r.location?.name || '-' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 60 },
  ];

  if (isLoading) return <Card loading />;

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>出库单详情</Typography.Title>}
      extra={
        <Space>
          {order?.status === 'draft' && (
            <>
              <Button type="primary" onClick={() => confirmMutation.mutate()} loading={confirmMutation.isPending}>确认出库</Button>
              <Popconfirm title="确认删除该出库单？" onConfirm={() => deleteMutation.mutate()}>
                <Button danger loading={deleteMutation.isPending}>删除</Button>
              </Popconfirm>
            </>
          )}
          <Button onClick={() => navigate('/outbound')}>返回</Button>
        </Space>
      }
    >
      <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small" style={{ marginBottom: 24 }}>
        <Descriptions.Item label="单号">{order?.orderNo}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag color={order?.status === 'confirmed' ? 'green' : 'default'}>{order?.status === 'confirmed' ? '已确认' : '草稿'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="仓库">{order?.warehouse?.name}</Descriptions.Item>
        <Descriptions.Item label="领用人">{order?.receiver || '-'}</Descriptions.Item>
        <Descriptions.Item label="关联货柜">{order?.container ? <Tag color={order.container.status === 'sealed' ? 'green' : 'blue'}><a onClick={() => navigate(`/containers/${order.container.id}`)} style={{cursor:'pointer'}}>{order.container.containerNo}</a></Tag> : '-'}</Descriptions.Item>
        <Descriptions.Item label="备注">{order?.note || '-'}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{dayjs(order?.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5}>商品明细</Typography.Title>
      <Table rowKey="id" columns={itemColumns} dataSource={order?.items} pagination={false} scroll={{ x: 400 }} />
    </Card>
  );
}
