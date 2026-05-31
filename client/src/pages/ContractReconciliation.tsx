import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Space, Typography, Tag, Descriptions, Spin, Collapse } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import dayjs from 'dayjs';

export default function ContractReconciliation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['contract-reconciliation', id],
    queryFn: () => apiClient.get(`/contracts/${id}/reconciliation`).then(r => r.data),
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (!data) return <div>加载失败</div>;

  const { contract, summary, totals, inboundItems, outboundItems, containerItems } = data;

  const summaryCols = [
    { title: 'SKU', dataIndex: 'sku', width: 140 },
    { title: '品名', dataIndex: 'name' },
    { title: '规格', dataIndex: 'spec', width: 100 },
    { title: '单位', dataIndex: 'unit', width: 50 },
    { title: '合同单价', dataIndex: 'unitPrice', width: 90,
      render: (v: number) => v ? `¥${v.toFixed(2)}` : <span style={{ color: '#ccc' }}>—</span>,
    },
    { title: '合同数量', dataIndex: 'plannedQty', width: 80,
      render: (v: number) => <Typography.Text strong>{v}</Typography.Text>,
    },
    { title: '已入库', dataIndex: 'receivedQty', width: 80,
      render: (v: number, r: any) => {
        if (v >= r.plannedQty) return <Tag color="green">{v}</Tag>;
        if (v > 0) return <Tag color="blue">{v}</Tag>;
        return <span style={{ color: '#ccc' }}>0</span>;
      },
    },
    { title: '已出库', dataIndex: 'shippedQty', width: 80,
      render: (v: number) => v > 0 ? <Typography.Text>{v}</Typography.Text> : <span style={{ color: '#ccc' }}>0</span>,
    },
    { title: '甩柜', dataIndex: 'returnedQty', width: 60,
      render: (v: number) => v > 0 ? <Tag color="orange">{v}</Tag> : <span style={{ color: '#ccc' }}>0</span>,
    },
    { title: '合同结余', dataIndex: 'stockBalance', width: 80,
      render: (v: number) => <Typography.Text strong>{v}</Typography.Text>,
    },
    { title: '出货金额', key: 'amount', width: 100,
      render: (_: any, r: any) => {
        const amt = (r.unitPrice || 0) * r.shippedQty;
        return amt > 0 ? <Typography.Text strong>¥{amt.toFixed(2)}</Typography.Text> : <span style={{ color: '#ccc' }}>—</span>;
      },
    },
  ];

  const inboundCols = [
    { title: '入库单号', dataIndex: ['inbound', 'orderNo'] },
    { title: 'SKU', dataIndex: ['product', 'sku'], width: 120 },
    { title: '品名', dataIndex: ['product', 'name'] },
    { title: '数量', dataIndex: 'quantity', width: 60 },
    { title: '日期', dataIndex: ['inbound', 'createdAt'], render: (v: string) => v?.substring(0, 10) },
  ];

  const outboundCols = [
    { title: '出库单号', dataIndex: ['outbound', 'orderNo'],
      render: (v: string, r: any) => <a onClick={() => navigate(`/outbound/${r.outbound.id}`)}>{v}</a>,
    },
    { title: 'SKU', dataIndex: ['product', 'sku'], width: 120 },
    { title: '品名', dataIndex: ['product', 'name'] },
    { title: '实出', dataIndex: 'effectiveQty', width: 60 },
    { title: '甩柜', dataIndex: 'returnedQty', width: 60,
      render: (v: number) => v > 0 ? <Tag style={{ fontSize: 11 }} color="orange">{v}</Tag> : <span style={{ color: '#ccc' }}>0</span>,
    },
    { title: '日期', dataIndex: ['outbound', 'createdAt'], render: (v: string) => v?.substring(0, 10) },
  ];

  const containerCols = [
    { title: '货柜号', dataIndex: ['container', 'containerNo'],
      render: (v: string, r: any) => <a onClick={() => window.open(`/containers/${r.container.id}/report`, '_blank')}>{v}</a>,
    },
    { title: 'SKU', dataIndex: ['product', 'sku'], width: 120 },
    { title: '品名', dataIndex: ['product', 'name'] },
    { title: '实装数', dataIndex: 'actualQty', width: 80 },
    { title: '甩柜', dataIndex: 'returnedQty', width: 60,
      render: (v: number) => v > 0 ? <Tag color="orange">{v}</Tag> : '0',
    },
    { title: '封柜时间', dataIndex: ['container', 'sealTime'],
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/contracts/${id}`)}>返回合同</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          合同对账 - {contract.contractNo}
        </Typography.Title>
      </Space>

      <Descriptions bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="客户">{contract.businessCustomer?.realName || contract.customer?.realName || contract.customer?.username}</Descriptions.Item>
        <Descriptions.Item label="合同状态">
          {contract.status === 'active' ? <Tag color="processing">进行中</Tag>
            : contract.status === 'completed' ? <Tag color="success">已完成</Tag>
            : <Tag>{contract.status}</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="创建日期">{contract.createdAt?.substring(0, 10)}</Descriptions.Item>
      </Descriptions>

      <Card title="商品收发汇总" size="small" style={{ marginBottom: 16 }}>
        <Table rowKey="sku" columns={summaryCols} dataSource={summary} pagination={false} size="small"
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4}><Typography.Text strong>合计</Typography.Text></Table.Summary.Cell>
              <Table.Summary.Cell index={1} />
              <Table.Summary.Cell index={2}><Typography.Text strong>{totals.planned}</Typography.Text></Table.Summary.Cell>
              <Table.Summary.Cell index={3}><Typography.Text strong>{totals.received}</Typography.Text></Table.Summary.Cell>
              <Table.Summary.Cell index={4}><Typography.Text strong>{totals.shipped}</Typography.Text></Table.Summary.Cell>
              <Table.Summary.Cell index={5}><Typography.Text strong>{totals.returned}</Typography.Text></Table.Summary.Cell>
              <Table.Summary.Cell index={6}><Typography.Text strong>{totals.stockBalance}</Typography.Text></Table.Summary.Cell>
              <Table.Summary.Cell index={7}><Typography.Text strong>¥{totals.amount.toFixed(2)}</Typography.Text></Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>

      <Collapse items={[
        {
          key: 'inbound',
          label: `入库记录 (${inboundItems.length} 条)`,
          children: inboundItems.length > 0
            ? <Table rowKey="id" columns={inboundCols} dataSource={inboundItems} pagination={false} size="small" />
            : <Typography.Text type="secondary">暂无入库记录</Typography.Text>,
        },
        {
          key: 'outbound',
          label: `出库记录 (${outboundItems.length} 条)`,
          children: outboundItems.length > 0
            ? <Table rowKey="id" columns={outboundCols} dataSource={outboundItems} pagination={false} size="small" />
            : <Typography.Text type="secondary">暂无出库记录</Typography.Text>,
        },
        {
          key: 'container',
          label: `货柜明细 (${containerItems.length} 条)`,
          children: containerItems.length > 0
            ? <Table rowKey="id" columns={containerCols} dataSource={containerItems} pagination={false} size="small" />
            : <Typography.Text type="secondary">暂无货柜记录</Typography.Text>,
        },
      ]} />
    </div>
  );
}
