import { useState, useEffect } from 'react';
import { Button, Card, Typography } from 'antd';
import { DownloadOutlined, CloseOutlined } from '@ant-design/icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setShowPrompt(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', '1');
  };

  if (!showPrompt) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 1000,
      maxWidth: 420, margin: '0 auto',
    }}>
      <Card size="small" style={{ borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text strong>添加到主屏幕</Typography.Text>
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={handleDismiss} />
          </div>
        }
      >
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          将此应用安装到手机桌面，像原生 App 一样使用
        </Typography.Text>
        <Button type="primary" icon={<DownloadOutlined />} block onClick={handleInstall}
          style={{ marginTop: 10, height: 40 }}>
          安装应用
        </Button>
      </Card>
    </div>
  );
}
