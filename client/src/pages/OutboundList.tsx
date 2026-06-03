import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Space, Card, Typography, DatePicker } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { OutboundOrder } from '../types';
import dayjs from 'dayjs';

export default function OutboundList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const monthParam = dateRange?.[0]
    ? { startDate: dateRange[0].startOf('month').toISOString(), endDate: dateRange[0].endOf('month').toISOString() }
    : {};

  const { data, isLoading } = useQuery({
    queryKey: ['outbound', page, dateRange],
    queryFn: () => apiClient.get('/outbound', {
      params: { page, pageSize: 20, ...monthParam },
    }).then(res => res.data),
  });

  const columns = [
    { title: '单号', dataIndex: 'orderNo', key: 'orderNo', width: 160 },
    { title: '仓库', dataIndex: ['warehouse', 'name'], key: 'warehouse' },
    { title: '领用人', dataIndex: 'receiver', key: 'receiver' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (s: string) => <Tag color={s === 'confirmed' ? 'green' : 'default'}>{s === 'confirmed' ? '已确认' : '草稿'}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm') },
    { title: '操作', key: 'actions', render: (_: unknown, r: OutboundOrder) => <Button size="small" onClick={() => navigate(`/outbound/${r.id}`)}>详情</Button> },
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>出库管理</Typography.Title>} extra={<Space><DatePicker picker="month" value={dateRange?.[0] as any} onChange={(v) => setDateRange(v ? [v, v] : null)} allowClear format="M月" placeholder="选择月份" /><Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/outbound/new')}>新建出库单</Button></Space>}>
      <Table rowKey="id" columns={columns} dataSource={data?.data} loading={isLoading}
        pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 700 }}
      />
    </Card>
  );
}
