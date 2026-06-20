import { useState, useEffect } from 'react';
import { Modal, Table, Button, Input, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import apiClient from '../api/client';

interface Customer {
  id: number;
  name: string;
  phone?: string;
  name2?: string;
  phone2?: string;
  address?: string;
}

export default function CustomerManager() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/receivers');
      setList(res.data);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) fetchList(); }, [open]);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setPhone('');
  };

  const handleSave = async () => {
    if (!name.trim()) return message.warning('请输入领用人名称');
    try {
      if (editing) {
        await apiClient.put(`/receivers/${editing.id}`, { name: name.trim(), phone });
        message.success('已更新');
      } else {
        await apiClient.post('/receivers', { name: name.trim(), phone });
        message.success('已添加');
      }
      resetForm();
      fetchList();
    } catch (e: any) { message.error(e.response?.data?.error || '操作失败'); }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiClient.delete(`/receivers/${id}`);
      message.success('已删除');
      fetchList();
    } catch { message.error('删除失败'); }
  };

  const handleEdit = (row: Customer) => {
    setEditing(row);
    setName(row.name);
    setPhone(row.phone || '');
  };

  const columns = [
    { title: '领用人名称', dataIndex: 'name', key: 'name' },
    { title: '电话', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, row: Customer) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(row)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(row.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Button icon={<UserOutlined />} onClick={() => setOpen(true)}>领用人管理</Button>
      <Modal
        title="领用人管理"
        open={open}
        onCancel={() => { setOpen(false); resetForm(); }}
        footer={null}
        width={720}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Space wrap>
            <Input placeholder="领用人名称" value={name} onChange={e => setName(e.target.value)} style={{ width: 140 }} />
            <Input placeholder="电话" value={phone} onChange={e => setPhone(e.target.value)} style={{ width: 150 }} />
          </Space>
          <Space wrap>
            <Button type="primary" icon={editing ? <EditOutlined /> : <PlusOutlined />} onClick={handleSave}>
              {editing ? '保存' : '添加'}
            </Button>
            {editing && <Button onClick={resetForm}>取消</Button>}
          </Space>
          <Table
            dataSource={list}
            columns={columns}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={false}
            style={{ maxHeight: 300, overflow: 'auto' }}
          />
        </Space>
      </Modal>
    </>
  );
}
