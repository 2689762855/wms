import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, Button, InputNumber, Input, Card, Typography, Tag, message, Space, Popconfirm } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import { useAuth } from '../stores/AuthContext';
import type { CheckItem, CheckTask } from '../types';
import dayjs from 'dayjs';

function statusTag(s: string) {
  if (s === 'completed') return <Tag color="green">已完成</Tag>;
  if (s === 'anomaly') return <Tag color="orange">异常</Tag>;
  return <Tag color="processing">进行中</Tag>;
}

export default function CheckTaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'warehouse_admin' || user?.role === 'tenant_admin';
  const [actualQtys, setActualQtys] = useState<Record<number, number>>({});
  const [reviewNote, setReviewNote] = useState('');
  const [selectedSub, setSelectedSub] = useState<number | null>(null);

  const { data: task, isLoading } = useQuery({
    queryKey: ['check-task', id],
    queryFn: () => apiClient.get(`/check-tasks/${id}`).then(r => r.data as CheckTask),
  });

  const isMaster = !task?.parentTaskId;
  const subTasks = task?.subTasks || [];
  const selectedSubTask = selectedSub ? subTasks.find(s => s.id === selectedSub) : null;

  const submitMutation = useMutation({
    mutationFn: (items: { id: number; actualQty: number }[]) =>
      apiClient.put(`/check-tasks/${selectedSub}/submit`, { items }),
    onSuccess: () => {
      message.success('已提交');
      queryClient.invalidateQueries({ queryKey: ['check-task', id] });
      setSelectedSub(null);
    },
    onError: (err: any) => message.error(err.response?.data?.error || '提交失败'),
  });

  const resolveMutation = useMutation({
    mutationFn: (action: 'confirm' | 'reject') =>
      apiClient.put(`/check-tasks/${selectedSub}/resolve`, { action, note: action === 'confirm' ? reviewNote : undefined }),
    onSuccess: (res: any) => {
      message.success(res.data.status === 'completed' ? '已确认' : '已驳回');
      queryClient.invalidateQueries({ queryKey: ['check-task', id] });
      setSelectedSub(null);
      setReviewNote('');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const reopenMutation = useMutation({
    mutationFn: (subId: number) => apiClient.put(`/check-tasks/${subId}/reopen`),
    onSuccess: () => {
      message.success('已重开');
      queryClient.invalidateQueries({ queryKey: ['check-task', id] });
    },
    onError: (err: any) => message.error(err.response?.data?.error || '重开失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/check-tasks/${id}`),
    onSuccess: () => { message.success('已取消'); queryClient.invalidateQueries({ queryKey: ['check-tasks'] }); navigate('/check-tasks'); },
    onError: (err: any) => message.error(err.response?.data?.error || '取消失败'),
  });

  // 子任务汇总表格
  const subColumns = [
    { title: '库位', key: 'loc', render: (_: unknown, r: CheckTask) => r.location?.name || '无库位' },
    { title: '编码', dataIndex: ['location', 'code'], key: 'code', render: (v: string) => v || '-' },
    { title: '状态', key: 'status', render: (_: unknown, r: CheckTask) => statusTag(r.status) },
    {
      title: '差异', key: 'diff', render: (_: unknown, r: CheckTask) => {
        const diffCount = (r.items || []).filter((i: any) => i.diffQty && i.diffQty !== 0).length;
        return diffCount > 0 ? <Tag color="orange">{diffCount}项</Tag> : <span style={{ color: '#999' }}>0</span>;
      },
    },
    { title: '备注', dataIndex: 'reviewNote', key: 'note', render: (v: string) => v ? <span style={{ color: '#666' }}>{v}</span> : '-' },
    {
      title: '操作', key: 'actions', render: (_: unknown, r: CheckTask) => (
        <Space size={4}>
          {r.status === 'in_progress' && <Button size="small" type="primary" onClick={() => setSelectedSub(r.id)}>录入</Button>}
          {r.status === 'anomaly' && isAdmin && <Button size="small" onClick={() => setSelectedSub(r.id)}>处理</Button>}
          {r.status === 'completed' && <Button size="small" onClick={() => setSelectedSub(r.id)}>查看</Button>}
          {r.status === 'completed' && isAdmin && task?.status !== 'completed' && (
            <Popconfirm title="重开此库位盘点？" onConfirm={() => reopenMutation.mutate(r.id)}>
              <Button size="small">重开</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // 子任务详情内的物品表格
  const itemColumns = [
    { title: 'SKU', dataIndex: ['product', 'sku'], key: 'sku' },
    { title: '商品名称', dataIndex: ['product', 'name'], key: 'name' },
    { title: '系统库存', dataIndex: 'systemQty', key: 'systemQty' },
    {
      title: '实际数量', dataIndex: 'actualQty', key: 'actualQty',
      render: (v: number | null, r: CheckItem) => {
        if (selectedSubTask?.status === 'completed' || selectedSubTask?.status === 'anomaly')
          return <span style={{ fontWeight: 'bold', color: (r.diffQty && r.diffQty !== 0) ? '#ff4d4f' : undefined }}>{v ?? '—'}</span>;
        return <InputNumber min={0} value={actualQtys[r.id] ?? r.systemQty} onChange={val => setActualQtys({ ...actualQtys, [r.id]: val || 0 })} />;
      },
    },
    {
      title: '差异', dataIndex: 'diffQty', key: 'diffQty',
      render: (v: number | null) => {
        if (v == null || v === 0) return <span style={{ color: '#999' }}>0</span>;
        return <Tag color={v > 0 ? 'green' : 'red'}>{v > 0 ? `+${v}` : v}</Tag>;
      },
    },
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>盘点详情</Typography.Title>}
      extra={
        <Space>
          {isMaster && task?.status !== 'completed' && isAdmin && (
            <>
              {subTasks.length > 0 && subTasks.every(s => s.status === 'completed') && (
                <Popconfirm title="最终确定后数据将锁定为只读，子任务从手机端移除" onConfirm={() => {
                  apiClient.put(`/check-tasks/${id}/finalize`).then(() => {
                    message.success('盘点已最终确定');
                    queryClient.invalidateQueries({ queryKey: ['check-task', id] });
                    queryClient.invalidateQueries({ queryKey: ['check-tasks'] });
                  }).catch((err: any) => message.error(err.response?.data?.error || '操作失败'));
                }}>
                  <Button type="primary">最终确定</Button>
                </Popconfirm>
              )}
              <Popconfirm title="确定取消此盘点任务？将删除所有子任务" onConfirm={() => deleteMutation.mutate()}>
                <Button danger loading={deleteMutation.isPending}>取消任务</Button>
              </Popconfirm>
            </>
          )}
          <Button onClick={() => { selectedSub ? setSelectedSub(null) : navigate('/check-tasks'); }}>
            {selectedSub ? '返回汇总' : '返回列表'}
          </Button>
        </Space>
      }
    >
      {selectedSub && selectedSubTask ? (
        <>
          <Space wrap style={{ marginBottom: 8 }}>
            <span>库位: <strong>{selectedSubTask.location?.name || '无库位'}</strong></span>
            <span>仓库: <strong>{task?.warehouse?.name}</strong></span>
            <span>状态: {statusTag(selectedSubTask.status)}</span>
          </Space>
          <Table rowKey="id" columns={itemColumns} dataSource={selectedSubTask.items} loading={isLoading} pagination={false} scroll={{ x: 600 }} />

          <div style={{ marginTop: 16 }}>
            {selectedSubTask.status === 'in_progress' && (
              <Button type="primary" onClick={() => {
                const items = (selectedSubTask.items || []).map((i: CheckItem) => ({
                  id: i.id, actualQty: actualQtys[i.id] ?? i.systemQty,
                }));
                submitMutation.mutate(items);
              }} loading={submitMutation.isPending}>提交盘点</Button>
            )}
            {selectedSubTask.status === 'anomaly' && isAdmin && (
              <Space>
                <Input placeholder="填写调整原因" value={reviewNote} onChange={e => setReviewNote(e.target.value)} style={{ width: 200 }} />
                <Popconfirm title="确认调整库存？" onConfirm={() => resolveMutation.mutate('confirm')}>
                  <Button type="primary" loading={resolveMutation.isPending} disabled={!reviewNote.trim()}>确认调整</Button>
                </Popconfirm>
                <Popconfirm title="驳回后异常项回到进行中" onConfirm={() => resolveMutation.mutate('reject')}>
                  <Button danger loading={resolveMutation.isPending}>驳回重盘</Button>
                </Popconfirm>
              </Space>
            )}
          </div>
        </>
      ) : (
        <>
          <Space wrap style={{ marginBottom: 8 }}>
            <span>仓库: <strong>{task?.warehouse?.name}</strong></span>
            <span>任务状态: {statusTag(task?.status || '')}</span>
            <span>创建人: <strong>{task?.operator?.realName || '—'}</strong></span>
            <span>创建: {task && dayjs(task.createdAt).format('YYYY-MM-DD HH:mm')}</span>
            {task?.reviewNote && <Tag>备注: {task.reviewNote}</Tag>}
          </Space>
          {isMaster && task?.status !== 'completed' && subTasks.length > 0 && subTasks.every(s => s.status === 'completed') && isAdmin && (
            <div style={{ background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>全部 {subTasks.length} 个库位已完成盘点，确认数据无误后点击「最终确定」锁定结果</span>
              <Popconfirm title="最终确定后数据将锁定为只读" onConfirm={() => {
                apiClient.put(`/check-tasks/${id}/finalize`).then(() => {
                  message.success('盘点已最终确定');
                  queryClient.invalidateQueries({ queryKey: ['check-task', id] });
                  queryClient.invalidateQueries({ queryKey: ['check-tasks'] });
                }).catch((err: any) => message.error(err.response?.data?.error || '操作失败'));
              }}>
                <Button type="primary" size="large">最终确定</Button>
              </Popconfirm>
            </div>
          )}
          <Typography.Title level={5}>库位子任务</Typography.Title>
          <Table rowKey="id" columns={subColumns} dataSource={subTasks} loading={isLoading} pagination={false} size="small" />
        </>
      )}
    </Card>
  );
}
