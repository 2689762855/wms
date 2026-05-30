import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Typography, Space, message, Result, Descriptions, Tag, Popconfirm } from 'antd';
import { ArrowLeftOutlined, WarningOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../stores/AuthContext';
import type { CheckTask, CheckItem } from '../../types';

export default function MobileCheckDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'warehouse_admin';

  const [actualQtys, setActualQtys] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reviewNote, setReviewNote] = useState('');

  const { data: task } = useQuery({
    queryKey: ['check-task', id],
    queryFn: () => apiClient.get(`/check-tasks/${id}`).then(r => r.data as CheckTask),
    enabled: !!id,
  });

  // 恢复已填的实际数量
  useEffect(() => {
    if (task?.status === 'in_progress' && task.items) {
      const qts: Record<number, string> = {};
      task.items.forEach((i: CheckItem) => { if (i.actualQty != null) qts[i.id] = String(i.actualQty); });
      setActualQtys(qts);
    }
  }, [task]);

  const handleSubmit = async () => {
    if (!task) return;
    setSubmitting(true);
    try {
      const items = task.items.map(item => ({
        id: item.id,
        actualQty: actualQtys[item.id] !== undefined ? parseInt(actualQtys[item.id]) || 0 : item.actualQty ?? 0,
      }));
      const res = await apiClient.put(`/check-tasks/${task.id}/submit`, { items });
      const updated = res.data as CheckTask;
      queryClient.invalidateQueries({ queryKey: ['check-task', id] });
      queryClient.invalidateQueries({ queryKey: ['check-sub-tasks'] });
      if (updated.status === 'anomaly') {
        message.warning('存在差异，已标记为异常，请在电脑端处理');
      } else {
        message.success('盘点完成');
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const resolveMutation = useMutation({
    mutationFn: (action: 'confirm' | 'reject') =>
      apiClient.put(`/check-tasks/${task?.id}/resolve`, { action, note: action === 'confirm' ? reviewNote : undefined }),
    onSuccess: (res: any) => {
      if (res.data.status === 'completed') { message.success('已确认'); }
      else { message.success('已驳回'); setReviewNote(''); }
      queryClient.invalidateQueries({ queryKey: ['check-task', id] });
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  // 待重盘 / 已确认分区
  const { pendingItems, confirmedItems, diffCount } = useMemo(() => {
    if (!task?.items) return { pendingItems: [], confirmedItems: [], diffCount: 0 };
    if (task.status === 'anomaly') {
      const items = [...task.items];
      items.sort((a, b) => { if ((a.diffQty || 0) && !(b.diffQty || 0)) return -1; if (!(a.diffQty || 0) && (b.diffQty || 0)) return 1; return 0; });
      return { pendingItems: items, confirmedItems: [], diffCount: items.filter(i => i.diffQty && i.diffQty !== 0).length };
    }
    const pending: CheckItem[] = [];
    const confirmed: CheckItem[] = [];
    for (const item of task.items) {
      if (item.actualQty == null) pending.push(item);
      else confirmed.push(item);
    }
    return { pendingItems: pending, confirmedItems: confirmed, diffCount: 0 };
  }, [task]);

  if (!task) return null;

  if (task.status === 'completed' && !(task.items || []).some((i: CheckItem) => i.diffQty && i.diffQty !== 0)) {
    return (
      <Result status="success" title="盘点完成"
        extra={[<Button key="back" onClick={() => navigate('/m/check')} block>返回列表</Button>]}
      />
    );
  }

  const renderItem = (item: CheckItem, isPending: boolean) => {
    const val = task.status === 'in_progress'
      ? (actualQtys[item.id] !== undefined ? actualQtys[item.id] : (item.actualQty?.toString() || ''))
      : '';
    const diff = task.status === 'anomaly'
      ? (item.diffQty ?? 0)
      : (parseInt(val) || item.systemQty) - item.systemQty;
    const hasDiff = diff !== 0;

    return (
      <div key={item.id} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: hasDiff ? '6px 8px' : '6px 0',
        borderRadius: 8, background: hasDiff ? '#fff2f0' : undefined,
        border: hasDiff ? '1px solid #ffccc7' : undefined,
      }}>
        <div style={{ flex: 1 }}>
          <Typography.Text strong>{item.product?.name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
            系统: {item.systemQty}
            {task.status === 'anomaly' && <> · 实盘: {item.actualQty}</>}
            {task.status === 'in_progress' && !isPending && <> · 已确认: {item.actualQty}</>}
          </Typography.Text>
          {hasDiff && task.status === 'anomaly' && (
            <Tag color={diff > 0 ? 'green' : 'red'} style={{ marginTop: 2 }}>{diff > 0 ? `+${diff}` : diff}</Tag>
          )}
        </div>
        {task.status === 'in_progress' && (
          <input type="tel" placeholder="实盘" value={val}
            onChange={e => setActualQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
            style={{ width: 80, textAlign: 'center', fontSize: 18, padding: '8px 4px', border: '1px solid #d9d9d9', borderRadius: 6 }}
          />
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/m/check')} />
        <Typography.Title level={5} style={{ margin: 0 }}>
          {task.location?.name || '无库位'} 盘点
        </Typography.Title>
        {task.status === 'anomaly' && <Tag color="orange" icon={<WarningOutlined />}>异常</Tag>}
      </div>

      <Card size="small" style={{ borderRadius: 8, marginBottom: 12, background: '#e6f7ff' }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="库位">{task.location?.name || '无库位'}（{task.location?.code || '-'}）</Descriptions.Item>
          <Descriptions.Item label="仓库">{task.warehouse?.name}</Descriptions.Item>
          <Descriptions.Item label="项目数">{task.items.length}</Descriptions.Item>
        </Descriptions>
      </Card>

      {task.status === 'in_progress' && confirmedItems.length > 0 && (
        <Card title="数量已确认（可点按调整）" style={{ borderRadius: 8, marginBottom: 12 }} extra={<Tag color="green">无需重盘</Tag>}>
          <Space orientation="vertical" style={{ width: '100%' }} size={12}>
            {confirmedItems.map(item => renderItem(item, false))}
          </Space>
        </Card>
      )}

      {(task.status === 'in_progress' || task.status === 'anomaly') && (
        <Card title={task.status === 'anomaly' ? '异常详情' : (confirmedItems.length > 0 ? '需要重新盘点' : '录入实盘数量')}
          style={{ borderRadius: 8, marginBottom: 12 }}
          bodyStyle={task.status === 'anomaly' ? undefined : undefined}>
          <Space orientation="vertical" style={{ width: '100%' }} size={12}>
            {(task.status === 'anomaly' ? pendingItems : pendingItems.length > 0 ? pendingItems : task.items).map(item => renderItem(item, true))}
          </Space>
        </Card>
      )}

      {task.status === 'in_progress' && (
        <Button type="primary" size="large" block loading={submitting} onClick={handleSubmit} style={{ height: 48, fontSize: 16 }}>
          提交盘点
        </Button>
      )}

      {task.status === 'anomaly' && isAdmin && (
        <Space orientation="vertical" style={{ width: '100%' }} size={8}>
          <input placeholder="填写调整原因/备注" value={reviewNote}
            onChange={e => setReviewNote(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: '1px solid #d9d9d9', borderRadius: 6 }} />
          <Popconfirm title="确认调整库存？" onConfirm={() => resolveMutation.mutate('confirm')}>
            <Button type="primary" size="large" block loading={resolveMutation.isPending}
              style={{ height: 48, fontSize: 16 }} disabled={!reviewNote.trim()}>确认调整</Button>
          </Popconfirm>
          <Popconfirm title="仅数量异常的商品需要重新盘点" onConfirm={() => resolveMutation.mutate('reject')}>
            <Button danger size="large" block loading={resolveMutation.isPending}
              style={{ height: 48, fontSize: 16 }}>驳回重盘</Button>
          </Popconfirm>
        </Space>
      )}

      {task.status === 'anomaly' && !isAdmin && (
        <Card size="small" style={{ borderRadius: 8, background: '#fffbe6', border: '1px solid #ffe58f', textAlign: 'center' }}>
          <WarningOutlined style={{ fontSize: 24, color: '#faad14' }} />
          <div style={{ marginTop: 8 }}>存在 {diffCount} 项差异，请联系管理员处理</div>
        </Card>
      )}
    </div>
  );
}
