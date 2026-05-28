import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Spin, Modal, Input, message, Select } from 'antd';
import apiClient from '../api/client';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { presetOptions } from '../utils/reportPresets';

export default function ContainerReport() {
  const { id } = useParams<{ id: string }>();
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState('');

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

  useEffect(() => {
    if (data) {
      setTimeout(() => window.print(), 500);
    }
  }, [data]);

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (!data) return <div>加载失败</div>;

  const items: any[] = data.summary || [];

  // 替换模板变量
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

    // 处理 {{#rows min=N}}...{{/rows}} 循环，支持自动补空行
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

    // 替换普通变量
    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    }

    return result;
  };

  const template = data.reportTemplate;
  const htmlContent = template ? renderTemplate(template) : null;

  const exportExcel = () => {
    const rows = [
      ['货柜号', data.containerNo || ''],
      ['客户', data.customerName || ''],
      ['到柜时间', data.toYardTime ? dayjs(data.toYardTime).format('YYYY-MM-DD HH:mm') : ''],
      ['封柜时间', data.sealTime ? dayjs(data.sealTime).format('YYYY-MM-DD HH:mm') : ''],
      ['', ''],
      ['序号', 'SKU', '商品', '规格', '单位', '计划数量', '实装数量', '甩柜数量'],
    ];
    (data.summary || []).forEach((item: any, idx: number) => {
      rows.push([
        String(idx + 1), item.sku, item.name, item.spec || '', item.unit || '',
        item.plannedQty || 0, item.actualQty || 0,
        Math.max(0, item.returnedQty || 0),
      ]);
    });
    rows.push([
      '', '', '', '', '合计',
      data.totals?.totalPlanned || 0,
      data.totals?.totalActual || 0,
      data.totals?.totalReturned || 0,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '装柜报表');
    XLSX.writeFile(wb, `${data.containerNo}装柜报表.xlsx`);
  };

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
        <span style={{ fontSize: 13, marginRight: 6 }}>模板:</span>
        <Select
          value={data.templatePreset || '__custom'}
          onChange={(val) => presetMutation.mutate(val === '__custom' ? null : val)}
          style={{ width: 160, marginRight: 12 }}
          options={[
            ...presetOptions.map(p => ({ label: p.name, value: p.key })),
            { label: '自定义模板', value: '__custom' },
          ]}
          loading={presetMutation.isPending}
        />
        <button onClick={() => window.print()} style={{ padding: '8px 24px', fontSize: 16, cursor: 'pointer' }}>打印</button>
        <button onClick={exportExcel} style={{ padding: '8px 24px', fontSize: 16, cursor: 'pointer', marginLeft: 12 }}>导出 Excel</button>
        {!data.templatePreset && (
          <button onClick={() => { setEditText(data.reportTemplate || ''); setEditOpen(true); }} style={{ padding: '8px 24px', fontSize: 16, cursor: 'pointer', marginLeft: 12 }}>编辑模板</button>
        )}
        <span style={{ marginLeft: 16, color: '#999', fontSize: 13 }}>提示：打印时请关闭浏览器「页眉和页脚」</span>
      </div>

      <Modal title={`编辑报表模板 - ${data.customerName}`} open={editOpen} onOk={() => saveMutation.mutate(editText)} onCancel={() => setEditOpen(false)} width={800} okText="保存" cancelText="取消">
        <Input.TextArea value={editText} onChange={e => setEditText(e.target.value)} rows={25} style={{ fontFamily: 'monospace', fontSize: 12 }} placeholder="粘贴 HTML 模板..." />
        <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
          可用变量：{`{{containerNo}} {{customerName}} {{sealDate}} {{sealTime}} {{toYardTime}} {{totalPlanned}} {{totalActual}} {{totalReturned}}`}<br />
          循环行：{`{{#rows}}...{{/rows}}`} 内可用 {`{{index}} {{sku}} {{name}} {{plannedQty}} {{actualQty}} {{returnedQty}} {{spec}} {{unit}}`}
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
