// Preview workspace choice only. This does not authenticate a user or grant server access.
(function(){
 const roles={customer:'Customer',barber:'Barber Pro',owner:'Owner HQ'},url=new URL(location.href),choice=url.searchParams.get('role');
 let saved=null;try{saved=sessionStorage.getItem('hairflix-preview-role');}catch{}
 if(roles[choice]){saved=roles[choice];try{sessionStorage.setItem('hairflix-preview-role',saved);}catch{}url.searchParams.delete('role');history.replaceState(null,'',url.pathname+url.search+url.hash);}
 window.HFEntryRole=Object.values(roles).includes(saved)?saved:null;
 if(!window.HFEntryRole)location.replace('/login/');
})();
