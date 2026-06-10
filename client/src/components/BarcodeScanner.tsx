import { useState, useRef, useCallback, useEffect } from 'react';
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
  const inputRef = useRef<any>(null);
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

  // 全局硬件扫码枪监听（新大陆 MT69 等工业 PDA 模拟键盘输入）
  useEffect(() => {
    let buffer = '';
    let lastTime = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onKeyDown = (e: KeyboardEvent) => {
      // 用户在 input/textarea/select 中正常输入时不拦截
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const now = Date.now();
      const gap = now - lastTime;
      lastTime = now;

      // 间隔 > 80ms 不是扫码枪速度 → 清空 buffer 重新开始
      if (gap > 80 && buffer.length > 0) {
        buffer = '';
      }

      if (e.key === 'Enter' && buffer.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        onScanRef.current(buffer.trim());
        buffer = '';
        message.success('扫码成功');
        return;
      }

      // 收集可打印字符
      if (e.key.length === 1) {
        buffer += e.key;
      }

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { buffer = ''; }, 200);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (scanningRef.current && scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleScanResult = useCallback((barcode: string) => {
    onScanRef.current(barcode);
    message.success('扫码成功');
    stopScan();
  }, [stopScan]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      scanningRef.current = true;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => handleScanResult(text),
        () => {},
      );
    } catch (err: any) {
      scanningRef.current = false;
      scannerRef.current = null;
      setScanning(false);
      const detail = err?.message || err?.toString() || '未知错误';
      console.error('扫码启动失败:', detail);
      message.error(`无法启动摄像头：${detail}`);
    }
  };

  const handleManualSubmit = () => {
    if (!manualValue.trim()) return;
    onScan(manualValue.trim());
    setManualValue('');
    refocusInput();
  };

  // 扫码完成后重新聚焦输入框
  const refocusInput = () => {
    setTimeout(() => { inputRef.current?.focus(); }, 50);
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Input
          ref={inputRef}
          autoFocus
          placeholder="扫码后自动填入"
          value={manualValue}
          onChange={e => setManualValue(e.target.value)}
          onPressEnter={handleManualSubmit}
          style={{ flex: '1 1 160px', minWidth: 120 }}
        />
        <Button onClick={handleManualSubmit}>确认</Button>
        {!scanning ? (
          <Button type="primary" icon={<CameraOutlined />} onClick={handleScan}>
            扫码
          </Button>
        ) : (
          <Button type="primary" danger icon={<CloseOutlined />} onClick={() => stopScan()}>
            关闭摄像头
          </Button>
        )}
      </div>
      <div id={containerId} style={{ display: scanning ? 'block' : 'none', width: '100%', maxWidth: 400, margin: '0 auto' }} />
      {scanning && (
        <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
          请将条码对准取景框
        </Typography.Text>
      )}
    </Space>
  );
}
