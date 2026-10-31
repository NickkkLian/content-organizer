/* A failed first read must never look like an empty collection. No data or storage is changed here. */
(function(){
  const loaded=new Set(),blocked=new Set();let retry=null, translate=null;const retries=new Map();
  const style=document.createElement('style');
  style.textContent='body[data-read-blocked]{display:block!important;min-height:100vh} body[data-read-blocked] > :not(#read-recovery):not(script):not(style):not(dialog[open]){display:none!important} #read-recovery{max-width:36rem;margin:10vh auto;padding:24px;font:inherit;overflow-wrap:anywhere} #read-recovery button{font:inherit;padding:10px 18px;cursor:pointer}';
  document.head.append(style);document.addEventListener('keydown',e=>{if(blocked.size&&(e.metaKey||e.ctrlKey)&&/^[sn]$/i.test(e.key)){e.preventDefault();e.stopImmediatePropagation();}},true);
  function clear(){document.body.removeAttribute('data-read-blocked');document.getElementById('read-recovery')?.remove();}
  globalThis.FirstRead={
    reset(){loaded.clear();blocked.clear();retries.clear();clear();},
    ready(scope='main'){loaded.add(scope);blocked.delete(scope);retries.delete(scope);if(!blocked.size)clear();},
    fail(again,T,partial=false,scope='main'){
      if(loaded.has(scope))return false;
      blocked.add(scope);retries.set(scope,again);if(blocked.size>1&&document.getElementById('read-recovery'))return true;
      retry=again;translate=T;clear();document.body.setAttribute('data-read-blocked','');
      const panel=document.createElement('section');panel.id='read-recovery';panel.setAttribute('role','alert');
      const title=document.createElement('h1');title.textContent=T('未能加载内容','Could not load your work');
      const text=document.createElement('p');text.textContent=partial?T('有些内容未能读取。已保存的内容没有改动。请重试，读取完成后再继续。','Some content could not be loaded. Your saved work is unchanged. Retry to load it before continuing.'):T('这次未能加载内容，已保存的内容没有改动。请重试，读取完成后再继续。','Nothing was loaded this time. Your saved work is unchanged. Retry to load it before continuing.');
      const button=document.createElement('button');button.type='button';button.textContent=T('重试','Retry');
      button.onclick=async()=>{button.disabled=true;button.textContent=translate('正在重试…','Retrying…');try{await Promise.all([...retries.values()].map(run=>run()));}finally{if(button.isConnected){button.disabled=false;button.textContent=translate('重试','Retry');}}};
      panel.append(title,text,button);document.body.append(panel);button.focus();return true;
    }
  };
})();
