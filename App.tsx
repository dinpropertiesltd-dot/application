
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, PropertyFile, Notice, Message, Transaction } from './types';
import { MOCK_USERS, MOCK_FILES, MOCK_NOTICES, MOCK_MESSAGES } from './data';
import { supabase, isCloudEnabled } from './supabase';
import { 
  LayoutDashboard, 
  Bell, 
  Mail, 
  FileCheck, 
  LogOut, 
  Menu, 
  X, 
  Settings,
  ShieldCheck,
  RefreshCw,
  Home,
  PieChart,
  ArrowUpRight,
  TrendingUp,
  FileText,
  User as UserIcon,
  Database
} from 'lucide-react';

// Components
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import AccountStatement from './pages/AccountStatement';
import PublicNotices from './pages/PublicNotices';
import NewsAlerts from './pages/NewsAlerts';
import Inbox from './pages/Inbox';
import SOPs from './pages/SOPs';
import AdminPortal from './pages/AdminPortal';
import PropertyPortal from './pages/PropertyPortal';
import AIChatAssistant from './pages/AIChatAssistant';
import Profile from './pages/Profile';

// --- Global Registry Storage (IndexedDB) ---
const DB_NAME = 'DIN_PORTAL_CORE';
const STORE_NAME = 'registry';

const AsyncStorage = {
  getDB: (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 3);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  setItem: async (key: string, value: any): Promise<void> => {
    try {
      const db = await AsyncStorage.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(JSON.parse(JSON.stringify(value)), key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (e) { console.error("Critical Persistence Error:", e); }
  },
  getItem: async (key: string): Promise<any> => {
    try {
      const db = await AsyncStorage.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) { return null; }
  },
  clear: async (): Promise<void> => {
    const db = await AsyncStorage.getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
  }
};

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [allFiles, setAllFiles] = useState<PropertyFile[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<PropertyFile | null>(null);
  const [initialChatPartnerId, setInitialChatPartnerId] = useState<string | null>(null);

  // 1. BOOT: Load Local Storage First
  useEffect(() => {
    const boot = async () => {
      setIsLoading(true);
      try {
        const [u, f, n, m] = await Promise.all([
          AsyncStorage.getItem('users'),
          AsyncStorage.getItem('files'),
          AsyncStorage.getItem('notices'),
          AsyncStorage.getItem('messages')
        ]);

        setUsers(u || MOCK_USERS);
        setAllFiles(f || MOCK_FILES);
        setNotices(n || MOCK_NOTICES);
        setMessages(m || MOCK_MESSAGES);

        const session = sessionStorage.getItem('DIN_SESSION_USER');
        if (session) {
          const sUser = JSON.parse(session);
          const active = (u || MOCK_USERS).find((usr: User) => usr.id === sUser.id);
          if (active) setUser(active);
        }

        // Background Cloud Sync
        if (isCloudEnabled && supabase) {
          const { data: cUsers } = await supabase.from('profiles').select('*');
          const { data: cFiles } = await supabase.from('property_files').select('*');
          if (cUsers?.length) setUsers(cUsers);
          if (cFiles?.length) setAllFiles(cFiles);
        }
      } catch (err) {
        console.error("Registry Boot Failure:", err);
      } finally {
        setIsLoading(false);
      }
    };
    boot();
  }, []);

  // 2. AUTO-SAVE: Instant Persistence to Local DB
  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('users', users);
      AsyncStorage.setItem('files', allFiles);
      AsyncStorage.setItem('notices', notices);
      AsyncStorage.setItem('messages', messages);
    }
  }, [users, allFiles, notices, messages, isLoading]);

  const syncToCloud = useCallback(async (table: string, data: any) => {
    if (!isCloudEnabled || !supabase) return;
    setIsSyncing(true);
    try {
      const dbTable = table === 'users' ? 'profiles' : table === 'files' ? 'property_files' : table;
      await supabase.from(dbTable).upsert(JSON.parse(JSON.stringify(data)));
    } catch (err) { console.error("Cloud Sync Failed:", err); }
    finally { setTimeout(() => setIsSyncing(false), 800); }
  }, []);

  const handleUpdateUsers = (u: User[]) => { setUsers(u); syncToCloud('users', u); };
  const handleUpdateFiles = (f: PropertyFile[]) => { setAllFiles(f); syncToCloud('files', f); };
  
  const handleMassImport = useCallback(async (data: { users: User[], files: PropertyFile[] }, isDestructive?: boolean) => {
    setIsSyncing(true);
    let nUsers = isDestructive ? data.users : [...users];
    let nFiles = isDestructive ? data.files : [...allFiles];

    if (!isDestructive) {
      const uMap = new Map(nUsers.map(u => [u.cnic.replace(/[^0-9X]/g, ''), u]));
      data.users.forEach(u => uMap.set(u.cnic.replace(/[^0-9X]/g, ''), u));
      nUsers = Array.from(uMap.values());

      const fMap = new Map(nFiles.map(f => [f.fileNo, f]));
      data.files.forEach(f => fMap.set(f.fileNo, f));
      nFiles = Array.from(fMap.values());
    }

    // Set state
    setUsers(nUsers);
    setAllFiles(nFiles);

    // Hard Sync
    await AsyncStorage.setItem('users', nUsers);
    await AsyncStorage.setItem('files', nFiles);
    
    syncToCloud('users', nUsers);
    syncToCloud('files', nFiles);
    setIsSyncing(false);
  }, [users, allFiles, syncToCloud]);

  const handleLogin = (u: User) => {
    setUser(u);
    sessionStorage.setItem('DIN_SESSION_USER', JSON.stringify(u));
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    sessionStorage.removeItem('DIN_SESSION_USER');
    setCurrentPage('login');
    setSelectedFile(null);
  };

  const userCnicNorm = useMemo(() => user?.cnic.replace(/[^0-9X]/g, '') || '', [user]);
  const userFiles = useMemo(() => allFiles.filter(f => f.ownerCNIC.replace(/[^0-9X]/g, '') === userCnicNorm), [allFiles, userCnicNorm]);

  if (isLoading) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-20 h-20 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-8"></div>
      <h2 className="text-white font-black uppercase tracking-[0.4em] text-xs">Synchronizing Node</h2>
      <p className="text-slate-500 text-[10px] font-bold uppercase mt-3 tracking-widest">Master Registry Accessing...</p>
    </div>
  );

  if (!user) return <LoginPage onLogin={handleLogin} users={users} onRegister={(u) => handleUpdateUsers([...users, u])} />;

  const visibleMessages = messages.filter(m => user.role === 'ADMIN' || m.receiverId === user.id || m.receiverId === 'ALL' || m.senderId === user.id);
  const unreadCount = visibleMessages.filter(m => !m.isRead && m.receiverId === user.id).length;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'statement', label: 'Ledger', icon: FileText, hidden: user.role !== 'CLIENT' || userFiles.length === 0 },
    { id: 'property', label: 'Assets', icon: Home, hidden: user.role !== 'ADMIN' },
    { id: 'notices', label: 'Notices', icon: ShieldCheck },
    { id: 'alerts', label: 'News', icon: Bell },
    { id: 'inbox', label: 'Inbox', icon: Mail, badge: unreadCount },
    { id: 'sops', label: 'SOPs', icon: FileCheck },
    { id: 'profile', label: 'Profile', icon: UserIcon },
    { id: 'admin', label: 'Control', icon: Settings, hidden: user.role !== 'ADMIN' },
  ].filter(i => !i.hidden);

  const renderPage = () => {
    if (selectedFile) return <AccountStatement file={selectedFile} onBack={() => setSelectedFile(null)} />;
    switch (currentPage) {
      case 'dashboard': return <Dashboard onSelectFile={setSelectedFile} files={userFiles} userName={user.name} />;
      case 'property': return <PropertyPortal allFiles={allFiles} setAllFiles={handleUpdateFiles} onPreviewStatement={setSelectedFile} />;
      case 'notices': return <PublicNotices notices={notices} />;
      case 'alerts': return <NewsAlerts />;
      case 'inbox': return <Inbox messages={visibleMessages} setMessages={setMessages} currentUser={user} onSendMessage={(m) => setMessages(prev => [m, ...prev])} users={users} initialPartnerId={initialChatPartnerId} />;
      case 'sops': return <SOPs />;
      case 'profile': return <Profile user={user} onUpdate={(u) => { setUsers(users.map(o => o.id === u.id ? u : o)); setUser(u); }} />;
      case 'admin': return <AdminPortal users={users} setUsers={handleUpdateUsers} notices={notices} setNotices={setNotices} allFiles={allFiles} setAllFiles={handleUpdateFiles} messages={messages} onSendMessage={(m) => setMessages(prev => [m, ...prev])} onImportFullDatabase={handleMassImport} onResetDatabase={() => { AsyncStorage.clear(); window.location.reload(); }} onSwitchToChat={(id) => { setInitialChatPartnerId(id); setCurrentPage('inbox'); }} onPreviewStatement={setSelectedFile} />;
      default: return <Dashboard onSelectFile={setSelectedFile} files={userFiles} userName={user.name} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 relative overflow-x-hidden">
      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transition-transform duration-300 ease-in-out lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-8 border-b flex items-center justify-between font-black text-xl tracking-tighter text-slate-900">DIN PROPERTIES</div>
          <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar">
            {navItems.map((item) => (
              <button 
                key={item.id} 
                onClick={() => { setCurrentPage(item.id); setSelectedFile(null); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${currentPage === item.id ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <item.icon size={20} /> <span className="flex-1 text-left">{item.label}</span>
                {item.badge ? <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black">{item.badge}</span> : null}
              </button>
            ))}
          </nav>
          <div className="p-6 border-t space-y-4">
            {isSyncing && <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl animate-pulse text-[10px] font-black uppercase"><RefreshCw size={14} className="animate-spin" /> Node Sync Active</div>}
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-black text-red-600 hover:bg-red-50 transition-colors"><LogOut size={20} /> Terminate</button>
          </div>
        </div>
      </aside>
      <main className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarOpen ? 'lg:pl-72' : 'pl-0'}`}>
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b h-20 flex items-center px-4 lg:px-8 justify-between">
          <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2.5 text-slate-900"><Menu size={24} /></button>
          <div className="flex-1 flex justify-end items-center gap-4">
            {isCloudEnabled && (
              <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase border border-emerald-100">
                <Database size={14} /> Cloud Active
              </div>
            )}
             <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-black">{user.name.charAt(0)}</div>
          </div>
        </header>
        <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-10">{renderPage()}</div>
      </main>
      {user && <AIChatAssistant currentUser={user} userFiles={userFiles} allFiles={allFiles} />}
    </div>
  );
};

export default App;
