import { useState, useMemo } from 'react';
import { Card, Typography, Table, Select, Space, Spin, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import apiClient from '../api/client';

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const PIE_COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2', '#f5222d', '#faad14'];
const fmt = (v: number | undefined | null) => (v ?? 0).toLocaleString('zh-CN');
const fmtMoney = (v: number | undefined | null) => '¥' + fmt(Math.round(v ?? 0));

export default function ReportsCustomerStats() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | null>(null);
  const [filterIds, setFilterIds] = useState<number[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-stats', year],
    queryFn: () => apiClient.get('/reports/customer-stats', { params: { year } }).then(r => r.data),
  });

  const allCustomers: any[] = data?.customers || [];
  const filtered = filterIds.length > 0 ? allCustomers.filter((c: any) => filterIds.includes(c.businessCustomerId)) : allCustomers;

  // --- summary data (month-responsive) ---
  const summary = useMemo(() => {
    const mi = month != null ? month - 1 : null;
    const pick = (arr: number[]) => mi != null ? arr[mi] : arr.reduce((a, b) => a + b, 0);
    return {
      contracts: filtered.reduce((s: number, c: any) => s + pick(c.monthlyContracts || Array(12).fill(0)), 0),
      containers: filtered.reduce((s: number, c: any) => s + pick(c.monthlyContainers), 0),
      qty: filtered.reduce((s: number, c: any) => s + pick(c.monthlyQty), 0),
      amount: filtered.reduce((s: number, c: any) => s + pick(c.monthlyAmount), 0),
    };
  }, [filtered, month]);

  // --- monthly trend chart data ---
  const trendData = useMemo(() => {
    return MONTHS.map((m, i) => {
      const qty = filtered.reduce((s: number, c: any) => s + (c.monthlyQty[i] || 0), 0);
      const amount = filtered.reduce((s: number, c: any) => s + (c.monthlyAmount[i] || 0), 0);
      return { month: m, 出货件数: qty, 出货金额: Math.round(amount * 100) / 100 };
    });
  }, [filtered]);

  // --- pie chart data (yearly per customer) ---
  const pieData = useMemo(() => {
    return filtered
      .filter((c: any) => c.yearlyAmount > 0)
      .map((c: any) => ({ name: c.customerName, value: Math.round(c.yearlyAmount * 100) / 100 }))
      .sort((a: any, b: any) => b.value - a.value);
  }, [filtered]);

  // --- ranking table ---
  const rankCols = [
    { title: '排名', dataIndex: 'rank', width: 50, align: 'center' as const },
    { title: '客户', dataIndex: 'customer', width: 90 },
    { title: '合同', dataIndex: 'contracts', width: 60, align: 'center' as const, render: (v: number) => fmt(v) },
    { title: '货柜', dataIndex: 'containers', width: 60, align: 'center' as const, render: (v: number) => fmt(v) },
    { title: '出货件数', dataIndex: 'qty', width: 90, align: 'center' as const, render: (v: number) => fmt(v) },
    { title: '出货金额', dataIndex: 'amount', width: 110, align: 'center' as const, render: (v: number) => v ? fmtMoney(v) : '-' },
    { title: '占比', dataIndex: 'pct', width: 70, align: 'center' as const },
  ];

  const rankData = useMemo(() => {
    const totalAmt = pieData.reduce((s: number, d: any) => s + d.value, 0);
    const rows = pieData.map((d: any, i: number) => {
      const c = filtered.find((x: any) => x.customerName === d.name);
      return {
        rank: i + 1,
        customer: d.name,
        contracts: c?.yearlyContracts || 0,
        containers: c?.yearlyContainers || 0,
        qty: c?.yearlyQty || 0,
        amount: c?.yearlyAmount || 0,
        pct: totalAmt > 0 ? `${Math.round(d.value / totalAmt * 100)}%` : '-',
        key: c?.businessCustomerId || i,
      };
    });
    return rows;
  }, [filtered, pieData]);

  // --- export ---
  const handleExport = () => {
    const header = '排名,客户,合同,货柜,出货件数,出货金额,占比\n';
    const rows = rankData.map(r => `${r.rank},${r.customer},${r.contracts},${r.containers},${r.qty},${Math.round(r.amount)},${r.pct}`).join('\n');
    const bom = '﻿';
    const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `客户统计报表_${year}年.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <Spin style={{ display: 'block', padding: 80, textAlign: 'center' }} />;

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>{year}年{month ? `${month}月` : '全年'} 客户统计报表</Typography.Title>}
      extra={
        <Space wrap>
          <Select mode="multiple" allowClear placeholder="全部客户" style={{ minWidth: 180 }} maxTagCount={2}
            value={filterIds} onChange={v => setFilterIds(v)}
            options={allCustomers.map((c: any) => ({ label: c.customerName, value: c.businessCustomerId }))} />
          <Select value={month} onChange={setMonth} style={{ width: 80 }} allowClear placeholder="全年">
            {MONTHS.map((m, i) => <Select.Option key={i + 1} value={i + 1}>{m}</Select.Option>)}
          </Select>
          <Select value={year} onChange={setYear} style={{ width: 90 }}>
            {[2025, 2026, 2027].map(y => <Select.Option key={y} value={y}>{y}</Select.Option>)}
          </Select>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
        </Space>
      }
    >
      {/* summary cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, padding: '16px 24px', background: '#fafafa', borderRadius: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
          <Typography.Text type="secondary">合同</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0 }}>{fmt(summary.contracts)}</Typography.Title>
        </div>
        <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
          <Typography.Text type="secondary">货柜</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0 }}>{fmt(summary.containers)}</Typography.Title>
        </div>
        <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
          <Typography.Text type="secondary">出货件数</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0 }}>{fmt(summary.qty)}</Typography.Title>
        </div>
        <div style={{ flex: 1, minWidth: 120, textAlign: 'center' }}>
          <Typography.Text type="secondary">出货金额</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0, color: '#1677ff' }}>{fmtMoney(summary.amount)}</Typography.Title>
        </div>
      </div>

      {/* charts row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <Card size="small" title="月度出货趋势" style={{ flex: 3, minWidth: 400 }}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" label={{ value: '件数', position: 'insideTopLeft', dy: -10, style: { fontSize: 12 } }} />
              <YAxis yAxisId="right" orientation="right" label={{ value: '金额(¥)', position: 'insideTopRight', dy: -10, style: { fontSize: 12 } }} />
              <Tooltip formatter={(v: number, name: string) => name === '出货金额' ? fmtMoney(v) : fmt(v)} />
              <Legend />
              <Bar yAxisId="left" dataKey="出货件数" fill="#1677ff" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="出货金额" stroke="#fa8c16" strokeWidth={3} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card size="small" title="客户营收占比" style={{ flex: 2, minWidth: 240 }}>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>暂无数据</div>
          )}
        </Card>
      </div>

      {/* ranking table */}
      <Card size="small" title="客户排名">
        <Table rowKey="key" columns={rankCols} dataSource={rankData} pagination={false} size="small" bordered locale={{ emptyText: '暂无数据' }}
          summary={() => {
            const totalContracts = rankData.reduce((s, r) => s + r.contracts, 0);
            const totalContainers = rankData.reduce((s, r) => s + r.containers, 0);
            const totalQty = rankData.reduce((s, r) => s + r.qty, 0);
            const totalAmt = rankData.reduce((s, r) => s + r.amount, 0);
            return (
              <Table.Summary.Row style={{ fontWeight: 'bold' }}>
                <Table.Summary.Cell index={0} align="center">-</Table.Summary.Cell>
                <Table.Summary.Cell index={1}>合计</Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="center">{fmt(totalContracts)}</Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="center">{fmt(totalContainers)}</Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="center">{fmt(totalQty)}</Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="center">{fmtMoney(totalAmt)}</Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="center">100%</Table.Summary.Cell>
              </Table.Summary.Row>
            );
          }}
        />
      </Card>
    </Card>
  );
}
