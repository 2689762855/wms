import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Table, Button, Modal, Form, Input, Card, Typography, Space, Upload, message, Popconfirm } from 'antd';
import { PlusOutlined, QrcodeOutlined, PrinterOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../stores/AuthContext';
import apiClient from '../api/client';
import QRCode from 'qrcode';

export default function WarehouseLocations() {
  const { id: warehouseId } = useParams();
  const { user } = useAuth();
  const isOperator = user?.role === 'operator';
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selectedLoc, setSelectedLoc] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const { data: locations, isLoading, refetch } = useQuery({
    queryKey: ['locations', warehouseId],
    queryFn: () => apiClient.get('/locations', { params: { warehouseId } }).then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      editing
        ? apiClient.put(`/locations/${editing.id}`, values)
        : apiClient.post('/locations', { ...values, warehouseId: Number(warehouseId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations', warehouseId] });
      message.success(editing ? '已保存' : '已创建');
      setOpen(false);
      form.resetFields();
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/locations/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['locations', warehouseId] }); message.success('已删除'); },
  });

  useEffect(() => {
    if (selectedLoc?.code) {
      QRCode.toDataURL(selectedLoc.code, { width: 300, margin: 2 }).then(setQrDataUrl);
    }
  }, [selectedLoc]);

  const columns = [
    { title: '库位名称', dataIndex: 'name', key: 'name' },
    {
      title: '二维码', key: 'qr', width: 80, align: 'center' as const,
      render: (_: unknown, r: any) => <Button size="small" icon={<QrcodeOutlined />} onClick={() => setSelectedLoc(r)}>查看</Button>,
    },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_: unknown, r: any) => (
        isOperator ? <span style={{ color: '#999' }}>—</span> : (
        <Space>
          <Button size="small" onClick={() => { setEditing(r); form.setFieldsValue(r); setOpen(true); }}>编辑</Button>
          <Popconfirm title="确认删除?" onConfirm={() => deleteMutation.mutate(r.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
        )
      ),
    },
  ];

  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>库位管理 - 仓库 #{warehouseId}</Typography.Title>}
      extra={!isOperator && (
        <Space>
          <Button icon={<DownloadOutlined />} size="small" onClick={() => apiClient.get('/locations/template', { responseType: 'blob' }).then(res => {
            const url = URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a'); a.href = url; a.download = 'location-template.xlsx'; a.click();
            URL.revokeObjectURL(url);
          })}>下载模板</Button>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={file => {
            const form = new FormData();
            form.append('file', file);
            apiClient.post('/locations/import', form).then(res => {
              message.success(`导入完成：${res.data.created} 个库位`);
              refetch();
            }).catch(err => message.error(err.response?.data?.error || '导入失败'));
            return false;
          }}>
            <Button icon={<UploadOutlined />} size="small">批量导入</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>新增库位</Button>
        </Space>
      )}
    >
      <Table rowKey="id" columns={columns} dataSource={locations} loading={isLoading} pagination={false} scroll={{ x: 500 }} />

      <Modal title={editing ? '编辑库位' : '新增库位'} open={open} onCancel={() => setOpen(false)}
        onOk={() => form.submit()} confirmLoading={saveMutation.isPending}
        style={{ maxWidth: 460 }}
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="name" label="库位名称" rules={[{ required: true }]}>
            <Input placeholder="例如: A区-01架-01层" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="库位二维码" open={!!selectedLoc} onCancel={() => setSelectedLoc(null)} footer={null} style={{ maxWidth: 420 }}>
        {selectedLoc && (
          <div style={{ textAlign: 'center' }}>
            <div ref={printRef}>
              {qrDataUrl && <img src={qrDataUrl} alt="QR" style={{ width: 260, height: 260 }} />}
              <Typography.Title level={5} style={{ marginTop: 12 }}>{selectedLoc.name}</Typography.Title>
              <Typography.Text type="secondary" copyable>{selectedLoc.code}</Typography.Text>
            </div>
            <div style={{ marginTop: 16 }}>
              <Typography.Text type="secondary">
                手机扫描此二维码可快速定位库位，在入库/出库时扫码自动填入仓库和库位信息。
              </Typography.Text>
            </div>
            <Button icon={<PrinterOutlined />} style={{ marginTop: 12 }} onClick={() => {
              const w = window.open('', '_blank');
              if (w) {
                w.document.write(`<html><body style="text-align:center;padding:20px"><h2>${selectedLoc.name}</h2><img src="${qrDataUrl}" style="width:260px;height:260px"/><p>${selectedLoc.code}</p></body></html>`);
                w.print();
              }
            }}>打印二维码</Button>
          </div>
        )}
      </Modal>
    </Card>
  );
}
