import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import publicApiClient from '../api/publicClient';

interface Customer {
  id: number;
  username: string;
  realName?: string;
  warehouseId?: number | null;
}

interface CustomerAuthState {
  customer: Customer | null;
  token: string | null;
  loading: boolean;
  login: (token: string, customer: Customer) => void;
  logout: () => void;
}

const CustomerAuthContext = createContext<CustomerAuthState>({
  customer: null,
  token: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('customer_token');
    if (saved) {
      publicApiClient.get('/me', { headers: { Authorization: `Bearer ${saved}` } })
        .then(res => {
          setCustomer(res.data);
          setToken(saved);
        })
        .catch(() => localStorage.removeItem('customer_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (newToken: string, newCustomer: Customer) => {
    localStorage.setItem('customer_token', newToken);
    setToken(newToken);
    setCustomer(newCustomer);
  };

  const logout = () => {
    localStorage.removeItem('customer_token');
    setToken(null);
    setCustomer(null);
  };

  return (
    <CustomerAuthContext.Provider value={{ customer, token, loading, login, logout }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  return useContext(CustomerAuthContext);
}
