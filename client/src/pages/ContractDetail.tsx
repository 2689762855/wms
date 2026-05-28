import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Space, Typography, Tag, message, Modal, Form, Input, Descriptions, Popconfirm, Select } from 'antd';
import { ArrowLeftOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();

  const { data: contract } = useQuery({
    queryKey: ['contract', id],
    queryFn: () => apiClient.get(`/contracts/${id}`).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/contracts/${id}`),
    onSuccess: () => { message.success('已删除'); navigate('/contracts'); },
    onError: (err: any) => message.error(err.response?.data?.error || '删除失败'),
  });

  const editMutation = useMutation({
    mutationFn: (values: any) => apiClient.put(`/contracts/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract', id] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      message.success('已更新');
      setEditOpen(false);
    },
    onError: (err: any) => message.error(err.response?.data?.error || '保存失败'),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiClient.patch(`/contracts/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract', id] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      message.success('状态已更新');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '更新失败'),
  });

  const itemColumns = [
    { title: 'SKU', dataIndex: ['product', 'sku'] },
    { title: '商品', dataIndex: ['product', 'name'] },
    { title: '规格', dataIndex: ['product', 'spec'] },
    { title: '单位', dataIndex: ['product', 'unit'], width: 60 },
    { title: '单价', dataIndex: 'unitPrice', width: 90,
      render: (v: number) => v ? <Typography.Text>¥{v.toFixed(2)}</Typography.Text> : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title: '计划数量', dataIndex: 'plannedQty',
      render: (v: number) => <Typography.Text strong>{v}</Typography.Text>,
    },
    {
      title: '已入库', dataIndex: 'receivedQty',
      render: (v: number, r: any) => {
        const over = v > r.plannedQty;
        return <Tag color={over ? 'red' : v >= r.plannedQty ? 'green' : 'blue'}>{v}</Tag>;
      },
    },
    { title: '金额', key: 'amount', width: 100,
      render: (_: any, r: any) => {
        const price = r.unitPrice || 0;
        const qty = r.receivedQty;
        if (!price) return <span style={{ color: '#ccc' }}>—</span>;
        return <Typography.Text strong>¥{(price * qty).toFixed(2)}</Typography.Text>;
      },
    },
    {
      title: '进度', key: 'progress',
      render: (_: any, r: any) => {
        const pct = r.plannedQty > 0 ? Math.round((r.receivedQty / r.plannedQty) * 100) : 0;
        const over = r.receivedQty > r.plannedQty;
        return <span style={{ color: over ? '#ff4d4f' : undefined }}>{over ? `超出 ${r.receivedQty - r.plannedQty}` : `${pct}%`}</span>;
      },
    },
  ];

  if (!contract) return null;
  const hasReceived = contract.items?.some((i: any) => i.receivedQty > 0);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/contracts')}>返回</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>合同 {contract.contractNo}</Typography.Title>
      </Space>

      <Descriptions bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="客户">{contract.customer?.realName || contract.customer?.username}</Descriptions.Item>
        <Descriptions.Item label="状态">{(() => { const m: Record<string, { color: string; label: string }> = { active: { color: 'processing', label: '进行中' }, completed: { color: 'success', label: '已完成' }, cancelled: { color: 'default', label: '已取消' } }; return <Tag color={m[contract.status]?.color}>{m[contract.status]?.label || contract.status}</Tag>; })()}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{contract.createdAt?.substring(0, 10)}</Descriptions.Item>
      </Descriptions>

      <Space style={{ marginBottom: 16 }}>
        <Button icon={<EditOutlined />} disabled={hasReceived} onClick={() => { form.setFieldsValue({ contractNo: contract.contractNo }); setEditOpen(true); }}
          title={hasReceived ? '已有入库记录，无法编辑' : ''}>编辑合同号</Button>
        <Popconfirm title="确定删除此合同？" onConfirm={() => deleteMutation.mutate()} disabled={hasReceived}>
          <Button danger icon={<DeleteOutlined />} disabled={hasReceived}
            title={hasReceived ? '已有入库记录，无法删除' : ''}>删除合同</Button>
        </Popconfirm>
        <Select value={contract.status} style={{ width: 120 }} onChange={(v) => statusMutation.mutate(v)}
          options={[{ label: '进行中', value: 'active' }, { label: '已完成', value: 'completed' }, { label: '已取消', value: 'cancelled' }]} />
      </Space>

      <Card title="商品明细">
        <Table rowKey="productId" columns={itemColumns} dataSource={contract.items || []} pagination={false} size="small" />
      </Card>

      <Modal title="编辑合同号" open={editOpen} onOk={() => form.submit()} onCancel={() => setEditOpen(false)}>
        <Form form={form} layout="vertical" onFinish={(v) => editMutation.mutate(v)}>
          <Form.Item name="contractNo" label="合同号" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Typography.Text type="secondary">已有入库记录时，只能修改合同号，不能修改商品明细。</Typography.Text>
        </Form>
      </Modal>
    </div>
  );
}
