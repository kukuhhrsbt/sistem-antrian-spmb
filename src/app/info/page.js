'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function InfoEstimasiAntrian() {
  const [daftarAntrian, setDaftarAntrian] = useState([]);
  const [config, setConfig] = useState({ 
    kuota_pembuatan: 0, offset_kuota_pembuatan: 0 
  });
  
  const [statistik, setStatistik] = useState({ 
    terpakaiTotal: 0,
    selesaiPembuatan: 0, selesaiVerifikasi: 0,
    menungguPembuatan: 0, menungguVerifikasi: 0
  });

  // KUNCI ZONA WAKTU: Menarik format tanggal sinkron dengan zona waktu WIB
  const tglSekarang = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

  const fetchData = async () => {
    const { data: antrian } = await supabase.from('antrian').select('nomor_hp, jenis_antrian, status').eq('tanggal', tglSekarang);
    if (antrian) setDaftarAntrian(antrian);
    
    const { data: pengaturan } = await supabase.from('pengaturan_sistem').select('kuota_pembuatan, offset_kuota_pembuatan').eq('id', 1).single();
    if (pengaturan) setConfig(pengaturan);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('info_publik_rt_v5')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'antrian' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengaturan_sistem' }, () => fetchData())
      .subscribe();
      
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    if (!daftarAntrian) return;
    
    const tiketPembuatan = daftarAntrian.filter(a => a.jenis_antrian === 'pembuatan_akun').length;
    const tiketVerifikasi = daftarAntrian.filter(a => a.jenis_antrian === 'verifikasi_akun').length;
    const totalTiket = tiketPembuatan + tiketVerifikasi;
    
    let offsetDB = parseInt(config.offset_kuota_pembuatan) || 0;
    
    // SISTEM PENYEMBUH (SELF-HEALING)
    if (offsetDB > totalTiket) {
      offsetDB = 0;
    }

    setStatistik({
      terpakaiTotal: Math.max(0, totalTiket - offsetDB),
      selesaiPembuatan: daftarAntrian.filter(a => a.jenis_antrian === 'pembuatan_akun' && a.status === 'selesai').length,
      selesaiVerifikasi: daftarAntrian.filter(a => a.jenis_antrian === 'verifikasi_akun' && a.status === 'selesai').length,
      menungguPembuatan: daftarAntrian.filter(a => a.jenis_antrian === 'pembuatan_akun' && (a.status === 'menunggu' || a.status === 'dipanggil')).length,
      menungguVerifikasi: daftarAntrian.filter(a => a.jenis_antrian === 'verifikasi_akun' && (a.status === 'menunggu' || a.status === 'dipanggil')).length
    });
  }, [daftarAntrian, config]);

  const limitKuota = parseInt(config.kuota_pembuatan) || 0;
  const sisaKuotaUtama = Math.max(0, limitKuota - statistik.terpakaiTotal);

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col p-4 md:p-8 font-sans antialiased">
      <div className="max-w-4xl w-full mx-auto space-y-6">
        
        <div className="text-center space-y-1 mb-6">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-800">INFO LAYANAN LOKET SPMB</h1>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">SMA Negeri 3 Sragen</p>
        </div>

        <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-center text-center md:text-left gap-4">
          <div>
            <h2 className="text-lg font-black tracking-wide text-blue-400">SISA KUOTA UTAMA HARI INI</h2>
            <p className="text-xs text-slate-400 mt-1">Sisa tiket yang tersedia untuk layanan Pengajuan & Verifikasi</p>
          </div>
          <div className="flex items-end gap-2 bg-slate-900 px-6 py-3 rounded-xl border border-slate-700 shadow-inner">
            <span className="text-4xl font-black text-white">{sisaKuotaUtama}</span>
            <span className="text-lg font-bold text-slate-500 mb-1">/ {limitKuota}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-blue-100">
            <div className="bg-blue-600 p-4 text-center text-white">
              <h2 className="text-lg font-black uppercase tracking-widest">Pengajuan Akun (A)</h2>
            </div>
            
            <div className="grid grid-cols-2 divide-x divide-slate-100 bg-white">
              <div className="p-5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2">Telah Selesai</p>
                <p className="text-3xl font-black text-slate-800">{statistik.selesaiPembuatan}</p>
              </div>
              <div className="p-5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2">Menunggu</p>
                <p className="text-3xl font-black text-slate-800">{statistik.menungguPembuatan}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-emerald-100">
            <div className="bg-emerald-600 p-4 text-center text-white">
              <h2 className="text-lg font-black uppercase tracking-widest">Verifikasi Akun (B)</h2>
            </div>
            
            <div className="grid grid-cols-2 divide-x divide-slate-100 bg-white">
              <div className="p-5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2">Telah Selesai</p>
                <p className="text-3xl font-black text-slate-800">{statistik.selesaiVerifikasi}</p>
              </div>
              <div className="p-5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2">Menunggu</p>
                <p className="text-3xl font-black text-slate-800">{statistik.menungguVerifikasi}</p>
              </div>
            </div>
          </div>
        </div>
        
      </div>
    </main>
  );
}