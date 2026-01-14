
import React, { useState, useRef, useMemo } from 'react';
import { User, Notice, PropertyFile, Transaction, Message } from '../types';
import { 
  Users, 
  Search, 
  ShieldCheck, 
  Zap, 
  Eye, 
  Settings,
  UploadCloud,
  RefreshCw,
  Edit,
  X,
  Plus,
  Trash2,
  Save,
  Bell,
  FileText,
  AlertTriangle
} from 'lucide-react';

interface AdminPortalProps {
  users: User[];
  setUsers: (users: User[]) => void;
  notices: Notice[];
  setNotices: React.Dispatch<React.SetStateAction<Notice[]>>;
  allFiles: PropertyFile[];
  setAllFiles: React.Dispatch<React.SetStateAction<PropertyFile[]>>;
  messages: Message[];
  onSendMessage: (msg: Message) => void;
  onImportFullDatabase?: (data: { users: User[], files: PropertyFile[] }, isDestructive?: boolean) => void;
  onResetDatabase?: () => void;
  onSwitchToChat?: (clientId: string) => void;
  onPreviewStatement?: (file: PropertyFile) => void;
}

const AdminPortal: React.FC<AdminPortalProps> = ({ 
  users, 
  setUsers, 
  notices,
  setNotices,
  allFiles, 
  onImportFullDatabase,
  onResetDatabase,
  onSwitchToChat,
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'USERS' | 'CONTENT' | 'SYSTEM'>('OVERVIEW');
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const masterSyncRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    let collection = 0, os = 0;
    allFiles.forEach(f => {
      f.transactions.forEach(t => collection += (t.amount_paid || 0));
      os += f.balance;
    });
    return { collection, os, count: allFiles.length };
  }, [allFiles]);

  const parseCSVLine = (line: string): string[] => {
    const columns: string[] = [];
    let cur = "", inQ = false;
    for (const char of line) {
      if (char === '"') inQ = !inQ;
      else if (char === ',' && !inQ) { columns.push(cur.trim()); cur = ""; }
      else cur += char;
    }
    columns.push(cur.trim());
    return columns;
  };

  const handleMasterSync = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = (event.target?.result as string).replace(/^\uFEFF/, '');
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length < 2) throw new Error("Format");

        const rawHeaders = parseCSVLine(lines[0]);
        const normH = rawHeaders.map(h => h.trim().toLowerCase());
        const getIdx = (names: string[]) => {
          for (const n of names) {
            const i = normH.indexOf(n.toLowerCase());
            if (i !== -1) return i;
          }
          return -1;
        };

        const col = (arr: string[], names: string[]) => {
          const i = getIdx(names);
          return i !== -1 ? arr[i]?.trim() : undefined;
        };

        const parseVal = (v: any) => {
          if (!v || v.toUpperCase() === 'NULL' || v === '-') return 0;
          return parseFloat(v.replace(/,/g, '').replace(/[()]/g, '')) || 0;
        };

        const userMap = new Map<string, User>();
        const fileMap = new Map<string, PropertyFile>();

        lines.slice(1).forEach((line, idx) => {
          const cols = parseCSVLine(line);
          const rawCNIC = col(cols, ['ocnic', 'cnic', 'u_ocnic']) || '';
          const normCNIC = rawCNIC.replace(/[^0-9X]/g, '');
          const itemCode = col(cols, ['itemcode', 'item_code', 'u_itemcode']) || '';
          
          if (!normCNIC || !itemCode) return;

          if (!userMap.has(normCNIC)) {
            userMap.set(normCNIC, {
              id: `user-${normCNIC}`,
              cnic: rawCNIC,
              name: col(cols, ['oname', 'ownername', 'name']) || 'SAP Member',
              email: `${normCNIC}@dinproperties.com.pk`,
              phone: col(cols, ['ocell', 'cellno']) || '-',
              role: 'CLIENT', status: 'Active', password: 'password123'
            });
          }

          if (!fileMap.has(itemCode)) {
            fileMap.set(itemCode, {
              fileNo: itemCode,
              currencyNo: col(cols, ['currencyno', 'currency']) || '-',
              plotSize: col(cols, ['dscription', 'description', 'size']) || 'Plot',
              plotValue: parseVal(col(cols, ['doctotal'])),
              balance: 0, receivable: 0, totalReceivable: 0, paymentReceived: 0, surcharge: 0, overdue: 0,
              ownerName: userMap.get(normCNIC)!.name, ownerCNIC: rawCNIC,
              fatherName: col(cols, ['ofatname', 'fathername']) || '-',
              cellNo: col(cols, ['ocell', 'cellno']) || '-',
              regDate: col(cols, ['otrfdate', 'regdate']) || '-',
              address: col(cols, ['opraddress', 'address']) || '-',
              // USER REQUESTED MAPPING: Plot | Block | Park | Corner | MB
              plotNo: col(cols, ['plot', 'plotno', 'u_plotno']) || '-',
              block: col(cols, ['block', 'u_block']) || '-',
              park: col(cols, ['park', 'u_park']) || '-',
              corner: col(cols, ['corner', 'u_corner']) || '-',
              mainBoulevard: col(cols, ['mb', 'mainboulevard', 'u_mainbu']) || '-',
              transactions: []
            });
          }

          const prop = fileMap.get(itemCode)!;
          const paidVal = parseVal(col(cols, ['reconsum', 'paid']));
          const osVal = parseVal(col(cols, ['balduedeb', 'balance']));
          
          prop.paymentReceived += paidVal;
          prop.balance += osVal;
          
          prop.transactions.push({
            seq: idx, transid: Date.now() + idx, line_id: 0, shortname: itemCode,
            duedate: col(cols, ['duedate']) || '-',
            receivable: parseVal(col(cols, ['receivable'])),
            u_intno: parseVal(col(cols, ['u_intno'])),
            u_intname: col(cols, ['u_intname']) || '',
            transtype: '13', itemcode: itemCode, plottype: 'Res', currency: 'PKR',
            description: '', doctotal: prop.plotValue, status: 'Synced',
            balance: 0, balduedeb: osVal, paysrc: 0, amount_paid: paidVal,
            receipt_date: col(cols, ['refdate']), mode: col(cols, ['mode']),
            surcharge: parseVal(col(cols, ['markup', 'surcharge']))
          });
        });

        if (onImportFullDatabase) {
          onImportFullDatabase({ 
            users: Array.from(userMap.values()), 
            files: Array.from(fileMap.values()) 
          }, true);
        }
        alert("Master Sync Complete: All records locked to local registry.");
      } catch (err) { alert("Format Error: Verify CSV columns."); }
      finally { setIsProcessing(false); }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-black uppercase tracking-tighter">Supervisors Node</h1>
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          {['OVERVIEW', 'USERS', 'CONTENT', 'SYSTEM'].map(t => (
            <button key={t} onClick={() => setActiveTab(t as any)} className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === t ? 'bg-indigo-900 text-white shadow-lg' : 'text-slate-500'}`}>{t}</button>
          ))}
        </div>
      </div>

      {activeTab === 'OVERVIEW' && (
        <div className="space-y-10">
          <div className="bg-indigo-950 p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-8">
                <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center"><UploadCloud size={32} /></div>
                <div><h2 className="text-3xl font-black uppercase">Registry Uplink</h2><p className="text-indigo-400 text-[11px] font-black tracking-widest mt-1">SECURE SAP TRANSACTION SYNC</p></div>
              </div>
              <button onClick={() => masterSyncRef.current?.click()} className="bg-white text-indigo-900 px-10 py-5 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-4 hover:scale-105 transition-all">
                {isProcessing ? <RefreshCw className="animate-spin" /> : <FileText />}
                Process Registry CSV
              </button>
              <input ref={masterSyncRef} type="file" className="hidden" accept=".csv" onChange={handleMasterSync} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
             <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Total Files</p><h4 className="text-2xl font-black">{stats.count}</h4></div>
             <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Collection</p><h4 className="text-2xl font-black text-emerald-600">PKR {stats.collection.toLocaleString()}</h4></div>
             <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Total O/S</p><h4 className="text-2xl font-black text-rose-600">PKR {stats.os.toLocaleString()}</h4></div>
             <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">System Load</p><h4 className="text-2xl font-black text-indigo-600">OPTIMAL</h4></div>
          </div>
        </div>
      )}
      
      {activeTab === 'SYSTEM' && (
        <div className="bg-white rounded-[3rem] p-12 border shadow-2xl space-y-8">
           <h3 className="text-2xl font-black uppercase">Data Maintenance</h3>
           <div className="flex gap-4">
              <button onClick={onResetDatabase} className="bg-rose-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px]">Wipe Local Cache</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminPortal;
