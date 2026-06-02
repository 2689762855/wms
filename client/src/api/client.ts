import axios from 'axios';
import { getServerUrl } from '../utils/serverConfig';

const apiClient = axios.create({
  timeout: 10000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.url && !config.url.startsWith('http')) {
    config.url = getServerUrl() + '/api' + config.url;
  }
  return config;
});

let redirectingToLogin = false;

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login' && !redirectingToLogin) {
        redirectingToLogin = true;
        const reason = error.response?.data?.error || '登录已过期，请重新登录';
        window.location.href = '/login?reason=' + encodeURIComponent(reason);
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
