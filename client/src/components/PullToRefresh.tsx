import { useState, useRef, useCallback, type ReactNode } from 'react';
import { Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface Props {
  children: ReactNode;
}

export default function PullToRefresh({ children }: Props) {
  const [state, setState] = useState<'idle' | 'pulling' | 'ready' | 'refreshing'>('idle');
  const [pullDist, setPullDist] = useState(0);
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY > 0) return;
    pulling.current = true;
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return;
    const dist = e.touches[0].clientY - startY.current;
    if (dist <= 0) {
      pulling.current = false;
      setState('idle');
      setPullDist(0);
      return;
    }
    const damped = Math.min(dist * 0.4, 120);
    setPullDist(damped);
    setState(damped > 50 ? 'ready' : 'pulling');
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!pulling.current) return;
    pulling.current = false;
    if (state === 'ready') {
      setState('refreshing');
      setPullDist(0);
      window.location.reload();
    } else {
      setState('idle');
      setPullDist(0);
    }
  }, [state]);

  const indicatorHeight = pullDist;

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ minHeight: '100%' }}
    >
      <div style={{
        display: 'flex', justifyContent: 'center',
        height: indicatorHeight,
        overflow: 'hidden',
        transition: pullDist === 0 ? 'height 0.2s ease' : 'none',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          paddingTop: 8,
          color: state === 'ready' ? '#1677ff' : '#999',
          fontSize: 13,
        }}>
          {state === 'refreshing' ? (
            <Spin size="small" />
          ) : (
            <ReloadOutlined spin={state === 'ready'} />
          )}
          <span>
            {state === 'refreshing' ? '刷新中...' : state === 'ready' ? '释放刷新' : state === 'pulling' ? '下拉刷新' : ''}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}
