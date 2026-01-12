
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
  const [pendingSyncMode, setPendingSyncMode] = useState<'MERGE' | 'WIPE'>('MERGE');
  
  const masterSyncRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    let totalCollection = 0;
    let totalOutstanding = 0;

    allFiles.forEach(file => {
      file.transactions.forEach(t => {
        totalCollection += (t.amount_paid || 0);
      });
      totalOutstanding += file.balance;
    });

    return {
      totalCollection,
      totalOutstanding,
      fileCount: allFiles.length
    };
  }, [allFiles]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(val);
  };

  const parseCSVLine = (line: string): string[] => {
    const columns: string[] = [];
    let currentColumn = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        columns.push(currentColumn.trim());
        currentColumn = "";
      } else {
        currentColumn += char;
      }
    }
    columns.push(currentColumn.trim());
    return columns;
  };

  const parseSAPDate = (dateStr: string) => {
    if (!dateStr || dateStr === '-' || dateStr === '' || dateStr === 'NULL') return null;
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return null;
      const day = parseInt(parts[0]);
      const monthStr = parts[1];
      let year = parseInt(parts[2]);
      if (year < 100) year += 2000;
      
      const months: Record<string, number> = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
      };
      const normalizedMonth = monthStr.charAt(0).toUpperCase() + monthStr.slice(1).toLowerCase();
      const month = months[normalizedMonth.substring(0, 3)];
      if (month === undefined) return null;
      
      return new Date(year, month, day);
    } catch (e) { return null; }
  };

  const handleMasterSync = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = (event.target?.result as string).replace(/^\uFEFF/, '');
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error("Format Invalid");

        const rawHeaders = parseCSVLine(lines[0]);
        const normalizedHeaders = rawHeaders.map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
        
        const getIdx = (names: string[]) => {
          for (const name of names) {
            const target = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const idx = normalizedHeaders.indexOf(target);
            if (idx !== -1) return idx;
          }
          return -1;
        };

        const col = (arr: string[], names: string[]): string | undefined => {
          const idx = getIdx(names);
          const val = idx !== -1 ? arr[idx]?.trim() : undefined;
          if (val && val.toUpperCase() === 'NULL') return '';
          return val;
        };

        const parseVal = (val: string | undefined): number => {
          if (!val || val.toUpperCase() === 'NULL' || val === '-' || val === '') return 0;
          const clean = val.replace(/,/g, '').replace(/[()]/g, '').trim();
          const parsed = parseFloat(clean);
          return isNaN(parsed) ? 0 : parsed;
        };

        const userMap = new Map<string, User>();
        const fileMap = new Map<string, PropertyFile>();

        lines.slice(1).forEach((line, index) => {
          const cols = parseCSVLine(line);
          const rawCNIC = col(cols, ['ocnic', 'cnic', 'u_ocnic']) || '';
          const normalizedCNIC = rawCNIC.replace(/[^0-9X]/g, '') || '';
          const itemCode = col(cols, ['itemcode', 'item_code', 'u_itemcode']) || '';
          
          if (!normalizedCNIC || !itemCode) return;

          if (!userMap.has(normalizedCNIC)) {
            userMap.set(normalizedCNIC, {
              id: `user-${normalizedCNIC}`,
              cnic: rawCNIC,
              name: col(cols, ['oname', 'ownername', 'name']) || 'SAP Member',
              email: `${normalizedCNIC}@dinproperties.com.pk`,
              phone: col(cols, ['ocell', 'cellno', 'phone']) || '-',
              role: 'CLIENT', status: 'Active', password: 'password123'
            });
          }

          if (!fileMap.has(itemCode)) {
            fileMap.set(itemCode, {
              fileNo: itemCode, 
              currencyNo: col(cols, ['currency', 'currencyno']) || '-',
              plotSize: `${col(cols, ['dscription', 'description', 'size']) || 'Plot'}`,
              plotValue: parseVal(col(cols, ['doctotal'])),
              balance: 0, receivable: 0, totalReceivable: 0, paymentReceived: 0,
              surcharge: 0, overdue: 0,
              ownerName: userMap.get(normalizedCNIC)!.name,
              ownerCNIC: rawCNIC,
              fatherName: col(cols, ['ofatname', 'fathername', 'father_name']) || '-',
              cellNo: col(cols, ['ocell', 'cellno', 'cell_no']) || '-',
              regDate: col(cols, ['otrfdate', 'regdate']) || '-',
              address: col(cols, ['opraddress', 'address', 'owner_address']) || '-',
              plotNo: '-', block: '-', park: '-', corner: '-', mainBoulevard: '-',
              transactions: []
            });
          }

          const prop = fileMap.get(itemCode)!;
          
          const recVal = parseVal(col(cols, ['receivable']));
          const paidVal = parseVal(col(cols, ['reconsum', 'paid', 'amount_paid']));
          const surchargeVal = parseVal(col(cols, ['markup', 'surcharge']));
          const osVal = parseVal(col(cols, ['balduedeb', 'os_balance', 'balance']));
          const rDate = col(cols, ['refdate', 'receipt_date', 'ref_date']);
          const pMode = col(cols, ['mode', 'payment_mode']);
          const iNo = col(cols, ['instnum', 'instrument', 'inst_num', 'instrument_no']);

          prop.transactions.push({
            seq: index + 1,
            transid: parseVal(col(cols, ['transid'])) || Date.now() + index,
            line_id: parseVal(col(cols, ['line_id'])) || 0, 
            shortname: col(cols, ['shortname']) || itemCode, 
            duedate: col(cols, ['duedate', 'due_date']) || '-',
            receivable: recVal, 
            u_intno: parseVal(col(cols, ['u_intno'])) || 0,
            u_intname: col(cols, ['u_intname', 'type']) || '',
            transtype: col(cols, ['transtype']) || '13',
            itemcode: itemCode, 
            plottype: col(cols, ['plottype']) || 'Residential', 
            currency: 'PKR', 
            description: col(cols, ['dscription', 'description']) || '',
            doctotal: prop.plotValue, 
            status: col(cols, ['status']) || (paidVal >= (recVal || 0) && recVal > 0 ? 'Paid' : 'Unpaid'),
            balance: parseVal(col(cols, ['balance'])),
            balduedeb: osVal, 
            paysrc: parseVal(col(cols, ['paysrc'])), 
            amount_paid: paidVal, 
            receipt_date: (rDate && rDate.toUpperCase() !== 'NULL') ? rDate : '',
            mode: (pMode && pMode.toUpperCase() !== 'NULL') ? pMode : '', 
            surcharge: surchargeVal,
            instrument_no: (iNo && iNo.toUpperCase() !== 'NULL') ? iNo : ''
          });
        });

        const today = new Date();
        today.setHours(0,0,0,0);

        fileMap.forEach(prop => {
          const totalPaid = prop.transactions.reduce((sum, t) => sum + (t.amount_paid || 0), 0);
          const totalSurcharge = prop.transactions.reduce((sum, t) => sum + (t.surcharge || 0), 0);
          
          let totalOS = 0;
          let totalOverdue = 0;

          // Crucial: Group by installment ID to find current OS balance per item
          const planItems = new Map<number, { os: number, duedate: string }>();
          const otherItems: { os: number, duedate: string }[] = [];

          prop.transactions.forEach(t => {
            if (t.u_intno > 0) {
              // Update with the balance from the latest CSV row for this installment
              planItems.set(t.u_intno, { os: t.balduedeb || 0, duedate: t.duedate });
            } else {
              otherItems.push({ os: t.balduedeb || 0, duedate: t.duedate });
            }
          });

          // Calculate Balances & Overdue exactly like SAP
          planItems.forEach((item) => {
            totalOS += item.os;
            const dueDate = parseSAPDate(item.duedate);
            if (dueDate && dueDate < today && item.os > 0) {
              totalOverdue += item.os;
            }
          });

          otherItems.forEach((item) => {
            totalOS += item.os;
            const dueDate = parseSAPDate(item.duedate);
            if (dueDate && dueDate < today && item.os > 0) {
              totalOverdue += item.os;
            }
          });

          prop.paymentReceived = totalPaid;
          prop.surcharge = totalSurcharge;
          prop.balance = totalOS;
          prop.overdue = totalOverdue; 
        });

        if (onImportFullDatabase) {
          onImportFullDatabase({ 
            users: Array.from(userMap.values()), 
            files: Array.from(fileMap.values()) 
          }, pendingSyncMode === 'WIPE');
        }
        alert("Import Successful: Records Synchronized.");
      } catch (err) { 
        console.error(err);
        alert("Import Error: Please verify the CSV format and column headers."); 
      } finally { 
        setIsProcessing(false); 
      }
    };
    reader.readAsText(file);
  };

  const handleAddNotice = () => {
    const newNotice: Notice = {
      id: Math.random().toString(36).substr(2,9),
      title: 'NEW POLICY UPDATE',
      content: 'Detailed description of the new policy goes here.',
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      type: 'Public'
    };
    setNotices([newNotice, ...notices]);
  };

  const handleDeleteNotice = (id: string) => {
    setNotices(notices.filter(n => n.id !== id));
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.cnic.includes(searchTerm)
  );

  return (
    <div className="space-y-6 sm:space-y-10 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight uppercase">Supervisor Terminal</h1>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-full uppercase tracking-widest border border-indigo-200"><ShieldCheck size={14} /> LEVEL: ADMIN ACCESS</div>
          </div>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-2xl shadow-inner overflow-x-auto no-scrollbar">
          {(['OVERVIEW', 'USERS', 'CONTENT', 'SYSTEM'] as const).map((tab) => (
            <button key={tab} onClick={() => { setActiveTab(tab); setSearchTerm(''); }} className={`px-5 sm:px-8 py-2.5 rounded-xl sm:rounded-2xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'bg-indigo-900 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}>{tab}</button>
          ))}
        </div>
      </div>

      {activeTab === 'OVERVIEW' && (
        <div className="space-y-10">
          <div className="bg-indigo-950 p-8 sm:p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none"></div>
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
              <div className="flex items-center gap-8">
                 <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-indigo-600/40"><UploadCloud size={32} /></div>
                 <div><h2 className="text-3xl font-black uppercase tracking-tight">SAP Sync Unit</h2><p className="text-indigo-400 text-[11px] font-black uppercase tracking-[0.4em] mt-1">Cross-Client Import Active</p></div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                <button onClick={() => masterSyncRef.current?.click()} className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-5 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-4 transition-all active:scale-95">
                  {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <FileText size={20} />}
                  Upload Registry CSV
                </button>
                <input ref={masterSyncRef} type="file" className="hidden" accept=".csv" onChange={handleMasterSync} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Files', value: stats.fileCount, icon: FileText, color: 'text-blue-600' },
              { label: 'Gross Collection', value: formatCurrency(stats.totalCollection), icon: Zap, color: 'text-emerald-600' },
              { label: 'Total O/S', value: formatCurrency(stats.totalOutstanding), icon: AlertTriangle, color: 'text-amber-600' },
              { label: 'System Load', value: 'OPTIMAL', icon: ShieldCheck, color: 'text-indigo-600' },
            ].map((s, idx) => (
              <div key={idx} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
                <div className="flex items-center justify-between mb-4">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                   <s.icon size={16} className={s.color} />
                </div>
                <h4 className="text-xl font-black text-slate-900 truncate">{s.value}</h4>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'USERS' && (
        <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-200 overflow-hidden">
          <div className="p-8 border-b">
            <div className="relative w-full max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input type="text" placeholder="Search Master Member Registry..." className="w-full pl-12 pr-6 py-5 bg-slate-50 border border-slate-200 rounded-[2rem] text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <table className="w-full text-left">
            <thead><tr className="bg-slate-50 text-[10px] uppercase font-black text-slate-400 tracking-widest border-b"><th className="px-10 py-6">Member Identity</th><th className="px-10 py-6">Identity No (CNIC)</th><th className="px-10 py-6 text-right">Admin Control</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-10 py-8"><div className="font-black text-slate-900 text-sm uppercase">{u.name}</div><div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{u.email}</div></td>
                  <td className="px-10 py-8 font-black text-slate-900 text-sm">{u.cnic}</td>
                  <td className="px-10 py-8 text-right flex justify-end gap-3">
                    <button onClick={() => onSwitchToChat?.(u.id)} className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><Settings size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'CONTENT' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900 uppercase">Public Notice Management</h3>
            <button onClick={handleAddNotice} className="bg-slate-900 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-black transition-all">
              <Plus size={16} /> New Announcement
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {notices.map((n) => (
              <div key={n.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center"><Bell size={24} /></div>
                  <div>
                    <h4 className="font-black text-slate-900 text-sm uppercase">{n.title}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{n.date} | {n.type} UPDATE</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="p-2.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"><Edit size={16} /></button>
                  <button onClick={() => handleDeleteNotice(n.id)} className="p-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'SYSTEM' && (
        <div className="bg-white rounded-[3rem] p-10 shadow-2xl border border-slate-200 space-y-10">
          <div className="flex items-start gap-8">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center shrink-0"><AlertTriangle size={32} /></div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Destructive Protocols</h3>
              <p className="text-slate-500 font-medium mt-1 leading-relaxed">System-wide data purges are irreversible. These operations are logged with authorized IP timestamps.</p>
              <div className="mt-8 flex flex-wrap gap-4">
                <button onClick={onResetDatabase} className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-red-600/20 transition-all active:scale-95">Purge Global Database</button>
                <button onClick={() => alert("Maintenance Mode Triggered.")} className="bg-slate-900 hover:bg-black text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl transition-all">Enable Maintenance Loop</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPortal;
