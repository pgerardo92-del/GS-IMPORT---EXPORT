import React, { useState, useEffect } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://kywnmjiweynyobkfvsex.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3KVBLDNlHZOekrCnmDz3Cg_9P7pWgRG';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [vehicles, setVehicles] = useState([]);
  const [filteredVehicles, setFilteredVehicles] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);

  // 💡 Añadido 'todos' como opción predeterminada o seleccionable para stock total
  const [vistaActual, setVistaActual] = useState('todos'); // 'todos', 'activos', 'reservados', o 'vendidos'
  const [orden, setOrden] = useState('recientes');
  const [selectedVehicleIds, setSelectedVehicleIds] = useState([]);

  const [newCar, setNewCar] = useState({ ref_no: '', vin_chasis: '', marca: 'Toyota', modelo: '', anio: 2020, color: '', precio: '', imagen_url: '' });
  const [editingCar, setEditingCar] = useState(null);
  const [extendingResId, setExtendingResId] = useState(null);
  const [nuevaFechaExt, setNuevaFechaExt] = useState('');

  // 💡 Estado para el modal de extensión masiva (Admin)
  const [showMasiveExtendModal, setShowMasiveExtendModal] = useState(false);
  const [masiveFechaExt, setMasiveFechaExt] = useState('');

  const [filters, setFilters] = useState({
    marca: '',
    modelo: '',
    anio: '',
    chasis: '',
    refNo: '',
    vendedorId: ''
  });

  const [selectedCar, setSelectedCar] = useState(null);
  const [selectedCarDetail, setSelectedCarDetail] = useState(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteDoc, setClienteDoc] = useState('');
  const [horasReserva, setHorasReserva] = useState(48);

  const [selectedReservation, setSelectedReservation] = useState(null);
  const [monto, setMonto] = useState('');
  const [banco, setBanco] = useState('');
  const [nroComprobante, setNroComprobante] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());

  async function sincronizarConGoogleSheets(refNo, estado, clienteNombre, vendedorNombre) {
    if (!refNo) return;
    const URL_GOOGLE_SHEETS = "PEGÁ_AQUÍ_LA_URL_DE_TU_APLICACION_WEB_DE_APPS_SCRIPT";
    if (URL_GOOGLE_SHEETS.includes("PEGÁ_AQUÍ")) return;
    
    try {
      await fetch(URL_GOOGLE_SHEETS, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref_no: refNo,
          estado: estado,
          cliente_nombre: clienteNombre,
          vendedor_nombre: vendedorNombre
        })
      });
    } catch (error) {
      console.error("Error al sincronizar con Sheets:", error);
    }
  }

  const getDisplayRole = (rol, userEmail) => {
    if (rol === 'admin') return 'Administrador/a';
    if (rol === 'stock_manager') return 'Gestor de Stock';
    if (rol === 'vendedor') {
      if (userEmail === 'aracelylarrosa2005@gmail.com') return 'Vendedora';
      return 'Vendedor';
    }
    return rol;
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfileAndData(session.user.id, session.user.email);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfileAndData(session.user.id, session.user.email);
      else { setProfile(null); setLoading(false); }
    });

    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      checkExpiredReservations(now);
    }, 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (session) {
      loadVehiclesByView(vistaActual);
    }
  }, [vistaActual, orden]);

  async function fetchProfileAndData(userId, userEmail) {
    setLoading(true);
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (prof) {
      prof.email = userEmail;
    }
    setProfile(prof);

    const { data: profilesData } = await supabase.from('profiles').select('*');
    if (profilesData) setAllProfiles(profilesData);

    await loadAllData();
    setLoading(false);
  }

  async function loadAllData() {
    const { data: rData } = await supabase.from('reservations').select('*, profiles(nombre, email)').order('fecha_inicio', { ascending: false });
    if (rData) setReservations(rData || []);
    const { data: pData } = await supabase.from('payment_receipts').select('*, profiles!payment_receipts_vendedor_id_fkey(nombre, email)').order('subido_el', { ascending: false });
    if (pData) setReceipts(pData || []);
    await loadVehiclesByView(vistaActual);
  }

  async function loadVehiclesByView(vista) {
    let query = supabase.from('vehicles').select('*');
    
    if (vista === 'vendidos') {
      query = query.eq('estado', 'vendido');
    } else {
      query = query.neq('estado', 'vendido');
    }

    if (orden === 'recientes') {
      query = query.order('creado_el', { ascending: false });
    } else if (orden === 'precio_asc') {
      query = query.order('precio', { ascending: true });
    } else if (orden === 'precio_desc') {
      query = query.order('precio', { ascending: false });
    } else if (orden === 'anio_desc') {
      query = query.order('anio', { ascending: false });
    } else if (orden === 'anio_asc') {
      query = query.order('anio', { ascending: true });
    }

    const { data: vData } = await query;
    if (vData) {
      setVehicles(vData || []);
      aplicarFiltrosLocales(vData || [], reservations, vistaActual, filters, orden);
    }
  }

  function aplicarFiltrosLocales(listaVehiculos, listaReservas, vista, currentFilters, currentOrden) {
    let resultado = listaVehiculos.filter(car => {
      const activeRes = listaReservas.find(r => r.vehicle_id === car.id && ['activa', 'revision_pago', 'extendida'].includes(r.estado));
      const estaReservado = car.estado === 'reservado' || car.estado === 'seña_en_revision' || Boolean(activeRes);

      // 💡 Reglas de filtrado por pestañas
      if (vista === 'activos' && estaReservado) return false;
      if (vista === 'reservados' && !estaReservado) return false;
      // Si la vista es 'todos', incluye tanto activos como reservados (excluyendo vendidos que ya filtra Supabase)

      const matchMarca = currentFilters.marca === '' || (car.marca && car.marca.toLowerCase().includes(currentFilters.marca.toLowerCase()));
      const matchModelo = currentFilters.modelo === '' || (car.modelo && car.modelo.toLowerCase().includes(currentFilters.modelo.toLowerCase()));
      const matchAnio = currentFilters.anio === '' || String(car.anio).includes(currentFilters.anio);
      const matchChasis = currentFilters.chasis === '' || (car.vin_chasis && car.vin_chasis.toLowerCase().includes(currentFilters.chasis.toLowerCase()));
      
      let matchRef = true;
      if (currentFilters.refNo && currentFilters.refNo.trim() !== '') {
        const refsBuscadas = currentFilters.refNo
          .split(/[\s,]+/)
          .map(r => r.trim().toLowerCase())
          .filter(Boolean);

        const refVehiculo = car.ref_no ? String(car.ref_no).trim().toLowerCase() : '';
        matchRef = refsBuscadas.some(ref => refVehiculo.includes(ref));
      }

      let matchVendedor = true;
      if (currentFilters.vendedorId !== '') {
        matchVendedor = activeRes && activeRes.vendedor_id === currentFilters.vendedorId;
      }

      return matchMarca && matchModelo && matchAnio && matchChasis && matchRef && matchVendedor;
    });

    setFilteredVehicles(resultado);
    setSelectedVehicleIds([]);
  }

  async function checkExpiredReservations(now) {
    if (reservations.length === 0) return;
    for (const res of reservations) {
      if (['activa', 'extendida'].includes(res.estado) && new Date(res.fecha_limite) <= now) {
        await supabase.from('reservations').update({ estado: 'vencida' }).eq('id', res.id);
        await supabase.from('vehicles').update({ estado: 'disponible' }).eq('id', res.vehicle_id);
        
        const vehiculoAfectado = vehicles.find(v => v.id === res.vehicle_id);
        if (vehiculoAfectado) {
          sincronizarConGoogleSheets(vehiculoAfectado.ref_no, 'disponible', '', '');
        }

        loadAllData();
      }
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError('Correo o contraseña incorrectos.');
  }

  async function handleCreateVehicle(e) {
    e.preventDefault();
    const { error } = await supabase.from('vehicles').insert([{
      ...newCar, 
      precio: parseFloat(newCar.precio), 
      anio: parseInt(newCar.anio),
      estado: 'en_taller_logistica', 
      publicado_para_venta: false, 
      creado_por: profile.id
    }]);
    if (error) alert('Error: ' + error.message);
    else {
      setNewCar({ ref_no: '', vin_chasis: '', marca: 'Toyota', modelo: '', anio: 2020, color: '', precio: '', imagen_url: '' });
      loadAllData();
      alert('Vehículo guardado en Stock Interno.');
    }
  }

  async function handleUpdateVehicle(e) {
    e.preventDefault();
    if (!editingCar) return;

    const { error } = await supabase.from('vehicles').update({
      ref_no: editingCar.ref_no,
      vin_chasis: editingCar.vin_chasis,
      marca: editingCar.marca,
      modelo: editingCar.modelo,
      anio: parseInt(editingCar.anio),
      color: editingCar.color,
      precio: parseFloat(editingCar.precio),
      imagen_url: editingCar.imagen_url
    }).eq('id', editingCar.id);

    if (error) {
      alert('Error al actualizar: ' + error.message);
    } else {
      setEditingCar(null);
      loadAllData();
      alert('¡Vehículo actualizado con éxito!');
    }
  }

  async function handlePublishVehicle(carId) {
    await supabase.from('vehicles').update({ publicado_para_venta: true, estado: 'disponible' }).eq('id', carId);
    loadAllData();
  }

  async function handleDeleteVehicle(carId) {
    if (!confirm('¿Estás seguro de eliminar esta unidad permanentemente del sistema?')) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', carId);
    if (error) {
      alert('Error al eliminar: ' + error.message);
    } else {
      loadAllData();
      alert('Vehículo eliminado con éxito.');
    }
  }

  async function handleSaveExtendedDate(resId) {
    if (!nuevaFechaExt) return alert('Selecciona una fecha y hora válidas.');

    const { error } = await supabase.from('reservations').update({ 
      fecha_limite: new Date(nuevaFechaExt).toISOString(), 
      estado: 'extendida' 
    }).eq('id', resId);

    if (error) {
      alert('Error al extender la reserva: ' + error.message);
    } else {
      setExtendingResId(null);
      setNuevaFechaExt('');
      loadAllData();
      alert('¡Reserva extendida exitosamente!');
    }
  }

  async function handleMasiveExtend() {
    if (!masiveFechaExt) return alert('Selecciona una fecha y hora válidas.');
    if (selectedVehicleIds.length === 0) return alert('No hay unidades seleccionadas.');

    if (!confirm(`¿Estás seguro de extender la reserva para las ${selectedVehicleIds.length} unidades seleccionadas?`)) return;

    const nuevaFechaISO = new Date(masiveFechaExt).toISOString();

    for (const carId of selectedVehicleIds) {
      const activeRes = reservations.find(r => r.vehicle_id === carId && ['activa', 'revision_pago', 'extendida'].includes(r.estado));
      if (activeRes) {
        await supabase.from('reservations').update({ 
          fecha_limite: nuevaFechaISO, 
          estado: 'extendida' 
        }).eq('id', activeRes.id);
      }
    }

    setShowMasiveExtendModal(false);
    setMasiveFechaExt('');
    setSelectedVehicleIds([]);
    loadAllData();
    alert('¡Reservas extendidas exitosamente de forma masiva!');
  }

  function toggleSelectVehicle(carId) {
    if (selectedVehicleIds.includes(carId)) {
      setSelectedVehicleIds(selectedVehicleIds.filter(id => id !== carId));
    } else {
      setSelectedVehicleIds([...selectedVehicleIds, carId]);
    }
  }

  function handleSelectAll() {
    if (selectedVehicleIds.length === filteredVehicles.length) {
      setSelectedVehicleIds([]);
    } else {
      setSelectedVehicleIds(filteredVehicles.map(car => car.id));
    }
  }

  function handleSearchFilters(e) {
    if (e) e.preventDefault();
    aplicarFiltrosLocales(vehicles, reservations, vistaActual, filters, orden);
  }

  function handleResetFilters() {
    const emptyFilters = { marca: '', modelo: '', anio: '', chasis: '', refNo: '', vendedorId: '' };
    setFilters(emptyFilters);
    aplicarFiltrosLocales(vehicles, reservations, vistaActual, emptyFilters, orden);
  }

  function exportarAExcel() {
    const autosAExportar = selectedVehicleIds.length > 0 
      ? filteredVehicles.filter(car => selectedVehicleIds.includes(car.id))
      : filteredVehicles;

    if (autosAExportar.length === 0) {
      return alert('No hay unidades seleccionadas para exportar.');
    }

    const headers = ['Nro Referencia', 'Chasis / VIN', 'Marca', 'Modelo', 'Anio', 'Color', 'Precio ($)', 'Estado', 'Vendedor'];
    
    const rows = autosAExportar.map(car => {
      const activeRes = reservations.find(r => r.vehicle_id === car.id && ['activa', 'revision_pago', 'extendida'].includes(r.estado));
      const estaReservado = car.estado === 'reservado' || car.estado === 'seña_en_revision' || Boolean(activeRes);
      
      let estadoTexto = 'DISPONIBLE';
      if (car.estado === 'vendido') {
        estadoTexto = 'VENDIDO';
      } else if (estaReservado) {
        estadoTexto = 'RESERVADO';
      }

      const vendedorNombre = (estaReservado && activeRes && activeRes.profiles?.nombre) ? activeRes.profiles.nombre : '';

      return [
        car.ref_no || 'N/D',
        car.vin_chasis || '',
        car.marca || '',
        car.modelo || '',
        car.anio || '',
        car.color || '',
        car.precio || 0,
        estadoTexto,
        vendedorNombre
      ];
    });

    let csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `GS_Import_Stock_${vistaActual}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleCreateReservation(e) {
    e.preventDefault();
    if (!selectedCar) return;

    const ultimaReservaCaida = reservations.find(
      r => r.vehicle_id === selectedCar.id && 
           r.vendedor_id === profile.id && 
           ['vencida', 'cancelada_por_vendedor', 'cancelada_por_admin'].includes(r.estado)
    );

    if (ultimaReservaCaida) {
      const fechaCaida = new Date(ultimaReservaCaida.fecha_limite || ultimaReservaCaida.fecha_inicio);
      const msTranscurridos = currentTime - fechaCaida;
      const ms24Horas = 24 * 3600 * 1000;

      if (msTranscurridos < ms24Horas) {
        const horasRestantes = Math.ceil((ms24Horas - msTranscurridos) / 3600000);
        setSelectedCar(null);
        return alert(`🚫 Estás penalizado en esta unidad específica por 24 horas debido a una reserva caída. Podés reservar cualquier otro vehículo, pero este unitario estará disponible para vos en ${horasRestantes} hora(s).`);
      }
    }

    const limite = new Date(Date.now() + horasReserva * 3600000).toISOString();
    const { error } = await supabase.from('reservations').insert([{
      vehicle_id: selectedCar.id, vendedor_id: profile.id, cliente_nombre: clienteNombre,
      cliente_doc: clienteDoc, fecha_limite: limite, estado: 'activa'
    }]);

    if (error) return alert('Error al reservar: ' + error.message);
    await supabase.from('vehicles').update({ estado: 'reservado' }).eq('id', selectedCar.id);
    
    await sincronizarConGoogleSheets(selectedCar.ref_no, 'reservado', clienteNombre, profile.nombre);

    setSelectedCar(null); setClienteNombre(''); setClienteDoc('');
    loadAllData();
    alert('¡Vehículo reservado con éxito!');
  }

  async function handleUploadReceipt(e) {
    e.preventDefault();
    if (!archivo) return alert('Adjuntá el comprobante.');
    setUploading(true);
    const ext = archivo.name.split('.').pop();
    const fileName = `recibo_${selectedReservation.id}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('comprobantes-transferencia').upload(fileName, archivo);
    if (upErr) { setUploading(false); return alert('Error al subir: ' + upErr.message); }
    const { data: urlData } = supabase.storage.from('comprobantes-transferencia').getPublicUrl(fileName);

    await supabase.from('payment_receipts').insert([{
      reservation_id: selectedReservation.id, vendedor_id: profile.id, monto_transferido: parseFloat(monto),
      banco_origen: banco, nro_comprobante: nroComprobante, archivo_url: urlData.publicUrl, estado: 'pendiente_revision'
    }]);
    await supabase.from('reservations').update({ estado: 'revision_pago' }).eq('id', selectedReservation.id);
    await supabase.from('vehicles').update({ estado: 'seña_en_revision' }).eq('id', selectedReservation.vehicle_id);
    setUploading(false); setSelectedReservation(null); setMonto(''); setBanco(''); setNroComprobante(''); setArchivo(null);
    loadAllData();
  }

  async function handleCancelMyReservation(reservationId, carId) {
    if (!confirm('¿Estás seguro de anular esta reserva? El vehículo volverá a estar disponible para los demás vendedores.')) return;
    await supabase.from('reservations').update({ estado: 'cancelada_por_vendedor' }).eq('id', reservationId);
    await supabase.from('vehicles').update({ estado: 'disponible' }).eq('id', carId);

    const vehiculoAfectado = vehicles.find(v => v.id === carId);
    if (vehiculoAfectado) {
      await sincronizarConGoogleSheets(vehiculoAfectado.ref_no, 'disponible', '', '');
    }

    loadAllData();
    alert('Reserva anulada correctamente. El vehículo ya está disponible en el stock.');
  }

  async function handleAdminCancelReservation(reservationId, carId) {
    if (!confirm('⚠️ [ADMIN] ¿Estás seguro de dar de baja la reserva activa de este vendedor? El vehículo volverá a estar disponible inmediatamente.')) return;
    
    await supabase.from('reservations').update({ estado: 'cancelada_por_admin' }).eq('id', reservationId);
    await supabase.from('vehicles').update({ estado: 'disponible' }).eq('id', carId);

    const vehiculoAfectado = vehicles.find(v => v.id === carId);
    if (vehiculoAfectado) {
      await sincronizarConGoogleSheets(vehiculoAfectado.ref_no, 'disponible', '', '');
    }

    loadAllData();
    alert('Reserva dada de baja por el administrador con éxito.');
  }

  async function handleReleaseOrSell(carId, nuevoEstado) {
    await supabase.from('vehicles').update({ estado: nuevoEstado }).eq('id', carId);
    if (nuevoEstado === 'disponible') {
      await supabase.from('reservations').update({ estado: 'cancelada' }).eq('vehicle_id', carId).in('estado', ['activa', 'revision_pago', 'extendida']);
    }

    const vehiculoAfectado = vehicles.find(v => v.id === carId);
    if (vehiculoAfectado) {
      await sincronizarConGoogleSheets(vehiculoAfectado.ref_no, nuevoEstado, '', '');
    }

    loadAllData();
  }

  function formatTimeRemaining(fechaLimite) {
    const diff = new Date(fechaLimite) - currentTime;
    if (diff <= 0) return '⏰ RESERVA VENCIDA (CAÍDA)';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff / 3600000) % 24);
    const m = Math.floor((diff / 60000) % 60);
    const s = Math.floor((diff / 1000) % 60);
    return d > 0 ? `${d}d ${h}h ${m}m ${s}s restantes` : `${h}h ${m}m ${s}s restantes`;
  }

  function calcularDiasEnStock(fechaCreacion) {
    if (!fechaCreacion) return 'Recién cargado';
    const diffTime = Math.abs(currentTime - new Date(fechaCreacion));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return '⏱ Cargado hoy (0 días)';
    return `⏱ ${diffDays} día(s) en stock`;
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>Cargando sistema...</div>;

  if (!session || !profile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleLogin} style={{ background: '#fff', padding: 32, borderRadius: 12, width: 340 }}>
          <h2 style={{ margin: '0 0 8px' }}>🚗 GS Import Export</h2>
          <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>Sistema de Stock y Reservas</p>
          {authError && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{authError}</div>}
          <input type="email" placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: 10, marginBottom: 12, boxSizing: 'border-box' }} />
          <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', padding: 10, marginBottom: 18, boxSizing: 'border-box' }} />
          <button type="submit" style={{ width: '100%', padding: 12, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Ingresar</button>
        </form>
      </div>
    );
  }

  const userRoleText = getDisplayRole(profile.rol, profile.email);
  const esVendedor = profile.rol === 'vendedor';
  const esStockManagerOAdmin = profile.rol === 'stock_manager' || profile.rol === 'admin';
  const esAdmin = profile.rol === 'admin';

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'sans-serif', color: '#0f172a' }}>
      <header style={{ background: '#0f172a', color: '#fff', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>🚗 GS Import Export — Reservas</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, background: '#1e293b', padding: '6px 12px', borderRadius: 20 }}>👤 {profile.nombre} ({userRoleText.toUpperCase()})</span>
          <button onClick={() => supabase.auth.signOut()} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>Salir</button>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: '24px auto', padding: '0 16px' }}>
        {esStockManagerOAdmin && (
          <div style={{ background: '#fff', padding: 18, borderRadius: 10, marginBottom: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0 }}>📦 Cargar Vehículo a Stock Interno</h3>
            <form onSubmit={handleCreateVehicle} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              <input placeholder="Nro. Referencia" value={newCar.ref_no} onChange={e => setNewCar({...newCar, ref_no: e.target.value})} style={{ padding: 8 }} />
              <input placeholder="Chasis / VIN" value={newCar.vin_chasis} onChange={e => setNewCar({...newCar, vin_chasis: e.target.value})} required style={{ padding: 8 }} />
              <input placeholder="Marca" value={newCar.marca} onChange={e => setNewCar({...newCar, marca: e.target.value})} required style={{ padding: 8 }} />
              <input placeholder="Modelo" value={newCar.modelo} onChange={e => setNewCar({...newCar, modelo: e.target.value})} required style={{ padding: 8 }} />
              <input type="number" placeholder="Año" value={newCar.anio} onChange={e => setNewCar({...newCar, anio: e.target.value})} required style={{ padding: 8 }} />
              <input placeholder="Color" value={newCar.color} onChange={e => setNewCar({...newCar, color: e.target.value})} required style={{ padding: 8 }} />
              <input type="number" placeholder="Precio ($)" value={newCar.precio} onChange={e => setNewCar({...newCar, precio: e.target.value})} required style={{ padding: 8 }} />
              <input placeholder="URL de la Foto (Link)" value={newCar.imagen_url} onChange={e => setNewCar({...newCar, imagen_url: e.target.value})} style={{ padding: 8 }} />
              <button type="submit" style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, padding: 8, cursor: 'pointer', fontWeight: 600, gridColumn: '1 / -1' }}>+ Guardar Vehículo</button>
            </form>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0 }}>
            {vistaActual === 'todos' ? `🚗 STOCK TOTAL (${filteredVehicles.length})` : vistaActual === 'activos' ? `🟢 UNIDADES DISPONIBLES (${filteredVehicles.length})` : vistaActual === 'reservados' ? `🔒 UNIDADES RESERVADAS (${filteredVehicles.length})` : `📁 HISTORIAL DE UNIDADES VENDIDAS (${filteredVehicles.length})`}
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', padding: '4px 8px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: '#475569' }}>Ordenar:</span>
              <select 
                value={orden} 
                onChange={e => setOrden(e.target.value)}
                style={{ border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, cursor: 'pointer', outline: 'none', color: '#0f172a' }}
              >
                <option value="recientes">Más Recientes (Ingreso)</option>
                <option value="precio_asc">Precio: Más barato a más caro</option>
                <option value="precio_desc">Precio: Más caro a más barato</option>
                <option value="anio_desc">Año: Más nuevo (Reciente)</option>
                <option value="anio_asc">Año: Más antiguo</option>
              </select>
            </div>

            {/* 💡 Pestañas de Filtro Actualizadas con 'Todos (Stock Total)' */}
            <div style={{ display: 'flex', background: '#e2e8f0', padding: 4, borderRadius: 8, gap: 4 }}>
              <button 
                onClick={() => setVistaActual('todos')}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: vistaActual === 'todos' ? '#0f172a' : 'transparent', color: vistaActual === 'todos' ? '#fff' : '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
              >
                📦 Todos (Stock Total)
              </button>
              <button 
                onClick={() => setVistaActual('activos')}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: vistaActual === 'activos' ? '#16a34a' : 'transparent', color: vistaActual === 'activos' ? '#fff' : '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
              >
                🟢 Disponibles / Stock
              </button>
              <button 
                onClick={() => setVistaActual('reservados')}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: vistaActual === 'reservados' ? '#d97706' : 'transparent', color: vistaActual === 'reservados' ? '#fff' : '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
              >
                🔒 Reservados
              </button>
              {profile.rol === 'admin' && (
                <button 
                  onClick={() => setVistaActual('vendidos')}
                  style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: vistaActual === 'vendidos' ? '#16a34a' : 'transparent', color: vistaActual === 'vendidos' ? '#fff' : '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
                >
                  📂 Ver Vendidos (Historial)
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ background: '#1e293b', padding: 16, borderRadius: 10, marginBottom: 20, border: '1px solid #334155' }}>
          <form onSubmit={handleSearchFilters} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
            <input 
              placeholder="Ref (Ej: CF325349, CF325353)" 
              value={filters.refNo} 
              onChange={e => setFilters({...filters, refNo: e.target.value})} 
              style={{ padding: 8, borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#fff' }} 
            />
            <input 
              placeholder="Chasis / VIN" 
              value={filters.chasis} 
              onChange={e => setFilters({...filters, chasis: e.target.value})} 
              style={{ padding: 8, borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#fff' }} 
            />
            <input 
              placeholder="Marca" 
              value={filters.marca} 
              onChange={e => setFilters({...filters, marca: e.target.value})} 
              style={{ padding: 8, borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#fff' }} 
            />
            <input 
              placeholder="Modelo" 
              value={filters.modelo} 
              onChange={e => setFilters({...filters, modelo: e.target.value})} 
              style={{ padding: 8, borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#fff' }} 
            />
            <input 
              placeholder="Año" 
              value={filters.anio} 
              onChange={e => setFilters({...filters, anio: e.target.value})} 
              style={{ padding: 8, borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#fff' }} 
            />
            <select
              value={filters.vendedorId}
              onChange={e => setFilters({...filters, vendedorId: e.target.value})}
              style={{ padding: 8, borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#fff', cursor: 'pointer' }}
            >
              <option value="">👤 Todos los Vendedores</option>
              {allProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.nombre || p.email}</option>
              ))}
            </select>
          </form>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderTop: '1px solid #334155', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button 
                type="button" 
                onClick={handleSelectAll} 
                style={{ background: '#334155', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                {selectedVehicleIds.length === filteredVehicles.length && filteredVehicles.length > 0 ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
              </button>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>
                {selectedVehicleIds.length} seleccionados
              </span>

              {esAdmin && selectedVehicleIds.length > 0 && (
                <button 
                  type="button"
                  onClick={() => setShowMasiveExtendModal(true)}
                  style={{ background: '#d97706', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}
                >
                  📅 Extender Seleccionadas ({selectedVehicleIds.length})
                </button>
              )}

              <button 
                type="button" 
                onClick={exportarAExcel} 
                style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              >
                📊 Descargar Excel ({selectedVehicleIds.length > 0 ? selectedVehicleIds.length : 'Todos'})
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                type="button" 
                onClick={handleResetFilters} 
                style={{ background: '#475569', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
              >
                Reset
              </button>
              <button 
                type="button" 
                onClick={handleSearchFilters} 
                style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
              >
                BUSCAR
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filteredVehicles.map(car => {
            const activeRes = reservations.find(r => r.vehicle_id === car.id && ['activa', 'revision_pago', 'extendida'].includes(r.estado));
            const isSelected = selectedVehicleIds.includes(car.id);
            const isExtending = extendingResId === (activeRes ? activeRes.id : null);
            const estaReservado = car.estado === 'reservado' || car.estado === 'seña_en_revision' || Boolean(activeRes);

            const ultimaReservaCaida = reservations.find(
              r => r.vehicle_id === car.id && 
                   r.vendedor_id === profile.id && 
                   ['vencida', 'cancelada_por_vendedor', 'cancelada_por_admin'].includes(r.estado)
            );

            let estaPenalizadoEnUnidad = false;
            if (ultimaReservaCaida) {
              const fechaCaida = new Date(ultimaReservaCaida.fecha_limite || ultimaReservaCaida.fecha_inicio);
              const msTranscurridos = currentTime - fechaCaida;
              const ms24Horas = 24 * 3600 * 1000;
              if (msTranscurridos < ms24Horas) {
                estaPenalizadoEnUnidad = true;
              }
            }

            return (
              <div key={car.id} style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                
                <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input 
                    type="checkbox" 
                    checked={isSelected} 
                    onChange={() => toggleSelectVehicle(car.id)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Seleccionar</span>
                </div>

                {car.imagen_url ? (
                  <img src={car.imagen_url} alt={car.modelo} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: 120, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>Sin Fotografía</div>
                )}
                
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                      <span>Ref: <strong>{car.ref_no || 'N/D'}</strong></span>
                      <strong style={{ color: car.estado === 'vendido' ? '#16a34a' : (estaReservado ? '#d97706' : '#16a34a') }}>
                        {estaReservado ? 'RESERVADA' : 'DISPONIBLE'}
                      </strong>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                      <span>VIN: {car.vin_chasis}</span>
                    </div>
                    <h4 style={{ margin: '6px 0' }}>{car.marca} {car.modelo} ({car.anio})</h4>
                    <p style={{ margin: '0 0 6px', fontSize: 14 }}>Color: {car.color} — <strong>${car.precio.toLocaleString()}</strong></p>
                    
                    {esAdmin && (
                      <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 'bold', marginBottom: 10, background: '#eff6ff', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
                        {calcularDiasEnStock(car.creado_el)}
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={() => setSelectedCarDetail(car)} 
                    style={{ width: '100%', padding: 8, marginBottom: 8, background: '#475569', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                  >
                    🔍 Ver Detalles
                  </button>

                  {esStockManagerOAdmin && (
                    <button 
                      onClick={() => setEditingCar(car)} 
                      style={{ width: '100%', padding: 8, marginBottom: 12, background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >
                      ✏️ Editar Unidad
                    </button>
                  )}

                  {!esVendedor && activeRes && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                      <div><strong>Vendedor/a:</strong> {activeRes.profiles?.nombre}</div>
                      <div><strong>Cliente:</strong> {activeRes.cliente_nombre}</div>
                      <div style={{ color: '#dc2626', fontWeight: 700, marginTop: 4, marginBottom: 6 }}>⏱ {formatTimeRemaining(activeRes.fecha_limite)}</div>
                      
                      {profile.rol === 'admin' && (
                        <div>
                          {!isExtending ? (
                            <button 
                              onClick={() => {
                                setExtendingResId(activeRes.id);
                                const d = new Date(activeRes.fecha_limite);
                                setNuevaFechaExt(d.toISOString().slice(0, 16));
                              }} 
                              style={{ width: '100%', padding: 6, background: '#d97706', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}
                            >
                              📅 Extender Reserva (Calendario)
                            </button>
                          ) : (
                            <div style={{ background: '#fef3c7', padding: 8, borderRadius: 6, border: '1px solid #f59e0b', marginBottom: 6 }}>
                              <label style={{ fontSize: 11, fontWeight: 'bold', display: 'block', marginBottom: 4 }}>Nueva Fecha y Hora:</label>
                              <input 
                                type="datetime-local" 
                                value={nuevaFechaExt} 
                                onChange={e => setNuevaFechaExt(e.target.value)}
                                style={{ width: '100%', padding: 6, fontSize: 12, marginBottom: 6, boxSizing: 'border-box' }}
                              />
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button 
                                  onClick={() => setExtendingResId(null)} 
                                  style={{ flex: 1, padding: 4, background: '#64748b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                                >
                                  Cancelar
                                </button>
                                <button 
                                  onClick={() => handleSaveExtendedDate(activeRes.id)} 
                                  style={{ flex: 1, padding: 4, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}
                                >
                                  Guardar
                                </button>
                              </div>
                            </div>
                          )}

                          <button 
                            onClick={() => handleAdminCancelReservation(activeRes.id, car.id)}
                            style={{ width: '100%', padding: 6, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}
                          >
                            ❌ Dar de Baja Reserva (Admin)
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    {vistaActual !== 'vendidos' && (
                      <>
                        {profile.rol === 'admin' && !car.publicado_para_venta && (
                          <button onClick={() => handlePublishVehicle(car.id)} style={{ width: '100%', padding: 10, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginBottom: 8 }}>🚀 Habilitar Venta</button>
                        )}
                        
                        {estaReservado ? (
                          <button 
                            disabled 
                            style={{ width: '100%', padding: 10, background: '#cbd5e1', color: '#475569', border: 'none', borderRadius: 6, cursor: 'not-allowed', marginBottom: 8, fontWeight: 'bold' }}
                          >
                            🔒 UNIDAD RESERVADA
                          </button>
                        ) : (
                          car.estado === 'disponible' && car.publicado_para_venta && profile.rol !== 'stock_manager' && (
                            <button 
                              onClick={() => setSelectedCar(car)} 
                              disabled={estaPenalizadoEnUnidad}
                              style={{ 
                                width: '100%', 
                                padding: 10, 
                                background: estaPenalizadoEnUnidad ? '#94a3b8' : '#0f172a', 
                                color: '#fff', 
                                border: 'none', 
                                borderRadius: 6, 
                                cursor: estaPenalizadoEnUnidad ? 'not-allowed' : 'pointer', 
                                marginBottom: 8 
                              }}
                            >
                              {estaPenalizadoEnUnidad 
                                ? '🚫 Penalizado (24h en esta unidad)' 
                                : '📌 Reservar'}
                            </button>
                          )
                        )}
                        
                        {activeRes && (activeRes.vendedor_id === profile.id || profile.rol === 'admin') && (
                          <button onClick={() => setSelectedReservation(activeRes)} style={{ width: '100%', padding: 10, background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginBottom: 6 }}>📎 Subir Transferencia</button>
                        )}

                        {activeRes && activeRes.vendedor_id === profile.id && (
                          <button onClick={() => handleCancelMyReservation(activeRes.id, car.id)} style={{ width: '100%', padding: 8, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginBottom: 6 }}>❌ Anular Reserva</button>
                        )}
                      </>
                    )}

                    {profile.rol === 'admin' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexDirection: 'column' }}>
                        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                          {car.estado === 'vendido' ? (
                            <button onClick={() => handleReleaseOrSell(car.id, 'disponible')} style={{ width: '100%', padding: 8, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Volver a Stock</button>
                          ) : (
                            <>
                              {car.estado !== 'disponible' && (
                                <button onClick={() => handleReleaseOrSell(car.id, 'disponible')} style={{ width: '100%', padding: 8, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>🔓 Liberar Unidad</button>
                              )}
                              <button onClick={() => handleReleaseOrSell(car.id, 'vendido')} style={{ width: '100%', padding: 8, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Vendido</button>
                            </>
                          )}
                        </div>
                        <button onClick={() => handleDeleteVehicle(car.id)} style={{ width: '100%', padding: 8, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>🗑 Eliminar Unidad</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {showMasiveExtendModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: '100%', maxWidth: 400 }}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>📅 Extensión Masiva de Reservas</h3>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                Se aplicará la nueva fecha y hora límite a las <strong>{selectedVehicleIds.length}</strong> unidades seleccionadas.
              </p>
              <label style={{ fontSize: 12, fontWeight: 'bold', display: 'block', marginBottom: 6 }}>Nueva Fecha y Hora Límite:</label>
              <input 
                type="datetime-local" 
                value={masiveFechaExt} 
                onChange={e => setMasiveFechaExt(e.target.value)}
                style={{ width: '100%', padding: 8, fontSize: 13, marginBottom: 16, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setShowMasiveExtendModal(false)} style={{ flex: 1, padding: 10, cursor: 'pointer', background: '#64748b', color: '#fff', border: 'none', borderRadius: 6 }}>Cancelar</button>
                <button type="button" onClick={handleMasiveExtend} style={{ flex: 1, padding: 10, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Aplicar a Todas</button>
              </div>
            </div>
          </div>
        )}

        {editingCar && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <form onSubmit={handleUpdateVehicle} style={{ background: '#fff', padding: 24, borderRadius: 12, width: '100%', maxWidth: 400 }}>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>✏️ Editar Vehículo</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Nro. Referencia:</label>
                <input value={editingCar.ref_no || ''} onChange={e => setEditingCar({...editingCar, ref_no: e.target.value})} style={{ padding: 8 }} />
                
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Chasis / VIN:</label>
                <input value={editingCar.vin_chasis || ''} onChange={e => setEditingCar({...editingCar, vin_chasis: e.target.value})} required style={{ padding: 8 }} />
                
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Marca:</label>
                <input value={editingCar.marca || ''} onChange={e => setEditingCar({...editingCar, marca: e.target.value})} required style={{ padding: 8 }} />
                
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Modelo:</label>
                <input value={editingCar.modelo || ''} onChange={e => setEditingCar({...editingCar, modelo: e.target.value})} required style={{ padding: 8 }} />
                
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Año:</label>
                <input type="number" value={editingCar.anio || ''} onChange={e => setEditingCar({...editingCar, anio: e.target.value})} required style={{ padding: 8 }} />
                
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Color:</label>
                <input value={editingCar.color || ''} onChange={e => setEditingCar({...editingCar, color: e.target.value})} required style={{ padding: 8 }} />
                
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Precio ($):</label>
                <input type="number" value={editingCar.precio || ''} onChange={e => setEditingCar({...editingCar, precio: e.target.value})} required style={{ padding: 8 }} />
                
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>URL de la Foto (Link):</label>
                <input value={editingCar.imagen_url || ''} onChange={e => setEditingCar({...editingCar, imagen_url: e.target.value})} style={{ padding: 8 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button type="button" onClick={() => setEditingCar(null)} style={{ flex: 1, padding: 10, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ flex: 1, padding: 10, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Guardar Cambios</button>
              </div>
            </form>
          </div>
        )}

        {selectedCarDetail && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>{selectedCarDetail.marca} {selectedCarDetail.modelo} ({selectedCarDetail.anio})</h3>
                <button onClick={() => setSelectedCarDetail(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
              </div>

              {selectedCarDetail.imagen_url ? (
                <img src={selectedCarDetail.imagen_url} alt={selectedCarDetail.modelo} style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 14 }} />
              ) : (
                <div style={{ width: '100%', height: 140, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13, borderRadius: 8, marginBottom: 14 }}>Sin Fotografía</div>
              )}

              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><strong>Nro. Referencia:</strong> {selectedCarDetail.ref_no || 'N/D'}</div>
                <div><strong>VIN / Chasis:</strong> {selectedCarDetail.vin_chasis}</div>
                <div><strong>Color:</strong> {selectedCarDetail.color}</div>
                <div><strong>Precio:</strong> ${selectedCarDetail.precio.toLocaleString()}</div>
                <div style={{ gridColumn: '1 / -1' }}><strong>Estado Actual:</strong> {selectedCarDetail.estado.toUpperCase().replaceAll('_', ' ')}</div>
                {esAdmin && (
                  <div style={{ gridColumn: '1 / -1' }}><strong>Tiempo en Stock:</strong> {calcularDiasEnStock(selectedCarDetail.creado_el)}</div>
                )}
              </div>

              {profile.rol === 'admin' && (
                <div>
                  <h4 style={{ margin: '0 0 8px', borderBottom: '2px solid #e2e8f0', paddingBottom: 4 }}>📋 Historial de Reservas (Solo Admins)</h4>
                  {reservations.filter(r => r.vehicle_id === selectedCarDetail.id).length === 0 ? (
                    <p style={{ fontSize: 13, color: '#64748b' }}>Este vehículo no registra reservas anteriores.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {reservations.filter(r => r.vehicle_id === selectedCarDetail.id).map(hist => (
                        <div key={hist.id} style={{ background: '#f1f5f9', padding: 10, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}>
                          <div><strong>Vendedor/a:</strong> {hist.profiles?.nombre || 'N/D'} ({hist.profiles?.email || 'N/D'})</div>
                          <div><strong>Cliente:</strong> {hist.cliente_nombre} (CI/RUC: {hist.cliente_doc})</div>
                          <div><strong>Estado de Reserva:</strong> <span style={{ color: hist.estado === 'vencida' ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>{hist.estado.toUpperCase()}</span></div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Iniciado el: {new Date(hist.fecha_inicio).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button onClick={() => setSelectedCarDetail(null)} style={{ width: '100%', marginTop: 20, padding: 10, background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Cerrar</button>
            </div>
          </div>
        )}

        {selectedCar && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <form onSubmit={handleCreateReservation} style={{ background: '#fff', padding: 24, borderRadius: 10, width: 340 }}>
              <h3 style={{ marginTop: 0 }}>Reservar {selectedCar.marca} {selectedCar.modelo}</h3>
              <input placeholder="Nombre del Cliente" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} required style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
              <input placeholder="CI / RUC del Cliente" value={clienteDoc} onChange={e => setClienteDoc(e.target.value)} required style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
              <select value={horasReserva} onChange={e => setHorasReserva(Number(e.target.value))} style={{ width: '100%', padding: 8, marginBottom: 14, boxSizing: 'border-box' }}>
                <option value={24}>24 Horas de Reserva</option>
                <option value={48}>48 Horas de Reserva</option>
                <option value={72}>72 Horas de Reserva</option>
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setSelectedCar(null)} style={{ flex: 1, padding: 8, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ flex: 1, padding: 8, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Confirmar</button>
              </div>
            </form>
          </div>
        )}

        {selectedReservation && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <form onSubmit={handleUploadReceipt} style={{ background: '#fff', padding: 24, borderRadius: 10, width: 360 }}>
              <h3 style={{ marginTop: 0 }}>Subir Transferencia</h3>
              <input type="number" placeholder="Monto" value={monto} onChange={e => setMonto(e.target.value)} required style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
              <input placeholder="Banco" value={banco} onChange={e => setBanco(e.target.value)} required style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
              <input placeholder="Nro. Boleta" value={nroComprobante} onChange={e => setNroComprobante(e.target.value)} required style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
              <input type="file" accept=".pdf,image/*" onChange={e => setArchivo(e.target.files[0])} required style={{ marginBottom: 14, width: '100%' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setSelectedReservation(null)} style={{ flex: 1, padding: 8, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" disabled={uploading} style={{ flex: 1, padding: 8, background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>{uploading ? 'Subiendo...' : 'Enviar'}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}