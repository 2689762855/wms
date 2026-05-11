import { Card, Typography, Space } from 'antd';
import { MailOutlined } from '@ant-design/icons';

export default function About() {
  return (
    <Card title={<Typography.Title level={4} style={{ margin: 0 }}>关于我们</Typography.Title>}>
      <Space direction="vertical" size="large" style={{ padding: '24px 0' }}>
        <div>
          <Typography.Title level={5}>库存管理系统 (WMS)</Typography.Title>
          <Typography.Text type="secondary">全栈仓库管理系统 · React + Express + Prisma + SQLite</Typography.Text>
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
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            如有问题或建议，欢迎发送邮件联系
          </Typography.Text>
        </div>
      </Space>
    </Card>
  );
}
