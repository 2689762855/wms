import { useState, useMemo } from 'react';
import { Card, Typography, Table, Select, Space, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

export default function ReportsCustomerStats() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | null>(null);
  const [filterIds, setFilterIds] = useState<number[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-stats', year],
    queryFn: () => apiClient.get('/reports/customer-stats', { params: { year } }).then(r => r.data),
  });

  const allCustomers: any[] = data?.customers || [];
  const filtered = filterIds.length > 0 ? allCustomers.filter(c => filterIds.includes(c.businessCustomerId)) : allCustomers;

  const cols = [
    { title: '客户', dataIndex: 'customer', width: 100 },
    { title: '合同', dataIndex: 'contracts', width: 70, align: 'center' as const },
    { title: '货柜', dataIndex: 'containers', width: 70, align: 'center' as const },
    { title: '出货件数', dataIndex: 'qty', width: 90, align: 'center' as const },
    { title: '出货金额', dataIndex: 'amount', width: 110, align: 'center' as const, render: (v: number) => v ? `¥${v.toFixed(2)}` : '-' },
  ];

  const monthBlocks = useMemo(() => {
    const indices = month != null ? [month - 1] : MONTHS.map((_, i) => i);
    const blocks = indices.map(i => {
      const rows = filtered.map(c => ({
        customer: c.customerName,
        contracts: c.monthlyContracts ? c.monthlyContracts[i] : 0,
        containers: c.monthlyContainers[i],
        qty: c.monthlyQty[i],
        amount: Math.round(c.monthlyAmount[i] * 100) / 100,
        key: `${i}_${c.businessCustomerId}`,
      }));
      const total = {
        customer: '合计',
        contracts: rows.reduce((s, r) => s + r.contracts, 0),
        containers: rows.reduce((s, r) => s + r.containers, 0),
        qty: rows.reduce((s, r) => s + r.qty, 0),
        amount: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
      };
      return { month: MONTHS[i], rows: [...rows, total], key: i };
    });

    // 全年合计
    const yearRows = filtered.map(c => ({
      customer: c.customerName,
      contracts: c.yearlyContracts || 0,
      containers: c.yearlyContainers,
      qty: c.yearlyQty,
      amount: Math.round(c.yearlyAmount * 100) / 100,
      key: `y_${c.businessCustomerId}`,
    }));
    const yearTotal = {
      customer: '合计',
      contracts: yearRows.reduce((s, r) => s + r.contracts, 0),
      containers: yearRows.reduce((s, r) => s + r.containers, 0),
      qty: yearRows.reduce((s, r) => s + r.qty, 0),
      amount: Math.round(yearRows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    };
    blocks.push({ month: '全年合计', rows: [...yearRows, yearTotal], key: 'year' });

    return blocks;
  }, [filtered, month]);

  if (isLoading) return <Spin style={{ display: 'block', padding: 40, textAlign: 'center' }} />;

  const totalRow = monthBlocks.find(b => b.key === 'year')?.rows.slice(-1)[0] || {};
  const sc = totalRow.contracts || 0;
  const sco = totalRow.containers || 0;
  const sq = totalRow.qty || 0;
  const sa = totalRow.amount || 0;

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>{year}年{month ? `${month}月` : '全年'} 客户统计报表</Typography.Title>}
      extra={
        <Space>
          <Select mode="multiple" allowClear placeholder="全部客户" style={{ minWidth: 200 }} maxTagCount={2}
            value={filterIds} onChange={v => setFilterIds(v)}
            options={allCustomers.map(c => ({ label: c.customerName, value: c.businessCustomerId }))} />
          <Select value={month} onChange={setMonth} style={{ width: 80 }} allowClear placeholder="全年">
            {MONTHS.map((m, i) => <Select.Option key={i + 1} value={i + 1}>{m}</Select.Option>)}
          </Select>
          <Select value={year} onChange={setYear} style={{ width: 100 }}>
            {[2025, 2026, 2027].map(y => <Select.Option key={y} value={y}>{y}</Select.Option>)}
          </Select>
        </Space>
      }
    >
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, padding: 16, background: '#fafafa', borderRadius: 8 }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <Typography.Text type="secondary">合同</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0 }}>{sc}</Typography.Title>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <Typography.Text type="secondary">货柜</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0 }}>{sco}</Typography.Title>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <Typography.Text type="secondary">出货件数</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0 }}>{sq}</Typography.Title>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <Typography.Text type="secondary">出货金额</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0 }}>¥{sa.toFixed(0)}</Typography.Title>
        </div>
      </div>

      {monthBlocks.map(block => (
        <Card key={block.key} size="small" title={block.month}
          style={{ marginBottom: 8, background: block.key === 'year' ? '#fafafa' : undefined }}>
          <Table rowKey="customer" columns={cols} dataSource={block.rows} pagination={false} size="small" bordered
            onRow={(record) => record.customer === '合计' ? { style: { fontWeight: 'bold' } } : {}} />
        </Card>
      ))}
    </Card>
  );
}
