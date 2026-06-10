import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Table, Button, Modal, Form, Input, Card, Typography, Space, message, Popconfirm, Segmented } from 'antd';
import { PlusOutlined, QrcodeOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../stores/AuthContext';
import apiClient from '../api/client';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

export default function WarehouseLocations() {
  const { id: warehouseId } = useParams();
  const { user } = useAuth();
  const isOperator = user?.role === 'operator';
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selectedLoc, setSelectedLoc] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [labelType, setLabelType] = useState<'qr' | 'barcode'>('qr');
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  const barcodeCanvasRef = useRef<HTMLCanvasElement>(null);

  const { data: locations, isLoading } = useQuery({
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
    onError: (err: any) => message.error(err.response?.data?.error || '删除失败'),
  });

  useEffect(() => {
    if (selectedLoc?.code) {
      QRCode.toDataURL(selectedLoc.code, { width: 300, margin: 2 }).then(setQrDataUrl);
      // 条形码需要等 canvas 挂载后渲染
      if (labelType === 'barcode') {
        setTimeout(() => {
          if (barcodeCanvasRef.current) {
            JsBarcode(barcodeCanvasRef.current, selectedLoc.code, {
              format: 'CODE128',
              width: 2,
              height: 80,
              displayValue: true,
              fontSize: 14,
              margin: 10,
            });
          }
        }, 50);
      }
    }
  }, [selectedLoc, labelType]);

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
      extra={!isOperator && <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>新增库位</Button>}
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

      <Modal title="库位标签" open={!!selectedLoc} onCancel={() => { setSelectedLoc(null); setLabelType('qr'); }} footer={null} style={{ maxWidth: 420 }}>
        {selectedLoc && (
          <div style={{ textAlign: 'center' }}>
            <Segmented
              value={labelType}
              onChange={(val) => setLabelType(val as 'qr' | 'barcode')}
              options={[
                { label: '二维码', value: 'qr' },
                { label: '条形码', value: 'barcode' },
              ]}
              style={{ marginBottom: 16 }}
            />
            <div ref={printRef}>
              {labelType === 'qr' ? (
                qrDataUrl && <img src={qrDataUrl} alt="QR" style={{ width: 260, height: 260 }} />
              ) : (
                <canvas ref={barcodeCanvasRef} style={{ maxWidth: '100%' }} />
              )}
              <Typography.Title level={5} style={{ marginTop: 12 }}>{selectedLoc.name}</Typography.Title>
              <Typography.Text type="secondary" copyable>{selectedLoc.code}</Typography.Text>
            </div>
            <div style={{ marginTop: 16 }}>
              <Typography.Text type="secondary">
                手机扫描此{labelType === 'qr' ? '二维码' : '条形码'}可快速定位库位，在入库/出库时扫码自动填入仓库和库位信息。
              </Typography.Text>
            </div>
            <Button icon={<PrinterOutlined />} style={{ marginTop: 12 }} onClick={() => {
                const labelName = labelType === 'qr' ? '二维码' : '条形码';
                const imgSrc = labelType === 'qr'
                  ? qrDataUrl
                  : (barcodeCanvasRef.current ? barcodeCanvasRef.current.toDataURL() : '');
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{text-align:center;padding:20px;font-family:sans-serif}img{display:block;margin:0 auto}</style></head><body><h2>${selectedLoc.name}</h2><p style="color:#666;margin-bottom:12px">${labelName}</p><img src="${imgSrc}" style="${labelType === 'qr' ? 'width:260px;height:260px' : 'max-width:100%'}"/><p style="font-size:14px">${selectedLoc.code}</p></body></html>`;
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const w = window.open(url, '_blank');
                const printAndClose = () => { if (w && !w.closed) w.print(); URL.revokeObjectURL(url); };
                if (w) {
                  try { w.onload = printAndClose; } catch {}
                  // 兜底：300ms 后强制弹出打印
                  setTimeout(printAndClose, 300);
                } else {
                  URL.revokeObjectURL(url);
                }
            }}>打印{labelType === 'qr' ? '二维码' : '条形码'}</Button>
          </div>
        )}
      </Modal>
    </Card>
  );
}
