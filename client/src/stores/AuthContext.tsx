import { createContext, useContext, useState, useEffect, useRef } from 'react';
import apiClient from '../api/client';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: any }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const aborted = useRef(false);

  // 仅在应用启动时验证 token（从 localStorage 恢复登录状态）
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      setToken(savedToken);
      apiClient.get('/auth/me')
        .then((res) => {
          if (!aborted.current) setUser(res.data as User);
        })
        .catch(() => { if (!aborted.current) { localStorage.removeItem('token'); setToken(null); } })
        .finally(() => { if (!aborted.current) setLoading(false); });
    } else {
      setLoading(false);
    }
    return () => { aborted.current = true; };
  }, []);

  const login = (newToken: string, newUser: User) => {
    // 标记旧的 /auth/me 请求无效，防止覆盖新的身份
    aborted.current = true;
    // 超管切换客户视角时，保存原 token 以便恢复
    if (user?.role === 'super_admin' && newUser.role === 'tenant_admin') {
      localStorage.setItem('admin_token', token!);
    }
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
    setLoading(false);
  };

  const logout = () => {
    // 如果是客户视角，先尝试恢复超管身份
    const adminToken = localStorage.getItem('admin_token');
    if (adminToken) {
      localStorage.removeItem('admin_token');
      localStorage.setItem('token', adminToken);
      setToken(adminToken);
      // 清除客户视角标记，让新的 /auth/me 不被拦截
      apiClient.get('/auth/me').then(res => setUser(res.data as User)).catch(() => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      });
      return;
    }
    // 退出前清理可能残留的 admin_token
    localStorage.removeItem('admin_token');
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
