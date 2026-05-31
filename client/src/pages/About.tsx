import { Card, Typography, Space } from 'antd';
import { MailOutlined, WechatOutlined } from '@ant-design/icons';

const isStandalone = import.meta.env.VITE_STANDALONE === 'true';

export default function About() {
  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>关于我们</Typography.Title>}>
      <Space orientation="vertical" size="large" style={{ padding: '24px 0' }}>
        <div>
          <Typography.Title level={5}>库存管理系统 (WMS)</Typography.Title>
          <Typography.Text type="secondary">全栈仓库管理系统 · React + Express + Prisma + SQLite</Typography.Text>
        </div>

        <div>
          <Typography.Title level={5}>系统功能</Typography.Title>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {[
              { title: '仪表盘', desc: '仓库概览、库存统计、快捷入口' },
              { title: '仓库与库位', desc: '多仓库管理、库位创建与二维码生成' },
              { title: '商品管理', desc: '商品分类（无限级）、SKU 自动生成、Excel 批量导入/模板下载、条码支持、图片上传' },
              { title: '库存管理', desc: '库存查询、库存流水（含排柜编号）、库位间转移、安全库存预警、FIFO 批次追踪' },
              { title: '入库管理', desc: '创建入库单 → 确认入库 → 自动更新库存、支持批次号和合同关联' },
              { title: '出库管理', desc: '多合同关联、排柜编号匹配、按批次自动填库存/库位、FIFO 跨合同消耗' },
              { title: '排柜管理', desc: '车辆货柜号、装柜/甩柜/封柜、甩柜自动归还库存、按合同对账、打印装柜报表' },
              { title: '调拨管理', desc: '跨仓库调拨 → 提交审批 → 通过/拒绝 → 自动转移库存' },
              { title: '盘点管理', desc: '按仓库创建任务 → 按库位自动拆分子任务 → 录入实盘 → 差异自动调账 → 最终确定' },
              { title: '合同管理', desc: '合同号/客户/商品/单价、出/入库关联、合同对账（收发存+甩柜退货）、状态自动流转' },
              { title: '报表统计', desc: '出入库汇总、仓库对比、周转率分析、排柜报表（自定义模板/Excel）' },
              { title: '用户与权限', desc: '多租户（超管/租户管理员）、JWT 双密钥认证、仓库级数据隔离' },
              ...(!isStandalone ? [{ title: '客户管理', desc: '多租户支持、客户独立仓库、到期/暂停管理、客户报表模板/打印预设' }] : []),
              { title: '移动端 APP', desc: 'Android APK、网页扫码入库/出库/盘点/转移、库位二维码扫码、PWA 安装' },
            ].map(f => (
              <div key={f.title} style={{ background: '#fafafa', padding: '12px 16px', borderRadius: 6 }}>
                <Typography.Text strong>{f.title}</Typography.Text>
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>{f.desc}</Typography.Text>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#fafafa', padding: 24, borderRadius: 8, maxWidth: 400 }}>
          <Typography.Text strong style={{ fontSize: 15 }}>联系我们</Typography.Text>
          <div style={{ marginTop: 12 }}>
            <Space>
              <MailOutlined style={{ fontSize: 18, color: '#1677ff' }} />
              <Typography.Text copyable style={{ fontSize: 15 }}>
                2689762855@qq.com
              </Typography.Text>
            </Space>
          </div>
          <div style={{ marginTop: 12 }}>
            <Space>
              <WechatOutlined style={{ fontSize: 18, color: '#07c160' }} />
              <Typography.Text copyable style={{ fontSize: 15 }}>
                fjm2689762855
              </Typography.Text>
            </Space>
          </div>
          <div style={{ marginTop: 12 }}>
            <Space>
              <Typography.Text strong style={{ fontSize: 18, color: '#1677ff', width: 18, textAlign: 'center' }}>Q</Typography.Text>
              <Typography.Text copyable style={{ fontSize: 15 }}>
                2689762855
              </Typography.Text>
            </Space>
          </div>
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
            如有问题或建议，欢迎通过以上方式联系
          </Typography.Text>
        </div>
      </Space>
    </Card>
  );
}
