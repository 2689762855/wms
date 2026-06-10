import { useState } from 'react';
import { Card, Typography, Select, Statistic, Row, Col } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';

export default function ReportsInOut() {
  const [days, setDays] = useState(30);

  const { data } = useQuery({
    queryKey: ['reports-in-out', days],
    queryFn: () => apiClient.get('/reports/in-out-summary', { params: { days } }).then(r => r.data),
  });

  return (
    <div>
      <Typography.Title level={4}>出入库报表</Typography.Title>
      <Select value={days} onChange={setDays} style={{ marginBottom: 16, width: 150 }}>
        <Select.Option value={7}>最近 7 天</Select.Option>
        <Select.Option value={30}>最近 30 天</Select.Option>
        <Select.Option value={90}>最近 90 天</Select.Option>
      </Select>

      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="入库总数" value={data?.totalInboundQty || 0} prefix={<ArrowUpOutlined />} styles={{ content: { color: '#3f8600' } }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="出库总数" value={data?.totalOutboundQty || 0} prefix={<ArrowDownOutlined />} styles={{ content: { color: '#cf1322' } }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="入库单数" value={data?.totalInbounds || 0} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="出库单数" value={data?.totalOutbounds || 0} /></Card></Col>
      </Row>

      <Card title="每日出入库趋势">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data?.daily || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis />
            <Tooltip labelFormatter={(d) => dayjs(d).format('YYYY-MM-DD')} />
            <Legend />
            <Bar dataKey="inboundQty" name="入库数量" fill="#52c41a" />
            <Bar dataKey="outboundQty" name="出库数量" fill="#ff4d4f" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
