import { useState, useRef, useCallback, useEffect } from 'react';
import { Input, Button, Space, message, Typography } from 'antd';
import { CameraOutlined, CloseOutlined } from '@ant-design/icons';
import { Html5Qrcode } from 'html5-qrcode';
import { BarcodeScanner as NativeScanner } from '@capacitor-community/barcode-scanner';
import { App } from '@capacitor/app';

interface Props {
  onScan: (barcode: string) => void;
}

const isNative = (() => {
  try { return !!(window as any).Capacitor?.isNativePlatform?.(); } catch { return false; }
})();

export default function BarcodeScanner({ onScan }: Props) {
  const [scanning, setScanning] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [useWeb, setUseWeb] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanningRef = useRef(false);
  const stoppingRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const containerId = 'scanner-reader';

  const stopWebScan = useCallback(async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    const el = document.getElementById(containerId);
    if (el) el.style.display = 'none';
  }, []);

  const finishScan = useCallback(() => {
    scanningRef.current = false;
    setScanning(false);
  }, []);

  // Listen for Android back button to stop native scanner
  useEffect(() => {
    if (!isNative) return;
    const handler = App.addListener('backButton', () => {
      if (scanningRef.current && !useWeb) {
        stoppingRef.current = true;
        NativeScanner.showBackground();
        NativeScanner.stopScan().catch(() => {});
        document.body.classList.remove('scanner-active');
        finishScan();
      }
    });
    return () => { handler.remove(); };
  }, [useWeb, finishScan]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanningRef.current) {
        if (isNative && !useWeb) {
          NativeScanner.showBackground();
          NativeScanner.stopScan().catch(() => {});
          document.body.classList.remove('scanner-active');
        }
        stopWebScan();
      }
    };
  }, [useWeb, stopWebScan]);

  const handleScanResult = useCallback((barcode: string) => {
    onScanRef.current(barcode);
    message.success('扫码成功');
    if (!useWeb) {
      NativeScanner.showBackground();
      NativeScanner.stopScan().catch(() => {});
      document.body.classList.remove('scanner-active');
    } else {
      stopWebScan();
    }
    finishScan();
  }, [useWeb, stopWebScan, finishScan]);

  const startNativeScan = async () => {
    try {
      const perm = await NativeScanner.checkPermission({ force: true });
      if (!perm.granted) {
        message.error('需要相机权限');
        return;
      }
      scanningRef.current = true;
      setScanning(true);
      document.body.classList.add('scanner-active');
      NativeScanner.hideBackground();
      const result = await NativeScanner.startScan();
      if (stoppingRef.current) {
        stoppingRef.current = false;
        return;
      }
      NativeScanner.showBackground();
      document.body.classList.remove('scanner-active');
      NativeScanner.stopScan().catch(() => {});
      finishScan();
      if (result.hasContent && result.content) {
        handleScanResult(result.content);
      }
    } catch (err: any) {
      console.warn('Native scan failed, fallback to web:', err.message || err);
      NativeScanner.showBackground();
      NativeScanner.stopScan().catch(() => {});
      document.body.classList.remove('scanner-active');
      finishScan();
      setUseWeb(true);
      message.info('已切换为网页扫码模式');
      startWebScan();
    }
  };

  const startWebScan = async () => {
    try {
      const el = document.getElementById(containerId);
      if (el) el.style.display = 'block';
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      scanningRef.current = true;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => handleScanResult(text),
        () => {},
      );
      setScanning(true);
    } catch {
      scanningRef.current = false;
      message.error('无法启动摄像头，请手动输入条码');
    }
  };

  const handleScan = () => {
    if (isNative && !useWeb) {
      startNativeScan();
    } else {
      startWebScan();
    }
  };

  const handleStop = () => {
    if (!useWeb) {
      stoppingRef.current = true;
      NativeScanner.showBackground();
      NativeScanner.stopScan().catch(() => {});
      document.body.classList.remove('scanner-active');
    } else {
      stopWebScan();
    }
    finishScan();
  };

  const handleManualSubmit = () => {
    if (!manualValue.trim()) return;
    onScan(manualValue.trim());
    setManualValue('');
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {!scanning ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Input
            placeholder="手动输入条码"
            value={manualValue}
            onChange={e => setManualValue(e.target.value)}
            onPressEnter={handleManualSubmit}
            style={{ flex: '1 1 160px', minWidth: 120 }}
          />
          <Button onClick={handleManualSubmit}>确认</Button>
          <Button type="primary" icon={<CameraOutlined />} onClick={handleScan}>
            扫码
          </Button>
        </div>
      ) : (
        <div>
          {useWeb && (
            <div id={containerId} style={{ width: '100%', maxWidth: 400, margin: '0 auto 12px' }} />
          )}
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 12 }}>
            {useWeb ? '请将条码对准取景框' : '摄像头已开启，按手机返回键可关闭'}
          </Typography.Text>
          <Button
            type="primary"
            danger
            icon={<CloseOutlined />}
            onClick={handleStop}
            size="large"
            block
          >
            关闭摄像头
          </Button>
        </div>
      )}
    </Space>
  );
}
