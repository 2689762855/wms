import { useState, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Card, Typography, message, Popconfirm } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../stores/AuthContext';
import apiClient from '../api/client';
import type { Category } from '../types';

// 从平铺列表建树
function buildTree(list: Category[]): Category[] {
  const map = new Map<number, Category>();
  const roots: Category[] = [];
  for (const item of list) map.set(item.id, { ...item, children: [] });
  for (const item of map.values()) {
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children!.push(item);
    } else roots.push(item);
  }
  return roots;
}

// 把树转为带缩进的选择项
function flattenOptions(list: Category[], level = 0): { label: string; value: number }[] {
  const result: { label: string; value: number }[] = [];
  for (const item of list) {
    const prefix = level > 0 ? '　'.repeat(level - 1) + '└ ' : '';
    result.push({ label: prefix + item.name, value: item.id });
    if (item.children?.length) result.push(...flattenOptions(item.children, level + 1));
  }
  return result;
}

export default function Categories() {
  const { user } = useAuth();
  const isOperator = user?.role === 'operator';
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: flatList, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.get('/categories').then(res => res.data),
  });

  const tree = useMemo(() => flatList ? buildTree(flatList) : [], [flatList]);
  const selectOptions = useMemo(() => flattenOptions(tree), [tree]);

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      editing
        ? apiClient.put(`/categories/${editing!.id}`, values)
        : apiClient.post('/categories', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      message.success(editing ? '已保存' : '已创建');
      setOpen(false);
      form.resetFields();
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      message.success('已删除');
    },
    onError: (err: any) => message.error(err.response?.data?.error || '删除失败'),
  });

  const openCreate = (parentId?: number) => {
    setEditing(null);
    form.resetFields();
    if (parentId) form.setFieldsValue({ parentId });
    setOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    form.setFieldsValue({ parentId: c.parentId, name: c.name });
    setOpen(true);
  };

  const columns = [
    { title: '分类名称', dataIndex: 'name', key: 'name' },
    {
      title: '操作', key: 'actions',
      render: (_: unknown, record: Category) => (
        isOperator ? <span style={{ color: '#999' }}>—</span> : (
        <Space>
          <Button size="small" onClick={() => openCreate(record.id)}>添加子分类</Button>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除?" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
        )
      ),
    },
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>商品分类</Typography.Title>} extra={!isOperator && <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>新增分类</Button>}>
      <Table rowKey="id" columns={columns} dataSource={tree} loading={isLoading} pagination={false} scroll={{ x: 400 }} />
      <Modal title={editing ? '编辑分类' : '新增分类'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={saveMutation.isPending}>
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="parentId" label="上级分类">
            <Select allowClear placeholder="留空即为顶级分类" options={selectOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
