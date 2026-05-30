export const presetOptions = [
  { key: 'manifest', name: '排柜配载清单' },
  { key: 'packing-list', name: '中英文装箱单' },
  { key: 'shipping-detail', name: '出货明细单' },
];

export const presetLabelMap: Record<string, string> = {};
for (const p of presetOptions) {
  presetLabelMap[p.key] = p.name;
}

// ===== Excel 导出模板 =====

export interface ExcelColumn {
  key: string;
  label: string;
  width: number;
}

export interface ExcelTemplate {
  columns: ExcelColumn[];
}

export const allColumnKeys = ['index', 'sku', 'name', 'spec', 'unit', 'plannedQty', 'actualQty', 'returnedQty', 'unitPrice', 'amount', 'mark', 'gw', 'nw', 'cbm', 'remark'];

export const allColumnLabels: Record<string, string> = {
  index: '序号', sku: 'SKU', name: '品名', spec: '规格', unit: '单位',
  plannedQty: '计划数量', actualQty: '实装数量', returnedQty: '差异',
  unitPrice: '合同单价', amount: '金额',
  mark: '唛头', gw: '毛重(KG)', nw: '净重(KG)', cbm: '体积(CBM)', remark: '备注',
};

export const excelPresets: Record<string, ExcelTemplate> = {
  full: {
    columns: [
      { key: 'index', label: '序号', width: 6 },
      { key: 'sku', label: 'SKU', width: 14 },
      { key: 'name', label: '品名', width: 16 },
      { key: 'spec', label: '规格', width: 10 },
      { key: 'unit', label: '单位', width: 6 },
      { key: 'plannedQty', label: '计划数量', width: 10 },
      { key: 'actualQty', label: '实装数量', width: 10 },
      { key: 'returnedQty', label: '差异', width: 8 },
      { key: 'remark', label: '备注', width: 12 },
    ],
  },
  simple: {
    columns: [
      { key: 'index', label: '序号', width: 6 },
      { key: 'sku', label: 'SKU', width: 14 },
      { key: 'name', label: '品名', width: 20 },
      { key: 'actualQty', label: '实装数量', width: 10 },
      { key: 'remark', label: '备注', width: 16 },
    ],
  },
  reconciliation: {
    columns: [
      { key: 'index', label: '序号', width: 6 },
      { key: 'sku', label: 'SKU', width: 14 },
      { key: 'name', label: '品名', width: 16 },
      { key: 'spec', label: '规格', width: 10 },
      { key: 'unit', label: '单位', width: 6 },
      { key: 'actualQty', label: '实装数量', width: 10 },
      { key: 'returnedQty', label: '短装数量', width: 10 },
      { key: 'remark', label: '备注', width: 12 },
    ],
  },
};

export const excelPresetNames: Record<string, string> = {
  full: '全部字段',
  simple: '简易清单',
  reconciliation: '对账明细',
};

export const defaultExcelTemplate: ExcelTemplate = excelPresets.full;
