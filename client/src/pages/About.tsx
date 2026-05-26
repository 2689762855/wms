import { Card, Typography, Space } from 'antd';
import { MailOutlined, WechatOutlined } from '@ant-design/icons';

const isStandalone = import.meta.env.VITE_STANDALONE === 'true';

export default function About() {
  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>关于我们</Typography.Title>}>
      <Space direction="vertical" size="large" style={{ padding: '24px 0' }}>
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
              { title: '商品管理', desc: '商品分类（无限级）、SKU 自动生成、Excel 批量导入/模板下载、条码支持' },
              { title: '库存管理', desc: '库存查询、库存流水、库位间转移、库存调拨' },
              { title: '入库管理', desc: '创建入库单 → 确认入库 → 自动更新库存' },
              { title: '出库管理', desc: '创建出库单 → 确认出库 → 自动扣减库存' },
              { title: '调拨管理', desc: '跨仓库调拨 → 提交审批 → 通过/拒绝 → 自动转移库存' },
              { title: '盘点管理', desc: '按仓库创建任务 → 按库位自动拆分子任务 → 录入实盘 → 差异自动调账 → 最终确定' },
              { title: '库存预警', desc: '安全库存设置 → 低于安全线自动标红预警' },
              { title: '报表统计', desc: '出入库汇总、仓库对比、周转率分析' },
              { title: '用户与权限', desc: '三级角色（超管/仓管/操作员）、JWT 认证、仓库级数据隔离' },
              ...(!isStandalone ? [{ title: '客户管理', desc: '多租户支持、客户独立仓库、到期/暂停管理' }] : []),
              { title: '移动端 APP', desc: 'Android APK、扫码入库/出库/盘点/转移、库位二维码扫码' },
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
