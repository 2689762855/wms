import { useState, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Cascader, Space, Card, Typography, Upload, message, Popconfirm, Select, Image, Descriptions } from 'antd';
import { PlusOutlined, UploadOutlined, DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../stores/AuthContext';
import apiClient from '../api/client';
import type { Product, Category, Warehouse } from '../types';
import { buildTree, toCascaderOptions, findPath, getCategoryPath } from '../utils/categoryTree';
import { getServerUrl } from '../utils/serverConfig';

function imgFullUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return (getServerUrl() || '') + path;
}

export default function Products() {
  const { user } = useAuth();
  const isOperator = user?.role === 'operator';
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form] = Form.useForm();
  const [keyword, setKeyword] = useState('');
  const [importWarehouseId, setImportWarehouseId] = useState<number | undefined>();
  const [imageFileList, setImageFileList] = useState<any[]>([]);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const queryClient = useQueryClient();

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiClient.get('/warehouses').then(res => res.data as Warehouse[]),
  });

  const { data: flatCats } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.get('/categories').then(res => res.data),
  });
  const cascaderOptions = useMemo(() => flatCats ? toCascaderOptions(buildTree(flatCats)) : [], [flatCats]);

  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['products', keyword, page],
    queryFn: () => apiClient.get('/products', { params: { keyword, page, pageSize: 20 } }).then(res => res.data),
  });

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      editing
        ? apiClient.put(`/products/${editing!.id}`, values)
        : apiClient.post('/products', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      message.success(editing ? '已保存' : '已创建');
      setOpen(false);
      form.resetFields();
    },
    onError: (err: any) => message.error(err.response?.data?.error || '操作失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      message.success('已删除');
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setImageFileList([]);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    const values: Record<string, unknown> = { ...p };
    if (p.categoryId && flatCats) {
      const tree = buildTree(flatCats);
      const path = findPath(tree, p.categoryId);
      if (path) values.categoryId = path;
    }
    form.setFieldsValue(values);
    setImageFileList((p as any).imageUrl ? [{ uid: '-1', name: '商品图片', status: 'done', url: (p as any).imageUrl }] : []);
    setOpen(true);
  };

  const columns = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
    { title: '商品名称', dataIndex: 'name', key: 'name',
      render: (name: string, record: Product) => (
        <Typography.Link onClick={() => setViewProduct(record)}>{name}</Typography.Link>
      ),
    },
    { title: '规格', dataIndex: 'spec', key: 'spec' },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
    { title: '条码', dataIndex: 'barcode', key: 'barcode', width: 130 },
    { title: '安全库存', dataIndex: 'safetyStock', key: 'safetyStock', width: 80 },
    { title: '分类', key: 'category', width: 180,
      render: (_: unknown, r: Product) => r.category ? getCategoryPath(r.category) : '-',
    },
    {
      title: '操作', key: 'actions', width: 150,
      render: (_: unknown, record: Product) => (
        isOperator ? <span style={{ color: '#999' }}>—</span> : (
        <Space>
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
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>商品管理</Typography.Title>}
      extra={!isOperator && (
        <Space>
          <Button icon={<DownloadOutlined />} onClick={() => apiClient.get('/products/template', { responseType: 'blob' }).then(res => {
            const url = URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a'); a.href = url; a.download = 'product-template.xlsx'; a.click();
            URL.revokeObjectURL(url);
          }).catch(() => message.error('下载失败，请重试'))}>下载模板</Button>
          <Select
            placeholder="选择入库仓库"
            allowClear
            style={{ width: 160 }}
            value={importWarehouseId}
            onChange={setImportWarehouseId}
            options={warehouses?.map((w: Warehouse) => ({ label: w.name, value: w.id }))}
          />
          <Upload accept=".xlsx,.xls,.csv" showUploadList={false} beforeUpload={file => {
            if (!importWarehouseId) { message.error('请先选择入库仓库'); return false; }
            const form = new FormData();
            form.append('file', file);
            form.append('warehouseId', String(importWarehouseId));
            apiClient.post('/products/import', form).then(res => {
              const { created, stockAdded, errors } = res.data;
              message.success(`导入完成：新增 ${created} 个商品，入库 ${stockAdded} 条`);
              if (errors?.length) message.warning(errors.join('; '));
              queryClient.invalidateQueries({ queryKey: ['products'] });
            }).catch(err => message.error(err.response?.data?.error || '导入失败'));
            return false;
          }}>
            <Button icon={<UploadOutlined />}>批量导入</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增商品</Button>
        </Space>
      )}>
      <Input.Search placeholder="搜索商品名称/SKU/条码" allowClear onSearch={setKeyword} style={{ marginBottom: 16, maxWidth: '100%', width: 300 }} />
      <Table rowKey="id" columns={columns} dataSource={data?.data} loading={isLoading}
        pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 1000 }}
        size="small"
      />
      <Modal title={editing ? '编辑商品' : '新增商品'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={saveMutation.isPending} width={undefined} style={{ maxWidth: 600 }}>
        <Form form={form} layout="vertical" onFinish={(values) => {
          const data = { ...values };
          if (Array.isArray(data.categoryId)) data.categoryId = data.categoryId[data.categoryId.length - 1];
          saveMutation.mutate(data);
        }}>
          <Form.Item name="name" label="商品名称" rules={[{ required: true, message: '请输入商品名称' }]}>
            <Input />
          </Form.Item>
          <Space size="middle">
            <Form.Item name="spec" label="规格">
              <Input placeholder="例如: 500ml" />
            </Form.Item>
            <Form.Item name="unit" label="单位" initialValue="pcs">
              <Input placeholder="pcs" />
            </Form.Item>
          </Space>
          <Form.Item name="barcode" label="条码">
            <Input placeholder="扫描或手动输入" />
          </Form.Item>
          <Form.Item name="categoryId" label="分类">
            <Cascader allowClear placeholder="选择分类" options={cascaderOptions} changeOnSelect />
          </Form.Item>
          <Form.Item name="imageUrl" label="商品图片" style={{ display: 'none' }}>
            <Input />
          </Form.Item>
          <Form.Item label="商品图片">
            <Upload
              accept="image/*"
              maxCount={1}
              listType="picture-card"
              fileList={imageFileList}
              customRequest={async ({ file, onSuccess, onError }) => {
                const formData = new FormData();
                formData.append('image', file as File);
                try {
                  const res = await apiClient.post('/products/upload-image', formData);
                  if (onSuccess) onSuccess(res.data);
                } catch (err: any) {
                  if (onError) onError(err);
                  message.error('上传失败');
                }
              }}
              onChange={({ fileList: newList }) => {
                const fixed = newList.map(f => {
                  if (!f.url && f.response?.imageUrl) f.url = f.response.imageUrl;
                  return f;
                });
                setImageFileList(fixed);
                if (fixed[0]?.status === 'done' && fixed[0]?.response?.imageUrl) {
                  form.setFieldsValue({ imageUrl: fixed[0].response.imageUrl });
                } else if (fixed.length === 0) {
                  form.setFieldsValue({ imageUrl: '' });
                }
              }}
            >
              {imageFileList.length === 0 ? (
                <div>
                  <InboxOutlined />
                  <div style={{ marginTop: 8 }}>点击或拖拽上传</div>
                </div>
              ) : null}
            </Upload>
          </Form.Item>
          <Space size="middle">
            <Form.Item name="safetyStock" label="安全库存" initialValue={0}>
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="costPrice" label="成本价">
              <InputNumber min={0} precision={2} prefix="¥" />
            </Form.Item>
            <Form.Item name="salePrice" label="售价">
              <InputNumber min={0} precision={2} prefix="¥" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
      <Modal
        title="商品详情"
        open={!!viewProduct}
        onCancel={() => setViewProduct(null)}
        footer={<Button onClick={() => setViewProduct(null)}>关闭</Button>}
        width={560}
      >
        {viewProduct && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {viewProduct.imageUrl && (
              <div style={{ textAlign: 'center' }}>
                <Image src={imgFullUrl(viewProduct.imageUrl)} alt={viewProduct.name} style={{ maxHeight: 300 }} />
              </div>
            )}
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="SKU">{viewProduct.sku}</Descriptions.Item>
              <Descriptions.Item label="商品名称">{viewProduct.name}</Descriptions.Item>
              <Descriptions.Item label="规格">{viewProduct.spec || '-'}</Descriptions.Item>
              <Descriptions.Item label="单位">{viewProduct.unit}</Descriptions.Item>
              <Descriptions.Item label="条码">{viewProduct.barcode || '-'}</Descriptions.Item>
              <Descriptions.Item label="安全库存">{viewProduct.safetyStock}</Descriptions.Item>
              <Descriptions.Item label="成本价">{viewProduct.costPrice != null ? `¥${viewProduct.costPrice}` : '-'}</Descriptions.Item>
              <Descriptions.Item label="售价">{viewProduct.salePrice != null ? `¥${viewProduct.salePrice}` : '-'}</Descriptions.Item>
            </Descriptions>
          </Space>
        )}
      </Modal>
    </Card>
  );
}
