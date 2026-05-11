import { useState, useEffect, useRef, useCallback } from 'react';
import { Input, Button, Space, message } from 'antd';
import { CameraOutlined, StopOutlined } from '@ant-design/icons';
import { Html5Qrcode } from 'html5-qrcode';
import { BarcodeScanner as NativeScanner } from '@capacitor-community/barcode-scanner';

interface Props {
  onScan: (barcode: string) => void;
}

const isCapacitor = typeof (window as any).Capacitor !== 'undefined';

export default function BarcodeScanner({ onScan }: Props) {
  const [scanning, setScanning] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanningRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const containerId = 'scanner-reader';

  useEffect(() => {
    return () => {
      if (scanningRef.current) {
        if (isCapacitor) {
          NativeScanner.showBackground();
          NativeScanner.stopScan().catch(() => {});
        }
        if (scannerRef.current) {
          scannerRef.current.stop().catch(() => {});
        }
      }
    };
  }, []);

  const handleScanResult = useCallback((barcode: string) => {
    onScanRef.current(barcode);
    message.success('扫码成功');
    // 扫到后立即停止，防止重复扫描
    if (isCapacitor) {
      NativeScanner.showBackground();
      NativeScanner.stopScan().catch(() => {});
    } else {
      stopWebScan();
    }
    setScanning(false);
    scanningRef.current = false;
  }, [onScan]);

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
      console.error('Scan error:', err);
      NativeScanner.showBackground();
      NativeScanner.stopScan().catch(() => {});
      document.body.classList.remove('scanner-active');
      scanningRef.current = false;
      setScanning(false);
      message.error('扫码失败');
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
        (err) => { console.error('QR scan error:', err); },
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
    scanningRef.current = false;
    setScanning(false);
  };

  const handleScan = () => {
    if (isCapacitor) {
      startNativeScan();
    } else {
      startWebScan();
    }
  };

  const handleStop = () => {
    if (isCapacitor) {
      NativeScanner.showBackground();
      NativeScanner.stopScan().catch(() => {});
      document.body.classList.remove('scanner-active');
      scanningRef.current = false;
      setScanning(false);
    } else {
      stopWebScan();
    }
  };

  const handleManualSubmit = () => {
    if (!manualValue.trim()) return;
    onScan(manualValue.trim());
    setManualValue('');
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Input placeholder="手动输入条码" value={manualValue} onChange={e => setManualValue(e.target.value)}
          onPressEnter={handleManualSubmit} style={{ flex: '1 1 180px', minWidth: 140 }}
        />
        <Button onClick={handleManualSubmit}>确认</Button>
        {!scanning ? (
          <Button icon={<CameraOutlined />} onClick={handleScan}>扫码</Button>
        ) : (
          <Button icon={<StopOutlined />} onClick={handleStop}>停止扫码</Button>
        )}
      </div>
      {!isCapacitor && <div id={containerId} style={{ width: '100%', maxWidth: 320 }} />}
    </Space>
  );
}
