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
  const [name2, setName2] = useState('');
  const [phone2, setPhone2] = useState('');
  const [address, setAddress] = useState('');

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/customers');
      setList(res.data);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) fetchList(); }, [open]);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setPhone('');
    setName2('');
    setPhone2('');
    setAddress('');
  };

  const handleSave = async () => {
    if (!name.trim()) return message.warning('请输入顾客名称');
    try {
      if (editing) {
        await apiClient.put(`/customers/${editing.id}`, { name: name.trim(), phone, name2, phone2, address });
        message.success('已更新');
      } else {
        await apiClient.post('/customers', { name: name.trim(), phone, name2, phone2, address });
        message.success('已添加');
      }
      resetForm();
      fetchList();
    } catch (e: any) { message.error(e.response?.data?.error || '操作失败'); }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiClient.delete(`/customers/${id}`);
      message.success('已删除');
      fetchList();
    } catch { message.error('删除失败'); }
  };

  const handleEdit = (row: Customer) => {
    setEditing(row);
    setName(row.name);
    setPhone(row.phone || '');
    setName2(row.name2 || '');
    setPhone2(row.phone2 || '');
    setAddress(row.address || '');
  };

  const columns = [
    { title: '顾客名称', dataIndex: 'name', key: 'name' },
    { title: '电话', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '-' },
    { title: '地址', dataIndex: 'address', key: 'address', ellipsis: true, render: (v: string) => v || '-' },
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
      <Button icon={<UserOutlined />} onClick={() => setOpen(true)}>顾客管理</Button>
      <Modal
        title="顾客管理"
        open={open}
        onCancel={() => { setOpen(false); resetForm(); }}
        footer={null}
        width={720}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Space wrap>
            <Input placeholder="顾客名称" value={name} onChange={e => setName(e.target.value)} style={{ width: 140 }} />
            <Input placeholder="电话" value={phone} onChange={e => setPhone(e.target.value)} style={{ width: 150 }} />
            <Input placeholder="备用联系人" value={name2} onChange={e => setName2(e.target.value)} style={{ width: 140 }} />
            <Input placeholder="备用电话" value={phone2} onChange={e => setPhone2(e.target.value)} style={{ width: 150 }} />
          </Space>
          <Space wrap>
            <Input placeholder="地址" value={address} onChange={e => setAddress(e.target.value)} style={{ width: 450 }} />
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
