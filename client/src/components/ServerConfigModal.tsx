import { useState } from 'react';
import { Modal, Input, Button, Typography, message } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { getServerUrl, setServerUrl, getDefaultUrl } from '../utils/serverConfig';

export default function ServerConfigModal() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(getServerUrl());

  const handleSave = () => {
    if (!value.trim()) {
      message.warning('请输入服务器地址');
      return;
    }
    setServerUrl(value.trim());
    message.success('已保存，请重新打开应用');
    setOpen(false);
  };

  return (
    <>
      <Button type="text" size="small" icon={<SettingOutlined />}
        onClick={() => { setValue(getServerUrl()); setOpen(true); }}
        style={{ color: 'inherit', opacity: 0.8 }}
      />
      <Modal title="服务器设置" open={open} onCancel={() => setOpen(false)} onOk={handleSave}
        okText="保存" cancelText="取消" style={{ maxWidth: 400 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          设置后端 API 服务器地址
        </Typography.Text>
        <Input value={value} onChange={e => setValue(e.target.value)}
          style={{ marginTop: 8 }} placeholder={getDefaultUrl()}
          allowClear
        />
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          格式: http://服务器IP:3001
        </Typography.Text>
      </Modal>
    </>
  );
}
