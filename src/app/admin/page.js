'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [config, setConfig] = useState({ 
    id: 1, pendaftaran_dibuka: true, mode_waktu_aktif: false, jam_buka: '07:30:00', jam_tutup: '15:00:00', 
    kuota_pembuatan: 50, kuota_verifikasi: 50,
    offset_kuota_pembuatan: 0, offset_kuota_verifikasi: 0,
    checklist_pembuatan: [], checklist_verifikasi: [] 
  });
  
  const [inputChecklistPembuatan, setInputChecklistPembuatan] = useState('');
  const [inputChecklistVerifikasi, setInputChecklistVerifikasi] = useState('');
  
  const [showModalSyarat, setShowModalSyarat] = useState(false);
  const [modalLanjutan, setModalLanjutan] = useState({ show: false, jenis: null, namaLayanan: '', idSelesai: null });

  const [daftarAntrian, setDaftarAntrian] = useState([]);
  
  const [statistik, setStatistik] = useState({ 
    pemUnik: 0, verUnik: 0,
    pemMenunggu: 0, verMenunggu: 0, khsMenunggu: 0,
    pemSelesai: 0, verSelesai: 0, khsSelesai: 0
  });

  const [aksiLoading, setAksiLoading] = useState(null);
  
  const [namaManual, setNamaManual] = useState('');
  const [asalManual, setAsalManual] = useState('');
  const [hpManual, setHpManual] = useState('');
  const [jenisManual, setJenisManual] = useState('pembuatan_akun');
  const [keteranganKhusus, setKeteranganKhusus] = useState('');
  const [isSubmitManual, setIsSubmitManual] = useState(false);

  const tglSekarang = new Date().toISOString().split('T')[0];
  const [tanggalArsip, setTanggalArsip] = useState(tglSekarang);
  const [dataArsip, setDataArsip] = useState([]);

  useEffect(() => {
    const cekSesiAktif = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setIsLoggedIn(true);
      setIsCheckingAuth(false);
    };
    cekSesiAktif();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') setIsLoggedIn(true);
      if (event === 'SIGNED_OUT') setIsLoggedIn(false);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAksiLoading('login');
    const { error } = await supabase.auth.signInWithPassword({ email: username, password: password });
    if (error) alert('Gagal Login: ' + error.message);
    setAksiLoading(null);
  };

  const handleLogout = async () => {
    if (confirm('Anda yakin ingin keluar dari sistem?')) await supabase.auth.signOut();
  };

  const fetchPengaturan = async () => {
    const { data } = await supabase.from('pengaturan_sistem').select('*').eq('id', 1).single();
    if (data) setConfig(data);
  };

  const fetchDaftarAntrian = async () => {
    const { data } = await supabase.from('antrian').select('*').eq('tanggal', tglSekarang).order('created_at', { ascending: true });
    if (data) setDaftarAntrian(data);
  };

  useEffect(() => {
    if (!daftarAntrian) return;
    
    const hpsPembuatan = new Set(daftarAntrian.filter(a => a.jenis_antrian === 'pembuatan_akun').map(a => a.nomor_hp)).size;
    const hpsVerifikasi = new Set(daftarAntrian.filter(a => a.jenis_antrian === 'verifikasi_akun').map(a => a.nomor_hp)).size;

    setStatistik({
      pemUnik: Math.max(0, hpsPembuatan - (config.offset_kuota_pembuatan || 0)),
      verUnik: Math.max(0, hpsVerifikasi - (config.offset_kuota_verifikasi || 0)),
      
      pemMenunggu: daftarAntrian.filter(a => a.jenis_antrian === 'pembuatan_akun' && a.status === 'menunggu').length,
      verMenunggu: daftarAntrian.filter(a => a.jenis_antrian === 'verifikasi_akun' && a.status === 'menunggu').length,
      khsMenunggu: daftarAntrian.filter(a => a.jenis_antrian === 'khusus' && a.status === 'menunggu').length,

      pemSelesai: daftarAntrian.filter(a => a.jenis_antrian === 'pembuatan_akun' && a.status === 'selesai').length,
      verSelesai: daftarAntrian.filter(a => a.jenis_antrian === 'verifikasi_akun' && a.status === 'selesai').length,
      khsSelesai: daftarAntrian.filter(a => a.jenis_antrian === 'khusus' && a.status === 'selesai').length
    });

  }, [daftarAntrian, config]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchPengaturan(); fetchDaftarAntrian();
      const channel = supabase.channel('admin_rt_v5_' + Date.now());
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'antrian' }, () => fetchDaftarAntrian());
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'pengaturan_sistem' }, () => fetchPengaturan());
      channel.subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (tanggalArsip === tglSekarang) {
      setDataArsip(daftarAntrian.filter(a => a.status === 'selesai'));
    } else {
      const fetchArsipMasaLalu = async () => {
        const { data } = await supabase.from('antrian').select('*').eq('tanggal', tanggalArsip).eq('status', 'selesai').order('created_at', { ascending: false });
        if (data) setDataArsip(data);
      };
      fetchArsipMasaLalu();
    }
  }, [tanggalArsip, daftarAntrian, isLoggedIn]);

  const ubahSistemManajemenForm = async (kolom, nilai) => {
    await supabase.from('pengaturan_sistem').update({ [kolom]: nilai }).eq('id', 1);
  };

  const tambahChecklist = async (tipe) => {
    if (tipe === 'pembuatan' && inputChecklistPembuatan) {
      await ubahSistemManajemenForm('checklist_pembuatan', [...config.checklist_pembuatan, inputChecklistPembuatan]);
      setInputChecklistPembuatan('');
    } else if (tipe === 'verifikasi' && inputChecklistVerifikasi) {
      await ubahSistemManajemenForm('checklist_verifikasi', [...config.checklist_verifikasi, inputChecklistVerifikasi]);
      setInputChecklistVerifikasi('');
    }
  };

  const hapusChecklist = async (tipe, indeks) => {
    if (tipe === 'pembuatan') {
      await ubahSistemManajemenForm('checklist_pembuatan', config.checklist_pembuatan.filter((_, idx) => idx !== indeks));
    } else {
      await ubahSistemManajemenForm('checklist_verifikasi', config.checklist_verifikasi.filter((_, idx) => idx !== indeks));
    }
  };

  const downloadRekapCSV = () => {
    if (dataArsip.length === 0) return alert(`Belum ada rekapan data.`);
    const header = ["Nomor Tiket", "Nama Lengkap", "Asal Sekolah", "Nomor HP", "Jenis Layanan", "Status", "Keterangan", "Waktu Selesai"].join(",");
    const rows = dataArsip.map(item => `"${item.nomor_antrian}","${item.nama_lengkap}","${item.asal_sekolah}","'${item.nomor_hp}","${item.jenis_antrian}","${item.status}","${item.keterangan || '-'}","${new Date(item.created_at).toLocaleTimeString('id-ID')}"`);
    const blob = new Blob([[header, ...rows].join("\n")], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Rekap_${tanggalArsip}.csv`; link.click();
  };

  const triggerPanggilUlangSuara = async (id) => {
    setAksiLoading(`${id}-suara`);
    await supabase.from('antrian').update({ updated_at: new Date().toISOString() }).eq('id', id);
    setAksiLoading(null);
  };

  const prosesUbahStatus = async (item, statusBaru) => {
    setAksiLoading(`${item.id}-${statusBaru}`);
    try {
      const { data, error } = await supabase.from('antrian').update({ status: statusBaru, updated_at: new Date().toISOString() }).eq('id', item.id).eq('status', item.status).select();
      if (error) throw error;
      if (!data || data.length === 0) return alert('⚠️ Gagal: Status sudah diubah Loket lain!');

      if (statusBaru === 'selesai') {
        const listTertunda = daftarAntrian.filter(a => a.jenis_antrian === item.jenis_antrian && a.status === 'dipanggil' && a.id !== item.id);
        const nextBaru = daftarAntrian.find(a => a.jenis_antrian === item.jenis_antrian && a.status === 'menunggu');

        if (listTertunda.length === 0 && nextBaru) {
          await supabase.from('antrian').update({ status: 'dipanggil', updated_at: new Date().toISOString() }).eq('id', nextBaru.id).eq('status', 'menunggu');
        } else if (listTertunda.length > 0) {
          const namaLayanan = item.jenis_antrian === 'pembuatan_akun' ? 'Pengajuan Akun' : item.jenis_antrian === 'verifikasi_akun' ? 'Verifikasi Akun' : 'Antrean Khusus';
          setModalLanjutan({ show: true, jenis: item.jenis_antrian, namaLayanan, idSelesai: item.id });
        }
      }
    } catch (err) { alert('Sistem Terganggu: ' + err.message); } finally { setAksiLoading(null); }
  };

  const eksekusiPanggilBaruDariModal = async (idNext) => {
    setAksiLoading('panggil-baru');
    await supabase.from('antrian').update({ status: 'dipanggil', updated_at: new Date().toISOString() }).eq('id', idNext).eq('status', 'menunggu');
    setModalLanjutan({ show: false, jenis: null, namaLayanan: '', idSelesai: null }); setAksiLoading(null);
  };

  const eksekusiPanggilUlangDariModal = async (idTertunda) => {
    setAksiLoading(`${idTertunda}-panggil-ulang`);
    await supabase.from('antrian').update({ updated_at: new Date().toISOString() }).eq('id', idTertunda);
    setModalLanjutan({ show: false, jenis: null, namaLayanan: '', idSelesai: null }); 
    setAksiLoading(null);
  };

  const handleInputManualAdmin = async (e) => {
    e.preventDefault(); if (!namaManual || !asalManual || !hpManual) return;
    setIsSubmitManual(true);
    try {
      const { error } = await supabase.rpc('ambil_antrian_atomic', { p_nama_lengkap: namaManual, p_asal_sekolah: asalManual, p_nomor_hp: hpManual, p_jenis_antrian: jenisManual, p_keterangan: jenisManual === 'khusus' ? keteranganKhusus : null });
      if (error) alert('Gagal menambahkan: ' + error.message);
      else { setNamaManual(''); setAsalManual(''); setHpManual(''); setKeteranganKhusus(''); }
    } finally { setIsSubmitManual(false); }
  };

  const resetKuotaTerbit = async (jenis, displayInfo) => {
    const konfirmasi = prompt(`PERINGATAN: Ini hanya akan mereset angka "Kuota Terbit" ke 0 (Nol) TANPA menghapus data antrean siswa di tabel. \n\nKetik "RESET" untuk mereset Kuota Terbit bagian [ ${displayInfo} ] ke 0:`);
    if (konfirmasi === 'RESET') {
      setAksiLoading(`reset-${jenis}`);
      let kolomOffset = jenis === 'pembuatan' ? 'offset_kuota_pembuatan' : 'offset_kuota_verifikasi';
      let targetJenis = jenis === 'pembuatan' ? 'pembuatan_akun' : 'verifikasi_akun';
      let siswaReal = new Set(daftarAntrian.filter(a => a.jenis_antrian === targetJenis).map(a => a.nomor_hp)).size;

      const { error } = await supabase.from('pengaturan_sistem').update({ [kolomOffset]: siswaReal }).eq('id', 1);
      if (error) alert('Gagal reset! Pastikan Anda sudah menjalankan perintah SQL penambahan kolom offset di Supabase. ' + error.message);
      else alert(`Kuota ${displayInfo} berhasil direset!`);
      setAksiLoading(null);
    } else if (konfirmasi !== null) {
      alert('Teks salah, reset dibatalkan.');
    }
  };

  const renderTabelAntrian = (listData, title, headerBg) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
      <div className={`${headerBg} text-white px-3 py-2 font-bold flex justify-between items-center text-xs`}>
        <span>{title}</span>
        <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">{listData.length} Antrean</span>
      </div>
      <div className="overflow-x-auto max-h-[32rem] overflow-y-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
              <th className="p-2 text-center w-16">Tiket</th><th className="p-2">Identitas</th><th className="p-2 text-center w-28">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-700">
            {listData.length === 0 ? <tr><td colSpan="3" className="p-4 text-center text-slate-400 italic">Kosong</td></tr> : listData.map((item) => (
              <tr key={item.id} className={`hover:bg-slate-50/60 ${item.status === 'dipanggil' ? 'bg-blue-50/50 font-medium' : ''}`}>
                <td className="p-2 text-center">
                  <span className="font-black text-slate-950 text-xs block">{item.nomor_antrian}</span>
                  <span className="text-[8px] text-slate-400 font-bold block mt-0.5">{new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                </td>
                <td className="p-2">
                  <p className="font-bold text-slate-900 leading-tight">{item.nama_lengkap}</p>
                  <p className="text-[9px] text-slate-400">{item.asal_sekolah} • {item.nomor_hp}</p>
                  {item.keterangan && <p className="text-[9px] font-medium text-rose-600 bg-rose-50 px-1 py-0.5 rounded mt-0.5 inline-block leading-tight">Note: {item.keterangan}</p>}
                </td>
                <td className="p-2 text-center align-middle">
                  <div className="flex flex-col gap-1 w-full">
                    {item.status === 'menunggu' && <button onClick={() => prosesUbahStatus(item, 'dipanggil')} disabled={!!aksiLoading} className="bg-blue-600 text-white px-2 py-1.5 rounded font-bold text-[10px] hover:bg-blue-700 transition-colors">Panggil</button>}
                    {item.status === 'dipanggil' && (
                      <>
                        <button onClick={() => prosesUbahStatus(item, 'selesai')} disabled={!!aksiLoading} className="bg-green-600 text-white px-2 py-1.5 rounded font-bold text-[10px] hover:bg-green-700 transition-colors">Selesai</button>
                        <button onClick={() => triggerPanggilUlangSuara(item.id)} disabled={!!aksiLoading} className={`px-2 py-1 rounded font-bold text-[9px] transition-all ${aksiLoading === `${item.id}-suara` ? 'bg-blue-200 text-blue-900 animate-pulse' : 'bg-blue-50 hover:bg-blue-100 text-blue-700'}`}>
                          {aksiLoading === `${item.id}-suara` ? '⏳ Memanggil...' : '🔊 Panggil Ulang'}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const arsipPembuatan = dataArsip.filter(a => a.jenis_antrian === 'pembuatan_akun');
  const arsipVerifikasi = dataArsip.filter(a => a.jenis_antrian === 'verifikasi_akun');
  const arsipKhusus = dataArsip.filter(a => a.jenis_antrian === 'khusus');

  if (isCheckingAuth) return <main className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white animate-pulse">Memuat sistem keamanan...</p></main>;

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full">
          <div className="text-center mb-5">
            <h1 className="text-sm font-black text-slate-900 tracking-wider">LOG IN PANEL KENDALI</h1>
            <p className="text-[10px] text-slate-400">SMA Negeri 3 Sragen</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Email Auth</label>
              <input type="email" required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-slate-50 outline-none focus:border-blue-500" placeholder="admin@domain.com" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Password Server</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-slate-50 outline-none focus:border-blue-500" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={aksiLoading === 'login'} className="w-full text-white font-bold py-2 rounded-lg bg-blue-600 hover:bg-blue-700">Masuk Sistem</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-xs text-slate-800 antialiased relative">
      
      {showModalSyarat && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <h2 className="text-sm font-black text-slate-800">⚙️ Pengaturan Syarat Pendaftaran</h2>
              <button onClick={() => setShowModalSyarat(false)} className="bg-slate-200 hover:bg-rose-500 hover:text-white text-slate-500 rounded-full w-6 h-6 flex items-center justify-center font-bold transition-colors">✕</button>
            </div>
            
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
              <div className="border border-blue-100 bg-blue-50/30 p-4 rounded-xl space-y-3">
                <h3 className="font-bold text-blue-900 border-b border-blue-100 pb-1">Syarat PENGAJUAN AKUN</h3>
                <div className="flex gap-1">
                  <input type="text" value={inputChecklistPembuatan} onChange={(e) => setInputChecklistPembuatan(e.target.value)} placeholder="Ketik syarat baru..." className="w-full px-2 py-1.5 border border-blue-200 rounded bg-white text-[10px] outline-none focus:border-blue-400" />
                  <button onClick={() => tambahChecklist('pembuatan')} className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded font-bold">Add</button>
                </div>
                <ul className="divide-y divide-blue-100 text-[10px] text-slate-600 max-h-48 overflow-y-auto pr-1">
                  {config.checklist_pembuatan.map((item, idx) => (
                    <li key={idx} className="py-1.5 flex justify-between items-center group">
                      <span className="truncate flex-1">{item}</span>
                      <button onClick={() => hapusChecklist('pembuatan', idx)} className="text-rose-400 hover:text-rose-600 font-bold px-1.5 opacity-50 group-hover:opacity-100">✕</button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border border-emerald-100 bg-emerald-50/30 p-4 rounded-xl space-y-3">
                <h3 className="font-bold text-emerald-900 border-b border-emerald-100 pb-1">Syarat VERIFIKASI AKUN</h3>
                <div className="flex gap-1">
                  <input type="text" value={inputChecklistVerifikasi} onChange={(e) => setInputChecklistVerifikasi(e.target.value)} placeholder="Ketik syarat baru..." className="w-full px-2 py-1.5 border border-emerald-200 rounded bg-white text-[10px] outline-none focus:border-emerald-400" />
                  <button onClick={() => tambahChecklist('verifikasi')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 rounded font-bold">Add</button>
                </div>
                <ul className="divide-y divide-emerald-100 text-[10px] text-slate-600 max-h-48 overflow-y-auto pr-1">
                  {config.checklist_verifikasi.map((item, idx) => (
                    <li key={idx} className="py-1.5 flex justify-between items-center group">
                      <span className="truncate flex-1">{item}</span>
                      <button onClick={() => hapusChecklist('verifikasi', idx)} className="text-rose-400 hover:text-rose-600 font-bold px-1.5 opacity-50 group-hover:opacity-100">✕</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalLanjutan.show && (() => {
        const nextBaru = daftarAntrian.find(a => a.jenis_antrian === modalLanjutan.jenis && a.status === 'menunggu');
        const listTertunda = daftarAntrian.filter(a => a.jenis_antrian === modalLanjutan.jenis && a.status === 'dipanggil' && a.id !== modalLanjutan.idSelesai);
        
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transition-all transform scale-100">
              <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
                <h2 className="text-sm font-black tracking-wide">Langkah Selanjutnya: {modalLanjutan.namaLayanan}</h2>
              </div>
              
              <div className="p-5 space-y-4">
                
                <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">1. Lanjut Panggil Baru</p>
                  {nextBaru ? (
                    <div className="flex justify-between items-center gap-3">
                      <div>
                        <p className="font-black text-xl text-emerald-900 leading-none">{nextBaru.nomor_antrian}</p>
                        <p className="text-[10px] text-emerald-700 mt-1 font-medium truncate max-w-[150px]">{nextBaru.nama_lengkap}</p>
                      </div>
                      <button onClick={() => eksekusiPanggilBaruDariModal(nextBaru.id)} disabled={!!aksiLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg font-bold text-[11px] shadow-sm active:scale-95 transition-transform">
                        {aksiLoading === 'panggil-baru' ? 'Memproses...' : 'Panggil Antrean Ini'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic py-1">Semua antrean baru sudah habis ditarik.</p>
                  )}
                </div>

                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">2. Panggil Ulang Yang Tertunda</p>
                  {listTertunda.length > 0 ? (
                    <div className="max-h-32 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {listTertunda.map(pu => (
                        <div key={pu.id} className="flex justify-between items-center bg-white p-2 border border-amber-100 rounded-lg shadow-sm">
                          <div>
                            <p className="font-black text-slate-800">{pu.nomor_antrian}</p>
                            <p className="text-[9px] text-slate-500 font-medium truncate max-w-[120px]">{pu.nama_lengkap}</p>
                          </div>
                          <button onClick={() => eksekusiPanggilUlangDariModal(pu.id)} disabled={!!aksiLoading} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border active:scale-95 transition-all ${aksiLoading === `${pu.id}-panggil-ulang` ? 'bg-amber-300 text-amber-900 border-amber-400 animate-pulse' : 'bg-amber-100 hover:bg-amber-200 text-amber-700 border-amber-200'}`}>
                            {aksiLoading === `${pu.id}-panggil-ulang` ? '⏳ Memanggil...' : '🔊 Panggil Ulang'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic py-1">Tidak ada antrean menggantung.</p>
                  )}
                </div>

              </div>

              <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button onClick={() => setModalLanjutan({ show: false, jenis: null, namaLayanan: '', idSelesai: null })} disabled={!!aksiLoading} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-[11px] font-bold transition-colors">
                  Tutup Saja (Jangan Panggil Siapapun)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="max-w-screen-2xl mx-auto space-y-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-sm font-black text-slate-900">Panel Utama Pengendali SPMB SMAN 3 Sragen</h1>
            <p className="text-[10px] text-slate-400">Sistem teroptimasi • Keamanan konkurensi multi-loket aktif</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setShowModalSyarat(true)} className="bg-slate-800 text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg font-bold shadow-sm">
              ⚙️ Atur Syarat
            </button>
            <div className="bg-slate-50 p-1.5 border rounded-lg flex items-center gap-2">
              <span className="font-bold text-slate-500">Status Form:</span>
              <button onClick={() => ubahSistemManajemenForm('pendaftaran_dibuka', !config.pendaftaran_dibuka)} className={`px-3 py-1 rounded font-bold text-white transition-all ${config.pendaftaran_dibuka ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                {config.pendaftaran_dibuka ? 'FORM DIBUKA' : 'FORM DITUTUP'}
              </button>
            </div>
            <button onClick={handleLogout} className="px-2.5 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-lg font-bold">Keluar</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <div className="bg-white p-4 rounded-xl border border-blue-200 border-l-4 border-l-blue-600 space-y-3 shadow-sm">
            <div className="flex justify-between items-start border-b border-slate-100 pb-2">
              <div>
                <p className="text-[10px] font-bold text-blue-500">PENGAJUAN AKUN (A)</p>
                <div className="flex gap-4 mt-1">
                  <div><span className="text-xl font-black text-blue-700">{statistik.pemUnik}</span><span className="text-[9px] text-slate-400 ml-1 block">Tercatat</span></div>
                  <div><span className="text-xl font-black text-amber-500">{statistik.pemMenunggu}</span><span className="text-[9px] text-slate-400 ml-1 block">Tunggu</span></div>
                  <div><span className="text-xl font-black text-emerald-600">{statistik.pemSelesai}</span><span className="text-[9px] text-slate-400 ml-1 block">Selesai</span></div>
                </div>
              </div>
              <button onClick={() => resetKuotaTerbit('pembuatan', 'Pengajuan Akun')} disabled={aksiLoading === 'reset-pembuatan'} className="bg-blue-50 text-blue-600 hover:bg-rose-100 hover:text-rose-600 px-2 py-1 rounded text-[9px] font-bold">
                {aksiLoading === 'reset-pembuatan' ? 'Mereset...' : '🔄 Reset'}
              </button>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="font-bold text-blue-800 text-[10px] uppercase">Batas Kuota Pengajuan:</span>
              <input type="number" value={config.kuota_pembuatan} onChange={(e) => ubahSistemManajemenForm('kuota_pembuatan', parseInt(e.target.value) || 0)} className="w-16 text-center border border-blue-200 rounded bg-blue-50 p-1 font-bold text-blue-900 outline-none" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-emerald-200 border-l-4 border-l-emerald-600 space-y-3 shadow-sm">
            <div className="flex justify-between items-start border-b border-slate-100 pb-2">
              <div>
                <p className="text-[10px] font-bold text-emerald-500">VERIFIKASI AKUN (B)</p>
                <div className="flex gap-4 mt-1">
                  <div><span className="text-xl font-black text-emerald-700">{statistik.verUnik}</span><span className="text-[9px] text-slate-400 ml-1 block">Tercatat</span></div>
                  <div><span className="text-xl font-black text-amber-500">{statistik.verMenunggu}</span><span className="text-[9px] text-slate-400 ml-1 block">Tunggu</span></div>
                  <div><span className="text-xl font-black text-emerald-600">{statistik.verSelesai}</span><span className="text-[9px] text-slate-400 ml-1 block">Selesai</span></div>
                </div>
              </div>
              <button onClick={() => resetKuotaTerbit('verifikasi', 'Verifikasi Akun')} disabled={aksiLoading === 'reset-verifikasi'} className="bg-emerald-50 text-emerald-600 hover:bg-rose-100 hover:text-rose-600 px-2 py-1 rounded text-[9px] font-bold">
                {aksiLoading === 'reset-verifikasi' ? 'Mereset...' : '🔄 Reset'}
              </button>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="font-bold text-emerald-800 text-[10px] uppercase">Batas Kuota Verifikasi:</span>
              <input type="number" value={config.kuota_verifikasi} onChange={(e) => ubahSistemManajemenForm('kuota_verifikasi', parseInt(e.target.value) || 0)} className="w-16 text-center border border-emerald-200 rounded bg-emerald-50 p-1 font-bold text-emerald-900 outline-none" />
            </div>
          </div>

        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 xl:grid-cols-5 gap-4 items-start">
          
          <div className="space-y-4 lg:col-span-1 xl:col-span-1">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3 sticky top-4">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="font-black text-slate-900 text-sm">➕ Antrean Manual</h3>
                <p className="text-[9px] text-slate-400 mt-0.5">Sisipkan antrean oleh Admin</p>
              </div>
              <form onSubmit={handleInputManualAdmin} className="space-y-2.5">
                <div>
                  <label className="text-[9px] font-bold text-slate-500 mb-0.5 block">Nama Lengkap</label>
                  <input type="text" required placeholder="Cth: Budi Santoso" value={namaManual} onChange={(e) => setNamaManual(e.target.value)} className="w-full px-2 py-1.5 border rounded-lg bg-slate-50 outline-none focus:border-slate-400" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 mb-0.5 block">Asal Sekolah</label>
                  <input type="text" required placeholder="Cth: SMP N 1 Sragen" value={asalManual} onChange={(e) => setAsalManual(e.target.value)} className="w-full px-2 py-1.5 border rounded-lg bg-slate-50 outline-none focus:border-slate-400" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 mb-0.5 block">Nomor WhatsApp</label>
                  <input type="tel" required placeholder="Cth: 081234" value={hpManual} onChange={(e) => setHpManual(e.target.value)} className="w-full px-2 py-1.5 border rounded-lg bg-slate-50 outline-none focus:border-slate-400" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 mb-0.5 block">Tujuan Loket</label>
                  <select value={jenisManual} onChange={(e) => setJenisManual(e.target.value)} className="w-full px-2 py-1.5 border rounded-lg bg-slate-50 font-bold outline-none cursor-pointer">
                    <option value="pembuatan_akun">PENGAJUAN AKUN (A)</option>
                    <option value="verifikasi_akun">VERIFIKASI AKUN (B)</option>
                    <option value="khusus">ANTREAN KHUSUS (K)</option>
                  </select>
                </div>
                {jenisManual === 'khusus' && (
                  <div>
                    <label className="text-[9px] font-bold text-rose-500 mb-0.5 block">Catatan Prioritas</label>
                    <textarea required placeholder="Alasan..." value={keteranganKhusus} onChange={(e) => setKeteranganKhusus(e.target.value)} className="w-full px-2 py-1.5 border border-rose-200 bg-rose-50/30 rounded-lg outline-none" rows="2" />
                  </div>
                )}
                <button type="submit" disabled={isSubmitManual} className={`w-full text-white font-bold py-2 rounded-lg transform transition-all active:scale-95 ${isSubmitManual ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-800'}`}>
                  {isSubmitManual ? 'Memproses...' : 'Masukkan ke Antrean'}
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-3 xl:col-span-4 space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {renderTabelAntrian(daftarAntrian.filter(a => a.jenis_antrian === 'pembuatan_akun' && a.status !== 'selesai'), '📋 PENGAJUAN AKUN', 'bg-blue-600')}
              {renderTabelAntrian(daftarAntrian.filter(a => a.jenis_antrian === 'verifikasi_akun' && a.status !== 'selesai'), '📋 VERIFIKASI AKUN', 'bg-emerald-600')}
              {renderTabelAntrian(daftarAntrian.filter(a => a.jenis_antrian === 'khusus' && a.status !== 'selesai'), '📋 Antrean Khusus', 'bg-rose-600')}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">🗄️</span>
                  <div>
                    <h2 className="font-black text-slate-800">Manajer Arsip & Rekap Data Selesai</h2>
                    <p className="text-[10px] text-slate-400">Pilih tanggal untuk melihat atau mengunduh data terdahulu.</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 text-[10px] pl-1">Tanggal:</span>
                  <input type="date" value={tanggalArsip} onChange={(e) => setTanggalArsip(e.target.value)} className="text-slate-900 px-2 py-1 rounded bg-white border border-slate-200 text-xs font-bold outline-none cursor-pointer" />
                  <button onClick={downloadRekapCSV} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold shadow-sm ml-1">
                    📥 Download CSV
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/50 rounded-lg p-2 border border-slate-100">
                <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                  <div className="bg-slate-700 text-white px-3 py-1.5 font-bold flex justify-between text-[10px]">
                    <span>ARSIP PENGAJUAN AKUN</span><span className="bg-white/20 px-1.5 rounded">{arsipPembuatan.length}</span>
                  </div>
                  <div className="overflow-y-auto max-h-40 divide-y bg-white text-[10px]">
                    {arsipPembuatan.length === 0 ? <p className="p-3 italic text-slate-400 text-center">Kosong</p> : arsipPembuatan.map(a => (
                      <div key={a.id} className="p-2 flex justify-between"><span className="font-bold">{a.nomor_antrian}</span><span className="truncate max-w-[120px]">{a.nama_lengkap}</span></div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                  <div className="bg-slate-700 text-white px-3 py-1.5 font-bold flex justify-between text-[10px]">
                    <span>ARSIP VERIFIKASI AKUN</span><span className="bg-white/20 px-1.5 rounded">{arsipVerifikasi.length}</span>
                  </div>
                  <div className="overflow-y-auto max-h-40 divide-y bg-white text-[10px]">
                    {arsipVerifikasi.length === 0 ? <p className="p-3 italic text-slate-400 text-center">Kosong</p> : arsipVerifikasi.map(a => (
                      <div key={a.id} className="p-2 flex justify-between"><span className="font-bold">{a.nomor_antrian}</span><span className="truncate max-w-[120px]">{a.nama_lengkap}</span></div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                  <div className="bg-slate-700 text-white px-3 py-1.5 font-bold flex justify-between text-[10px]">
                    <span>ARSIP ANTREAN KHUSUS</span><span className="bg-white/20 px-1.5 rounded">{arsipKhusus.length}</span>
                  </div>
                  <div className="overflow-y-auto max-h-40 divide-y bg-white text-[10px]">
                    {arsipKhusus.length === 0 ? <p className="p-3 italic text-slate-400 text-center">Kosong</p> : arsipKhusus.map(a => (
                      <div key={a.id} className="p-2 flex justify-between"><span className="font-bold">{a.nomor_antrian}</span><span className="truncate max-w-[120px]">{a.nama_lengkap}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}