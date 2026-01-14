
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
  User as UserIcon
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

// --- Ultra-Robust Persistent Storage (IndexedDB) ---
const DB_NAME = 'DIN_PORTAL_V3';
const STORE_NAME = 'registry_data';

const AsyncStorage = {
  getDB: (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
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
    } catch (e) { console.error("Persistence Failure:", e); }
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

  // 1. PRIMARY BOOT SEQUENCE
  useEffect(() => {
    const bootstrap = async () => {
      setIsLoading(true);
      try {
        const localUsers = await AsyncStorage.getItem('users');
        const localFiles = await AsyncStorage.getItem('files');
        const localNotices = await AsyncStorage.getItem('notices');
        const localMessages = await AsyncStorage.getItem('messages');

        setUsers(localUsers || MOCK_USERS);
        setAllFiles(localFiles || MOCK_FILES);
        setNotices(localNotices || MOCK_NOTICES);
        setMessages(localMessages || MOCK_MESSAGES);

        const sessionStr = sessionStorage.getItem('DIN_SESSION_USER');
        if (sessionStr) {
          const savedSession = JSON.parse(sessionStr);
          const activeUser = (localUsers || MOCK_USERS).find((u: User) => u.id === savedSession.id);
          if (activeUser) setUser(activeUser);
        }

        if (isCloudEnabled && supabase) {
          const { data: cloudUsers } = await supabase.from('profiles').select('*');
          const { data: cloudFiles } = await supabase.from('property_files').select('*');
          if (cloudUsers?.length) setUsers(cloudUsers);
          if (cloudFiles?.length) setAllFiles(cloudFiles);
        }
      } catch (err) {
        console.error("Registry Load Error:", err);
      } finally {
        setIsLoading(false);
      }
    };
    bootstrap();
  }, []);

  // 2. CRITICAL AUTO-PERSISTENCE OBSERVER
  useEffect(() => {
    if (!isLoading) {
      const commitRegistry = async () => {
        await AsyncStorage.setItem('users', users);
        await AsyncStorage.setItem('files', allFiles);
        await AsyncStorage.setItem('notices', notices);
        await AsyncStorage.setItem('messages', messages);
      };
      commitRegistry();
    }
  }, [users, allFiles, notices, messages, isLoading]);

  const syncToCloud = useCallback(async (table: string, data: any) => {
    if (!isCloudEnabled || !supabase) return;
    setIsSyncing(true);
    try {
      const dbTable = table === 'users' ? 'profiles' : table === 'files' ? 'property_files' : table;
      await supabase.from(dbTable).upsert(JSON.parse(JSON.stringify(data)));
    } catch (err) { console.error(`Sync Fail:`, err); }
    finally { setTimeout(() => setIsSyncing(false), 500); }
  }, []);

  const handleUpdateUsers = (u: User[]) => { setUsers(u); syncToCloud('users', u); };
  const handleUpdateFiles = (f: PropertyFile[]) => { setAllFiles(f); syncToCloud('files', f); };
  const handleUpdateNotices = (n: Notice[]) => { setNotices(n); syncToCloud('notices', n); };
  const handleUpdateMessages = (updater: Message[] | ((prev: Message[]) => Message[])) => {
    const next = typeof updater === 'function' ? updater(messages) : updater;
    setMessages(next);
    syncToCloud('messages', next);
  };

  const handleMassImport = useCallback(async (data: { users: User[], files: PropertyFile[] }, isDestructive?: boolean) => {
    setIsSyncing(true);
    let nextUsers = isDestructive ? data.users : [...users];
    let nextFiles = isDestructive ? data.files : [...allFiles];

    if (!isDestructive) {
      const userMap = new Map(nextUsers.map(u => [u.cnic.replace(/[^0-9X]/g, ''), u]));
      data.users.forEach(u => userMap.set(u.cnic.replace(/[^0-9X]/g, ''), u));
      nextUsers = Array.from(userMap.values());

      const fileMap = new Map(nextFiles.map(f => [f.fileNo, f]));
      data.files.forEach(f => fileMap.set(f.fileNo, f));
      nextFiles = Array.from(fileMap.values());
    }

    setUsers(nextUsers);
    setAllFiles(nextFiles);
    
    // Explicit wait for local storage before potential refresh
    await AsyncStorage.setItem('users', nextUsers);
    await AsyncStorage.setItem('files', nextFiles);
    
    syncToCloud('users', nextUsers);
    syncToCloud('files', nextFiles);
    setIsSyncing(false);
  }, [users, allFiles, syncToCloud]);

  const handleResetDatabase = async () => {
    if (!window.confirm("RESET REGISTRY TO FACTORY DEFAULTS?")) return;
    await AsyncStorage.clear();
    setUsers(MOCK_USERS);
    setAllFiles(MOCK_FILES);
    setNotices(MOCK_NOTICES);
    setMessages(MOCK_MESSAGES);
    alert("Registry Purged.");
  };

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

  const userCnicNormalized = useMemo(() => user?.cnic.replace(/[^0-9X]/g, '') || '', [user]);
  const userFiles = useMemo(() => allFiles.filter(f => f.ownerCNIC.replace(/[^0-9X]/g, '') === userCnicNormalized), [allFiles, userCnicNormalized]);

  const portfolioSummary = useMemo(() => {
    if (!userFiles.length) return { totalReceived: 0, totalOutstanding: 0, collectionIndex: 0 };
    let received = 0, outstanding = 0;
    userFiles.forEach(f => {
      received += f.paymentReceived || 0;
      outstanding += f.balance || 0;
    });
    const total = received + outstanding;
    return { 
      totalReceived: received, 
      totalOutstanding: outstanding, 
      collectionIndex: total > 0 ? Math.round((received / total) * 100) : 0 
    };
  }, [userFiles]);

  if (isLoading) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-center">
      <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
      <h2 className="text-white font-black uppercase tracking-[0.3em] text-sm">Synchronizing Registry</h2>
      <p className="text-slate-500 text-[10px] font-bold uppercase mt-2">Authenticating Node Connection</p>
    </div>
  );

  if (!user) return <LoginPage onLogin={handleLogin} users={users} onRegister={(u) => handleUpdateUsers([...users, u])} />;

  const visibleMessages = messages.filter(m => user.role === 'ADMIN' || m.receiverId === user.id || m.receiverId === 'ALL' || m.senderId === user.id);
  const unreadCount = visibleMessages.filter(m => !m.isRead && m.receiverId === user.id).length;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'statement', label: 'Account Statement', icon: FileText, hidden: user.role !== 'CLIENT' || userFiles.length === 0 },
    { id: 'property', label: 'Registry', icon: Home, hidden: user.role !== 'ADMIN' },
    { id: 'notices', label: 'Notices', icon: ShieldCheck },
    { id: 'alerts', label: 'News', icon: Bell },
    { id: 'inbox', label: 'Messages', icon: Mail, badge: unreadCount },
    { id: 'sops', label: 'SOPs', icon: FileCheck },
    { id: 'profile', label: 'Profile', icon: UserIcon },
    { id: 'admin', label: 'Admin', icon: Settings, hidden: user.role !== 'ADMIN' },
  ].filter(i => !i.hidden);

  const renderPage = () => {
    if (selectedFile) return <AccountStatement file={selectedFile} onBack={() => setSelectedFile(null)} />;
    switch (currentPage) {
      case 'dashboard': return <Dashboard onSelectFile={setSelectedFile} files={userFiles} userName={user.name} />;
      case 'property': return <PropertyPortal allFiles={allFiles} setAllFiles={handleUpdateFiles} onPreviewStatement={setSelectedFile} />;
      case 'notices': return <PublicNotices notices={notices} />;
      case 'alerts': return <NewsAlerts />;
      case 'inbox': return <Inbox messages={visibleMessages} setMessages={setMessages} currentUser={user} onSendMessage={(m) => handleUpdateMessages(prev => [m, ...prev])} users={users} initialPartnerId={initialChatPartnerId} />;
      case 'sops': return <SOPs />;
      case 'profile': return <Profile user={user} onUpdate={(u) => { setUsers(users.map(old => old.id === u.id ? u : old)); setUser(u); }} />;
      case 'admin': return <AdminPortal users={users} setUsers={handleUpdateUsers} notices={notices} setNotices={setNotices} allFiles={allFiles} setAllFiles={handleUpdateFiles} messages={messages} onSendMessage={(m) => handleUpdateMessages(prev => [m, ...prev])} onImportFullDatabase={handleMassImport} onResetDatabase={handleResetDatabase} onSwitchToChat={(id) => { setInitialChatPartnerId(id); setCurrentPage('inbox'); }} onPreviewStatement={setSelectedFile} />;
      default: return <Dashboard onSelectFile={setSelectedFile} files={userFiles} userName={user.name} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 relative overflow-x-hidden">
      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transition-transform duration-300 ease-in-out lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-8 border-b flex items-center justify-between font-black text-xl tracking-tighter">DIN PROPERTIES</div>
          <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar">
            {navItems.map((item) => (
              <button key={item.id} onClick={() => { setCurrentPage(item.id); setSelectedFile(null); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${currentPage === item.id ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-500 hover:bg-slate-50'}`}>
                <item.icon size={20} /> <span className="flex-1 text-left">{item.label}</span>
                {item.badge ? <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black">{item.badge}</span> : null}
              </button>
            ))}
          </nav>
          <div className="p-6 border-t space-y-4">
            {isSyncing && <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl animate-pulse text-[10px] font-black uppercase"><RefreshCw size={14} className="animate-spin" /> Syncing Node</div>}
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-black text-red-600 hover:bg-red-50 transition-colors"><LogOut size={20} /> Terminate</button>
          </div>
        </div>
      </aside>
      <main className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarOpen ? 'lg:pl-72' : 'pl-0'}`}>
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b h-20 flex items-center px-4 lg:px-8 justify-between">
          <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2.5 text-slate-900"><Menu size={24} /></button>
          <div className="flex-1 flex justify-end items-center gap-4">
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
