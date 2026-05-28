import { useState } from 'react';
import { Table, Button, Modal, Form, Input, DatePicker, Select, Space, Card, Typography, message, Tag, AutoComplete } from 'antd';
import { PlusOutlined, DeleteOutlined, EnterOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuth } from '../stores/AuthContext';
import type { CustomerInfo } from '../types';
import dayjs from 'dayjs';

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '待装柜' },
  loading: { color: 'processing', label: '装柜中' },
  sealed: { color: 'success', label: '已封柜' },
};

export default function Containers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [customerFilter, setCustomerFilter] = useState<number | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['containers', customerFilter],
    queryFn: () => apiClient.get('/containers', { params: customerFilter ? { customerId: customerFilter } : {} }).then((r) => r.data),
  });

  const { data: customers } = useQuery<CustomerInfo[]>({
    queryKey: ['customers'],
    queryFn: () => apiClient.get('/customers').then((r) => r.data),
    enabled: user?.role !== 'operator',
  });

  const createMutation = useMutation({
    mutationFn: (values: any) => apiClient.post('/containers', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      message.success('已创建');
      setOpen(false);
      form.resetFields();
    },
    onError: (err: any) => message.error(err.response?.data?.error || '创建失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/containers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['containers'] }); message.success('已删除'); },
  });

  const columns = [
    { title: '柜号', dataIndex: 'containerNo', key: 'containerNo', render: (v: string, r: any) => <a onClick={() => navigate(`/containers/${r.id}`)}>{v}</a> },
    { title: '客户', dataIndex: ['customer', 'realName'], key: 'customer' },
    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.label}</Tag> },
    { title: '商品数', key: 'items', render: (_: any, r: any) => new Set(r.items?.map((i: any) => i.productId)).size || 0 },
    { title: '到柜时间', dataIndex: 'toYardTime', render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-' },
    { title: '封柜时间', dataIndex: 'sealTime', render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-' },
    { title: '创建时间', dataIndex: 'createdAt', render: (v: string) => v?.substring(0, 10) },
    {
      title: '操作', key: 'actions', render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EnterOutlined />} onClick={() => navigate(`/containers/${r.id}`)}>装柜</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteMutation.mutate(r.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>货柜管理</Typography.Title>}
      extra={<Space>
        <Select allowClear placeholder="客户筛选" style={{ width: 160 }} showSearch optionFilterProp="label" value={customerFilter} onChange={(v) => setCustomerFilter(v)} options={customers?.map((c) => ({ label: c.realName || c.username, value: c.id }))} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建货柜</Button>
      </Space>}>
      <Table rowKey="id" columns={columns} dataSource={data?.data} loading={isLoading}
        pagination={{ total: data?.total, pageSize: 20, showSizeChanger: false }} />

      <Modal title="新建货柜" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)}>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="containerNo" label="柜号" rules={[{ required: true }]}>
            <Input placeholder="如: TGHU1234567" />
          </Form.Item>
          <Form.Item name="customerName" label="客户" rules={[{ required: true }]}>
            <AutoComplete
              placeholder="输入生意客户名，新客户自动创建"
              filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
              options={customers?.map((c) => ({ label: c.realName || c.username, value: c.id }))}
              onChange={(_val, opt: any) => form.setFieldValue('customerId', opt?.value ?? null)}
            >
              <Input />
            </AutoComplete>
          </Form.Item>
          <Form.Item name="customerId" hidden><Input /></Form.Item>
          <Form.Item name="toYardTime" label="到柜时间">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
