import { useState, useEffect } from 'react';
import { Modal, Table, Button, Input, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons';
import apiClient from '../api/client';

interface Supplier {
  id: number;
  name: string;
  contact?: string;
  phone?: string;
}

export default function SupplierManager() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/suppliers');
      setList(res.data);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) fetchList(); }, [open]);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setContact('');
    setPhone('');
  };

  const handleSave = async () => {
    if (!name.trim()) return message.warning('请输入供应商名称');
    try {
      if (editing) {
        await apiClient.put(`/suppliers/${editing.id}`, { name: name.trim(), contact, phone });
        message.success('已更新');
      } else {
        await apiClient.post('/suppliers', { name: name.trim(), contact, phone });
        message.success('已添加');
      }
      resetForm();
      fetchList();
    } catch (e: any) { message.error(e.response?.data?.error || '操作失败'); }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiClient.delete(`/suppliers/${id}`);
      message.success('已删除');
      fetchList();
    } catch { message.error('删除失败'); }
  };

  const handleEdit = (row: Supplier) => {
    setEditing(row);
    setName(row.name);
    setContact(row.contact || '');
    setPhone(row.phone || '');
  };

  const columns = [
    { title: '供应商名称', dataIndex: 'name', key: 'name' },
    { title: '联系人', dataIndex: 'contact', key: 'contact', render: (v: string) => v || '-' },
    { title: '电话', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, row: Supplier) => (
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
      <Button icon={<TeamOutlined />} onClick={() => setOpen(true)}>供应商管理</Button>
      <Modal
        title="供应商管理"
        open={open}
        onCancel={() => { setOpen(false); resetForm(); }}
        footer={null}
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space>
            <Input placeholder="供应商名称" value={name} onChange={e => setName(e.target.value)} style={{ width: 160 }} />
            <Input placeholder="联系人（可选）" value={contact} onChange={e => setContact(e.target.value)} style={{ width: 120 }} />
            <Input placeholder="电话（可选）" value={phone} onChange={e => setPhone(e.target.value)} style={{ width: 120 }} />
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
