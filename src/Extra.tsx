import {useEffect,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
import {supabase} from './supabase'
import {useApp,bs,label} from './shared'

const mes=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10)}
const dia=()=>new Date().toISOString().slice(0,10)
const rng=(d:string,h:string)=>[new Date(d+'T00:00:00').toISOString(),new Date(h+'T23:59:59').toISOString()]
const sum=(a:any[],f:(x:any)=>number)=>a.reduce((t,x)=>t+f(x),0)
const group=(rows:any[],key:(x:any)=>string,val:(x:any)=>number)=>{const m:any={};rows.forEach(r=>{const k=key(r);m[k]=(m[k]||0)+val(r)});return Object.entries(m).map(([k,v])=>({k,v:v as number}))}
const top=(a:any[],n=8)=>[...a].sort((x,y)=>y.v-x.v).slice(0,n)

function Bars({data,money=true}:any){
  const max=Math.max(1,...data.map((d:any)=>d.v))
  return <div>{data.length===0&&<p>Sin datos en este período.</p>}{data.map((d:any)=><div key={d.k} style={{display:'flex',gap:8,alignItems:'center',margin:'3px 0'}}>
    <span style={{width:130,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.k}</span>
    <div style={{flex:1,background:'#e7eae4',borderRadius:4}}><div style={{width:`${d.v/max*100}%`,background:'#1c5a44',height:16,borderRadius:4}}/></div>
    <span style={{width:90,fontSize:13,textAlign:'right'}}>{money?bs(d.v):d.v}</span></div>)}</div>}
const Fechas=({d,h,setD,setH}:any)=><div className="row"><label>Desde<input type="date" value={d} onChange={e=>setD(e.target.value)}/></label><label>Hasta<input type="date" value={h} onChange={e=>setH(e.target.value)}/></label></div>

export function Historial(){
  const {store,rol}=useApp();const [d,setD]=useState(mes()),[h,setH]=useState(dia()),[rows,setRows]=useState<any[]>([]),[msg,setMsg]=useState('')
  const load=()=>{const [a,b]=rng(d,h);supabase.from('sales').select('id,fecha,total,estado,sale_payments(metodo,monto)').eq('store_id',store).gte('fecha',a).lte('fecha',b).order('fecha',{ascending:false}).limit(300).then(({data})=>setRows(data||[]))}
  useEffect(()=>{load()},[store,d,h])
  const anular=async(id:string)=>{const m=prompt('Motivo de la anulación');if(!m)return
    const {error}=await supabase.rpc('anular_venta',{p_sale:id,p_motivo:m});setMsg(error?error.message:'Venta anulada. El stock se devolvió.');load()}
  return <><h1>Historial de ventas</h1><Fechas d={d} h={h} setD={setD} setH={setH}/><p>{msg}</p>
    <table><thead><tr><th>Fecha</th><th>Total</th><th>Pago</th><th>Estado</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}>
      <td>{new Date(r.fecha).toLocaleString()}</td><td>{bs(r.total)}</td><td>{(r.sale_payments||[]).map((p:any)=>p.metodo).join(' + ')}</td><td className={r.estado==='anulada'?'low':''}>{r.estado}</td>
      <td>{rol==='admin'&&r.estado==='confirmada'&&<button className="s" onClick={()=>anular(r.id)}>Anular</button>}</td></tr>)}</tbody></table></>
}

