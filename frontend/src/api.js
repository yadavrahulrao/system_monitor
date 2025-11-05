import axios from 'axios';

const API = axios.create({ baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:8000' });

export async function fetchSystem() {
  const r = await API.get('/api/system');
  return r.data;
}

export async function fetchContainers() {
  const r = await API.get('/api/containers');
  return r.data;
}