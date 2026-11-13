/* A failed first read must never look like an empty collection. No data or storage is changed here.
   A refused access token gets its own words and an Open Settings button, because Retry alone can never fix it. */
(function(){
  const loaded=new Set(),blocked=new Set();let retry=null, translate=null;const retries=new Map();
  const style=document.createElement('style');
  style.textContent='body[data-read-blocked]{display:block!important;min-height:100vh} body[data-read-blocked] > :not(#read-recovery):not(script):not(style):not(dialog[open]){display:none!important} #read-recovery{max-width:36rem;margin:10vh auto;padding:24px;font:inherit;overflow-wrap:anywhere} #read-recovery button{font:inherit;padding:10px 18px;cursor:pointer;margin:0 12px 12px 0}';
  document.head.append(style);document.addEventListener('keydown',e=>{if(blocked.size&&(e.metaKey||e.ctrlKey)&&/^[sn]$/i.test(e.key)){e.preventDefault();e.stopImmediatePropagation();}},true);
  function clear(){document.body.removeAttribute('data-read-blocked');document.getElementById('read-recovery')?.remove();}
  /* 'auth' = GitHub refused the token (401/403, or no token); 'offline'; 'timeout'; '' = unknown (today's plain text). */
  function reasonOf(e){
    if(e==='auth'||e==='offline'||e==='timeout')return e;
    const status=Number(e?.status)||0,m=String(e?.message||e||'');
    if(/rate limit|abuse detection/i.test(m))return '';
    if(status===401||status===403||/\b(401|403)\b|^auth$|bad credentials|requires authentication|resource not accessible|no (access )?token|token (is )?(missing|not set)/i.test(m))return 'auth';
    if(e?.name==='AbortError'||/timed? ?out/i.test(m))return 'timeout';
    if(e?.name==='TypeError'||/failed to fetch|networkerror|load failed|network request failed|offline/i.test(m))return 'offline';
    return '';
  }
  function describe(T,partial,why){
    if(why==='auth')return T('GitHub 不接受已保存的访问令牌，它可能已被更换。请打开“设置”，进入“连接”，粘贴当前的令牌，然后点“重试”。已保存的内容没有改动。','GitHub did not accept the saved access token. It may have been replaced. Open Settings, then Connection, and paste the current token, then press Retry. Your saved work is unchanged.');
    const base=partial?T('有些内容未能读取。已保存的内容没有改动。请重试，读取完成后再继续。','Some content could not be loaded. Your saved work is unchanged. Retry to load it before continuing.'):T('这次未能加载内容，已保存的内容没有改动。请重试，读取完成后再继续。','Nothing was loaded this time. Your saved work is unchanged. Retry to load it before continuing.');
    if(why==='offline')return base+' '+T('原因：没能连上 GitHub，请检查网络。','Reason: GitHub could not be reached. Check your internet connection.');
    if(why==='timeout')return base+' '+T('原因：GitHub 没有及时回应。','Reason: GitHub did not answer in time.');
    return base;
  }
  function draw(T,partial,why){
    clear();document.body.setAttribute('data-read-blocked','');
    const panel=document.createElement('section');panel.id='read-recovery';panel.setAttribute('role','alert');panel.setAttribute('data-reason',why);
    const title=document.createElement('h1');title.textContent=T('未能加载内容','Could not load your work');
    const text=document.createElement('p');text.textContent=describe(T,partial,why);
    const button=document.createElement('button');button.type='button';button.textContent=T('重试','Retry');
    button.onclick=async()=>{button.disabled=true;button.textContent=translate('正在重试…','Retrying…');try{await Promise.all([...retries.values()].map(run=>run()));}finally{if(button.isConnected){button.disabled=false;button.textContent=translate('重试','Retry');}}};
    let open=null;const addOpen=()=>{if(open)return true;if(typeof globalThis.SuiteSettings?.open!=='function')return false;open=document.createElement('button');open.type='button';open.id='read-open-settings';open.textContent=T('打开设置','Open Settings');open.onclick=()=>globalThis.SuiteSettings.open('connection');button.before(open);return true;};
    panel.append(title,text,button);document.body.append(panel);
    /* The shared Settings scripts can load after the first read fails: look for them for a few seconds. */
    if(why==='auth'){let n=0;const look=()=>{if(!panel.isConnected)return;if(addOpen())open.focus();else if(++n<50)setTimeout(look,200);};look();}
    (open||button).focus();
  }
  globalThis.FirstRead={
    reasonOf,
    reset(){loaded.clear();blocked.clear();retries.clear();clear();},
    ready(scope='main'){loaded.add(scope);blocked.delete(scope);retries.delete(scope);if(!blocked.size)clear();},
    fail(again,T,partial=false,scope='main',err){
      if(loaded.has(scope))return false;
      const why=reasonOf(err),panel=document.getElementById('read-recovery');
      blocked.add(scope);retries.set(scope,again);
      if(blocked.size>1&&panel){if(why==='auth'&&panel.getAttribute('data-reason')!=='auth'){retry=again;translate=T;draw(T,partial,why);}return true;}
      retry=again;translate=T;draw(T,partial,why);return true;
    }
  };
})();
