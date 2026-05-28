import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Spin, Modal, Input, message, Select, Checkbox, Button, Space } from 'antd';
import apiClient from '../api/client';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { presetOptions, presetLabelMap, excelPresets, defaultExcelTemplate, allColumnKeys, allColumnLabels, type ExcelColumn } from '../utils/reportPresets';

export default function ContainerReport() {
  const { id } = useParams<{ id: string }>();
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState('');
  const [excelEditOpen, setExcelEditOpen] = useState(false);
  const [excelColumns, setExcelColumns] = useState<ExcelColumn[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['container-report', id],
    queryFn: () => apiClient.get(`/containers/${id}/report`).then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (template: string) => apiClient.put(`/customers/${data.customerId}/template`, { template }),
    onSuccess: () => { message.success('模板已保存'); setEditOpen(false); },
    onError: (err: any) => message.error(err.response?.data?.error || '保存失败'),
  });

  const presetMutation = useMutation({
    mutationFn: (preset: string | null) => apiClient.put(`/customers/${data.customerId}/template-preset`, { preset }),
    onSuccess: () => { message.success('模板已切换'); window.location.reload(); },
    onError: (err: any) => message.error(err.response?.data?.error || '切换失败'),
  });

  const excelPresetMutation = useMutation({
    mutationFn: (preset: string | null) => apiClient.put(`/customers/${data.customerId}/excel-preset`, { preset }),
    onSuccess: () => { message.success('Excel 模板已切换'); window.location.reload(); },
    onError: (err: any) => message.error(err.response?.data?.error || '切换失败'),
  });

  const excelSaveMutation = useMutation({
    mutationFn: (exportTemplate: string | null) =>
      apiClient.put(`/customers/${data.customerId}/export-template`, { exportTemplate }),
    onSuccess: () => { message.success('Excel 模板已保存'); setExcelEditOpen(false); },
    onError: (err: any) => message.error(err.response?.data?.error || '保存失败'),
  });

  useEffect(() => {
    if (data) {
      setTimeout(() => window.print(), 500);
    }
  }, [data]);

  // Excel 导出列配置：优先自定义 → 预设 → 默认
  const activeColumns = useMemo((): ExcelColumn[] => {
    if (!data) return defaultExcelTemplate.columns;
    if (data.exportTemplate) {
      try {
        const parsed = JSON.parse(data.exportTemplate);
        if (parsed && Array.isArray(parsed.columns)) return parsed.columns;
      } catch {}
    }
    if (data.excelPreset && excelPresets[data.excelPreset]) {
      return excelPresets[data.excelPreset].columns;
    }
    return defaultExcelTemplate.columns;
  }, [data]);

  // 编辑中列配置
  const openExcelEditor = () => {
    setExcelColumns([...activeColumns]);
    setExcelEditOpen(true);
  };

  const addColumn = (key: string) => {
    if (excelColumns.some(c => c.key === key)) return;
    setExcelColumns([...excelColumns, { key, label: allColumnLabels[key] || key, width: 10 }]);
  };

  const removeColumn = (key: string) => {
    setExcelColumns(excelColumns.filter(c => c.key !== key));
  };

  const moveColumn = (key: string, dir: -1 | 1) => {
    const idx = excelColumns.findIndex(c => c.key === key);
    if (idx < 0 || idx + dir < 0 || idx + dir >= excelColumns.length) return;
    const next = [...excelColumns];
    [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
    setExcelColumns(next);
  };

  const saveExcelTemplate = () => {
    excelSaveMutation.mutate(JSON.stringify({ columns: excelColumns }));
  };

  const resetExcelTemplate = () => {
    excelSaveMutation.mutate(null);
  };

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (!data) return <div>加载失败</div>;

  const items: any[] = data.summary || [];

  const renderTemplate = (template: string) => {
    const vars: Record<string, string> = {
      containerNo: data.containerNo || '',
      customerName: data.customerName || '',
      toYardTime: data.toYardTime ? dayjs(data.toYardTime).format('YYYY-MM-DD HH:mm') : '',
      sealTime: data.sealTime ? dayjs(data.sealTime).format('YYYY-MM-DD HH:mm') : '',
      sealDate: data.sealTime ? dayjs(data.sealTime).format('YYYY-MM-DD') : '',
      totalPlanned: String(data.totals?.totalPlanned || 0),
      totalActual: String(data.totals?.totalActual || 0),
      totalReturned: String(data.totals?.totalReturned || 0),
    };

    const rowsRegex = /\{\{#rows(?:\s+min=(\d+))?\}\}([\s\S]*?)\{\{\/rows\}\}/g;
    let result = template.replace(rowsRegex, (_match, minStr, rowTemplate) => {
      const minRows = minStr ? parseInt(minStr) : 0;

      const renderRow = (rowVars: Record<string, string>) => {
        let row = rowTemplate;
        for (const [k, v] of Object.entries(rowVars)) {
          row = row.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
        }
        return row;
      };

      const rendered: string[] = items.map((item, idx) => {
        return renderRow({
          index: String(idx + 1),
          sku: item.sku || '',
          name: item.name || '',
          spec: item.spec || '',
          unit: item.unit || '',
          plannedQty: String(item.plannedQty || 0),
          actualQty: String(item.actualQty || 0),
          returnedQty: String(Math.max(0, item.returnedQty || 0)),
        });
      });

      if (minRows > 0 && rendered.length < minRows) {
        const emptyRow = renderRow({
          index: '', sku: '', name: '', spec: '', unit: '',
          plannedQty: '', actualQty: '', returnedQty: '',
        });
        while (rendered.length < minRows) {
          rendered.push(emptyRow);
        }
      }

      return rendered.join('');
    });

    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    }

    return result;
  };

  const template = data.reportTemplate;
  const htmlContent = template ? renderTemplate(template) : null;

  const getCellValue = (item: any, idx: number, key: string): string | number => {
    switch (key) {
      case 'index': return String(idx + 1);
      case 'sku': return item.sku || '';
      case 'name': return item.name || '';
      case 'spec': return item.spec || '';
      case 'unit': return item.unit || '';
      case 'plannedQty': return item.plannedQty || 0;
      case 'actualQty': return item.actualQty || 0;
      case 'returnedQty': return Math.max(0, item.returnedQty || 0);
      default: return '';
    }
  };

  const exportExcel = () => {
    const cols = activeColumns;
    // 表头行
    const headerInfo: string[][] = [
      ['货柜号', data.containerNo || ''],
      ['客户', data.customerName || ''],
      ['到柜时间', data.toYardTime ? dayjs(data.toYardTime).format('YYYY-MM-DD HH:mm') : ''],
      ['封柜时间', data.sealTime ? dayjs(data.sealTime).format('YYYY-MM-DD HH:mm') : ''],
      ['', ''],
    ];
    // 列头
    headerInfo.push(cols.map(c => c.label));
    // 数据行
    const dataRows = items.map((item, idx) => cols.map(c => getCellValue(item, idx, c.key)));
    // 合计行
    const totalRow = cols.map(c => {
      switch (c.key) {
        case 'index': return '';
        case 'name': return '合计';
        case 'plannedQty': return data.totals?.totalPlanned || 0;
        case 'actualQty': return data.totals?.totalActual || 0;
        case 'returnedQty': return data.totals?.totalReturned || 0;
        default: return '';
      }
    });

    const rows = [...headerInfo, ...dataRows, totalRow];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = cols.map(c => ({ wch: c.width }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '装柜报表');
    XLSX.writeFile(wb, `${data.containerNo}装柜报表.xlsx`);
  };

  const presetKey = data.templatePreset;
  const hasCustomExport = !!data.exportTemplate;
  const unusedKeys = allColumnKeys.filter(k => !excelColumns.some(c => c.key === k));

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          table { page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 13, marginRight: 6 }}>打印:</span>
          <Select
            value={presetKey || '__custom'}
            onChange={(val) => presetMutation.mutate(val === '__custom' ? null : val)}
            style={{ width: 160, marginRight: 12 }}
            options={[
              ...presetOptions.map(p => ({ label: p.name, value: p.key })),
              { label: '自定义模板', value: '__custom' },
            ]}
            loading={presetMutation.isPending}
          />
          {!presetKey && (
            <button onClick={() => { setEditText(data.reportTemplate || ''); setEditOpen(true); }} style={{ padding: '6px 16px', fontSize: 14, cursor: 'pointer' }}>编辑模板</button>
          )}
        </div>
        <div>
          <span style={{ fontSize: 13, marginRight: 6 }}>Excel:</span>
          <Select
            value={data.excelPreset || (hasCustomExport ? '__custom' : '__default')}
            onChange={(val) => {
              if (val === '__custom') return;
              excelPresetMutation.mutate(val === '__default' ? null : val);
            }}
            style={{ width: 160, marginRight: 12 }}
            options={[
              { label: '默认（出货明细）', value: '__default' },
              ...presetOptions.map(p => ({ label: p.name, value: p.key })),
            ]}
            loading={excelPresetMutation.isPending}
          />
          <button onClick={() => window.print()} style={{ padding: '8px 24px', fontSize: 16, cursor: 'pointer' }}>打印</button>
          <button onClick={exportExcel} style={{ padding: '8px 24px', fontSize: 16, cursor: 'pointer', marginLeft: 12 }}>导出 Excel</button>
          <button onClick={openExcelEditor} style={{ padding: '8px 24px', fontSize: 16, cursor: 'pointer', marginLeft: 12 }}>Excel 列设置</button>
          <span style={{ marginLeft: 16, color: '#999', fontSize: 13 }}>提示：打印时请关闭浏览器「页眉和页脚」</span>
        </div>
      </div>

      {/* HTML 模板编辑 */}
      <Modal title={`编辑报表模板 - ${data.customerName}`} open={editOpen} onOk={() => saveMutation.mutate(editText)} onCancel={() => setEditOpen(false)} width={800} okText="保存" cancelText="取消">
        <Input.TextArea value={editText} onChange={e => setEditText(e.target.value)} rows={25} style={{ fontFamily: 'monospace', fontSize: 12 }} placeholder="粘贴 HTML 模板..." />
        <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
          可用变量：{`{{containerNo}} {{customerName}} {{sealDate}} {{sealTime}} {{toYardTime}} {{totalPlanned}} {{totalActual}} {{totalReturned}}`}<br />
          循环行：{`{{#rows}}...{{/rows}}`} 内可用 {`{{index}} {{sku}} {{name}} {{plannedQty}} {{actualQty}} {{returnedQty}} {{spec}} {{unit}}`}
        </div>
      </Modal>

      {/* Excel 列编辑器 */}
      <Modal title="Excel 导出列设置" open={excelEditOpen} onOk={saveExcelTemplate} onCancel={() => setExcelEditOpen(false)} width={600} okText="保存" cancelText="取消" confirmLoading={excelSaveMutation.isPending}>
        <div style={{ marginBottom: 12 }}>
          <Space wrap>
            {unusedKeys.map(k => (
              <Button key={k} size="small" onClick={() => addColumn(k)}>+ {allColumnLabels[k] || k}</Button>
            ))}
          </Space>
          {unusedKeys.length === 0 && <span style={{ color: '#999' }}>所有列已添加</span>}
        </div>
        <div style={{ border: '1px solid #d9d9d9', borderRadius: 4, padding: 8, maxHeight: 360, overflow: 'auto' }}>
          {excelColumns.map((col, idx) => (
            <div key={col.key} style={{ display: 'flex', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ width: 24, color: '#999' }}>{idx + 1}</span>
              <span style={{ flex: 1 }}>{col.label}</span>
              <Button size="small" disabled={idx === 0} onClick={() => moveColumn(col.key, -1)}>↑</Button>
              <Button size="small" disabled={idx === excelColumns.length - 1} onClick={() => moveColumn(col.key, 1)} style={{ marginLeft: 4 }}>↓</Button>
              <Button size="small" danger onClick={() => removeColumn(col.key)} style={{ marginLeft: 8 }}>✕</Button>
            </div>
          ))}
          {excelColumns.length === 0 && <div style={{ color: '#999', textAlign: 'center', padding: 16 }}>暂无列，请从上方添加</div>}
        </div>
        <div style={{ marginTop: 12 }}>
          <Button size="small" onClick={resetExcelTemplate} loading={excelSaveMutation.isPending}>恢复默认</Button>
          <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>
            {hasCustomExport ? '当前：自定义列配置' : data.excelPreset ? '当前：Excel 预设 ' + (presetLabelMap[data.excelPreset] || data.excelPreset) : '当前：默认列配置'}
          </span>
        </div>
      </Modal>

      {htmlContent ? (
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      ) : (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          <p>该客户尚未设置报表模板</p>
          <p style={{ fontSize: 13 }}>请联系管理员在客户设置中上传 HTML 模板</p>
          <p style={{ fontSize: 12, marginTop: 20 }}>模板使用 {'{{变量}}'} 占位，支持 {'{{#rows}}...{{/rows}}'} 循环</p>
        </div>
      )}
    </div>
  );
}
