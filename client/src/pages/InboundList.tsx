import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Space, Card, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { InboundOrder } from '../types';
import dayjs from 'dayjs';

export default function InboundList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['inbound', page],
    queryFn: () => apiClient.get('/inbound', { params: { page, pageSize: 20 } }).then(res => res.data),
  });

  const columns = [
    { title: '单号', dataIndex: 'orderNo', key: 'orderNo', width: 160 },
    { title: '仓库', dataIndex: ['warehouse', 'name'], key: 'warehouse' },
    { title: '供应商', dataIndex: 'supplier', key: 'supplier' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (s: string) => <Tag color={s === 'confirmed' ? 'green' : 'default'}>{s === 'confirmed' ? '已确认' : '草稿'}</Tag>,
    },
    { title: '备注', dataIndex: 'note', key: 'note', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: unknown, r: InboundOrder) => <Button size="small" onClick={() => navigate(`/inbound/${r.id}`)}>详情</Button>,
    },
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>入库管理</Typography.Title>} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/inbound/new')}>新建入库单</Button>}>
      <Table rowKey="id" columns={columns} dataSource={data?.data} loading={isLoading}
        pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 800 }}
      />
    </Card>
  );
}
