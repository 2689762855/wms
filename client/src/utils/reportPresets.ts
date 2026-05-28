export const presetOptions = [
  { key: 'manifest', name: '柜货配载清单' },
  { key: 'packing-list', name: '中英文装箱单' },
  { key: 'shipping-detail', name: '出货明细单' },
];

export const presetLabelMap: Record<string, string> = {};
for (const p of presetOptions) {
  presetLabelMap[p.key] = p.name;
}
