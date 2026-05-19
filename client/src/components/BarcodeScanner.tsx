import { useState, useEffect, useRef, useCallback } from 'react';
import { Input, Button, Space, message, Typography } from 'antd';
import { CameraOutlined, CloseOutlined } from '@ant-design/icons';
import { Html5Qrcode } from 'html5-qrcode';
import { BarcodeScanner as NativeScanner } from '@capacitor-community/barcode-scanner';

interface Props {
  onScan: (barcode: string) => void;
}

const isCapacitor = typeof (window as any).Capacitor !== 'undefined';

export default function BarcodeScanner({ onScan }: Props) {
  const [scanning, setScanning] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [useNative, setUseNative] = useState(isCapacitor);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanningRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const containerId = 'scanner-reader';

  useEffect(() => {
    return () => {
      if (scanningRef.current) {
        if (isCapacitor && useNative) {
          NativeScanner.showBackground();
          NativeScanner.stopScan().catch(() => {});
        }
        if (scannerRef.current) {
          scannerRef.current.stop().catch(() => {});
        }
      }
    };
  }, [useNative]);

  const handleScanResult = useCallback((barcode: string) => {
    onScanRef.current(barcode);
    message.success('扫码成功');
    if (useNative && NativeScanner) {
      NativeScanner.showBackground();
      NativeScanner.stopScan().catch(() => {});
    } else {
      stopWebScan();
    }
    setScanning(false);
    scanningRef.current = false;
  }, [useNative]);

  const startNativeScan = async () => {
    try {
      const perm = await NativeScanner.checkPermission({ force: true });
      if (!perm.granted) {
        message.error('需要相机权限');
        return;
      }
      setScanning(true);
      scanningRef.current = true;
      document.body.classList.add('scanner-active');
      await NativeScanner.prepare();
      NativeScanner.hideBackground();
      const result = await NativeScanner.startScan();
      NativeScanner.showBackground();
      document.body.classList.remove('scanner-active');
      NativeScanner.stopScan().catch(() => {});
      scanningRef.current = false;
      setScanning(false);
      if (result.hasContent && result.content) {
        handleScanResult(result.content);
      }
    } catch (err: any) {
      console.warn('Native scan unavailable, falling back to web scanner:', err.message || err);
      NativeScanner.showBackground();
      NativeScanner.stopScan().catch(() => {});
      document.body.classList.remove('scanner-active');
      scanningRef.current = false;
      setScanning(false);
      setUseNative(false);
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
        () => {}, // ignore scan errors, keep camera open
      );
      setScanning(true);
    } catch {
      scanningRef.current = false;
      message.error('无法启动摄像头，请手动输入条码');
    }
  };

  const stopWebScan = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    const el = document.getElementById(containerId);
    if (el) el.style.display = 'none';
    scanningRef.current = false;
    setScanning(false);
  };

  const handleScan = () => {
    if (useNative) {
      startNativeScan();
    } else {
      startWebScan();
    }
  };

  const handleStop = () => {
    if (useNative) {
      NativeScanner.showBackground();
      NativeScanner.stopScan().catch(() => {});
      document.body.classList.remove('scanner-active');
    } else {
      stopWebScan();
    }
    scanningRef.current = false;
    setScanning(false);
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
          {!useNative && (
            <div id={containerId} style={{ width: '100%', maxWidth: 400, margin: '0 auto 12px' }} />
          )}
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 12 }}>
            {useNative ? '摄像头已开启，请对准条码扫描' : '请将条码对准取景框'}
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
