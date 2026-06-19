import { useState, useMemo } from 'react';
import { Button, Popover, Typography, Tag, Segmented } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import apiClient from '../api/client';

interface Props {
  productId: number;
  productName?: string;
}

interface PriceRecord {
  date: string;
  type: string;
  price: number;
  orderNo: string;
}

export default function PriceHistoryPopover({ productId, productName }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PriceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('全部');

  const handleOpen = (visible: boolean) => {
    setOpen(visible);
    if (visible) {
      setLoading(true);
      apiClient.get(`/products/${productId}/price-history`)
        .then(res => setData(res.data))
        .catch(() => setData([]))
        .finally(() => setLoading(false));
    }
  };

  const filtered = useMemo(() => {
    if (filter === '全部') return data;
    const mappedType = filter === '进价' ? '入库' : '出库';
    return data.filter(d => d.type === mappedType);
  }, [data, filter]);

  const displayType = (type: string) => type === '入库' ? '进价' : '售价';

  // 曲线图数据：按时间正序
  const chartData = useMemo(() =>
    [...filtered].reverse().map(d => ({
      date: dayjs(d.date).format('MM-DD'),
      price: d.price,
      type: d.type,
      orderNo: d.orderNo,
    }))
  , [filtered]);

  const popoverWidth = 560;

  return (
    <Popover
      open={open}
      onOpenChange={handleOpen}
      title={productName ? `${productName} 历史价格` : '历史价格'}
      overlayStyle={{ maxWidth: popoverWidth }}
      content={
        loading ? <Typography.Text type="secondary">加载中...</Typography.Text> :
        data.length === 0 ? <Typography.Text type="secondary">暂无历史价格</Typography.Text> :
        <div style={{ width: popoverWidth - 40 }}>
          <div style={{ marginBottom: 8, textAlign: 'right' }}>
            <Segmented size="small" value={filter} onChange={v => setFilter(v as string)}
              options={['全部', '进价', '售价']} />
          </div>

          {chartData.length > 0 && filter !== '全部' && (
            <div style={{ width: '100%', height: 130, marginBottom: 8 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} width={48} domain={['auto', 'auto']} />
                  <Tooltip
                    formatter={(v: number) => [`¥${v.toFixed(2)}`, '价格']}
                    labelFormatter={(l: string) => `日期: ${l}`}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="price" stroke="#1677ff" strokeWidth={2}
                    dot={{ r: 3, fill: '#1677ff' }} activeDot={{ r: 5 }}
                    connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'left' }}>日期</th>
                <th style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'left' }}>类型</th>
                <th style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>价格</th>
                <th style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'left' }}>单号</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 15).map((d, i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 8px' }}>{dayjs(d.date).format('MM-DD HH:mm')}</td>
                  <td style={{ padding: '2px 8px' }}><Tag color={d.type === '入库' ? 'blue' : 'orange'} style={{ fontSize: 11 }}>{displayType(d.type)}</Tag></td>
                  <td style={{ padding: '2px 8px', textAlign: 'right' }}>¥{d.price?.toFixed(2)}</td>
                  <td style={{ padding: '2px 8px', fontSize: 11, color: '#999' }}>{d.orderNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
      trigger="click"
    >
      <Button icon={<ClockCircleOutlined />}>历史价格</Button>
    </Popover>
  );
}
