
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

// --- Robust Persistent Storage Layer (IndexedDB) ---
const DB_NAME = 'DIN_PORTAL_STORAGE';
const STORE_NAME = 'registry';

const AsyncStorage = {
  getDB: (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
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
        store.put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (e) { console.error("Storage Error:", e); }
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
  removeItem: async (key: string): Promise<void> => {
    try {
      const db = await AsyncStorage.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (e) { console.error("Storage Error:", e); }
  }
};

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [notices, setNotices] = useState<Notice[]>(MOCK_NOTICES);
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);
  const [allFiles, setAllFiles] = useState<PropertyFile[]>(MOCK_FILES);
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<PropertyFile | null>(null);
  const [initialChatPartnerId, setInitialChatPartnerId] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      try {
        const sessionStr = sessionStorage.getItem('DIN_SESSION_USER');
        const savedSession = sessionStr ? JSON.parse(sessionStr) : null;
        
        if (isCloudEnabled && supabase) {
          const { data: usersData } = await supabase.from('profiles').select('*');
          const { data: filesData } = await supabase.from('property_files').select('*');
          const { data: noticesData } = await supabase.from('notices').select('*');
          const { data: messagesData } = await supabase.from('messages').select('*');
          
          if (usersData?.length) setUsers(usersData);
          if (filesData?.length) setAllFiles(filesData);
          if (noticesData?.length) setNotices(noticesData);
          if (messagesData?.length) setMessages(messagesData);
          
          if (savedSession) {
            const active = (usersData || MOCK_USERS).find(u => u.id === savedSession.id);
            if (active) setUser(active);
          }
        } else {
          const u = await AsyncStorage.getItem('DIN_PORTAL_USERS');
          const f = await AsyncStorage.getItem('DIN_PORTAL_FILES');
          const n = await AsyncStorage.getItem('DIN_PORTAL_NOTICES');
          const m = await AsyncStorage.getItem('DIN_PORTAL_MESSAGES');
          if (u) setUsers(u); 
          if (f) setAllFiles(f); 
          if (n) setNotices(n); 
          if (m) setMessages(m);
          if (savedSession) setUser(savedSession);
        }
      } catch (err) { 
        console.error("Initialization Error:", err); 
      } finally { 
        setIsLoading(false); 
      }
    };
    initData();
  }, []);

  const syncToCloud = useCallback(async (table: string, data: any) => {
    await AsyncStorage.setItem(`DIN_PORTAL_${table.toUpperCase()}`, data);
    if (!isCloudEnabled || !supabase) return;
    setIsSyncing(true);
    try {
      const dbTable = table === 'users' ? 'profiles' : table === 'files' ? 'property_files' : table;
      const cleanData = JSON.parse(JSON.stringify(data));
      await supabase.from(dbTable).upsert(cleanData);
    } catch (err) { 
      console.error(`Sync Failure for ${table}:`, err); 
    } finally { 
      setTimeout(() => setIsSyncing(false), 500); 
    }
  }, []);

  const handleUpdateUsers = (u: User[]) => { setUsers(u); syncToCloud('users', u); };
  
  const handleProfileUpdate = (updatedUser: User) => {
    const updatedUsers = users.map(u => u.id === updatedUser.id ? updatedUser : u);
    setUsers(updatedUsers);
    setUser(updatedUser);
    sessionStorage.setItem('DIN_SESSION_USER', JSON.stringify(updatedUser));
    syncToCloud('users', updatedUsers);
  };

  const handleUpdateFiles = (f: PropertyFile[]) => { setAllFiles(f); syncToCloud('files', f); };
  const handleUpdateNotices = (n: Notice[]) => { setNotices(n); syncToCloud('notices', n); };
  const handleUpdateMessages = (updater: Message[] | ((prev: Message[]) => Message[])) => {
    const next = typeof updater === 'function' ? updater(messages) : updater;
    setMessages(next); syncToCloud('messages', next);
  };

  const handleMassImport = useCallback((data: { users: User[], files: PropertyFile[] }, isDestructive?: boolean) => {
    let nextUsers = [...users];
    let nextFiles = [...allFiles];

    if (isDestructive) {
      nextUsers = data.users;
      nextFiles = data.files;
    } else {
      const userMap = new Map(nextUsers.map(u => [u.cnic.replace(/[^0-9X]/g, ''), u]));
      data.users.forEach(u => userMap.set(u.cnic.replace(/[^0-9X]/g, ''), u));
      nextUsers = Array.from(userMap.values());

      const fileMap = new Map(nextFiles.map(f => [f.fileNo, f]));
      data.files.forEach(f => fileMap.set(f.fileNo, f));
      nextFiles = Array.from(fileMap.values());
    }

    setUsers(nextUsers);
    setAllFiles(nextFiles);
    syncToCloud('users', nextUsers);
    syncToCloud('files', nextFiles);
  }, [users, allFiles, syncToCloud]);

  const handleResetDatabase = useCallback(async () => {
    if (!window.confirm("FATAL ACTION: This will purge the entire database and restore factory defaults. Proceed?")) return;
    
    setUsers(MOCK_USERS);
    setAllFiles(MOCK_FILES);
    setNotices(MOCK_NOTICES);
    setMessages(MOCK_MESSAGES);

    await AsyncStorage.removeItem('DIN_PORTAL_USERS');
    await AsyncStorage.removeItem('DIN_PORTAL_FILES');
    await AsyncStorage.removeItem('DIN_PORTAL_NOTICES');
    await AsyncStorage.removeItem('DIN_PORTAL_MESSAGES');

    syncToCloud('users', MOCK_USERS);
    syncToCloud('files', MOCK_FILES);
    syncToCloud('notices', MOCK_NOTICES);
    syncToCloud('messages', MOCK_MESSAGES);
    
    alert("Database reset complete.");
  }, [syncToCloud]);

  const handleLogin = (u: User) => { 
    const session = { ...u, isOnline: true }; 
    setUser(session); 
    sessionStorage.setItem('DIN_SESSION_USER', JSON.stringify(session)); 
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
    if (!userFiles.length) return { totalPlotValue: 0, totalReceived: 0, totalOutstanding: 0, totalSurcharge: 0, collectionIndex: 0 };
    
    let totalPlotValue = 0;
    let totalReceived = 0;
    let totalOutstanding = 0;
    let totalSurcharge = 0;

    userFiles.forEach(file => {
      totalPlotValue += file.plotValue || 0;
      file.transactions.forEach(t => {
        totalReceived += (t.amount_paid || 0);
        totalOutstanding += (t.balduedeb || 0);
        totalSurcharge += (t.surcharge || 0);
      });
    });

    const collectionIndex = totalPlotValue > 0 ? Math.round((totalReceived / (totalReceived + totalOutstanding)) * 100) : 0;

    return { totalPlotValue, totalReceived, totalOutstanding, totalSurcharge, collectionIndex };
  }, [userFiles]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(val);
  };

  const Logo = () => (
    <svg viewBox="0 0 300 120" width="140" height="56" xmlns="http://www.w3.org/2000/svg">
      <path fill="#6e6f72" d="M3.81,83.07c.44-1.57.68-3.15,1.25-4.69,5.64-15.3,24.1-15.79,36.44-22.4l5.16-3.01-.6,3.09c-1.54.92-3.04,1.93-4.61,2.78-12.11,6.59-31.14,7.31-36.2,22.64-.36,1.08-.92,2.75-.57,3.82-.12.57-.3,1.14-.34,1.72-.33-.12-.1-1.42-.52-1.72v-2.24Z"/>
      <polygon fill="#6e6f72" points="18.61 62.61 18.61 12.56 28.4 18.85 28.84 19.27 28.91 58.71 18.61 62.61"/>
      <path fill="#0c0b0b" d="M256.92,68.45c-.06,1.49.79,3.01,1.4,4.36,2.31,5.06,5.63,10.96,8.49,15.76.11.19.18.47.43.51.03-6.89.09-13.78-.51-20.64h5.85c-.43,2.37-.27,4.75-.34,7.14-.21,6.9-.32,13.9,0,20.8.04.94.28,2.05.34,3.01h-6.02c-.36-1.54-1.25-3.06-1.98-4.48-2.93-5.67-6.23-11.16-9.12-16.85-.08,7.1-.33,14.25.26,21.33h-5.85c.08-.84.3-1.84.34-2.67.35-7.35.25-14.83,0-22.18-.07-2.04.1-4.09-.34-6.11h7.05Z"/>
      <path fill="#0c0b0b" d="M95,68.45c.13,1.1.47,1.98.88,2.99.84,2.02,2.13,4.33,3.16,6.31,1.96,3.78,4.15,7.45,6.2,11.18.39.07.23-.17.26-.43.28-3.26-.09-6.72-.18-9.97s.09-6.74-.51-10.07h6.02c-.45,1.61-.27,3.26-.34,4.91-.29,7.01-.29,14.13,0,21.14.07,1.64-.11,3.3.34,4.91h-6.02l-11.1-21.15c-.39-.07-.23.17-.26.43-.31,3.71.1,7.65.18,11.35.06,3.13-.2,6.28.34,9.38h-5.85c.45-3.11.27-6.25.34-9.38.13-5.85.22-11.68.01-17.54-.05-1.29-.29-2.73-.35-4.03h6.88Z"/>
      <path fill="#0aa98f" d="M4.32,87.03c.04-.58.23-1.15.34-1.72,3.52-17.37,24.06-18.15,36.83-25.02,1.32-.71,2.59-1.53,3.87-2.32.12-.04.11.13.09.26-.3,1.98-2.24,5.93-3.3,7.71-5.53,9.21-14.94,13.33-24.66,16.8-3.8,1.36-8.51,3.15-12.34,4.18-.27.07-.54.15-.83.12Z"/>
      <path fill="#0c0b0b" d="M176.91,99.41l.35-4.21c.14-5.46.09-10.9-.01-16.34-.07-3.48.11-6.96-.34-10.41,3.83.15,7.81-.19,11.62,0,5.29.26,10.21,1.66,11.21,7.54s-1.96,9.41-7.35,10.61l8.95,12.81h-7.92c-.16-1.59-.97-3.02-1.69-4.42-.5-.97-4.79-8.31-5.28-8.31h-3.87c0,4.25-.04,8.52.52,12.73h-6.19ZM182.59,83.07h6.97c.85,0,2.9-.84,3.53-1.46,1.88-1.82,1.79-5.82-.36-7.39-.52-.38-2.41-1.13-3-1.13h-6.97l-.17,9.97Z"/>
      <path fill="#0c0b0b" d="M202.72,99.41c.16-1.86.11-3.73.17-5.6.01-.45.18-.87.19-1.36.19-8-.02-16.03-.35-24,6.81.37,15.72-1.82,19.93,5.11,3.18,5.23,3.37,15,.24,20.29-4.32,7.28-13.01,5.27-20.16,5.56ZM208.4,94.77h4.73c7.48,0,7.5-13.28,5.23-17.95-.76-1.57-2.88-3.55-4.71-3.55h-5.25v21.5Z"/>
      <path fill="#0c0b0b" d="M53.88,99.41c.09-.89.3-1.96.34-2.84.33-7.13.22-14.36,0-21.49-.07-2.22.1-4.44-.34-6.63,7.19.37,16.1-1.92,20.33,5.56,2.88,5.08,2.98,14.37.17,19.49-4.21,7.67-13.19,5.63-20.5,5.9ZM59.73,94.77h4.56c7.61,0,7.71-13.12,5.37-17.92-.77-1.58-2.83-3.58-4.68-3.58h-5.25v21.5Z"/>
      <path fill="#0aa98f" d="M44.07,105.43c-4.6,1.67-9.06,2.57-13.94,1.64-8.71-1.66-15.07-8.8-21.5-14.28-1.25-1.07-3.02-2.18-4.13-3.26-.18-.18-.4-.3-.34-.6,4.34-1.7,8.64-2.59,13.28-1.67,8.12,1.6,14.37,8.73,20.53,13.7,1.97,1.59,4.02,3.05,6.1,4.47Z"/>
      <path fill="#0c0b0b" d="M148.35,99.41c3-9.01,6.47-17.92,8.93-27.1.16-.6.67-3.54.78-3.69.27-.39,6.61-.03,7.56-.17,2.93,10.47,6.3,20.85,10.26,30.97h-6.37c.02-1.39-.36-2.95-.81-4.26-.19-.55-.27-1.45-.98-1.43l-11.68.04c-.25.08-.28.29-.37.49-.69,1.47-.69,3.7-1.38,5.16h-5.94ZM157.29,89.26h9.46l-4.91-14.1-4.56,14.1Z"/>
      <path fill="#0c0b0b" d="M244.53,86.68c-3.64-.57-7.34-.27-11.01-.34l.17,8.08c2.9-.15,5.8.23,8.7.18.41,0,.78-.17,1.19-.19,1.7-.09,3.24.12,4.91-.51l-.52,5.84-20.48-.6c.1-1.03.31-2.25.35-3.27.25-6.31.16-12.61,0-18.91-.07-2.85.09-5.69-.34-8.52l19.63-.27.5,5.77c-1.2-.47-2.57-.62-3.86-.69-3.34-.18-6.74.1-10.07.18l-.17,8.08c3.67-.09,7.38.26,11.01-.34v5.5Z"/>
      <path fill="#0c0b0b" d="M144.56,75.68c-6.48-5.9-12.65-1.98-13.25,6.11-.52,7.01,1.13,16.32,10.47,12.79-.1-4.51.37-9.11-.32-13.56h5.51v18.4c-.92-.11-2.11-.32-3.01-.34-4.7-.13-8.27,2.91-13.15-.79-7.21-5.48-6.95-24.38,1.31-28.93,4.27-2.35,7.44-1.51,11.75-.28.33.09.81.02,1.05.16.38.22-.35,1.69-.35,2.07v4.39Z"/>
      <path fill="#6e6f72" d="M5.01,31.99l6.28,3.95c.58.38,3.74,2.38,3.84,2.7l.04,25.6-.18.5c-3.7,2.41-6.93,5.64-9.04,9.54l-.94,2.07V31.99Z"/>
      <path fill="#0c0b0b" d="M294.94,69.66c-.06,2.19-.14,4.33,0,6.53-.3.08-.34-.12-.52-.26-2.86-2.21-4.42-3.32-8.35-3.02-2.45.19-7.16,2.07-5.21,5.22,1.36,2.2,7.74,3.83,10.24,5.24,8.54,4.85,5.61,14.97-3.52,16.49-4.02.67-7.96-.22-11.92-.89l-.16-6.46c3.11,2.35,7.41,3.14,11.18,2.15,3.52-.93,5.2-4.22,1.78-6.59-3.12-2.16-7.36-2.75-10.38-5.28-5.45-4.56-3.08-12.15,3.35-14.2,4.76-1.51,8.92-.22,13.51,1.04Z"/>
      <path fill="#6e6f72" d="M32.54,27.35l7.83,4.98,2.29,1.67.05,19.06-.12.27c-3.24,1.62-6.49,3.46-10.05,4.28v-30.27Z"/>
      <path fill="#0c0b0b" d="M85.54,68.45c-.53,3.27-.27,6.59-.34,9.9-.12,5.98-.29,12.06-.01,18.06.04.95.3,2.04.35,3h-6.28v-30.96h6.28Z"/>
    </svg>
  );

  if (isLoading) return <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4"><div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-6"></div><h2 className="text-white font-black uppercase tracking-[0.3em] text-sm animate-pulse">Initializing Portal</h2></div>;
  if (!user) return <LoginPage onLogin={handleLogin} users={users} onRegister={(u) => handleUpdateUsers([...users, u])} />;

  const visibleMessages = messages.filter(m => user.role === 'ADMIN' || m.receiverId === user.id || m.receiverId === 'ALL' || m.senderId === user.id);
  const unreadCount = visibleMessages.filter(m => !m.isRead && m.receiverId === user.id).length;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'statement', label: 'Account Statement', icon: FileText, hidden: user.role !== 'CLIENT' || userFiles.length === 0 },
    { id: 'property', label: 'Property', icon: Home, hidden: user.role !== 'ADMIN' },
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
      case 'inbox': return <Inbox messages={visibleMessages} setMessages={handleUpdateMessages} currentUser={user} onSendMessage={(m) => { setMessages([m, ...messages]); syncToCloud('messages', [m, ...messages]); }} users={users} initialPartnerId={initialChatPartnerId} />;
      case 'sops': return <SOPs />;
      case 'profile': return <Profile user={user} onUpdate={handleProfileUpdate} />;
      case 'admin': return <AdminPortal users={users} setUsers={handleUpdateUsers} notices={notices} setNotices={setNotices} allFiles={allFiles} setAllFiles={handleUpdateFiles} messages={messages} onSendMessage={(m) => { setMessages([m, ...messages]); syncToCloud('messages', [m, ...messages]); }} onImportFullDatabase={handleMassImport} onResetDatabase={handleResetDatabase} onSwitchToChat={(id) => { setInitialChatPartnerId(id); setCurrentPage('inbox'); }} onPreviewStatement={setSelectedFile} />;
      default: return <Dashboard onSelectFile={setSelectedFile} files={userFiles} userName={user.name} />;
    }
  };

  const handleSidebarNav = (id: string) => {
    if (id === 'statement' && userFiles.length > 0) {
      setSelectedFile(userFiles[0]);
    } else {
      setCurrentPage(id); 
      setSelectedFile(null); 
    }
    if (window.innerWidth < 1024) setIsSidebarOpen(false); 
  };

  return (
    <div className="flex min-h-screen bg-slate-50 relative overflow-x-hidden">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transition-transform duration-300 ease-in-out lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-8 border-b flex items-center justify-between">
            <Logo />
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:bg-slate-50 rounded-xl">
              <X size={24} />
            </button>
          </div>
          
          <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar">
            {navItems.map((item) => (
              <button 
                key={item.id} 
                onClick={() => handleSidebarNav(item.id)} 
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${((currentPage === item.id && !selectedFile) || (item.id === 'statement' && selectedFile)) ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <item.icon size={20} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge ? (
                  <span className={`${currentPage === item.id ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-600'} text-[10px] px-2 py-0.5 rounded-full font-black`}>
                    {item.badge}
                  </span>
                ) : null}
              </button>
            ))}

            {/* Live Ledger Summary Widget for Clients */}
            {user.role === 'CLIENT' && userFiles.length > 0 && (
              <div className="mt-8 pt-8 border-t border-slate-100">
                <div className="px-4 mb-4 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Ledger Summary</span>
                  <PieChart size={14} className="text-emerald-500" />
                </div>
                
                <div className="mx-2 bg-slate-900 rounded-3xl p-5 text-white shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full translate-x-1/2 -translate-y-1/2 blur-2xl"></div>
                  
                  <div className="relative z-10 space-y-4">
                    <div>
                      <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Inbound Total</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[10px] font-bold text-slate-400">PKR</span>
                        <span className="text-lg font-black">{formatCurrency(portfolioSummary.totalReceived)}</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-end mb-1.5">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Collection Index</p>
                        <p className="text-[10px] font-black text-emerald-400">{portfolioSummary.collectionIndex}%</p>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${portfolioSummary.collectionIndex}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between border-t border-white/5">
                      <div>
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">O/S Ledger</p>
                        <p className="text-xs font-black text-slate-200">PKR {formatCurrency(portfolioSummary.totalOutstanding)}</p>
                      </div>
                      <button 
                        onClick={() => handleSidebarNav('statement')}
                        className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition-colors"
                      >
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </nav>
          
          <div className="p-6 border-t bg-slate-50/50 space-y-4">
            {isSyncing && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl animate-pulse">
                <RefreshCw size={14} className="animate-spin" />
                <span className="text-[10px] font-black uppercase tracking-widest">Registry Syncing</span>
              </div>
            )}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Identity Verified</p>
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              </div>
              <p className="text-sm font-black text-slate-900 truncate">{user.name}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-tight">{user.role} TERMINAL</p>
            </div>
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-black text-red-600 hover:bg-red-50 transition-colors">
              <LogOut size={20} /> Terminate Session
            </button>
          </div>
        </div>
      </aside>

      <main className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarOpen ? 'lg:pl-72' : 'pl-0'}`}>
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 h-20 flex items-center px-4 lg:px-8 justify-between">
          <button 
            onClick={() => setIsSidebarOpen(true)} 
            className={`p-2.5 text-slate-900 hover:bg-slate-50 rounded-xl transition-all ${isSidebarOpen ? 'lg:hidden' : 'flex'}`}
          >
            <Menu size={24} />
          </button>
          
          <div className="flex-1 flex justify-end items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 px-5 py-2.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-900/10 border border-slate-800">
              <ShieldCheck size={16} className="text-emerald-400" /> Authorized Registry Access
            </div>
            <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white font-black text-xl shadow-2xl shadow-slate-900/20 border border-slate-800">
              {user.name.charAt(0)}
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-10 overflow-x-hidden">
          {renderPage()}
        </div>
      </main>

      {/* Global AI Assistant - Authenticated Only */}
      {user && (
        <AIChatAssistant 
          currentUser={user} 
          userFiles={userFiles} 
          allFiles={allFiles} 
        />
      )}
    </div>
  );
};

export default App;
