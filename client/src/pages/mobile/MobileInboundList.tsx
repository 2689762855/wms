import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Tag, Typography, Space, Spin } from 'antd';
import { PlusOutlined, CameraOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import type { InboundOrder } from '../../types';

export default function MobileInboundList() {
  const navigate = useNavigate();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['inbound'],
    queryFn: () => apiClient.get('/inbound', { params: { pageSize: 50 } }).then(r => r.data.data as InboundOrder[]),
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  return (
    <div>
      <Typography.Title level={5} style={{ margin: '0 0 12px' }}>入库记录</Typography.Title>

      {orders?.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无入库记录</div>
      )}

      <Space orientation="vertical" style={{ width: '100%' }} size={8}>
        {orders?.map(order => (
          <Card key={order.id} size="small" style={{ borderRadius: 8, cursor: 'pointer' }}
            onClick={() => navigate(`/m/inbound/${order.id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Typography.Text strong>{order.orderNo}</Typography.Text>
                <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                  {order.supplier || '未填写供应商'} · {order.items?.length || 0} 项
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(order.createdAt).toLocaleString('zh-CN')}
                </Typography.Text>
              </div>
              <Tag color={order.status === 'confirmed' ? 'green' : 'orange'}>
                {order.status === 'confirmed' ? '已确认' : '草稿'}
              </Tag>
            </div>
          </Card>
        ))}
      </Space>

      <div style={{ position: 'fixed', bottom: 80, right: 16, zIndex: 50 }}>
        <Button type="primary" shape="round" size="large" icon={<CameraOutlined />}
          onClick={() => navigate('/m/inbound/new')} style={{ height: 48, fontSize: 16 }}>
          扫码入库
        </Button>
      </div>
    </div>
  );
}
