import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {seedData,transition,type Data,type Action} from './domain';
const KEY='goodchair.native.preview.v1';
type Store={data:Data;ready:boolean;storageError:string;act:(action:Action)=>string|null;reset:()=>void};
const Context=createContext<Store|null>(null);
export function Provider({children}:{children:React.ReactNode}){
 const [data,setData]=useState<Data>(seedData),[ready,setReady]=useState(false),[storageError,setStorageError]=useState('');
 const current=useRef(data),writes=useRef(Promise.resolve());
 useEffect(()=>{let active=true;AsyncStorage.getItem(KEY).then(raw=>{if(!active)return;if(raw){const value=JSON.parse(raw);if(value.version!==1||!Array.isArray(value.visits)||!Array.isArray(value.blocks)||!Array.isArray(value.threads)||!Array.isArray(value.messages)||!Number.isInteger(value.barberShare))throw Error('Invalid saved data');current.current=value;setData(value);}}).catch(()=>{if(active)setStorageError('Saved preview could not be restored. The example data is shown; reset the preview to save changes.');}).finally(()=>{if(active)setReady(true);});return()=>{active=false;};},[]);
 const commit=useCallback((next:Data)=>{current.current=next;setData(next);writes.current=writes.current.catch(()=>{}).then(()=>AsyncStorage.setItem(KEY,JSON.stringify(next))).catch(()=>setStorageError('Changes are visible but could not be saved on this device.'));},[]);
 const act=useCallback((action:Action)=>{try{commit(transition(current.current,action));return null;}catch(e){return e instanceof Error?e.message:'Unable to update this visit.';}},[commit]);
 const reset=useCallback(()=>{setStorageError('');commit(seedData());},[commit]);
 return <Context.Provider value={{data,ready,storageError,act,reset}}>{children}</Context.Provider>;
}
export function useStore(){const value=useContext(Context);if(!value)throw Error('Missing data provider');return value;}
