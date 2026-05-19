import { useState, useRef, useCallback } from 'react';
import { Input, Button, Space, message, Typography } from 'antd';
import { CameraOutlined, CloseOutlined } from '@ant-design/icons';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onScan: (barcode: string) => void;
}

export default function BarcodeScanner({ onScan }: Props) {
  const [scanning, setScanning] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanningRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const containerId = 'scanner-reader';

  const stopScan = useCallback(async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    const el = document.getElementById(containerId);
    if (el) el.style.display = 'none';
    scanningRef.current = false;
    setScanning(false);
  }, []);

  const handleScanResult = useCallback((barcode: string) => {
    onScanRef.current(barcode);
    message.success('扫码成功');
    stopScan();
  }, [stopScan]);

  const handleScan = async () => {
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
          <div id={containerId} style={{ width: '100%', maxWidth: 400, margin: '0 auto 12px' }} />
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 12 }}>
            请将条码对准取景框
          </Typography.Text>
          <Button
            type="primary"
            danger
            icon={<CloseOutlined />}
            onClick={() => stopScan()}
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
