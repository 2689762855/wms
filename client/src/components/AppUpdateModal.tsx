import { useState } from 'react';
import { Modal, Button, Alert, Space, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { AppVersion } from '../types';
import { downloadAndInstall } from '../utils/updateChecker';

const { Text, Paragraph } = Typography;

interface Props {
  open: boolean;
  serverVersion: AppVersion;
  forceUpdate: boolean;
  onDismiss: () => void;
}

export default function AppUpdateModal({ open, serverVersion, forceUpdate, onDismiss }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDownload = async () => {
    setLoading(true);
    setError('');
    try {
      await downloadAndInstall(serverVersion.downloadUrl);
    } catch (e: any) {
      setError(e?.message || '下载失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="发现新版本"
      open={open}
      onCancel={forceUpdate ? undefined : onDismiss}
      maskClosable={!forceUpdate}
      closable={!forceUpdate}
      footer={
        <Space>
          {!forceUpdate && <Button onClick={onDismiss}>暂不更新</Button>}
          <Button type="primary" icon={<DownloadOutlined />} loading={loading} onClick={handleDownload}>
            立即更新
          </Button>
        </Space>
      }
      zIndex={1050}
    >
      <Space orientation="vertical" style={{ width: '100%' }}>
        <Text strong>版本 {serverVersion.versionName}</Text>
        {serverVersion.changelog && (
          <Paragraph style={{ whiteSpace: 'pre-line', marginBottom: 0 }}>
            {serverVersion.changelog}
          </Paragraph>
        )}
        {forceUpdate && (
          <Alert type="warning" message="此版本为强制更新，请立即更新后再使用" showIcon />
        )}
        {error && <Alert type="error" message={error} showIcon closable onClose={() => setError('')} />}
      </Space>
    </Modal>
  );
}
