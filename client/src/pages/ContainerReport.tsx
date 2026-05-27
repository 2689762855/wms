import { useParams } from 'react-router-dom';
import { Table, Typography, Card, Descriptions } from 'antd';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import dayjs from 'dayjs';

export default function ContainerReport() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['container-report', id],
    queryFn: () => apiClient.get(`/containers/${id}/report`).then((r) => r.data),
  });

  if (isLoading) return <Card loading />;
  if (!data) return null;

  const columns = [
    { title: 'SKU', dataIndex: 'sku', width: 100 },
    { title: '商品名称', dataIndex: 'name' },
    { title: '规格', dataIndex: 'spec' },
    { title: '计划数量', dataIndex: 'plannedQty' },
    { title: '实际装柜', dataIndex: 'actualQty' },
    { title: '甩柜', dataIndex: 'returnedQty' },
    { title: '单位', dataIndex: 'unit', width: 60 },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <Typography.Title level={3}>装柜报表</Typography.Title>

      <Descriptions bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="柜号">{data.containerNo}</Descriptions.Item>
        <Descriptions.Item label="到柜时间">{data.toYardTime ? dayjs(data.toYardTime).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
        <Descriptions.Item label="封柜时间">{data.sealTime ? dayjs(data.sealTime).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
        <Descriptions.Item label="状态">{data.status === 'sealed' ? '已封柜' : data.status}</Descriptions.Item>
      </Descriptions>

      <Table rowKey="sku" columns={columns} dataSource={data.summary || []} pagination={false} size="small"
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3}><Typography.Text strong>合计</Typography.Text></Table.Summary.Cell>
            <Table.Summary.Cell index={1}><Typography.Text strong>{data.totals?.totalPlanned}</Typography.Text></Table.Summary.Cell>
            <Table.Summary.Cell index={2}><Typography.Text strong>{data.totals?.totalActual}</Typography.Text></Table.Summary.Cell>
            <Table.Summary.Cell index={3}><Typography.Text strong>{data.totals?.totalReturned}</Typography.Text></Table.Summary.Cell>
            <Table.Summary.Cell index={4} />
          </Table.Summary.Row>
        )}
      />

      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 24 }}>
        打印日期：{dayjs().format('YYYY-MM-DD HH:mm')}
      </Typography.Text>
    </div>
  );
}