export function Informes(){
  const {store}=useApp();const [d,setD]=useState(mes()),[h,setH]=useState(dia()),[q,setQ]=useState(''),[r,setR]=useState<any>(null)
  useEffect(()=>{(async()=>{const [a,b]=rng(d,h)
    const s=await supabase.from('sales').select('fecha,total,vendedor_id,sale_items(cantidad,product_variants(atributos,sku,products(nombre,categories(nombre)))),sale_payments(metodo,monto)').eq('store_id',store).eq('estado','confirmada').gte('fecha',a).lte('fecha',b).order('fecha')
    const g=await supabase.from('expenses').select('monto').eq('store_id',store).gte('fecha',d).lte('fecha',h)
    const sl=await supabase.from('salary_payments').select('neto,employees!inner(store_id)').eq('employees.store_id',store).gte('fecha',d).lte('fecha',h)
    const c=await supabase.from('purchases').select('total').eq('store_id',store).eq('estado','confirmada').gte('fecha',a).lte('fecha',b)
    const p=await supabase.from('profiles').select('id,nombre')
    setR({s:s.data||[],g:g.data||[],sl:sl.data||[],c:c.data||[],p:p.data||[]})})()},[store,d,h])
  if(!r)return <p className="c">Cargando…</p>
  const ventas=sum(r.s,x=>+x.total),gastos=sum(r.g,x=>+x.monto),sueldos=sum(r.sl,x=>+x.neto),compras=sum(r.c,x=>+x.total)
  const nom=(id:string)=>r.p.find((x:any)=>x.id===id)?.nombre||'—'
  const items=r.s.flatMap((x:any)=>x.sale_items).filter((i:any)=>label(i.product_variants).toLowerCase().includes(q.toLowerCase()))
  return <><h1>Informes</h1><Fechas d={d} h={h} setD={setD} setH={setH}/>
    <div className="k"><div><small>Ingresos (ventas)</small><strong>{bs(ventas)}</strong></div><div><small>Gastos</small><strong>{bs(gastos)}</strong></div>
      <div><small>Sueldos pagados</small><strong>{bs(sueldos)}</strong></div><div><small>Compras de mercadería</small><strong>{bs(compras)}</strong></div>
      <div><small>Resultado (ingresos − gastos − sueldos)</small><strong>{bs(ventas-gastos-sueldos)}</strong></div></div>
    <h2>Ingresos vs. egresos</h2><Bars data={[{k:'Ingresos',v:ventas},{k:'Gastos',v:gastos},{k:'Sueldos',v:sueldos},{k:'Compras',v:compras}]}/>
    <h2>Ventas por día</h2><Bars data={group(r.s,x=>new Date(x.fecha).toLocaleDateString(),x=>+x.total)}/>
    <h2>Ventas por forma de pago</h2><Bars data={group(r.s.flatMap((x:any)=>x.sale_payments),p=>p.metodo,p=>+p.monto)}/>
    <h2>Ventas por vendedor</h2><Bars data={top(group(r.s,x=>nom(x.vendedor_id),x=>+x.total))}/>
    <h2>Productos y categorías más vendidos</h2><input placeholder="Filtrar por producto, equipo, jugador, talla…" value={q} onChange={e=>setQ(e.target.value)}/>
    <h3>Productos (unidades)</h3><Bars money={false} data={top(group(items,i=>i.product_variants.products.nombre,i=>i.cantidad))}/>
    <h3>Categorías (unidades)</h3><Bars money={false} data={top(group(items,i=>i.product_variants.products.categories?.nombre||'Sin categoría',i=>i.cantidad))}/></>
}

