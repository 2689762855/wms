import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Space, Card, Typography, DatePicker, Input } from 'antd';
import CustomerManager from '../components/CustomerManager';
import { PlusOutlined, SearchOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { OutboundOrder } from '../types';
import dayjs from 'dayjs';

export default function OutboundList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [receiver, setReceiver] = useState('');

  const monthParam = dateRange?.[0]
    ? { startDate: dateRange[0].startOf('month').toISOString(), endDate: dateRange[0].endOf('month').toISOString() }
    : {};

  const exportCsv = () => {
    const params = new URLSearchParams({ ...monthParam, ...(receiver && { receiver }) } as Record<string,string>);
    window.open(`/api/outbound/export?${params}`, '_blank');
  };

  const { data, isLoading } = useQuery({
    queryKey: ['outbound', page, dateRange, receiver],
    queryFn: () => apiClient.get('/outbound', {
      params: { page, pageSize: 20, ...monthParam, receiver: receiver || undefined },
    }).then(res => res.data),
  });

  const columns = [
    { title: '单号', dataIndex: 'orderNo', key: 'orderNo', width: 160 },
    { title: '仓库', dataIndex: ['warehouse', 'name'], key: 'warehouse' },
    { title: '顾客', dataIndex: 'receiver', key: 'receiver', width: 80, ellipsis: true },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (s: string) => <Tag color={s === 'confirmed' ? 'green' : 'default'}>{s === 'confirmed' ? '已确认' : '草稿'}</Tag> },
    { title: '商品摘要', key: 'summary', width: 200, ellipsis: true,
      render: (_: unknown, r: any) => {
        const items = r.items || [];
        if (!items.length) return '-';
        const first2 = items.slice(0, 2).map((i: any) => `${i.product?.name || '?'} x${i.quantity}`);
        return items.length > 2 ? `${first2.join('、')} 等${items.length}项` : first2.join('、');
      },
    },
    { title: '数量', key: 'totalQty', width: 60, align: 'center' as const,
      render: (_: unknown, r: any) => (r.items || []).reduce((s: number, i: any) => s + i.quantity, 0) || '-',
    },
    { title: '金额', key: 'totalAmount', width: 100,
      render: (_: unknown, r: any) => {
        const total = (r.items || []).reduce((s: number, i: any) => s + (i.quantity * (i.unitPrice || 0)), 0);
        return total ? `¥${total.toFixed(2)}` : '-';
      },
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm') },
    { title: '操作', key: 'actions', render: (_: unknown, r: OutboundOrder) => <Button size="small" onClick={() => navigate(`/outbound/${r.id}`)}>详情</Button> },
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>出库管理</Typography.Title>} extra={<Space><Input prefix={<SearchOutlined />} placeholder="顾客" allowClear value={receiver} onChange={e => { setReceiver(e.target.value); setPage(1); }} style={{ width: 130 }} /><DatePicker picker="month" value={dateRange?.[0] as any} onChange={(v) => setDateRange(v ? [v, v] : null)} allowClear format="M月" placeholder="选择月份" /><CustomerManager /><Button icon={<DownloadOutlined />} onClick={exportCsv}>导出</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/outbound/new')}>新建出库单</Button></Space>}>
      <Table rowKey="id" columns={columns} dataSource={data?.data} loading={isLoading}
        pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 700 }}
      />
    </Card>
  );
}
