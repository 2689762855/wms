import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Typography, Descriptions, Table, Tag, Button, Space, message, Modal, Input, Select, Popconfirm } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../stores/AuthContext';
import apiClient from '../api/client';
import { getCategoryPath } from '../utils/categoryTree';
import dayjs from 'dayjs';
import type { Location } from '../types';

export default function TransferDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [rejectModal, setRejectModal] = useState({ open: false, reason: '' });
  const [targetLocationId, setTargetLocationId] = useState<number | undefined>();

  const { data: order, isLoading } = useQuery({
    queryKey: ['transfer', id],
    queryFn: () => apiClient.get(`/transfer/${id}`).then(res => res.data),
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiClient.put(`/transfer/${id}/confirm`, { targetLocationId }),
    onSuccess: (data: any) => { message.success('调拨已完成，库存已转移'); queryClient.setQueryData(['transfer', id], data); queryClient.invalidateQueries({ queryKey: ['transfer'] }); queryClient.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (err: any) => message.error(err.response?.data?.error || '确认失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/transfer/${id}`),
    onSuccess: () => { message.success('已删除'); queryClient.invalidateQueries({ queryKey: ['transfer'] }); navigate('/transfer'); },
    onError: (err: any) => message.error(err.response?.data?.error || '删除失败'),
  });

  const { data: targetLocations } = useQuery({
    queryKey: ['locations', order?.toWarehouseId],
    queryFn: () => apiClient.get('/locations', { params: { warehouseId: order.toWarehouseId } }).then(r => r.data as Location[]),
    enabled: !!order?.toWarehouseId && (order?.status === 'pending' || order?.status === 'draft'),
  });

  const approveMutation = useMutation({
    mutationFn: () => apiClient.put(`/transfer/${id}/approve`, { targetLocationId }),
    onSuccess: (data: any) => { message.success('已通过，库存已转移'); queryClient.setQueryData(['transfer', id], data); queryClient.invalidateQueries({ queryKey: ['transfer'] }); queryClient.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (err: any) => message.error(err.response?.data?.error || '审批失败'),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => apiClient.put(`/transfer/${id}/reject`, { reason }),
    onSuccess: (data: any) => { message.success('已拒绝'); queryClient.setQueryData(['transfer', id], data); queryClient.invalidateQueries({ queryKey: ['transfer'] }); setRejectModal({ open: false, reason: '' }); },
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

  const itemColumns = [
    { title: '一级分类', key: 'rootCat', width: 100, render: (_: unknown, r: any) => { const p = getCategoryPath(r.product?.category || null); return p === '-' ? '-' : p.split(' - ')[0]; } },
    { title: 'SKU', dataIndex: ['product', 'sku'], key: 'sku', width: 140 },
    { title: '商品名称', dataIndex: ['product', 'name'], key: 'name' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 60 },
  ];

  if (isLoading) return <Card loading />;

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>调拨单详情</Typography.Title>}
      extra={
        <Space>
          {me?.role === 'tenant_admin' && (order?.status === 'draft' || order?.status === 'pending') && (
            <>
              <Select placeholder="请选择目标库位" style={{ width: 180 }} onChange={setTargetLocationId} value={targetLocationId}
                options={targetLocations?.map((l: any) => ({ label: l.name, value: l.id }))} />
              <Button type="primary" disabled={!targetLocationId} onClick={() => confirmMutation.mutate()} loading={confirmMutation.isPending}>确认调拨（直接转移库存）</Button>
              <Popconfirm title="确定删除此调拨单？" onConfirm={() => deleteMutation.mutate()}>
                <Button danger loading={deleteMutation.isPending}>删除</Button>
              </Popconfirm>
            </>
          )}
          {me?.role !== 'tenant_admin' && (order?.status === 'draft' || order?.status === 'pending') && (
            <>
              <Select placeholder="请选择目标库位" style={{ width: 180 }} onChange={setTargetLocationId} value={targetLocationId}
                options={targetLocations?.map((l: any) => ({ label: l.name, value: l.id }))} />
              <Button type="primary" disabled={!targetLocationId} onClick={() => confirmMutation.mutate()} loading={confirmMutation.isPending}>确认调拨</Button>
              <Popconfirm title="确定删除此调拨单？" onConfirm={() => deleteMutation.mutate()}>
                <Button danger loading={deleteMutation.isPending}>删除</Button>
              </Popconfirm>
            </>
          )}
          {order?.status === 'pending' && order?.toWarehouseId !== me?.warehouseId && me?.role === 'super_admin' && (
            <>
              <Select placeholder="请选择目标库位" style={{ width: 180 }} onChange={setTargetLocationId} value={targetLocationId}
                options={targetLocations?.map((l: Location) => ({ label: l.name, value: l.id }))} />
              <Button type="primary" disabled={!targetLocationId} onClick={() => approveMutation.mutate()} loading={approveMutation.isPending}>通过（超管）</Button>
              <Button danger onClick={() => setRejectModal({ open: true, reason: '' })}>拒绝</Button>
            </>
          )}
          {order?.status === 'pending' && order?.toWarehouseId === me?.warehouseId && me?.role !== 'super_admin' && me?.role !== 'tenant_admin' && (
            <>
              <Select placeholder="请选择目标库位" style={{ width: 180 }} onChange={setTargetLocationId} value={targetLocationId}
                options={targetLocations?.map((l: Location) => ({ label: l.name, value: l.id }))} />
              <Button type="primary" disabled={!targetLocationId} onClick={() => approveMutation.mutate()} loading={approveMutation.isPending}>通过</Button>
              <Button danger onClick={() => setRejectModal({ open: true, reason: '' })}>拒绝</Button>
            </>
          )}
          <Button onClick={() => navigate('/transfer')}>返回</Button>
        </Space>
      }
    >
      <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small" style={{ marginBottom: 24 }}>
        <Descriptions.Item label="单号">{order?.orderNo}</Descriptions.Item>
        <Descriptions.Item label="状态">{statusTag(order?.status)}</Descriptions.Item>
        <Descriptions.Item label="源仓库">{order?.fromWarehouse?.name}</Descriptions.Item>
        <Descriptions.Item label="目标仓库">{order?.toWarehouse?.name}</Descriptions.Item>
        <Descriptions.Item label="操作人">{order?.operator?.realName || '—'}</Descriptions.Item>
        <Descriptions.Item label="备注">{order?.note || '—'}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{dayjs(order?.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
        {order?.status !== 'draft' && (
          <>
            <Descriptions.Item label="审批人">{order?.reviewedBy?.realName || '—'}</Descriptions.Item>
            <Descriptions.Item label="审批时间">{order?.reviewedAt ? dayjs(order.reviewedAt).format('YYYY-MM-DD HH:mm:ss') : '—'}</Descriptions.Item>
            {order?.status === 'rejected' && (
              <Descriptions.Item label="拒绝理由" span={2}>
                <span style={{ color: '#ff4d4f' }}>{order?.reviewNote || '—'}</span>
              </Descriptions.Item>
            )}
          </>
        )}
      </Descriptions>

      <Typography.Title level={5}>商品明细</Typography.Title>
      <Table rowKey="id" columns={itemColumns} dataSource={order?.items} pagination={false} scroll={{ x: 400 }} />

      <Modal title="拒绝理由" open={rejectModal.open} onCancel={() => setRejectModal({ open: false, reason: '' })}
        onOk={() => rejectMutation.mutate(rejectModal.reason)} confirmLoading={rejectMutation.isPending}
      >
        <Input.TextArea rows={3} placeholder="请填写拒绝理由" value={rejectModal.reason} onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })} />
      </Modal>
    </Card>
  );
}
