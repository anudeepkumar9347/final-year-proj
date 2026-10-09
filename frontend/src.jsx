import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import './style.css';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((config) => {
  const token = localStorage.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const bytes = (value) => value < 1024 ? `${value} B` : `${(value / 1024 / 1024).toFixed(2)} MB`;
const message = (error) => error.response?.data?.error || 'Request failed';

function Auth({ done }) {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post(`/auth/${register ? 'register' : 'login'}`, form);
      localStorage.token = data.token;
      done(data.user);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  };

  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  return <main className="auth-page"><section className="auth-card">
    <div className="brand"><span className="brand-mark">CS</span><div><h1>CloudStore</h1><p>Secure file storage</p></div></div>
    <div className="auth-heading"><h2>{register ? 'Create your account' : 'Sign in'}</h2><p>{register ? 'Set up your workspace to start managing files.' : 'Access your files and storage workspace.'}</p></div>
    <form onSubmit={submit}>
      {register && <label>Name<input name="name" required value={form.name} onChange={change} /></label>}
      <label>Email<input name="email" type="email" required value={form.email} onChange={change} /></label>
      <label>Password<input name="password" type="password" required minLength="8" value={form.password} onChange={change} /></label>
      {error && <p className="form-error">{error}</p>}
      <button disabled={busy}>{busy ? 'Please wait...' : register ? 'Create account' : 'Sign in'}</button>
    </form>
    <button className="text-button" onClick={() => { setRegister(!register); setError(''); }}>
      {register ? 'Already have an account? Sign in' : 'New to CloudStore? Create an account'}
    </button>
  </section></main>;
}

function App() {
  const [user, setUser] = useState(null);
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [uploadItems, setUploadItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      const [fileResponse, statsResponse, nodeResponse] = await Promise.all([
        api.get('/files'),
        api.get('/analytics/overview'),
        api.get('/storage/nodes')
      ]);
      setFiles(fileResponse.data.files);
      setStats(statsResponse.data);
      setNodes(nodeResponse.data.nodes);
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        setUser(null);
      } else {
        setNotice(message(error));
      }
    }
  };

  useEffect(() => {
    if (localStorage.token) api.get('/auth/me').then((response) => setUser(response.data.user)).catch(() => localStorage.removeItem('token'));
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user]);

  const updateItem = (id, update) => {
    setUploadItems((items) => items.map((item) => item.id === id ? { ...item, ...update } : item));
  };

  const uploadBatch = async (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;

    const items = selected.map((file, index) => ({ id: `${Date.now()}-${index}`, file, name: file.name, size: file.size, progress: 0, status: 'Queued' }));
    setUploadItems(items);
    setBusy(true);
    setNotice('');

    let nextIndex = 0;
    let completed = 0;
    let failed = 0;
    const uploadOne = async (item) => {
      updateItem(item.id, { status: 'Uploading' });
      const data = new FormData();
      data.append('file', item.file);
      try {
        await api.post('/files/upload', data, {
          onUploadProgress: (progressEvent) => {
            const progress = progressEvent.total ? Math.round((progressEvent.loaded / progressEvent.total) * 100) : 0;
            updateItem(item.id, { progress, status: progress >= 100 ? 'Finalizing' : 'Uploading' });
          }
        });
        completed += 1;
        updateItem(item.id, { progress: 100, status: 'Complete' });
      } catch (error) {
        failed += 1;
        updateItem(item.id, { status: `Failed: ${message(error)}` });
      }
    };

    const worker = async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex++];
        await uploadOne(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, items.length) }, worker));
    setBusy(false);
    setNotice(`${completed} of ${items.length} file${items.length === 1 ? '' : 's'} uploaded${failed ? `; ${failed} failed` : ''}.`);
    await load();
  };

  const download = async (file) => {
    try {
      const response = await api.get(`/files/${file.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice(message(error));
    }
  };

  const remove = async (file) => {
    if (!window.confirm(`Delete ${file.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/files/${file.id}`);
      setNotice(`${file.name} deleted.`);
      await load();
    } catch (error) {
      setNotice(message(error));
    }
  };

  if (!user) return <Auth done={setUser} />;
  const totalBytes = uploadItems.reduce((sum, item) => sum + item.size, 0);
  const uploadedBytes = uploadItems.reduce((sum, item) => sum + item.size * item.progress / 100, 0);
  const overallProgress = totalBytes ? Math.round(uploadedBytes / totalBytes * 100) : 0;

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">CS</span><h1>CloudStore</h1></div><div className="account"><span>{user.name}</span><button className="secondary" onClick={() => { localStorage.clear(); setUser(null); }}>Log out</button></div></header>
    <main className="workspace">
      <section className="page-title"><div><p className="eyebrow">FILE MANAGEMENT</p><h2>My files</h2><p>Manage your stored files and monitor capacity.</p></div><label className="button">{busy ? 'Uploading...' : 'Upload files'}<input type="file" multiple onChange={uploadBatch} disabled={busy} /></label></section>
      {notice && <div className="notice">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">x</button></div>}
      {uploadItems.length > 0 && <section className="upload-panel panel"><div className="panel-heading"><div><h3>Batch upload</h3><p>{busy ? `Uploading ${overallProgress}% overall` : 'Upload summary'}</p></div><strong className="upload-count">{uploadItems.filter((item) => item.status === 'Complete').length}/{uploadItems.length}</strong></div><div className="overall-progress"><span style={{ width: `${overallProgress}%` }} /></div><div className="upload-list">{uploadItems.map((item) => <div className="upload-row" key={item.id}><div className="upload-file"><b>{item.name}</b><small>{bytes(item.size)} · {item.status}</small></div><div className="progress-track"><span style={{ width: `${item.progress}%` }} /></div><strong>{item.progress}%</strong></div>)}</div></section>}
      {stats && <section className="metrics">{[['Original logical bytes', bytes(stats.logicalBytes)], ['Unique stored bytes', bytes(stats.uniquePhysicalBytes)], ['Actual replicated bytes', bytes(stats.replicatedPhysicalBytes)], ['Unique-content saving', bytes(stats.deduplicationSavedBytes)]].map((item) => <article key={item[0]}><small>{item[0]}</small><strong>{item[1]}</strong></article>)}</section>}
      {stats && <section className="proof-strip panel"><div><b>Storage proof</b><span>{stats.logicalBytes ? `${bytes(stats.physicalSavedBytes)} actual disk saving after replication` : 'Upload files to measure savings'}</span></div><div><b>{stats.uniqueChunks}</b><span>unique chunks</span></div><div><b>{stats.duplicateReferences}</b><span>reused references</span></div><div><b>{stats.replicas}</b><span>physical replicas</span></div></section>}
      <section className="content-grid"><div className="panel files-panel"><div className="panel-heading"><div><h3>Files</h3><p>{files.length} file{files.length === 1 ? '' : 's'} in your workspace</p></div></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Size</th><th>Uploaded</th><th className="actions">Actions</th></tr></thead><tbody>{files.map((file) => <tr key={file.id}><td className="file-name">{file.name}</td><td>{bytes(file.logical_size)}</td><td>{new Date(file.created_at).toLocaleDateString()}</td><td className="actions"><button className="link-button" onClick={() => download(file)}>Download</button><button className="link-button danger" onClick={() => remove(file)}>Delete</button></td></tr>)}{!files.length && <tr><td className="empty" colSpan="4">No files yet. Upload a file to get started.</td></tr>}</tbody></table></div></div><aside className="panel nodes-panel"><div className="panel-heading"><div><h3>Physical storage locations</h3><p>{nodes.filter((node) => node.status === 'ONLINE').length} of {nodes.length} online</p></div></div>{nodes.map((node) => <div className="node" key={node.id}><div><b>{node.name}</b><small>{node.path} · {bytes(node.used_space)} on disk · {node.chunks} chunks</small></div><span className={node.status === 'ONLINE' ? 'status online' : 'status offline'}>{node.status}</span></div>)}</aside></section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
