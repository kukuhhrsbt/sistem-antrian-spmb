'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [config, setConfig] = useState({ id: 1, pendaftaran_dibuka: true, mode_waktu_aktif: false, jam_buka: '07:30:00', jam_tutup: '15:00:00', kuota_harian: 100, checklist_pembuatan: [], checklist_verifikasi: [] });
  const [inputChecklistPembuatan, setInputChecklistPembuatan] = useState('');
  const [inputChecklistVerifikasi, setInputChecklistVerifikasi] = useState('');
  
  const [showModalSyarat, setShowModalSyarat] = useState(false);

  const [daftarAntrian, setDaftarAntrian] = useState([]);
  const [totalSiswaUnik, setTotalSiswaUnik] = useState(0);
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
    if (confirm('Anda yakin ingin keluar dari sistem?')) {
      await supabase.auth.signOut();
    }
  };

  const fetchPengaturan = async () => {
    const { data } = await supabase.from('pengaturan_sistem').select('*').eq('id', 1).single();
    if (data) setConfig(data);
  };

  const fetchDaftarAntrian = async () => {
    const { data } = await supabase.from('antrian').select('*').eq('tanggal', tglSekarang).order('created_at', { ascending: true });
    if (data) {
      setDaftarAntrian(data);
      setTotalSiswaUnik(new Set(data.map(item => item.nomor_hp)).size);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchPengaturan();
      fetchDaftarAntrian();

      const channelName = 'admin_rt_' + Date.now();
      const channel = supabase.channel(channelName);
      
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
    let listUpdate = [];
    if (tipe === 'pembuatan') {
      if (!inputChecklistPembuatan) return;
      listUpdate = [...config.checklist_pembuatan, inputChecklistPembuatan];
      await supabase.from('pengaturan_sistem').update({ checklist_pembuatan: listUpdate }).eq('id', 1);
      setInputChecklistPembuatan('');
    } else {
      if (!inputChecklistVerifikasi) return;
      listUpdate = [...config.checklist_verifikasi, inputChecklistVerifikasi];
      await supabase.from('pengaturan_sistem').update({ checklist_verifikasi: listUpdate }).eq('id', 1);
      setInputChecklistVerifikasi('');
    }
  };

  const hapusChecklist = async (tipe, indeks) => {
    let listUpdate = [];
    if (tipe === 'pembuatan') {
      listUpdate = config.checklist_pembuatan.filter((_, idx) => idx !== indeks);
      await supabase.from('pengaturan_sistem').update({ checklist_pembuatan: listUpdate }).eq('id', 1);
    } else {
      listUpdate = config.checklist_verifikasi.filter((_, idx) => idx !== indeks);
      await supabase.from('pengaturan_sistem').update({ checklist_verifikasi: listUpdate }).eq('id', 1);
    }
  };

  const downloadRekapCSV = () => {
    if (dataArsip.length === 0) return alert(`Belum ada rekapan data untuk tanggal ${tanggalArsip}.`);
    const header = ["Nomor Tiket", "Nama Lengkap", "Asal Sekolah", "Nomor HP", "Jenis Layanan", "Status", "Keterangan", "Waktu Selesai"].join(",");
    const rows = dataArsip.map(item => {
        const layanan = item.jenis_antrian === 'pembuatan_akun' ? 'Pembuatan Akun' : item.jenis_antrian === 'verifikasi_akun' ? 'Verifikasi Berkas' : 'Antrian Khusus';
        return `"${item.nomor_antrian}","${item.nama_lengkap}","${item.asal_sekolah}","'${item.nomor_hp}","${layanan}","${item.status.toUpperCase()}","${item.keterangan || '-'}","${new Date(item.created_at).toLocaleTimeString('id-ID')}"`;
    });
    const blob = new Blob([[header, ...rows].join("\n")], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_SPMB_${tanggalArsip}.csv`;
    link.click();
  };

  // FITUR: Trigger Suara Panggil Ulang Tanpa Mengubah Status Inti
  const triggerPanggilUlangSuara = async (id) => {
    setAksiLoading(`${id}-suara`);
    await supabase.from('antrian').update({ updated_at: new Date().toISOString() }).eq('id', id);
    setAksiLoading(null);
  };

  // LOGIKA INTI YANG DISEMPURNAKAN: Simpel dan Otomatis
  const prosesUbahStatus = async (item, statusBaru) => {
    setAksiLoading(`${item.id}-${statusBaru}`);
    try {
      // 1. Pengaman Anti-Bentrok: Pastikan status di database masih sama
      const { data, error } = await supabase
        .from('antrian')
        .update({ status: statusBaru, updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .eq('status', item.status)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        alert('⚠️ Gagal: Antrean ini sudah diproses oleh Admin Loket lain!');
        return;
      }

      // 2. Jika ditekan "Selesai", langsung panggil antrean normal berikutnya secara otomatis
      if (statusBaru === 'selesai') {
        const nextNormal = daftarAntrian.find(a => a.jenis_antrian === item.jenis_antrian && a.status === 'menunggu');

        if (nextNormal) {
          // Panggil otomatis urutan selanjutnya (Aman dari bentrok)
          await supabase.from('antrian').update({ status: 'dipanggil', updated_at: new Date().toISOString() }).eq('id', nextNormal.id).eq('status', 'menunggu');
        }
      }
    } catch (err) {
      alert('Sistem Terganggu: ' + err.message);
    } finally {
      setAksiLoading(null);
    }
  };

  const handleInputManualAdmin = async (e) => {
    e.preventDefault();
    if (!namaManual || !asalManual || !hpManual) return;
    setIsSubmitManual(true);
    try {
      let prefix = jenisManual === 'verifikasi_akun' ? 'B' : jenisManual === 'khusus' ? 'K' : 'A';
      const { data: lastRow } = await supabase.from('antrian').select('nomor_urut_internal').eq('tanggal', tglSekarang).eq('jenis_antrian', jenisManual).order('nomor_urut_internal', { ascending: false }).limit(1);
      const urutSelanjutnya = lastRow && lastRow.length > 0 ? lastRow[0].nomor_urut_internal + 1 : 1;
      
      await supabase.from('antrian').insert([{
        nama_lengkap: namaManual, asal_sekolah: asalManual, nomor_hp: hpManual, jenis_antrian: jenisManual,
        nomor_urut_internal: urutSelanjutnya, nomor_antrian: `${prefix}-${urutSelanjutnya}`, status: 'menunggu',
        keterangan: jenisManual === 'khusus' ? keteranganKhusus : null
      }]);
      setNamaManual(''); setAsalManual(''); setHpManual(''); setKeteranganKhusus('');
    } finally {
      setIsSubmitManual(false);
    }
  };

  const antrianPembuatanAkunActive = daftarAntrian.filter(a => a.jenis_antrian === 'pembuatan_akun' && a.status !== 'selesai');
  const antrianVerifikasiBerkasActive = daftarAntrian.filter(a => a.jenis_antrian === 'verifikasi_akun' && a.status !== 'selesai');
  const antrianKhususActive = daftarAntrian.filter(a => a.jenis_antrian === 'khusus' && a.status !== 'selesai');

  const arsipPembuatan = dataArsip.filter(a => a.jenis_antrian === 'pembuatan_akun');
  const arsipVerifikasi = dataArsip.filter(a => a.jenis_antrian === 'verifikasi_akun');
  const arsipKhusus = dataArsip.filter(a => a.jenis_antrian === 'khusus');

  if (isCheckingAuth) return <main className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-white animate-pulse">Memuat...</p></main>;

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full space-y-3 text-xs">
          <div className="text-center mb-5"><h1 className="text-sm font-black text-slate-900">LOG IN ADMIN</h1><p className="text-[10px] text-slate-400">SMAN 3 Sragen</p></div>
          <input type="email" required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-slate-50 outline-none" placeholder="Email Admin" />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-slate-50 outline-none" placeholder="Password" />
          <button type="submit" disabled={aksiLoading === 'login'} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg">{aksiLoading === 'login' ? 'Memverifikasi...' : 'Masuk Sistem'}</button>
        </form>
      </main>
    );
  }

  const renderTabelAntrian = (listData, title, headerBg) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className={`${headerBg} text-white px-3 py-2 font-bold tracking-wide flex justify-between items-center text-[11px]`}>
        <span>{title}</span>
        <span className="bg-white/20 px-2 py-0.5 rounded">{listData.length} Antrean</span>
      </div>
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
              <th className="p-2 text-center w-12">Tiket</th>
              <th className="p-2">Identitas Siswa</th>
              <th className="p-2 text-center w-28">Tindakan Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-700">
            {listData.length === 0 ? (
              <tr><td colSpan="3" className="p-4 text-center text-slate-400 italic text-xs">Antrean kosong.</td></tr>
            ) : (
              listData.map((item) => (
                <tr key={item.id} className={`hover:bg-slate-50/60 ${item.status === 'dipanggil' ? 'bg-blue-50/50' : ''}`}>
                  <td className="p-2 text-center">
                    <span className="font-black text-slate-950 text-xs block">{item.nomor_antrian}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase mt-1 inline-block ${item.status === 'menunggu' ? 'bg-slate-100 text-slate-500' : 'bg-blue-600 text-white animate-pulse'}`}>{item.status}</span>
                  </td>
                  <td className="p-2">
                    <p className="font-bold text-slate-900 text-xs leading-tight">{item.nama_lengkap}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{item.asal_sekolah} • {item.nomor_hp}</p>
                    {item.keterangan && <p className="text-[9px] font-medium text-rose-600 bg-rose-50 px-1 py-0.5 rounded mt-0.5 inline-block leading-tight">Note: {item.keterangan}</p>}
                  </td>
                  <td className="p-2 align-middle">
                    <div className="flex flex-col gap-1.5 w-full">
                      
                      {/* Kondisi saat masih menunggu */}
                      {item.status === 'menunggu' && (
                        <button onClick={() => prosesUbahStatus(item, 'dipanggil')} disabled={!!aksiLoading} className="w-full bg-blue-600 text-white px-2 py-1.5 rounded font-bold text-[10px] hover:bg-blue-700 shadow-sm transition-transform active:scale-95">Panggil Siswa</button>
                      )}
                      
                      {/* Kondisi saat sedang dipanggil / di loket */}
                      {item.status === 'dipanggil' && (
                        <>
                          <button onClick={() => prosesUbahStatus(item, 'selesai')} disabled={!!aksiLoading} className="w-full bg-emerald-600 text-white px-2 py-1.5 rounded text-[10px] font-black hover:bg-emerald-700 shadow-sm border-b-2 border-emerald-800 transition-transform active:scale-95">✓ Selesai Berkas</button>
                          
                          <button onClick={() => triggerPanggilUlangSuara(item.id)} disabled={!!aksiLoading} className="w-full bg-blue-100 text-blue-700 px-2 py-1.5 rounded text-[9px] font-bold hover:bg-blue-200 transition-transform active:scale-95">🔊 Panggil Ulang</button>
                        </>
                      )}
                      
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-xs text-slate-800 antialiased relative">
      
      {showModalSyarat && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <h2 className="text-sm font-black text-slate-800">⚙️ Pengaturan Syarat Pendaftaran</h2>
              <button onClick={() => setShowModalSyarat(false)} className="bg-slate-200 hover:bg-rose-500 hover:text-white text-slate-500 rounded-full w-6 h-6 flex items-center justify-center font-bold">✕</button>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
              {/* Syarat Pembuatan Akun */}
              <div className="border border-blue-100 bg-blue-50/30 p-4 rounded-xl space-y-3">
                <h3 className="font-bold text-blue-900 border-b border-blue-100 pb-1">Syarat PEMBUATAN AKUN</h3>
                <div className="flex gap-1">
                  <input type="text" value={inputChecklistPembuatan} onChange={(e) => setInputChecklistPembuatan(e.target.value)} placeholder="Ketik syarat baru..." className="w-full px-2 py-1.5 border border-blue-200 rounded outline-none" />
                  <button onClick={() => tambahChecklist('pembuatan')} className="bg-blue-600 text-white px-3 rounded font-bold">Add</button>
                </div>
                <ul className="divide-y divide-blue-100 text-[10px] text-slate-600">
                  {config.checklist_pembuatan.map((item, idx) => (
                    <li key={idx} className="py-1.5 flex justify-between group"><span>{item}</span><button onClick={() => hapusChecklist('pembuatan', idx)} className="text-rose-400 hover:text-rose-600 font-bold px-1">✕</button></li>
                  ))}
                </ul>
              </div>
              {/* Syarat Verifikasi Berkas */}
              <div className="border border-emerald-100 bg-emerald-50/30 p-4 rounded-xl space-y-3">
                <h3 className="font-bold text-emerald-900 border-b border-emerald-100 pb-1">Syarat VERIFIKASI BERKAS</h3>
                <div className="flex gap-1">
                  <input type="text" value={inputChecklistVerifikasi} onChange={(e) => setInputChecklistVerifikasi(e.target.value)} placeholder="Ketik syarat baru..." className="w-full px-2 py-1.5 border border-emerald-200 rounded outline-none" />
                  <button onClick={() => tambahChecklist('verifikasi')} className="bg-emerald-600 text-white px-3 rounded font-bold">Add</button>
                </div>
                <ul className="divide-y divide-emerald-100 text-[10px] text-slate-600">
                  {config.checklist_verifikasi.map((item, idx) => (
                    <li key={idx} className="py-1.5 flex justify-between group"><span>{item}</span><button onClick={() => hapusChecklist('verifikasi', idx)} className="text-rose-400 hover:text-rose-600 font-bold px-1">✕</button></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header Admin */}
        <div className="bg-white p-4 rounded-xl shadow-sm flex flex-col lg:flex-row justify-between lg:items-center gap-4 border border-slate-200">
          <div>
            <h1 className="text-sm font-black text-slate-900">Panel Admin Pengendali SPMB</h1>
            <p className="text-[10px] text-slate-400">Teroptimasi • Anti-Bentrok • Tampilan Simpel</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setShowModalSyarat(true)} className="bg-slate-800 text-white px-3 py-1.5 rounded-lg font-bold">⚙️ Syarat</button>
            <div className="bg-slate-50 p-1.5 border rounded-lg flex items-center gap-2">
              <span className="font-bold text-slate-500">Buka/Tutup:</span>
              <button onClick={() => ubahSistemManajemenForm('pendaftaran_dibuka', !config.pendaftaran_dibuka)} className={`px-3 py-1.5 rounded font-bold text-white ${config.pendaftaran_dibuka ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                {config.pendaftaran_dibuka ? 'DIBUKA' : 'DITUTUP'}
              </button>
            </div>
            <div className="bg-slate-50 border px-3 py-1.5 rounded-lg flex items-center gap-2 font-bold">
              <span>Kuota Harian:</span>
              <input type="number" value={config.kuota_harian} onChange={(e) => ubahSistemManajemenForm('kuota_harian', parseInt(e.target.value) || 0)} className="w-12 text-center text-blue-600 border rounded" />
            </div>
            <button onClick={handleLogout} className="px-2.5 py-1.5 bg-rose-100 text-rose-700 rounded-lg font-bold">Keluar</button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
          {/* Form Input Manual (Kiri) */}
          <div className="space-y-4 xl:col-span-1">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3 sticky top-4">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="font-black text-slate-900 text-sm">➕ Antrean Manual</h3>
                <p className="text-[9px] text-slate-400 mt-0.5">Sisipkan langsung oleh Admin</p>
              </div>
              <form onSubmit={handleInputManualAdmin} className="space-y-2.5">
                <div>
                  <label className="text-[9px] font-bold text-slate-500 block">Nama Lengkap</label>
                  <input type="text" required value={namaManual} onChange={(e) => setNamaManual(e.target.value)} className="w-full px-2 py-1.5 border rounded-lg bg-slate-50 outline-none" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 block">Asal Sekolah</label>
                  <input type="text" required value={asalManual} onChange={(e) => setAsalManual(e.target.value)} className="w-full px-2 py-1.5 border rounded-lg bg-slate-50 outline-none" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 block">Nomor WhatsApp</label>
                  <input type="tel" required value={hpManual} onChange={(e) => setHpManual(e.target.value)} className="w-full px-2 py-1.5 border rounded-lg bg-slate-50 outline-none" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 block">Tujuan Loket</label>
                  <select value={jenisManual} onChange={(e) => setJenisManual(e.target.value)} className="w-full px-2 py-1.5 border rounded-lg bg-slate-50 font-bold outline-none">
                    <option value="pembuatan_akun">PEMBUATAN AKUN (A)</option>
                    <option value="verifikasi_akun">VERIFIKASI BERKAS (B)</option>
                    <option value="khusus">ANTREAN KHUSUS (K)</option>
                  </select>
                </div>
                {jenisManual === 'khusus' && (
                  <div>
                    <label className="text-[9px] font-bold text-rose-500 block">Catatan Prioritas Khusus</label>
                    <textarea required value={keteranganKhusus} onChange={(e) => setKeteranganKhusus(e.target.value)} className="w-full px-2 py-1.5 border border-rose-200 bg-rose-50/30 rounded-lg outline-none" rows="2" />
                  </div>
                )}
                <button type="submit" disabled={isSubmitManual} className="w-full bg-slate-900 text-white font-bold py-2 mt-1 rounded-lg hover:bg-slate-800">
                  {isSubmitManual ? 'Memproses...' : 'Masukkan ke Antrean'}
                </button>
              </form>
            </div>
          </div>

          {/* Tabel Antrean (Kanan) */}
          <div className="xl:col-span-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {renderTabelAntrian(antrianPembuatanAkunActive, '📋 LOKET A: BUAT AKUN', 'bg-blue-600')}
              {renderTabelAntrian(antrianVerifikasiBerkasActive, '📋 LOKET B: VERIFIKASI', 'bg-emerald-600')}
              {renderTabelAntrian(antrianKhususActive, '📋 LOKET K: KHUSUS', 'bg-rose-600')}
            </div>

            {/* Arsip Manager */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 border-b border-slate-100 pb-3 mb-4">
                <div>
                  <h2 className="font-black text-slate-800">🗄️ Manajer Arsip Data Selesai</h2>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border">
                  <span className="font-bold text-slate-500 text-[10px] pl-1">Tanggal:</span>
                  <input type="date" value={tanggalArsip} onChange={(e) => setTanggalArsip(e.target.value)} className="px-2 py-1 rounded border text-xs font-bold outline-none" />
                  <button onClick={downloadRekapCSV} className="bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold shadow-sm">📥 CSV</button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { data: arsipPembuatan, title: 'ARSIP A' },
                  { data: arsipVerifikasi, title: 'ARSIP B' },
                  { data: arsipKhusus, title: 'ARSIP K' }
                ].map((arsip, idx) => (
                  <div key={idx} className="bg-slate-50 rounded-lg border p-2">
                    <div className="bg-slate-700 text-white px-2 py-1 rounded text-[10px] font-bold mb-2 flex justify-between">
                      <span>{arsip.title}</span><span>{arsip.data.length} Selesai</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto text-[10px]">
                      {arsip.data.map(a => (
                        <div key={a.id} className="flex justify-between p-1 border-b last:border-0">
                          <span className="font-bold">{a.nomor_antrian}</span>
                          <span className="truncate w-24">{a.nama_lengkap}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </main>
  );
}