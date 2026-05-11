import { Row, Col, Card, Statistic, Typography, Table } from 'antd';
import { InboxOutlined, ImportOutlined, ExportOutlined, AlertOutlined, SwapOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import apiClient from '../api/client';
import { getCategoryLevelName } from '../utils/categoryTree';
import type { Category } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line } from 'recharts';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2'];

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => apiClient.get('/warehouses').then(r => r.data) });
  const { data: alerts } = useQuery({ queryKey: ['alerts'], queryFn: () => apiClient.get('/alerts').then(r => r.data) });

  const alertCount = useMemo(() => {
    if (!alerts) return 0;
    // 后端按商品+仓库维度返回，直接计数
    return (alerts as { product: { id: number }; warehouseId: number }[]).length;
  }, [alerts]);
  const { data: reports } = useQuery({ queryKey: ['reports-in-out', 30], queryFn: () => apiClient.get('/reports/in-out-summary', { params: { days: 30 } }).then(r => r.data) });
  const { data: stockSummary } = useQuery({ queryKey: ['stock-summary'], queryFn: () => apiClient.get('/reports/stock-summary').then(r => r.data) });
  const { data: inventory } = useQuery({ queryKey: ['inventory-all'], queryFn: () => apiClient.get('/inventory').then(r => r.data) });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.get('/categories').then(r => r.data) });
  const { data: whComparison } = useQuery({ queryKey: ['warehouse-comparison'], queryFn: () => apiClient.get('/reports/warehouse-comparison').then(r => r.data) });

  const catMap = useMemo(() => {
    const map = new Map<number, Category>();
    categories?.forEach((c: Category) => map.set(c.id, c));
    return map;
  }, [categories]);

  const pieData = stockSummary?.map((s: { warehouse: string; totalQuantity: number }) => ({
    name: s.warehouse,
    value: s.totalQuantity,
  })).filter((d: { value: number }) => d.value > 0) || [];

  const topProducts = [...(inventory || [])]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)
    .map((item, i) => {
      const lv2 = getCategoryLevelName(item.product?.category, 2, catMap);
      const lv3 = getCategoryLevelName(item.product?.category, 3, catMap);
      const catDisplay = [lv2, lv3].filter(Boolean).join(' - ');
      return { rank: i + 1, name: catDisplay ? `${catDisplay} ${item.product?.name}` : item.product?.name, sku: item.product?.sku, qty: item.quantity, warehouse: item.warehouse?.name };
    });

  const topColumns = [
    { title: '#', dataIndex: 'rank', width: 40 },
    { title: '商品', dataIndex: 'name' },
    { title: 'SKU', dataIndex: 'sku' },
    { title: '库存', dataIndex: 'qty' },
    { title: '仓库', dataIndex: 'warehouse' },
  ];

  return (
    <div>
      <Typography.Title level={4}>仪表盘</Typography.Title>

      <Row gutter={[12, 12]}>
        <Col xs={12} sm={8} md={4}>
          <Card hoverable onClick={() => navigate('/warehouses')} size="small">
            <Statistic title="仓库总数" value={warehouses?.length || 0} prefix={<InboxOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card hoverable onClick={() => navigate('/products')} size="small">
            <Statistic title="库存品类" value={stockSummary?.reduce((s: number, r: { totalItems: number }) => s + r.totalItems, 0) || 0} prefix={<InboxOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card hoverable onClick={() => navigate('/inbound')} size="small">
            <Statistic title="入库总量" value={reports?.totalInboundQty || 0} prefix={<ImportOutlined />} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card hoverable onClick={() => navigate('/outbound')} size="small">
            <Statistic title="出库总量" value={reports?.totalOutboundQty || 0} prefix={<ExportOutlined />} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card hoverable onClick={() => navigate('/inventory')} size="small">
            <Statistic title="库存总计" value={stockSummary?.reduce((s: number, r: { totalQuantity: number }) => s + r.totalQuantity, 0) || 0} suffix="件" />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card hoverable onClick={() => navigate('/alerts')} size="small" style={{ border: alertCount > 0 ? '1px solid #ff4d4f' : undefined }}>
            <Statistic title="库存预警" value={alertCount} prefix={<AlertOutlined />} valueStyle={{ color: alertCount > 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} md={12}>
          <Card title="各仓库出入库对比" size="small">
            {whComparison?.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={whComparison} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="warehouse" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="inbound" name="入库" fill="#52c41a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outbound" name="出库" fill="#ff4d4f" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>暂无出入库数据</div>
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="各仓库库存占比" size="small">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ fontSize: 10 }}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v} 件`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>暂无库存数据</div>
            )}
          </Card>
        </Col>
      </Row>

      {reports?.daily && reports.daily.length > 0 && (
        <Card title="近30天出入库趋势" style={{ marginTop: 16 }}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={reports.daily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="inboundQty" name="入库" fill="#52c41a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outboundQty" name="出库" fill="#ff4d4f" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}

      {topProducts.length > 0 && (
        <Card title="库存 TOP 5" style={{ marginTop: 16 }}>
          <Table rowKey="rank" columns={topColumns} dataSource={topProducts} pagination={false} size="small" />
        </Card>
      )}
    </div>
  );
}
