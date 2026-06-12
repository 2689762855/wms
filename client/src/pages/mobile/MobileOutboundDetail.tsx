import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Tag, Typography, Descriptions, Table, Spin, Result } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import type { OutboundOrder } from '../../types';

export default function MobileOutboundDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['outbound', id],
    queryFn: () => apiClient.get(`/outbound/${id}`).then(r => r.data as OutboundOrder),
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (isError || !order) return <Result status="error" title="加载失败" extra={<Button onClick={() => navigate(-1)}>返回</Button>} />;

  const itemColumns = [
    { title: '商品', dataIndex: ['product', 'name'], key: 'name', width: 140 },
    { title: 'SKU', dataIndex: ['product', 'sku'], key: 'sku', width: 100 },
    { title: '库位', key: 'loc', width: 80, render: (_: unknown, r: any) => r.location?.name || order.location?.name || '-' },
    { title: '数量', dataIndex: 'quantity', key: 'qty', width: 50, align: 'center' as const },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/m/outbound')} />
        <Typography.Title level={5} style={{ margin: 0 }}>出库详情</Typography.Title>
        <Tag color={order.status === 'confirmed' ? 'green' : 'orange'} style={{ marginLeft: 'auto' }}>
          {order.status === 'confirmed' ? '已确认' : '草稿'}
        </Tag>
      </div>

      <Card size="small" style={{ borderRadius: 8, marginBottom: 12 }}>
        <Descriptions column={1} size="small" colon={false}>
          <Descriptions.Item label="单号">{order.orderNo}</Descriptions.Item>
          <Descriptions.Item label="仓库">{order.warehouse?.name}</Descriptions.Item>
          <Descriptions.Item label="领用人">{order.receiver || '-'}</Descriptions.Item>
          {import.meta.env.VITE_STANDALONE !== 'true' && <Descriptions.Item label="关联货柜">{order.container ? <Tag color="blue">{order.container.containerNo}</Tag> : '-'}</Descriptions.Item>}
          {order.location && <Descriptions.Item label="库位">{order.location.name}</Descriptions.Item>}
          <Descriptions.Item label="时间">{new Date(order.createdAt).toLocaleString('zh-CN')}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={`商品明细 (${order.items?.length || 0} 项)`} size="small" style={{ borderRadius: 8 }}>
        <Table rowKey="id" columns={itemColumns} dataSource={order.items}
          pagination={false} size="small" scroll={{ x: 350 }} />
      </Card>
    </div>
  );
}
