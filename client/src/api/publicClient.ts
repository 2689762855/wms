import axios from 'axios';
import { getServerUrl } from '../utils/serverConfig';

const publicApiClient = axios.create({
  timeout: 10000,
});

publicApiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('customer_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.url && !config.url.startsWith('http')) {
    config.url = getServerUrl() + '/api/public' + config.url;
  }
  return config;
});

publicApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('customer_token');
      if (window.location.pathname === '/stock') {
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

export default publicApiClient;
