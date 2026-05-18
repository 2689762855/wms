import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Modal, Form, Select, Input, Tag, Card, Typography, Space, Popconfirm, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import { useAuth } from '../stores/AuthContext';
import type { Warehouse, CheckTask } from '../types';
import dayjs from 'dayjs';

function statusInfo(s: string) {
  if (s === 'completed') return { color: 'green' as const, text: '已完成' };
  if (s === 'anomaly') return { color: 'orange' as const, text: '异常' };
  return { color: 'processing' as const, text: '进行中' };
}

export default function CheckTasks() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'warehouse_admin' || user?.role === 'tenant_admin';

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: () => apiClient.get('/warehouses').then(r => r.data) });
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['check-tasks'],
    queryFn: () => apiClient.get('/check-tasks').then(res => res.data as CheckTask[]),
  });

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => apiClient.post('/check-tasks', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['check-tasks'] });
      message.success('盘点任务已创建，已按库位自动拆分');
      setOpen(false);
      form.resetFields();
    },
    onError: (err: any) => message.error(err.response?.data?.error || '创建失败'),
  });

  const finalizeMutation = useMutation({
    mutationFn: (id: number) => apiClient.put(`/check-tasks/${id}/finalize`),
    onSuccess: () => {
      message.success('盘点已最终确定');
      queryClient.invalidateQueries({ queryKey: ['check-tasks'] });
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const columns = [
    { title: '仓库', dataIndex: ['warehouse', 'name'], key: 'warehouse' },
    { title: '状态', key: 'status', render: (_: unknown, r: CheckTask) => {
      const subs = r.subTasks || [];
      const allSubDone = subs.length > 0 && subs.every(s => s.status === 'completed');
      if (r.status === 'completed') return <Tag color="green">已完成</Tag>;
      if (r.status === 'anomaly') return <Tag color="orange">异常</Tag>;
      if (allSubDone) return <Tag color="blue">待最终确定</Tag>;
      return <Tag color="processing">进行中</Tag>;
    } },
    { title: '库位数', key: 'locCount', render: (_: unknown, r: CheckTask) => r.subTasks?.length || 0 },
    { title: '进度', key: 'progress', render: (_: unknown, r: CheckTask) => {
      const subs = r.subTasks || [];
      const done = subs.filter(s => s.status === 'completed').length;
      const anomaly = subs.filter(s => s.status === 'anomaly').length;
      return <span>{done}/{subs.length} 完成{anomaly > 0 ? <Tag color="orange" style={{ marginLeft: 4 }}>{anomaly}异常</Tag> : null}</span>;
    } },
    { title: '备注', dataIndex: 'note', key: 'note' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (t: string) => dayjs(t).format('MM-DD HH:mm') },
    { title: '操作', key: 'actions', render: (_: unknown, r: CheckTask) => {
      const subs = r.subTasks || [];
      const allSubDone = subs.length > 0 && subs.every(s => s.status === 'completed');
      return (
        <Space size={4}>
          <Button size="small" onClick={() => navigate(`/check-tasks/${r.id}`)}>查看</Button>
          {allSubDone && r.status !== 'completed' && isAdmin && (
            <Popconfirm title="最终确定后数据将锁定为只读" onConfirm={() => finalizeMutation.mutate(r.id)}>
              <Button size="small" type="primary" loading={finalizeMutation.isPending}>最终确定</Button>
            </Popconfirm>
          )}
        </Space>
      );
    }},
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>盘点管理</Typography.Title>} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建盘点</Button>}>
      <Table rowKey="id" columns={columns} dataSource={tasks} loading={isLoading} pagination={false} scroll={{ x: 800 }} />
      <Modal title="新建盘点任务" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={createMutation.isPending}>
        <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item name="warehouseId" label="仓库" rules={[{ required: true }]}>
            <Select>{warehouses?.map((w: Warehouse) => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="note" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
