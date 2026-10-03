-- PASO 1: pega TODO este archivo en Supabase > SQL Editor > Run
create table stores(id uuid primary key default gen_random_uuid(),nombre text not null,direccion text,telefono text,activa boolean default true);
create table profiles(id uuid primary key references auth.users on delete cascade,nombre text,rol text not null default 'vendedor' check(rol in('admin','vendedor','encargado')),store_id uuid references stores,activo boolean default true);
create table categories(id uuid primary key default gen_random_uuid(),nombre text not null,caracteristicas text[] default '{}');
create table products(id uuid primary key default gen_random_uuid(),nombre text not null,category_id uuid references categories,descripcion text,imagen text,activo boolean default true);
create table product_variants(id uuid primary key default gen_random_uuid(),product_id uuid references products on delete cascade,sku text unique,atributos jsonb default '{}',precio_compra numeric default 0,precio_venta numeric default 0,stock_minimo int default 3,activo boolean default true,created_at timestamptz default now());
create table variant_stock(variant_id uuid references product_variants on delete cascade,store_id uuid references stores,cantidad int not null default 0 check(cantidad>=0),primary key(variant_id,store_id));
create table suppliers(id uuid primary key default gen_random_uuid(),nombre text not null,empresa text,telefono text,direccion text,contacto text,observaciones text,activo boolean default true);
create table sales(id uuid primary key default gen_random_uuid(),store_id uuid references stores,vendedor_id uuid references profiles,fecha timestamptz default now(),subtotal numeric,descuento numeric default 0,total numeric,observaciones text,estado text default 'confirmada');
create table sale_items(id uuid primary key default gen_random_uuid(),sale_id uuid references sales on delete cascade,variant_id uuid references product_variants,cantidad int,precio numeric,costo numeric);
create table sale_payments(id uuid primary key default gen_random_uuid(),sale_id uuid references sales on delete cascade,metodo text,monto numeric);
create table purchases(id uuid primary key default gen_random_uuid(),store_id uuid references stores,supplier_id uuid references suppliers,fecha timestamptz default now(),total numeric,forma_pago text,observaciones text,registrado_por uuid references profiles,estado text default 'confirmada');
create table purchase_items(id uuid primary key default gen_random_uuid(),purchase_id uuid references purchases on delete cascade,variant_id uuid references product_variants,cantidad int,precio numeric);
create table inventory_movements(id uuid primary key default gen_random_uuid(),variant_id uuid references product_variants,store_id uuid references stores,tipo text,cantidad int,sale_id uuid,purchase_id uuid,motivo text,usuario_id uuid,fecha timestamptz default now());
create table expenses(id uuid primary key default gen_random_uuid(),store_id uuid references stores,categoria text,descripcion text,monto numeric,fecha date default current_date,forma_pago text,observaciones text,registrado_por uuid);
create table employees(id uuid primary key default gen_random_uuid(),store_id uuid references stores,nombre text,cargo text,telefono text,sueldo_base numeric default 0,comision_pct numeric default 0,activo boolean default true);
create table salary_payments(id uuid primary key default gen_random_uuid(),employee_id uuid references employees,periodo text,sueldo_base numeric,comision numeric,bonos numeric,adelantos numeric,descuentos numeric,neto numeric,forma_pago text,fecha date default current_date,observaciones text);

insert into stores(nombre) values('Tienda principal');

create function my_role() returns text language sql stable security definer set search_path=public as $$select rol from profiles where id=auth.uid() and activo$$;
create function my_store() returns uuid language sql stable security definer set search_path=public as $$select store_id from profiles where id=auth.uid()$$;

create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,nombre) values(new.id,coalesce(new.raw_user_meta_data->>'nombre',new.email)) on conflict do nothing; return new; end$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

do $$ declare t text; begin
 foreach t in array array['stores','profiles','categories','products','product_variants','variant_stock','suppliers','sales','sale_items','sale_payments','purchases','purchase_items','inventory_movements','expenses','employees','salary_payments'] loop
  execute format('alter table %I enable row level security',t); end loop;
 foreach t in array array['stores','categories','products','product_variants'] loop
  execute format('create policy "r_%1$s" on %1$s for select to authenticated using(true)',t); end loop;
 foreach t in array array['categories','products','product_variants','suppliers'] loop
  execute format('create policy "w_%1$s" on %1$s for all to authenticated using(my_role() in(''admin'',''encargado'')) with check(my_role() in(''admin'',''encargado''))',t); end loop;
 foreach t in array array['stores','profiles','expenses','employees','salary_payments'] loop
  execute format('create policy "a_%1$s" on %1$s for all to authenticated using(my_role()=''admin'') with check(my_role()=''admin'')',t); end loop;
 foreach t in array array['variant_stock','inventory_movements','purchases'] loop
  execute format('create policy "s_%1$s" on %1$s for select to authenticated using(my_role()=''admin'' or (store_id=my_store() and my_role()<>''vendedor'' or (%1$L=''variant_stock'' and store_id=my_store())))',t); end loop;
