import { Card, Typography, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';

export default function ReportsTurnover() {
  const { data, isLoading } = useQuery({
    queryKey: ['stock-summary'],
    queryFn: () => apiClient.get('/reports/stock-summary').then(r => r.data),
  });

  const columns = [
    { title: '仓库', dataIndex: 'warehouse', key: 'warehouse' },
    { title: 'SKU 数量', dataIndex: 'totalItems', key: 'totalItems' },
    { title: '库存总数量', dataIndex: 'totalQuantity', key: 'totalQuantity' },
    { title: '库存总金额', dataIndex: 'totalValue', key: 'totalValue', render: (v: number) => `¥${v.toFixed(2)}` },
  ];

  return (
    <div>
      <Typography.Title level={4}>库存周转概览</Typography.Title>
      <Table rowKey="warehouse" columns={columns} dataSource={data} loading={isLoading} pagination={false}
        scroll={{ x: 500 }}
        summary={() => {
          const totalQty = data?.reduce((s: number, r: { totalQuantity: number }) => s + r.totalQuantity, 0) || 0;
          const totalVal = data?.reduce((s: number, r: { totalValue: number }) => s + r.totalValue, 0) || 0;
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><strong>合计</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1}>{data?.length || 0} 个仓库</Table.Summary.Cell>
              <Table.Summary.Cell index={2}><strong>{totalQty}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={3}><strong>¥{totalVal.toFixed(2)}</strong></Table.Summary.Cell>
            </Table.Summary.Row>
          );
        }}
      />
    </div>
  );
}
