import {createContext,useContext} from 'react'
export const Ctx:any=createContext(null)
export const useApp=()=>useContext(Ctx)
export const bs=(n:any)=>'Bs '+Number(n||0).toFixed(2)
export const label=(v:any)=>`${v.products?.nombre||''} ${Object.values(v.atributos||{}).join(' ')} ${v.sku?'['+v.sku+']':''}`