export function Empleados(){
  const {store}=useApp();const [emp,setEmp]=useState<any[]>([]),[users,setUsers]=useState<any[]>([]),[pays,setPays]=useState<any[]>([]),[f,setF]=useState<any>({}),[msg,setMsg]=useState('')
  const [p,setP]=useState<any>({periodo:new Date().toISOString().slice(0,7),forma:'efectivo',base:0,com:0,bon:0,ade:0,des:0})
  const load=()=>{supabase.from('employees').select('*').eq('store_id',store).eq('activo',true).then(({data})=>setEmp(data||[]))
    supabase.from('profiles').select('id,nombre').then(({data})=>setUsers(data||[]))
    supabase.from('salary_payments').select('*,employees!inner(nombre,store_id)').eq('employees.store_id',store).order('fecha',{ascending:false}).limit(60).then(({data})=>setPays(data||[]))}
  useEffect(load,[store])
  const add=async()=>{const {error}=await supabase.from('employees').insert({store_id:store,nombre:f.nombre,cargo:f.cargo,telefono:f.tel,sueldo_base:+f.sueldo||0,comision_pct:+f.pct||0,profile_id:f.prof||null});setMsg(error?error.message:'Empleado guardado');load()}
  const e=emp.find(x=>x.id===p.emp)
  const pick=(id:string)=>{const x=emp.find(y=>y.id===id);setP({...p,emp:id,base:x?.sueldo_base||0,com:0})}
  const calc=async()=>{if(!e?.profile_id)return setMsg('Vincula al empleado con un usuario para calcular su comisión');
    const fin=new Date(+p.periodo.slice(0,4),+p.periodo.slice(5,7),0).toISOString().slice(0,10);const [a,b]=rng(p.periodo+'-01',fin)
    const {data}=await supabase.from('sales').select('total').eq('vendedor_id',e.profile_id).eq('estado','confirmada').gte('fecha',a).lte('fecha',b)
    setP({...p,com:(sum(data||[],x=>+x.total)*e.comision_pct/100).toFixed(2)})}
  const neto=+p.base+ +p.com+ +p.bon- +p.ade- +p.des
  const pagar=async()=>{if(!e)return setMsg('Elige un empleado');const {error}=await supabase.from('salary_payments').insert({employee_id:e.id,periodo:p.periodo,sueldo_base:+p.base,comision:+p.com,bonos:+p.bon,adelantos:+p.ade,descuentos:+p.des,neto,forma_pago:p.forma});setMsg(error?error.message:'Pago registrado');load()}
  const num=(k:string,t:string)=><label>{t}<input type="number" value={p[k]} onChange={ev=>setP({...p,[k]:ev.target.value})}/></label>
  return <><h1>Empleados y sueldos</h1>
    <div className="box"><h2>Nuevo empleado</h2><div className="row"><input placeholder="Nombre" onChange={e=>setF({...f,nombre:e.target.value})}/><input placeholder="Cargo" onChange={e=>setF({...f,cargo:e.target.value})}/><input placeholder="Teléfono" onChange={e=>setF({...f,tel:e.target.value})}/>
      <input type="number" placeholder="Sueldo base" onChange={e=>setF({...f,sueldo:e.target.value})}/><input type="number" placeholder="% comisión" onChange={e=>setF({...f,pct:e.target.value})}/>
      <select onChange={e=>setF({...f,prof:e.target.value})}><option value="">Usuario vinculado (opcional)</option>{users.map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}</select><button onClick={add}>Guardar</button></div></div>
    <div className="box" style={{marginTop:12}}><h2>Registrar pago de sueldo</h2><div className="row"><select value={p.emp||''} onChange={e=>pick(e.target.value)}><option value="">Empleado…</option>{emp.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
      <input type="month" value={p.periodo} onChange={e=>setP({...p,periodo:e.target.value})}/></div>
      <div className="row">{num('base','Sueldo base')}{num('com','Comisión')}{num('bon','Bonos')}{num('ade','Adelantos')}{num('des','Descuentos')}</div>
      <div className="row"><button className="s" onClick={calc}>Calcular comisión del mes</button><select value={p.forma} onChange={e=>setP({...p,forma:e.target.value})}>{['efectivo','qr','transferencia','tarjeta'].map(m=><option key={m}>{m}</option>)}</select><h2>Neto: {bs(neto)}</h2><button className="y" onClick={pagar}>Registrar pago</button></div></div>
    <p>{msg}</p><h2>Total pagado por empleado (últimos pagos)</h2><Bars data={group(pays,x=>x.employees.nombre,x=>+x.neto)}/>
    <table><thead><tr><th>Fecha</th><th>Empleado</th><th>Período</th><th>Neto</th></tr></thead><tbody>{pays.map(x=><tr key={x.id}><td>{x.fecha}</td><td>{x.employees.nombre}</td><td>{x.periodo}</td><td>{bs(x.neto)}</td></tr>)}</tbody></table></>
}

export function Usuarios(){
  const {stores}=useApp();const [rows,setRows]=useState<any[]>([]),[f,setF]=useState<any>({rol:'vendedor'}),[msg,setMsg]=useState('')
  const load=()=>supabase.from('profiles').select('*').order('nombre').then(({data})=>setRows(data||[]))
  useEffect(()=>{load()},[])
  const crear=async()=>{setMsg('')
    const tmp=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
    const {data,error}=await tmp.auth.signUp({email:f.email,password:f.pass,options:{data:{nombre:f.nombre}}})
    if(error||!data.user)return setMsg(error?.message||'No se pudo crear el usuario')
    const u=await supabase.from('profiles').update({nombre:f.nombre,rol:f.rol,store_id:f.store||stores[0]?.id}).eq('id',data.user.id)
    setMsg(u.error?u.error.message:'Usuario creado. Ya puede ingresar.');load()}
  const upd=async(id:string,c:any)=>{await supabase.from('profiles').update(c).eq('id',id);load()}
  const roles=['admin','vendedor','encargado']
  return <><h1>Usuarios</h1><div className="box"><h2>Crear usuario</h2><div className="row"><input placeholder="Nombre" onChange={e=>setF({...f,nombre:e.target.value})}/><input placeholder="Correo" onChange={e=>setF({...f,email:e.target.value})}/>
    <input type="password" placeholder="Contraseña (mín. 6)" onChange={e=>setF({...f,pass:e.target.value})}/>
    <select value={f.rol} onChange={e=>setF({...f,rol:e.target.value})}>{roles.map(r=><option key={r}>{r}</option>)}</select>
    <select onChange={e=>setF({...f,store:e.target.value})}>{stores.map((s:any)=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select><button className="y" onClick={crear}>Crear</button></div><p>{msg}</p></div>
    <table><thead><tr><th>Usuario</th><th>Rol</th><th>Tienda</th><th>Estado</th></tr></thead><tbody>{rows.map(u=><tr key={u.id}><td>{u.nombre}</td>
      <td><select value={u.rol} onChange={e=>upd(u.id,{rol:e.target.value})}>{roles.map(r=><option key={r}>{r}</option>)}</select></td>
      <td><select value={u.store_id||''} onChange={e=>upd(u.id,{store_id:e.target.value})}>{stores.map((s:any)=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></td>
      <td><button className="s" onClick={()=>upd(u.id,{activo:!u.activo})}>{u.activo?'Activo (desactivar)':'Inactivo (activar)'}</button></td></tr>)}</tbody></table></>
}

export function Config(){
  const [rows,setRows]=useState<any[]>([]),[n,setN]=useState(''),[msg,setMsg]=useState('')
  const load=()=>supabase.from('stores').select('*').order('nombre').then(({data})=>setRows(data||[]))
  useEffect(()=>{load()},[])
  const add=async()=>{const {error}=await supabase.from('stores').insert({nombre:n});if(error)setMsg(error.message);else{alert('Tienda creada');location.reload()}}
  const tog=async(s:any)=>{await supabase.from('stores').update({activa:!s.activa}).eq('id',s.id);load()}
  return <><h1>Configuración: tiendas</h1><div className="row"><input placeholder="Nombre de la nueva tienda" value={n} onChange={e=>setN(e.target.value)}/><button className="y" onClick={add}>Crear tienda</button></div><p className="err">{msg}</p>
    <table><tbody>{rows.map(s=><tr key={s.id}><td>{s.nombre}</td><td><button className="s" onClick={()=>tog(s)}>{s.activa?'Activa (desactivar)':'Inactiva (activar)'}</button></td></tr>)}</tbody></table></>
}

export function Traspaso({rows}:any){
  const {store,stores,rol}=useApp();const [v,setV]=useState(''),[n,setN]=useState(1),[to,setTo]=useState(''),[msg,setMsg]=useState('')
  if(rol==='vendedor')return null
  const go=async()=>{const {error}=await supabase.rpc('traspasar',{p_from:store,p_to:to,p_variant:v,p_cant:+n});if(error)setMsg(error.message);else{alert('Traspaso realizado');location.reload()}}
  return <div className="box" style={{marginTop:16}}><h2>Traspasar a otra tienda</h2><div className="row">
    <select value={v} onChange={e=>setV(e.target.value)}><option value="">Producto…</option>{rows.filter((r:any)=>r.cantidad>0).map((r:any)=><option key={r.product_variants.id} value={r.product_variants.id}>{label(r.product_variants)} ({r.cantidad})</option>)}</select>
    <input type="number" min={1} value={n} onChange={e=>setN(+e.target.value)}/>
    <select value={to} onChange={e=>setTo(e.target.value)}><option value="">Tienda destino…</option>{stores.filter((s:any)=>s.id!==store).map((s:any)=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
    <button className="y" onClick={go}>Traspasar</button></div><p className="err">{msg}</p></div>
}
