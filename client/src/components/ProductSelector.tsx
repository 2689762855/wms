import { useState, useMemo, useEffect } from 'react';
import { Modal, Table, Input, Cascader, Typography, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import { buildTree, toCascaderOptions, getCategoryPath } from '../utils/categoryTree';
import type { Product, Category } from '../types';

interface Props {
  open: boolean;
  onCancel: () => void;
  onOk: (products: Product[]) => void;
  excludeIds?: number[];
}

export default function ProductSelector({ open, onCancel, onOk, excludeIds = [] }: Props) {
  const [keyword, setKeyword] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => apiClient.get('/products', { params: { pageSize: 200 } }).then(r => r.data.data),
    enabled: open,
  });

  const { data: flatCats } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.get('/categories').then(r => r.data),
    enabled: open,
  });

  const catTree = useMemo(() => flatCats ? buildTree(flatCats) : [], [flatCats]);
  const cascaderOptions = useMemo(() => toCascaderOptions(catTree), [catTree]);

  const getDescendantIds = (tree: (Category & { children?: Category[] })[], id: number): number[] => {
    const find = (list: typeof tree): (typeof tree)[0] | null => {
      for (const item of list) {
        if (item.id === id) return item;
        if (item.children?.length) {
          const found = find(item.children);
          if (found) return found;
        }
      }
      return null;
    };
    const collect = (item: typeof tree[0]): number[] => {
      let ids = [item.id];
      if (item.children?.length) for (const child of item.children) ids = ids.concat(collect(child));
      return ids;
    };
    const node = find(tree);
    return node ? collect(node) : [];
  };

  const filtered = useMemo(() => {
    if (!products) return [];
    let list = products.filter((p: Product) => !excludeIds.includes(p.id));
    if (keyword) {
      const kw = keyword.toLowerCase();
      list = list.filter((p: Product) =>
        p.name.toLowerCase().includes(kw) ||
        p.sku?.toLowerCase().includes(kw) ||
        p.barcode?.toLowerCase().includes(kw)
      );
    }
    if (filterCategoryId) {
      const allowedIds = getDescendantIds(catTree, filterCategoryId);
      list = list.filter((p: Product) => p.categoryId && allowedIds.includes(p.categoryId));
    }
    return list;
  }, [products, keyword, filterCategoryId, catTree, excludeIds]);

  useEffect(() => {
    if (!open) {
      setKeyword('');
      setSelectedRowKeys([]);
      setFilterCategoryId(null);
    }
  }, [open]);

  const columns = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130 },
    {
      title: '一级分类', key: 'rootCat', width: 100,
      render: (_: unknown, r: Product) => r.category?.parent?.parent?.name || '-',
    },
    { title: '商品名称', dataIndex: 'name', key: 'name' },
    { title: '规格', dataIndex: 'spec', key: 'spec', width: 80 },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
    { title: '条码', dataIndex: 'barcode', key: 'barcode', width: 120 },
    {
      title: '完整分类', key: 'category', width: 160,
      render: (_: unknown, r: Product) => getCategoryPath(r.category || null),
    },
  ];

  const handleOk = () => {
    if (!products) return;
    const selected = products.filter((p: Product) => selectedRowKeys.includes(p.id));
    onOk(selected);
    setSelectedRowKeys([]);
  };

  return (
    <Modal
      title="选择商品"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      width={900}
      okText={`确认添加${selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}`}
      cancelText="取消"
      destroyOnClose
    >
      <Space wrap style={{ marginBottom: 16, width: '100%' }}>
        <Input.Search
          placeholder="搜索商品名称 / SKU / 条码"
          allowClear
          onSearch={setKeyword}
          onChange={(e) => { if (!e.target.value) setKeyword(''); }}
          style={{ width: 280 }}
        />
        <Cascader
          allowClear
          placeholder="按分类筛选"
          options={cascaderOptions}
          onChange={(val) => {
            if (val?.length) setFilterCategoryId(val[val.length - 1] as number);
            else setFilterCategoryId(null);
          }}
          style={{ width: 220 }}
          changeOnSelect
        />
        <Typography.Text type="secondary">
          已选 {selectedRowKeys.length} 项
        </Typography.Text>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        pagination={false}
        size="small"
        scroll={{ y: 400 }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        locale={{ emptyText: '未找到匹配的商品' }}
      />
    </Modal>
  );
}