end $$;
create policy "p_own" on profiles for select to authenticated using(id=auth.uid());
create policy "r_suppliers" on suppliers for select to authenticated using(my_role() in('admin','encargado'));
create policy "s_sales" on sales for select to authenticated using(my_role()='admin' or (store_id=my_store() and (my_role()<>'vendedor' or vendedor_id=auth.uid())));
create policy "s_sale_items" on sale_items for select to authenticated using(exists(select 1 from sales s where s.id=sale_id));
create policy "s_sale_payments" on sale_payments for select to authenticated using(exists(select 1 from sales s where s.id=sale_id));
create policy "s_purchase_items" on purchase_items for select to authenticated using(exists(select 1 from purchases p where p.id=purchase_id));

create function create_sale(p_store uuid,p_items jsonb,p_pagos jsonb,p_descuento numeric default 0,p_obs text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; i jsonb; v_sub numeric:=0; v_costo numeric; v_pag numeric;
begin
 if my_role() not in('admin','vendedor') then raise exception 'Sin permiso'; end if;
 if my_role()<>'admin' and p_store<>my_store() then raise exception 'Tienda no permitida'; end if;
 insert into sales(store_id,vendedor_id,descuento) values(p_store,auth.uid(),p_descuento) returning id into v_id;
 for i in select * from jsonb_array_elements(p_items) loop
  select precio_compra into v_costo from product_variants where id=(i->>'variant_id')::uuid;
  update variant_stock set cantidad=cantidad-(i->>'cantidad')::int where variant_id=(i->>'variant_id')::uuid and store_id=p_store;
  if not found then raise exception 'Producto sin stock en esta tienda'; end if;
  insert into sale_items(sale_id,variant_id,cantidad,precio,costo) values(v_id,(i->>'variant_id')::uuid,(i->>'cantidad')::int,(i->>'precio')::numeric,v_costo);
  insert into inventory_movements(variant_id,store_id,tipo,cantidad,sale_id,usuario_id) values((i->>'variant_id')::uuid,p_store,'venta',-(i->>'cantidad')::int,v_id,auth.uid());
  v_sub:=v_sub+(i->>'cantidad')::int*(i->>'precio')::numeric;
 end loop;
 select coalesce(sum(monto),0) into v_pag from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric);
 if round(v_pag,2)<>round(v_sub-p_descuento,2) then raise exception 'Los pagos no suman el total'; end if;
 insert into sale_payments(sale_id,metodo,monto) select v_id,metodo,monto from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric);
 update sales set subtotal=v_sub,total=v_sub-p_descuento,observaciones=p_obs where id=v_id;
 return v_id;
end$$;

create function create_purchase(p_store uuid,p_supplier uuid,p_items jsonb,p_forma_pago text,p_obs text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; i jsonb; v_tot numeric:=0;
begin
 if my_role() not in('admin','encargado') then raise exception 'Sin permiso'; end if;
 if my_role()<>'admin' and p_store<>my_store() then raise exception 'Tienda no permitida'; end if;
 insert into purchases(store_id,supplier_id,forma_pago,observaciones,registrado_por) values(p_store,p_supplier,p_forma_pago,p_obs,auth.uid()) returning id into v_id;
 for i in select * from jsonb_array_elements(p_items) loop
  insert into purchase_items(purchase_id,variant_id,cantidad,precio) values(v_id,(i->>'variant_id')::uuid,(i->>'cantidad')::int,(i->>'precio')::numeric);
  insert into variant_stock(variant_id,store_id,cantidad) values((i->>'variant_id')::uuid,p_store,(i->>'cantidad')::int)
   on conflict(variant_id,store_id) do update set cantidad=variant_stock.cantidad+excluded.cantidad;
  update product_variants set precio_compra=(i->>'precio')::numeric where id=(i->>'variant_id')::uuid;
  insert into inventory_movements(variant_id,store_id,tipo,cantidad,purchase_id,usuario_id) values((i->>'variant_id')::uuid,p_store,'compra',(i->>'cantidad')::int,v_id,auth.uid());
  v_tot:=v_tot+(i->>'cantidad')::int*(i->>'precio')::numeric;
 end loop;
 update purchases set total=v_tot where id=v_id;
 return v_id;
end$$;
