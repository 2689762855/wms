import { useState } from 'react';
import { Table, Button, Modal, Form, Input, DatePicker, Select, Space, Card, Typography, message, Tag, Popconfirm, List, InputNumber } from 'antd';
import { PlusOutlined, DeleteOutlined, EnterOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import dayjs from 'dayjs';

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '待装柜' },
  loading: { color: 'processing', label: '装柜中' },
  sealed: { color: 'success', label: '已封柜' },
  cancelled: { color: 'error', label: '已作废' },
};

export default function Containers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [custMgrOpen, setCustMgrOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [bizCustFilter, setBizCustFilter] = useState<number | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const { data: products } = useQuery<any[]>({
    queryKey: ['products-all'],
    queryFn: () => apiClient.get('/products', { params: { pageSize: 999 } }).then(r => r.data.data),
  });

  const monthParam = dateRange?.[0]
    ? { startDate: dateRange[0].startOf('month').toISOString(), endDate: dateRange[0].endOf('month').toISOString() }
    : {};

  const { data, isLoading } = useQuery({
    queryKey: ['containers', bizCustFilter, dateRange],
    queryFn: () => apiClient.get('/containers', {
      params: {
        ...(bizCustFilter ? { businessCustomerId: bizCustFilter } : {}),
        ...monthParam,
      },
    }).then((r) => r.data),
  });

  const { data: businessCustomers, refetch: refetchCustomers } = useQuery<{ id: number; realName: string }[]>({
    queryKey: ['business-customers'],
    queryFn: () => apiClient.get('/contracts/business-customers').then((r) => r.data),
  });

  const { data: activeContracts } = useQuery<any[]>({
    queryKey: ['contracts-active'],
    queryFn: () => apiClient.get('/contracts', { params: { status: 'active', pageSize: 999 } }).then((r) => r.data.data),
  });

  // 未关联排柜的出库单（已确认但无 containerId）
  const { data: unlinkedOutbounds } = useQuery<any[]>({
    queryKey: ['outbounds-unlinked'],
    queryFn: () => apiClient.get('/outbound', { params: { unlinkedOnly: true, pageSize: 999, status: 'confirmed' } }).then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (values: any) => {
      if (values.toYardTime) values.toYardTime = values.toYardTime.toISOString();
      return apiClient.post('/containers', values);
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      queryClient.invalidateQueries({ queryKey: ['outbound'] });
      const linked = res.data?.linkedOutbounds || 0;
      message.success(linked > 0 ? `已创建，自动关联 ${linked} 个出库单` : '已创建');
      setOpen(false);
      form.resetFields();
    },
    onError: (err: any) => message.error(err.response?.data?.error || '创建失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/containers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['containers'] }); message.success('已删除'); },
    onError: (err: any) => message.error(err.response?.data?.error || '删除失败'),
  });

  const createCustMutation = useMutation({
    mutationFn: (realName: string) => apiClient.post('/contracts/business-customers', { realName }),
    onSuccess: () => {
      refetchCustomers();
      message.success('客户已创建');
      setNewCustName('');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '创建失败'),
  });

  const deleteCustMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/contracts/business-customers/${id}`),
    onSuccess: () => { refetchCustomers(); message.success('已删除'); },
    onError: (err: any) => message.error(err.response?.data?.error || '删除失败'),
  });

  const columns = [
    { title: '排柜编号', dataIndex: 'containerNo', key: 'containerNo', render: (v: string, r: any) => <a onClick={() => navigate(`/containers/${r.id}`)}>{v}</a> },
    { title: '客户', key: 'customer', render: (_: any, r: any) => r.businessCustomer?.realName || r.customer?.realName },
    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.label}</Tag> },
    { title: '关联合同', key: 'contracts', render: (_: any, r: any) => (r.contracts || []).map((cc: any) => <Tag key={cc.contractId} color="blue">{cc.contract?.contractNo}</Tag>) },
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
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>排柜管理</Typography.Title>}
      extra={<Space>
        <DatePicker picker="month" value={dateRange?.[0] as any} onChange={(v) => setDateRange(v ? [v, v] : null)} allowClear format="M月" placeholder="选择月份" />
        <Select allowClear placeholder="客户筛选" style={{ width: 150 }} value={bizCustFilter} onChange={(v) => setBizCustFilter(v)} showSearch optionFilterProp="label"
          options={businessCustomers?.map((c) => ({ label: c.realName, value: c.id }))} />
        <Button onClick={() => setCustMgrOpen(true)}>客户管理</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建排柜</Button>
      </Space>}>
      <Table rowKey="id" columns={columns} dataSource={data?.data} loading={isLoading}
        pagination={{ total: data?.total, pageSize: 20, showSizeChanger: false }} />

      <Modal title="新建排柜" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)}>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="containerNo" label="排柜编号" rules={[{ required: true }]}>
            <Input placeholder="如: PL-20260530-001" />
          </Form.Item>
          <Form.Item name="actualContainerNo" label="车辆货柜号（可选）">
            <Input placeholder="装柜后填写真实货柜号" />
          </Form.Item>
          <Form.Item name="customerName" label="客户" rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder="选择生意客户名（先去客户管理创建）"
              optionFilterProp="label"
              options={businessCustomers?.map((c) => ({ label: c.realName, value: c.realName }))}
            />
          </Form.Item>
          <Form.Item name="toYardTime" label="到柜时间">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="客户管理" open={custMgrOpen} onCancel={() => setCustMgrOpen(false)} footer={null} width={400}>
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input placeholder="新客户名称" value={newCustName} onChange={(e) => setNewCustName(e.target.value)}
            onPressEnter={() => newCustName && createCustMutation.mutate(newCustName)} />
          <Button type="primary" onClick={() => newCustName && createCustMutation.mutate(newCustName)}>新建</Button>
        </Space.Compact>
        <List
          dataSource={businessCustomers}
          renderItem={(item) => (
            <List.Item actions={[
              <Popconfirm title="确定删除？" onConfirm={() => deleteCustMutation.mutate(item.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ]}>
              {item.realName}
            </List.Item>
          )}
          locale={{ emptyText: '暂无客户' }}
        />
      </Modal>
    </Card>
  );
}
