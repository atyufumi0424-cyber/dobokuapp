(()=>{
const LOCAL_KEY='doboku_measurement_history_v1';
const $=id=>document.getElementById(id);
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function readLocal(){try{const v=JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function writeLocal(v){localStorage.setItem(LOCAL_KEY,JSON.stringify(v))}
function currentEntry(){
 const counts=[0,1,2,3].map(i=>Number(($('q'+i)?.textContent||'0').match(/\d+/)?.[0]||0));
 const dims=[...document.querySelectorAll('#dimBody tr')].map(tr=>{const td=tr.querySelectorAll('td');return td.length>=3?{type:td[0].textContent.trim(),value:Number(td[1].textContent.trim()),unit:td[2].textContent.trim()}:null}).filter(x=>x&&Number.isFinite(x.value));
 const f=$('file')?.files?.[0];
 return {id:Date.now()+'-'+Math.random().toString(36).slice(2,8),createdAt:new Date().toISOString(),fileName:f?.name||'図面',counts:{manhole:counts[0],catchBasin:counts[1],sideDitch:counts[2],curb:counts[3]},dimensions:dims};
}
function render(){
 const body=$('historyBody');if(!body)return;const h=readLocal();$('historyCount').textContent=h.length+'件';
 body.innerHTML=h.length?h.map(x=>`<tr><td>${new Date(x.createdAt).toLocaleString('ja-JP')}</td><td>${esc(x.fileName)}</td><td>マンホール ${x.counts?.manhole||0}基 / 集水桝 ${x.counts?.catchBasin||0}基 / 側溝 ${x.counts?.sideDitch||0} / 縁石 ${x.counts?.curb||0}</td><td><button class="historyDetail" data-id="${x.id}">詳細</button> <button class="historyDel" data-id="${x.id}">削除</button></td></tr>`).join(''):'<tr><td colspan="4">履歴はまだありません</td></tr>';
 body.querySelectorAll('.historyDel').forEach(b=>b.onclick=()=>{writeLocal(readLocal().filter(x=>x.id!==b.dataset.id));render()});
 body.querySelectorAll('.historyDetail').forEach(b=>b.onclick=()=>showDetail(b.dataset.id));
}
function showDetail(id){const x=readLocal().find(v=>v.id===id);if(!x)return;const d=(x.dimensions||[]).map(v=>`${v.type}: ${v.value}${v.unit}`).join('\n')||'寸法データなし';alert(`${new Date(x.createdAt).toLocaleString('ja-JP')}\n${x.fileName}\n\nマンホール ${x.counts?.manhole||0}基\n集水桝 ${x.counts?.catchBasin||0}基\n側溝 ${x.counts?.sideDitch||0}箇所\n縁石 ${x.counts?.curb||0}箇所\n\n${d}`)}
function saveHistory(){const h=readLocal();h.unshift(currentEntry());if(h.length>200)h.length=200;writeLocal(h);render();setBackupState('履歴を端末内に保存しました')}
function setBackupState(t){const e=$('historyState');if(e)e.textContent=t}
function exportHistory(){const data={app:'dobokuapp',version:1,exportedAt:new Date().toISOString(),history:readLocal()};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='土木図面_測定履歴バックアップ.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setBackupState('履歴バックアップを書き出しました')}
function importHistoryFile(f){const r=new FileReader();r.onerror=()=>setBackupState('バックアップを読み込めませんでした');r.onload=()=>{try{const obj=JSON.parse(r.result);const incoming=Array.isArray(obj)?obj:Array.isArray(obj.history)?obj.history:null;if(!incoming)throw new Error('形式不正');const merged=[...incoming,...readLocal()];const map=new Map();merged.forEach(x=>{if(x&&x.id)map.set(x.id,x)});const all=[...map.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,200);writeLocal(all);render();setBackupState(`バックアップを読み込みました（合計 ${all.length}件）`)}catch(e){setBackupState('バックアップ形式が正しくありません')}};r.readAsText(f)}
function loadScriptOnce(src,key){if(document.querySelector(`script[data-${key}]`))return;const s=document.createElement('script');s.src=src+'?ts='+Date.now();s.defer=true;s.dataset[key]='1';document.head.appendChild(s)}
function inject(){const host=document.querySelector('.app');if(!host)return;const sec=document.createElement('section');sec.className='card';sec.innerHTML=`<div class="sectionTitle">🕘 測定履歴</div><div class="row"><button id="exportHistory" class="btn secondary">履歴をバックアップ</button><label class="btn secondary" style="display:inline-flex;align-items:center;cursor:pointer">バックアップを読み込む<input id="importHistory" type="file" accept="application/json,.json" style="display:none"></label><button id="clearHistory" class="btn secondary">履歴を全削除</button><span id="historyCount" class="note">0件</span></div><div id="historyState" class="note" style="margin-top:8px">ログイン不要。解析結果はこの端末に自動保存されます。</div><div class="note" style="margin-top:6px">※ Safariのサイトデータを削除すると端末履歴も消えるため、必要に応じてバックアップしてください。</div><div class="tblwrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>日時</th><th>ファイル</th><th>数量</th><th></th></tr></thead><tbody id="historyBody"></tbody></table></div></section>`;host.appendChild(sec);
 $('exportHistory').onclick=exportHistory;$('importHistory').onchange=e=>{const f=e.target.files?.[0];if(f)importHistoryFile(f);e.target.value=''};$('clearHistory').onclick=()=>{if(!confirm('測定履歴をすべて削除しますか？'))return;writeLocal([]);render();setBackupState('履歴を削除しました')};render();
 const st=$('status');if(st){new MutationObserver(()=>{const t=st.textContent||'';if((t.startsWith('完了：')||t.startsWith('PDF全'))&&!st.dataset.historySaved){st.dataset.historySaved='1';saveHistory()}else if(!(t.startsWith('完了：')||t.startsWith('PDF全')))delete st.dataset.historySaved}).observe(st,{childList:true,subtree:true,characterData:true})}
 loadScriptOnce('./roadmark.js','roadmark');
 loadScriptOnce('./pdf-multipage.js','pdfmultipage');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
})();
