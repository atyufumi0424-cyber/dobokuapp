(()=>{
const LOCAL_KEY='doboku_measurement_history_v1';
const DRIVE_NAME='doboku-history.json';
let tokenClient=null,accessToken='',driveFileId='';
const $=id=>document.getElementById(id);
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function readLocal(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]')}catch{return []}}
function writeLocal(v){localStorage.setItem(LOCAL_KEY,JSON.stringify(v))}
function currentEntry(){
 const counts=[0,1,2,3].map(i=>Number(($('q'+i)?.textContent||'0').match(/\d+/)?.[0]||0));
 const dims=[...document.querySelectorAll('#dimBody tr')].map(tr=>{const td=tr.querySelectorAll('td');return td.length>=3?{type:td[0].textContent.trim(),value:Number(td[1].textContent.trim()),unit:td[2].textContent.trim()}:null}).filter(x=>x&&Number.isFinite(x.value));
 const f=$('file')?.files?.[0];
 return {id:Date.now()+'-'+Math.random().toString(36).slice(2,8),createdAt:new Date().toISOString(),fileName:f?.name||'図面',counts:{manhole:counts[0],catchBasin:counts[1],sideDitch:counts[2],curb:counts[3]},dimensions:dims};
}
function render(){
 const body=$('historyBody'); if(!body)return; const h=readLocal();
 $('historyCount').textContent=h.length+'件';
 body.innerHTML=h.length?h.map(x=>`<tr><td>${new Date(x.createdAt).toLocaleString('ja-JP')}</td><td>${esc(x.fileName)}</td><td>マンホール ${x.counts?.manhole||0}基 / 集水桝 ${x.counts?.catchBasin||0}基 / 側溝 ${x.counts?.sideDitch||0} / 縁石 ${x.counts?.curb||0}</td><td><button class="historyDel" data-id="${x.id}">削除</button></td></tr>`).join(''):'<tr><td colspan="4">履歴はまだありません</td></tr>';
 body.querySelectorAll('.historyDel').forEach(b=>b.onclick=async()=>{writeLocal(readLocal().filter(x=>x.id!==b.dataset.id));render();if(accessToken)await syncToDrive().catch(()=>{})});
}
async function saveHistory(){const h=readLocal();h.unshift(currentEntry());if(h.length>100)h.length=100;writeLocal(h);render();if(accessToken)await syncToDrive().catch(()=>{})}
async function api(url,opt={}){const r=await fetch(url,{...opt,headers:{Authorization:'Bearer '+accessToken,...(opt.headers||{})}});if(!r.ok)throw new Error('Google API '+r.status);if(r.status===204)return null;return r.json()}
async function findDriveFile(){const q=encodeURIComponent(`name='${DRIVE_NAME}' and trashed=false`);const d=await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name)`);driveFileId=d.files?.[0]?.id||'';return driveFileId}
async function loadFromDrive(){await findDriveFile();if(!driveFileId)return;const r=await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,{headers:{Authorization:'Bearer '+accessToken}});if(!r.ok)throw new Error('履歴取得 '+r.status);const remote=await r.json();const merged=[...remote,...readLocal()];const map=new Map();merged.forEach(x=>map.set(x.id,x));const all=[...map.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100);writeLocal(all);render()}
async function syncToDrive(){const body=JSON.stringify(readLocal());if(!driveFileId)await findDriveFile();if(driveFileId){const r=await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`,{method:'PATCH',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body});if(!r.ok)throw new Error('履歴同期 '+r.status);return}
 const boundary='doboku_'+Date.now();const meta=JSON.stringify({name:DRIVE_NAME,parents:['appDataFolder']});const multipart=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
 const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'multipart/related; boundary='+boundary},body:multipart});if(!r.ok)throw new Error('履歴作成 '+r.status);driveFileId=(await r.json()).id;
}
function googleReady(){return window.google?.accounts?.oauth2}
function initGoogle(){const clientId=window.DOBOKU_GOOGLE_CLIENT_ID||'';const btn=$('googleLogin');if(!clientId||clientId.includes('PASTE_')){btn.disabled=true;$('googleState').textContent='Google連携はOAuthクライアントID設定後に使えます';return}if(!googleReady()){setTimeout(initGoogle,300);return}tokenClient=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email',callback:async r=>{if(r.error){$('googleState').textContent='Googleログインに失敗しました';return}accessToken=r.access_token;$('googleState').textContent='Googleアカウント連携済み';btn.textContent='Google再認証';try{await loadFromDrive();await syncToDrive();$('googleState').textContent='Google Driveと履歴同期済み'}catch(e){$('googleState').textContent='Google連携済み（同期エラー）'}}});btn.onclick=()=>tokenClient.requestAccessToken({prompt:accessToken?'':'consent'});}
function inject(){const host=document.querySelector('.app');if(!host)return;const sec=document.createElement('section');sec.className='card';sec.innerHTML=`<div class="sectionTitle">🕘 測定履歴</div><div class="row"><button id="googleLogin" class="btn secondary">Googleアカウントと連携</button><button id="clearHistory" class="btn secondary">端末履歴を全削除</button><span id="historyCount" class="note">0件</span></div><div id="googleState" class="note" style="margin-top:8px">端末内に自動保存します</div><div class="tblwrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>日時</th><th>ファイル</th><th>数量</th><th></th></tr></thead><tbody id="historyBody"></tbody></table></div></section>`;host.appendChild(sec);$('clearHistory').onclick=async()=>{if(!confirm('端末内の測定履歴をすべて削除しますか？'))return;writeLocal([]);render();if(accessToken)await syncToDrive().catch(()=>{})};render();initGoogle();
 const st=$('status');if(st){new MutationObserver(()=>{const t=st.textContent||'';if(t.startsWith('完了：')&&!st.dataset.historySaved){st.dataset.historySaved='1';saveHistory();}else if(!t.startsWith('完了：'))delete st.dataset.historySaved;}).observe(st,{childList:true,subtree:true,characterData:true});}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
})();
