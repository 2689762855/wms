import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, InputNumber, Space, Typography, Tag, message, Modal, Descriptions } from 'antd';
import { ArrowLeftOutlined, LockOutlined, PrinterOutlined, InboxOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import dayjs from 'dayjs';

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '待装柜' },
  loading: { color: 'processing', label: '装柜中' },
  sealed: { color: 'success', label: '已封柜' },
};

export default function ContainerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actualQs, setActualQs] = useState<Record<string, number>>({});

  const { data: container, isLoading } = useQuery({
    queryKey: ['container', id],
    queryFn: () => apiClient.get(`/containers/${id}`).then((r) => r.data),
  });

  const loadMutation = useMutation({
    mutationFn: (items: any[]) => apiClient.put(`/containers/${id}/load`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['container', id] });
      message.success('装柜数据已保存');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '保存失败'),
  });

  const sealMutation = useMutation({
    mutationFn: () => apiClient.put(`/containers/${id}/seal`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['container', id] });
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      message.success('已封柜');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '封柜失败'),
  });

  const handleLoad = () => {
    if (!container) return;
    const items = container.items?.map((i: any) => ({
      ...i,
      actualQty: actualQs[`${i.productId}`] ?? i.actualQty ?? 0,
    }));
    loadMutation.mutate(items);
  };

  const handleSeal = () => {
    Modal.confirm({
      title: '确认封柜？',
      content: '封柜后将按实装数记录流水，甩柜部分归还库存。封柜后不可修改。',
      onOk: () => sealMutation.mutate(),
    });
  };

  const printReport = () => {
    const items = container?.items || [];
    const rows = items.map((i: any) => {
      const actual = actualQs[`${i.productId}`] ?? i.actualQty ?? 0;
      return `<tr>
        <td>${i.product?.sku || ''}</td>
        <td>${i.product?.name || ''}</td>
        <td>${i.product?.spec || ''}</td>
        <td>${i.plannedQty}</td>
        <td>${actual}</td>
        <td>${Math.max(0, i.plannedQty - actual)}</td>
        <td>${i.product?.unit || 'pcs'}</td>
      </tr>`;
    }).join('');
    const totalPlanned = items.reduce((s: number, i: any) => s + i.plannedQty, 0);
    const totalActual = items.reduce((s: number, i: any) => s + (actualQs[`${i.productId}`] ?? i.actualQty ?? 0), 0);
    const totalReturned = Math.max(0, totalPlanned - totalActual);

    const w = window.open('', '_blank');
    if (w) {
      w.document.write(`<html><head><meta charset="utf-8"><title>装柜报表</title>
        <style>body{font-family:sans-serif;padding:24px;max-width:800px;margin:0 auto}
        h2{margin-bottom:4px}.info{margin-bottom:16px;color:#666}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border:1px solid #ddd;padding:8px 12px;text-align:center}
        th{background:#f5f5f5}td{font-size:14px}
        .total{font-weight:bold;background:#fafafa}
        .footer{margin-top:24px;color:#999;font-size:12px}
        @media print{.footer{display:none}}
</style></head><body>
        <h2>装柜报表</h2>
        <div class="info">
          <p>柜号：${container.containerNo}</p>
          <p>到柜时间：${container.toYardTime ? dayjs(container.toYardTime).format('YYYY-MM-DD HH:mm') : '-'}</p>
          <p>封柜时间：${container.sealTime ? dayjs(container.sealTime).format('YYYY-MM-DD HH:mm') : '-'}</p>
          <p>状态：${container.status === 'sealed' ? '已封柜' : container.status}</p>
        </div>
        <table>
          <thead><tr><th>SKU</th><th>商品</th><th>规格</th><th>计划</th><th>实装</th><th>甩柜</th><th>单位</th></tr></thead>
          <tbody>${rows}
            <tr class="total"><td colspan="3">合计</td><td>${totalPlanned}</td><td>${totalActual}</td><td>${totalReturned}</td><td></td></tr>
          </tbody>
        </table>
        <p class="footer">打印时间：${dayjs().format('YYYY-MM-DD HH:mm')}</p>
      </body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 300);
    }
  };

  const columns = [
    { title: 'SKU', dataIndex: ['product', 'sku'], width: 100 },
    { title: '商品', dataIndex: ['product', 'name'] },
    { title: '规格', dataIndex: ['product', 'spec'] },
    { title: '计划装柜', dataIndex: 'plannedQty', width: 80 },
    {
      title: '实装数量', dataIndex: 'actualQty', width: 120,
      render: (v: number, r: any) => {
        if (container?.status === 'sealed') return <span style={{ fontWeight: 600 }}>{v || 0}</span>;
        return (
          <InputNumber
            min={0}
            value={actualQs[`${r.productId}`] ?? v ?? 0}
            onChange={(n) => setActualQs((prev) => ({ ...prev, [`${r.productId}`]: n || 0 }))}
            style={{ width: 80 }}
          />
        );
      },
    },
    {
      title: '甩柜', key: 'returned', width: 60,
      render: (_: any, r: any) => {
        const actual = actualQs[`${r.productId}`] ?? r.actualQty ?? 0;
        const returned = Math.max(0, r.plannedQty - actual);
        return returned > 0 ? <Tag color="orange">{returned}</Tag> : <span>-</span>;
      },
    },
    { title: '单位', dataIndex: ['product', 'unit'], width: 50 },
  ];

  if (isLoading) return <Card loading />;
  if (!container) return null;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/containers')}>返回</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>货柜 {container.containerNo}</Typography.Title>
        <Tag color={statusMap[container.status]?.color}>{statusMap[container.status]?.label}</Tag>
      </Space>

      <Descriptions bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="客户">{container.customer?.realName || container.customer?.username}</Descriptions.Item>
        <Descriptions.Item label="到柜时间">{container.toYardTime ? dayjs(container.toYardTime).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
        <Descriptions.Item label="封柜时间">{container.sealTime ? dayjs(container.sealTime).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
        <Descriptions.Item label="备注">{container.note || '-'}</Descriptions.Item>
      </Descriptions>

      {container.status !== 'sealed' && (
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<InboxOutlined />} onClick={handleLoad} loading={loadMutation.isPending}>保存装柜数据</Button>
          {container.status === 'loading' && (
            <Button type="primary" danger icon={<LockOutlined />} onClick={handleSeal} loading={sealMutation.isPending}>封柜</Button>
          )}
        </Space>
      )}

      {container.status === 'sealed' && (
        <Button icon={<PrinterOutlined />} onClick={printReport} style={{ marginBottom: 16 }}>打印装柜报表</Button>
      )}

      <Card title="装柜明细">
        <Table rowKey="productId" columns={columns} dataSource={container.items || []} pagination={false} size="small"
          summary={() => {
            const totalPlanned = (container.items || []).reduce((s: number, i: any) => s + i.plannedQty, 0);
            const totalActual = (container.items || []).reduce((s: number, i: any) => s + (actualQs[`${i.productId}`] ?? i.actualQty ?? 0), 0);
            const totalReturned = Math.max(0, totalPlanned - totalActual);
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}><Typography.Text strong>合计</Typography.Text></Table.Summary.Cell>
                <Table.Summary.Cell index={1}><Typography.Text strong>{totalPlanned}</Typography.Text></Table.Summary.Cell>
                <Table.Summary.Cell index={2}><Typography.Text strong>{totalActual}</Typography.Text></Table.Summary.Cell>
                <Table.Summary.Cell index={3}>{totalReturned > 0 && <Tag color="orange">{totalReturned}</Tag>}</Table.Summary.Cell>
                <Table.Summary.Cell index={4} />
              </Table.Summary.Row>
            );
          }}
        />
      </Card>    </div>
  );
}
