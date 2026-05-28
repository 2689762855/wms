export interface Preset {
  key: string;
  name: string;
  template: string;
}

export const reportPresets: Preset[] = [
  {
    key: 'manifest',
    name: '柜货配载清单',
    template: `<style>
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { border: 1px solid #000; padding: 6px; text-align: center; }
th { background: #e8e8e8; font-weight: bold; }
.print-header { text-align: center; margin-bottom: 8px; }
.print-header h2 { margin: 0; font-size: 18px; }
.print-header p { margin: 2px 0; font-size: 12px; color: #555; }
</style>
<div class="print-header">
  <h2>柜货配载清单 / CONTAINER LOADING MANIFEST</h2>
</div>
<table>
  <tr><td style="width:15%;">柜号 / Container No</td><td style="width:35%;">{{containerNo}}</td><td style="width:15%;">封条号 / Seal No</td><td style="width:35%;">________</td></tr>
  <tr><td>客户 / Customer</td><td>{{customerName}}</td><td>装柜日期 / Loading Date</td><td>{{sealDate}}</td></tr>
  <tr><td>到柜时间 / Arrival</td><td colspan="3">{{toYardTime}}</td></tr>
</table>
<table style="margin-top:10px;">
  <thead><tr><th>序号<br>No.</th><th>唛头<br>Mark</th><th>品名<br>Description</th><th>件数<br>Pkgs</th><th>数量<br>QTY</th><th>毛重(KG)<br>G.W.</th><th>净重(KG)<br>N.W.</th><th>体积(CBM)<br>Meas.</th><th>备注<br>Remark</th></tr></thead>
  <tbody>
    {{#rows min=18}}
    <tr style="height:22px;"><td>{{index}}</td><td></td><td>{{sku}} {{name}} {{spec}}</td><td></td><td>{{plannedQty}}</td><td></td><td></td><td></td><td></td></tr>
    {{/rows}}
  </tbody>
  <tfoot>
    <tr><td colspan="3" style="text-align:right;"><strong>合计 Total</strong></td><td></td><td><strong>{{totalPlanned}}</strong></td><td></td><td></td><td></td><td></td></tr>
  </tfoot>
</table>
<div style="margin-top:12px;font-size:12px;">
  <span>装柜负责人：________</span>&nbsp;&nbsp;&nbsp;
  <span>仓管签字：________</span>&nbsp;&nbsp;&nbsp;
  <span>日期：________</span>
</div>`,
  },
  {
    key: 'packing-list',
    name: '中英文装箱单',
    template: `<style>
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { border: 1px solid #000; padding: 6px; text-align: center; }
th { background: #e8e8e8; }
.print-header { text-align: center; margin-bottom: 8px; }
.print-header h2 { margin: 0 0 4px 0; font-size: 18px; letter-spacing: 2px; }
.print-header p { margin: 2px 0; font-size: 12px; }
.info-table td { border: none; text-align: left; padding: 3px 6px; }
</style>
<div class="print-header">
  <h2>装箱单 / PACKING LIST</h2>
</div>
<table class="info-table" style="margin-bottom:8px;">
  <tr><td style="width:15%;">发票号 / Invoice No:</td><td style="width:35%;">________</td><td style="width:15%;">日期 / Date:</td><td style="width:35%;">{{sealDate}}</td></tr>
  <tr><td>合同号 / Contract No:</td><td>________</td><td>柜号 / Container No:</td><td>{{containerNo}}</td></tr>
  <tr><td>客户 / Customer:</td><td colspan="3">{{customerName}}</td></tr>
</table>
<table>
  <thead><tr><th>序号<br>No.</th><th>品名 / Description</th><th>规格 / Spec</th><th>件数<br>Pkgs</th><th>数量<br>QTY</th><th>毛重(KG)<br>G.W.</th><th>净重(KG)<br>N.W.</th><th>体积(CBM)<br>Meas.</th></tr></thead>
  <tbody>
    {{#rows min=18}}
    <tr style="height:22px;"><td>{{index}}</td><td>{{name}}</td><td>{{spec}}</td><td></td><td>{{plannedQty}}</td><td></td><td></td><td></td></tr>
    {{/rows}}
  </tbody>
  <tfoot>
    <tr><td colspan="4" style="text-align:right;"><strong>合计 Total</strong></td><td><strong>{{totalPlanned}}</strong></td><td></td><td></td><td></td></tr>
  </tfoot>
</table>
<div style="margin-top:16px;font-size:12px;">
  <p>总件数 / Total Packages: ________&nbsp;&nbsp;&nbsp;&nbsp;总毛重 / Total G.W. (KG): ________&nbsp;&nbsp;&nbsp;&nbsp;总体积 / Total Meas. (CBM): ________</p>
</div>
<div style="margin-top:12px;font-size:12px;">
  <span>发货人签字 / Shipper: ________</span>&nbsp;&nbsp;&nbsp;
  <span>日期 / Date: ________</span>
</div>`,
  },
  {
    key: 'shipping-detail',
    name: '出货明细单',
    template: `<style>
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { border: 1px solid #333; padding: 7px; text-align: center; }
th { background: #f0f0f0; font-weight: bold; }
.print-header { text-align: center; margin-bottom: 10px; }
.print-header h2 { margin: 0; font-size: 18px; }
</style>
<div class="print-header"><h2>出货明细单</h2></div>
<div style="margin-bottom:10px;font-size:13px;">
  <span>客户：<strong>{{customerName}}</strong></span>&nbsp;&nbsp;&nbsp;&nbsp;
  <span>货柜号：<strong>{{containerNo}}</strong></span>&nbsp;&nbsp;&nbsp;&nbsp;
  <span>封柜日期：{{sealDate}}</span>&nbsp;&nbsp;&nbsp;&nbsp;
  <span>到柜时间：{{toYardTime}}</span>
</div>
<table>
  <thead><tr><th>序号</th><th>SKU</th><th>品名</th><th>规格</th><th>单位</th><th>计划数量</th><th>实装数量</th><th>差异</th><th>备注</th></tr></thead>
  <tbody>
    {{#rows min=18}}
    <tr style="height:26px;"><td>{{index}}</td><td>{{sku}}</td><td>{{name}}</td><td>{{spec}}</td><td>{{unit}}</td><td>{{plannedQty}}</td><td>{{actualQty}}</td><td>{{returnedQty}}</td><td></td></tr>
    {{/rows}}
  </tbody>
  <tfoot>
    <tr style="font-weight:bold;background:#f9f9f9;"><td colspan="5" style="text-align:right;">合计</td><td>{{totalPlanned}}</td><td>{{totalActual}}</td><td>{{totalReturned}}</td><td></td></tr>
  </tfoot>
</table>
<div style="margin-top:16px;font-size:13px;">
  <span>装柜负责人签字：______________</span>&nbsp;&nbsp;&nbsp;
  <span>仓管签字：______________</span>&nbsp;&nbsp;&nbsp;
  <span>日期：______________</span>
</div>`,
  },
];

export function getPresetTemplate(key: string): string | undefined {
  return reportPresets.find((p) => p.key === key)?.template;
}
