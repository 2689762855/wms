import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Card, Typography, Space, Modal, Input, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../stores/AuthContext';
import apiClient from '../api/client';
import type { TransferOrder } from '../types';
import dayjs from 'dayjs';

export default function TransferList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; id: number; reason: string }>({ open: false, id: 0, reason: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['transfer', page],
    queryFn: () => apiClient.get('/transfer', { params: { page, pageSize: 20 } }).then(r => r.data),
  });

  const submitMutation = useMutation({
    mutationFn: (id: number) => apiClient.put(`/transfer/${id}/submit`),
    onSuccess: () => { message.success('已提交审批'); queryClient.invalidateQueries({ queryKey: ['transfer'] }); },
    onError: (err: any) => message.error(err.response?.data?.error || '提交失败'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiClient.put(`/transfer/${id}/approve`),
    onSuccess: () => { message.success('已通过'); queryClient.invalidateQueries({ queryKey: ['transfer'] }); queryClient.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (err: any) => message.error(err.response?.data?.error || '审批失败'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => apiClient.put(`/transfer/${id}/reject`, { reason }),
    onSuccess: () => { message.success('已拒绝'); queryClient.invalidateQueries({ queryKey: ['transfer'] }); setRejectModal({ open: false, id: 0, reason: '' }); },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const statusTag = (s: string) => {
    const map: Record<string, { color: string; text: string }> = {
      draft: { color: 'default', text: '草稿' },
      pending: { color: 'processing', text: '待审批' },
      approved: { color: 'green', text: '已通过' },
      rejected: { color: 'red', text: '已拒绝' },
    };
    const m = map[s] || { color: 'default', text: s };
    return <Tag color={m.color}>{m.text}</Tag>;
  };

  const columns = [
    { title: '单号', dataIndex: 'orderNo', key: 'orderNo', width: 160, render: (no: string, r: TransferOrder) => <a onClick={() => navigate(`/transfer/${r.id}`)}>{no}</a> },
    { title: '源仓库', dataIndex: ['fromWarehouse', 'name'], key: 'from' },
    { title: '目标仓库', dataIndex: ['toWarehouse', 'name'], key: 'to' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => statusTag(s) },
    { title: '操作人', dataIndex: ['operator', 'realName'], key: 'op' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 160, render: (t: string) => dayjs(t).format('MM-DD HH:mm') },
    { title: '操作', key: 'actions', width: 200, render: (_: unknown, r: TransferOrder) => (
      <Space>
        {r.status === 'draft' && <Button size="small" type="primary" onClick={() => submitMutation.mutate(r.id)} loading={submitMutation.isPending}>提交</Button>}
        {r.status === 'pending' && r.toWarehouseId === me?.warehouseId && (
          <>
            <Button size="small" type="primary" onClick={() => approveMutation.mutate(r.id)} loading={approveMutation.isPending}>通过</Button>
            <Button size="small" danger onClick={() => setRejectModal({ open: true, id: r.id, reason: '' })}>拒绝</Button>
          </>
        )}
        {r.status === 'pending' && r.toWarehouseId !== me?.warehouseId && me?.role !== 'super_admin' && <Tag color="processing">等待目标仓审批</Tag>}
        {r.status === 'approved' && <Tag color="green">已完成</Tag>}
        {r.status === 'rejected' && <span title={r.reviewNote}>已拒绝: {r.reviewNote?.slice(0, 15)}{(r.reviewNote?.length || 0) > 15 ? '...' : ''}</span>}
      </Space>
    )},
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>调拨管理</Typography.Title>} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/transfer/new')}>新建调拨单</Button>}>
      <Table rowKey="id" columns={columns} dataSource={data?.data} loading={isLoading}
        pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 1000 }}
      />
      <Modal title="拒绝理由" open={rejectModal.open} onCancel={() => setRejectModal({ open: false, id: 0, reason: '' })} onOk={() => rejectMutation.mutate({ id: rejectModal.id, reason: rejectModal.reason })} confirmLoading={rejectMutation.isPending}>
        <Input.TextArea rows={3} placeholder="请填写拒绝理由" value={rejectModal.reason} onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })} />
      </Modal>
    </Card>
  );
}
