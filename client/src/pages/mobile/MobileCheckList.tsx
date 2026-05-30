import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Tag, Typography, Space, Spin, Popconfirm, message } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../stores/AuthContext';
import type { CheckTask } from '../../types';

export default function MobileCheckList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'warehouse_admin';

  const { data: tasksRaw, isLoading, error } = useQuery({
    queryKey: ['check-sub-tasks'],
    queryFn: () => apiClient.get('/check-tasks/sub').then(r => r.data),
    retry: 1,
  });
  const tasks = Array.isArray(tasksRaw) ? tasksRaw as CheckTask[] : [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/check-tasks/${id}`),
    onSuccess: () => {
      message.success('已取消');
      queryClient.invalidateQueries({ queryKey: ['check-sub-tasks'] });
    },
    onError: (err: any) => message.error(err.response?.data?.error || '取消失败'),
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  if (error) return <div style={{ textAlign: 'center', padding: 40, color: '#ff4d4f' }}>加载失败，请检查网络连接</div>;

  return (
    <div>
      <Typography.Title level={5} style={{ margin: '0 0 12px' }}>库位盘点</Typography.Title>

      {tasks?.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无盘点任务，请在电脑端创建</div>
      )}

      <Space orientation="vertical" style={{ width: '100%' }} size={8}>
        {tasks?.map(task => (
          <Card key={task.id} size="small" style={{ borderRadius: 8, cursor: task.status === 'completed' ? 'default' : 'pointer' }}
            onClick={() => { if (task.status !== 'completed') navigate(`/m/check/${task.id}`); }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Typography.Text strong>
                  {task.location?.name || '无库位'}
                </Typography.Text>
                <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                  {task.warehouse?.name} · {task.items?.length || 0} 项
                  {task.location?.code && <span> · {task.location.code}</span>}
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(task.createdAt).toLocaleString('zh-CN')}
                </Typography.Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Tag color={task.status === 'completed' ? 'green' : task.status === 'anomaly' ? 'orange' : 'blue'}>
                  {task.status === 'completed'
                    ? (task.items?.some((i: any) => i.diffQty && i.diffQty !== 0) ? '已完成(有调整)' : '已完成')
                    : task.status === 'anomaly' ? '异常' : '进行中'}
                </Tag>
                {task.status === 'in_progress' && isAdmin && (
                  <Popconfirm title="确定取消？" onConfirm={e => { e?.stopPropagation(); deleteMutation.mutate(task.id); }} onCancel={e => e?.stopPropagation()}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={e => e.stopPropagation()} />
                  </Popconfirm>
                )}
              </div>
            </div>
          </Card>
        ))}
      </Space>
    </div>
  );
}
