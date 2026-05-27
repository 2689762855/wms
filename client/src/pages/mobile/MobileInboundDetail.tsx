import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Tag, Typography, Descriptions, Table, Spin, Result } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import type { InboundOrder } from '../../types';

export default function MobileInboundDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['inbound', id],
    queryFn: () => apiClient.get(`/inbound/${id}`).then(r => r.data as InboundOrder),
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (isError || !order) return <Result status="error" title="加载失败" extra={<Button onClick={() => navigate(-1)}>返回</Button>} />;

  const itemColumns = [
    { title: '商品', dataIndex: ['product', 'name'], key: 'name', width: 120 },
    { title: 'SKU', dataIndex: ['product', 'sku'], key: 'sku', width: 100 },
    { title: '数量', dataIndex: 'quantity', key: 'qty', width: 50, align: 'center' as const },
    { title: '单价', dataIndex: 'unitPrice', key: 'price', width: 60, align: 'center' as const,
      render: (v: number | undefined) => v != null ? `¥${v.toFixed(2)}` : '-' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/m/inbound')} />
        <Typography.Title level={5} style={{ margin: 0 }}>入库详情</Typography.Title>
        <Tag color={order.status === 'confirmed' ? 'green' : 'orange'} style={{ marginLeft: 'auto' }}>
          {order.status === 'confirmed' ? '已确认' : '草稿'}
        </Tag>
      </div>

      <Card size="small" style={{ borderRadius: 8, marginBottom: 12 }}>
        <Descriptions column={1} size="small" colon={false}>
          <Descriptions.Item label="单号">{order.orderNo}</Descriptions.Item>
          <Descriptions.Item label="仓库">{order.warehouse?.name}</Descriptions.Item>
          <Descriptions.Item label="供应商">{order.supplier || '-'}</Descriptions.Item>
          <Descriptions.Item label="关联合同">
            {(() => {
              const contracts = [...new Set((order.items || []).filter((i: any) => i.contract).map((i: any) => `${i.contract.contractNo}|${i.contract.id}`))];
              return contracts.length > 0 ? contracts.map((s: string) => {
                const [no, cid] = s.split('|');
                return <Tag key={cid} color="blue">{no}</Tag>;
              }) : '-';
            })()}
          </Descriptions.Item>
          {order.location && <Descriptions.Item label="库位">{order.location.name}</Descriptions.Item>}
          <Descriptions.Item label="时间">{new Date(order.createdAt).toLocaleString('zh-CN')}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={`商品明细 (${order.items?.length || 0} 项)`} size="small" style={{ borderRadius: 8 }}>
        <Table rowKey="id" columns={itemColumns} dataSource={order.items}
          pagination={false} size="small" scroll={{ x: 400 }} />
      </Card>
    </div>
  );
}
