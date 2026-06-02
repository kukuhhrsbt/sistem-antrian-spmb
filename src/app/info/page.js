'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function InfoEstimasiAntrian() {
  const [daftarAntrian, setDaftarAntrian] = useState([]);
  const [config, setConfig] = useState({ 
    kuota_pembuatan: 0, kuota_verifikasi: 0, 
    offset_kuota_pembuatan: 0, offset_kuota_verifikasi: 0 
  });
  
  const tglSekarang = new Date().toISOString().split('T')[0];

  const fetchData = async () => {
    const { data: antrian } = await supabase.from('antrian').select('nomor_hp, jenis_antrian, status').eq('tanggal', tglSekarang);
    if (antrian) setDaftarAntrian(antrian);
    
    const { data: pengaturan } = await supabase.from('pengaturan_sistem').select('kuota_pembuatan, kuota_verifikasi, offset_kuota_pembuatan, offset_kuota_verifikasi').eq('id', 1).single();
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

  // Filter Data Pengajuan Akun
  const antrianPembuatan = daftarAntrian.filter(a => a.jenis_antrian === 'pembuatan_akun');
  const terpakaiPembuatan = Math.max(0, new Set(antrianPembuatan.map(item => item.nomor_hp)).size - (config.offset_kuota_pembuatan || 0));
  const selesaiPembuatan = antrianPembuatan.filter(a => a.status === 'selesai').length;
  const menungguPembuatan = antrianPembuatan.filter(a => a.status === 'menunggu' || a.status === 'dipanggil').length;

  // Filter Data Verifikasi Akun
  const antrianVerifikasi = daftarAntrian.filter(a => a.jenis_antrian === 'verifikasi_akun');
  const terpakaiVerifikasi = Math.max(0, new Set(antrianVerifikasi.map(item => item.nomor_hp)).size - (config.offset_kuota_verifikasi || 0));
  const selesaiVerifikasi = antrianVerifikasi.filter(a => a.status === 'selesai').length;
  const menungguVerifikasi = antrianVerifikasi.filter(a => a.status === 'menunggu' || a.status === 'dipanggil').length;

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col justify-center p-4 md:p-8 font-sans antialiased text-slate-800">
      <div className="max-w-6xl mx-auto w-full space-y-8">
        
        <div className="text-center space-y-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Status Pelayanan Pendaftaran</h1>
          <p className="text-base font-bold text-blue-600 uppercase tracking-widest mt-2">SPMB SMA Negeri 3 Sragen</p>
          <p className="text-sm text-slate-500 max-w-lg mx-auto mt-4">
            Informasi di bawah ini diperbarui secara seketika (*realtime*).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* KARTU STATISTIK PENGAJUAN AKUN */}
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-blue-100 transform transition-all hover:shadow-2xl">
            <div className="bg-blue-600 p-6 text-center text-white">
              <h2 className="text-xl font-black uppercase tracking-widest mb-1">Pengajuan Akun (Loket A)</h2>
              <p className="text-blue-200 text-xs font-bold uppercase tracking-wider">Kuota Terpakai Hari Ini</p>
              <div className="flex items-end justify-center gap-2 my-2">
                <span className="text-6xl font-black leading-none">{terpakaiPembuatan}</span>
                <span className="text-xl font-bold text-blue-300 mb-1">/ {config.kuota_pembuatan}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 divide-x divide-slate-100 bg-white">
              <div className="p-6 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2">Telah Diselesaikan</p>
                <p className="text-4xl font-black text-slate-800">{selesaiPembuatan}</p>
              </div>
              <div className="p-6 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2">Menunggu Giliran</p>
                <p className="text-4xl font-black text-slate-800">{menungguPembuatan}</p>
              </div>
            </div>
          </div>

          {/* KARTU STATISTIK VERIFIKASI AKUN */}
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-emerald-100 transform transition-all hover:shadow-2xl">
            <div className="bg-emerald-600 p-6 text-center text-white">
              <h2 className="text-xl font-black uppercase tracking-widest mb-1">Verifikasi Akun (Loket B)</h2>
              <p className="text-emerald-200 text-xs font-bold uppercase tracking-wider">Kuota Terpakai Hari Ini</p>
              <div className="flex items-end justify-center gap-2 my-2">
                <span className="text-6xl font-black leading-none">{terpakaiVerifikasi}</span>
                <span className="text-xl font-bold text-emerald-300 mb-1">/ {config.kuota_verifikasi}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 divide-x divide-slate-100 bg-white">
              <div className="p-6 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2">Telah Diselesaikan</p>
                <p className="text-4xl font-black text-slate-800">{selesaiVerifikasi}</p>
              </div>
              <div className="p-6 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2">Menunggu Giliran</p>
                <p className="text-4xl font-black text-slate-800">{menungguVerifikasi}</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}