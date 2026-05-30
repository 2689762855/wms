import { useState } from 'react';
import { Table, Card, Typography, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import dayjs from 'dayjs';

export default function InventoryLogs() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['logs', page],
    queryFn: () => apiClient.get('/inventory/logs', { params: { page, pageSize: 50 } }).then(r => r.data),
  });

  const typeMap: Record<string, { color: string; label: string }> = {
    inbound: { color: 'green', label: '入库' },
    outbound: { color: 'red', label: '出库' },
    transfer_in: { color: 'blue', label: '调拨入库' },
    transfer_out: { color: 'orange', label: '调拨出库' },
    check_adjust: { color: 'purple', label: '盘点调整' },
    container_return: { color: 'orange', label: '排柜退回' },
    container_adjust: { color: 'purple', label: '排柜调整' },
  };

  const columns = [
    { title: '商品', dataIndex: ['product', 'name'], key: 'product' },
    { title: '类型', dataIndex: 'type', key: 'type', render: (t: string) => {
      const m = typeMap[t] || { color: 'default', label: t };
      return <Tag color={m.color}>{m.label}</Tag>;
    }},
    { title: '变动数量', dataIndex: 'changeQty', key: 'changeQty', render: (v: number) => <span style={{ color: v > 0 ? 'green' : 'red' }}>{v > 0 ? `+${v}` : v}</span> },
    { title: '变动前', dataIndex: 'beforeQty', key: 'beforeQty' },
    { title: '变动后', dataIndex: 'afterQty', key: 'afterQty' },
    { title: '排柜编号', dataIndex: 'refNo', key: 'refNo', render: (v: string) => v || '-' },
    { title: '时间', dataIndex: 'createdAt', key: 'createdAt', render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm:ss') },
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>库存流水</Typography.Title>}>
      <Table rowKey="id" columns={columns} dataSource={data?.data} loading={isLoading}
        pagination={{ current: page, total: data?.total, pageSize: 50, onChange: setPage, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 800 }}
        size="small"
      />
    </Card>
  );
}
