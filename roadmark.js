(()=>{
const COLS=[
 {key:'solid150',label:'実線 W=15cm'},
 {key:'dash150',label:'破線 W=15cm'},
 {key:'zebra150',label:'ゼブラ線 W=15cm'},
 {key:'solid300',label:'実線 W=30cm'},
 {key:'dash300',label:'破線 W=30cm'},
 {key:'zebra300',label:'ゼブラ線 W=30cm'},
 {key:'solid450',label:'実線 W=45cm'},
 {key:'dash450',label:'破線 W=45cm'},
 {key:'zebra450',label:'ゼブラ線 W=45cm'},
 {key:'converted150',label:'文字・矢印・記号 W=15cm換算'}
];
let groups=[],lastPdfFile=null;
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitPdf(){for(let i=0;i<75;i++){if(window.pdfjsLib)return window.pdfjsLib;await sleep(200)}throw new Error('PDFライブラリを読み込めません')}
function norm(s){return String(s||'').normalize('NFKC').replace(/：/g,':').replace(/[‐‑–—−]/g,'-').replace(/ｾﾞﾌﾞﾗ/g,'ゼブラ').replace(/\s+/g,' ').trim()}
function districtMarkers(text){
 const re=/(\d{1,2})\s*[\.．]\s*([^\n]{1,30}?町)/g,out=[];let m;
 while((m=re.exec(text)))out.push({index:m.index,no:Number(m[1]),name:norm(m[2]).replace(/\s/g,'')});
 return out;
}
function numericLength(ctx,after){
 const a=norm(after);
 let m=a.match(/^L\s*=\s*([0-9.]+)\s*m?\s*[×x*+]\s*([0-9.]+)\s*(?:本|個|ヶ|箇所|箇)?\s*=\s*([0-9.]+)\s*m/i);
 if(m)return Number(m[3]);
 m=a.match(/^L\s*=\s*([0-9.]+)\s*m?\s*\+\s*([0-9.]+)\s*m?\s*=\s*([0-9.]+)\s*m/i);
 if(m)return Number(m[3]);
 m=a.match(/^L\s*=\s*([0-9.]+)\s*m?\s*[×x*]\s*([0-9.]+)\s*(?:本|個|ヶ|箇所|箇)?/i);
 if(m)return Number(m[1])*Number(m[2]);
 m=a.match(/^L\s*=\s*([0-9.]+)\s*m\s*\/\s*箇所/i);
 if(m){const cm=norm(ctx).match(/[×x]\s*([0-9.]+)\s*(?:箇所|ヶ|個)/);return Number(m[1])*(cm?Number(cm[1]):1)}
 m=a.match(/^L\s*=\s*([0-9.]+)\s*m/i);
 return m?Number(m[1]):NaN;
}
function classify(ctx){
 const c=norm(ctx);
 if(/W\s*150\s*換算/i.test(c))return 'converted150';
 const wm=c.match(/W\s*(150|300|450)/i);if(!wm)return null;const w=wm[1];
 const zebra=/ゼブラ/.test(c)&&!/ゼブラ\s*枠|ゼブラ枠/.test(c);
 const dash=/破線/.test(c);
 if(zebra)return 'zebra'+w;
 return (dash?'dash':'solid')+w;
}
function itemName(ctx){
 const c=norm(ctx);
 const names=['矢印予告直進左(右)折','矢印直進左折','矢印直進右折','矢印直進','矢印右折','矢印予告左折','交差点マーク','指導停止線','横断指導線','ゼブラ枠','ゼブラ','外側線','中央線','文字','矢羽根'];
 for(const n of names)if(c.includes(n)){
   if(n==='文字'){const q=c.match(/文字\s*[「\"]([^」\"]+)/);return q?'文字「'+q[1]+'」':'文字'}
   return n;
 }
 return '区画線';
}
function parseSegment(no,name,text,pageNo){
 const t=norm(text);const rows=[];const re=/L\s*=/ig;let m;
 while((m=re.exec(t))){
   const before=t.slice(Math.max(0,m.index-130),m.index);const after=t.slice(m.index,m.index+110);
   const value=numericLength(before,after);if(!Number.isFinite(value)||value<=0||value>10000)continue;
   const key=classify(before+' '+after);if(!key)continue;
   const label=itemName(before);
   const width=(before+' '+after).match(/W\s*(150|300|450)/i)?.[1]||'150';
   const style=/破線/.test(before)?'破線':(/実線/.test(before)?'実線':(/換算/.test(before)?'換算':''));
   rows.push({page:pageNo,item:label,width:Number(width),style,value,key,source:norm((before+' '+after).slice(-180))});
 }
 // Deduplicate identical annotation accidentally encountered twice in PDF text stream.
 const map=new Map();for(const r of rows){const k=[r.item,r.key,r.value,r.source.slice(-70)].join('|');if(!map.has(k))map.set(k,r)}
 const unique=[...map.values()];const totals={};COLS.forEach(c=>totals[c.key]=0);unique.forEach(r=>totals[r.key]+=r.value);
 return {no,name,page:pageNo,rows:unique,totals};
}
async function extractPdf(file){
 const pdfjs=await waitPdf();const buf=await file.arrayBuffer();const pdf=await pdfjs.getDocument({data:buf}).promise;const all=[];
 for(let p=1;p<=pdf.numPages;p++){
   setState(`PDF ${p}/${pdf.numPages}ページを解析中…`,'run');
   const page=await pdf.getPage(p),tc=await page.getTextContent();
   const text=tc.items.map(x=>x.str).join(' ');const markers=districtMarkers(text);
   if(!markers.length){all.push(parseSegment(p,'ページ'+p,text,p));continue}
   for(let i=0;i<markers.length;i++){
     const start=markers[i].index,end=i+1<markers.length?markers[i+1].index:text.length;
     all.push(parseSegment(markers[i].no,markers[i].name,text.slice(start,end),p));
   }
 }
 return all.filter(g=>g.rows.length||!/^ページ/.test(g.name)).sort((a,b)=>a.no-b.no);
}
function setState(t,k=''){const e=$('roadState');if(e){e.textContent=t;e.className='status '+k}}
function render(){
 const body=$('roadBody'),sum=$('roadSummary');if(!body||!sum)return;
 const grand={};COLS.forEach(c=>grand[c.key]=0);groups.forEach(g=>COLS.forEach(c=>grand[c.key]+=g.totals[c.key]||0));
 sum.innerHTML=COLS.map(c=>`<div class="metric"><small>${c.label}</small><strong>${(grand[c.key]||0).toFixed(1)}m</strong></div>`).join('');
 body.innerHTML=groups.length?groups.map(g=>`<tr><td>${g.no}</td><td>${g.name}</td>${COLS.map(c=>`<td>${(g.totals[c.key]||0).toFixed(1)}</td>`).join('')}<td>${g.rows.length}</td></tr>`).join(''):'<tr><td colspan="13">まだ解析していません</td></tr>';
 $('roadExport').disabled=!groups.length;
}
function makeSheetAOA(g){
 const head=['項目','実線\nW=15cm','破線\nW=15cm','ゼブラ線\nW=15cm','実線\nW=30cm','破線\nW=30cm','ゼブラ線\nW=30cm','実線\nW=45cm','破線\nW=45cm','ゼブラ線\nW=45cm','文字・矢印・記号\nW=15cm換算','ページ'];
 const rows=[['数量計算書'],[g.no,g.name,'','','','','','','','','','単位:m'],head];
 for(const r of g.rows){const a=Array(12).fill('');a[0]=r.item;a[1+COLS.findIndex(c=>c.key===r.key)]=r.value;a[11]=r.page;rows.push(a)}
 const sub=['小計'];COLS.forEach((c,i)=>sub[i+1]=Number((g.totals[c.key]||0).toFixed(1)));rows.push(sub);return rows;
}
function exportExcel(){
 if(!window.XLSX||!groups.length)return;
 const wb=XLSX.utils.book_new();
 const hdr=['No','工事箇所',...COLS.map(c=>c.label)];const summary=[['区画線 数量集計表','','単位:m'],hdr];
 const grand={};COLS.forEach(c=>grand[c.key]=0);
 groups.forEach(g=>{summary.push([g.no,g.name,...COLS.map(c=>Number((g.totals[c.key]||0).toFixed(1)))]);COLS.forEach(c=>grand[c.key]+=g.totals[c.key]||0)});
 summary.push(['','合計',...COLS.map(c=>Number((grand[c.key]||0).toFixed(1)))]);
 const ws=XLSX.utils.aoa_to_sheet(summary);ws['!cols']=[{wch:6},{wch:18},...COLS.map(()=>({wch:15}))];XLSX.utils.book_append_sheet(wb,ws,'集計表');
 for(const g of groups){const s=XLSX.utils.aoa_to_sheet(makeSheetAOA(g));s['!cols']=[{wch:24},...Array(10).fill({wch:14}),{wch:8}];XLSX.utils.book_append_sheet(wb,s,String(g.no).slice(0,31))}
 XLSX.writeFile(wb,'区画線_数量計算書.xlsx');setState('添付例に近い「集計表＋地区別数量計算書」を出力しました','ok');
}
async function analyze(){
 const f=$('file')?.files?.[0];if(!f)return setState('先にPDF図面を選択してください','warn');
 if(!(f.type==='application/pdf'||/\.pdf$/i.test(f.name)))return setState('このモードはまずPDF図面に対応しています','warn');
 lastPdfFile=f;$('roadRun').disabled=true;try{groups=await extractPdf(f);render();const n=groups.reduce((s,g)=>s+g.rows.length,0);setState(`完了：${groups.length}地区・${n}項目を抽出しました。内容を確認してExcel出力してください。`,'ok')}catch(e){setState('区画線解析エラー：'+(e.message||e),'err')}finally{$('roadRun').disabled=false}
}
function inject(){
 const host=document.querySelector('.app');if(!host)return;const sec=document.createElement('section');sec.className='card';sec.innerHTML=`
 <div class="sectionTitle">🛣️ 区画線 数量計算モード</div>
 <div class="note">CAD/PDF内の文字を直接読み取り、「中央線・外側線・ゼブラ・矢印・文字」などを W150/W300/W450・実線/破線/換算へ振り分けます。PDF全ページ対応。</div>
 <div class="row" style="margin-top:10px"><button id="roadRun" class="btn">区画線数量を解析</button><button id="roadExport" class="btn green" disabled>数量計算書Excel出力</button></div>
 <div id="roadState" class="status">PDF図面を選択して「区画線数量を解析」を押してください</div>
 <div id="roadSummary" class="results" style="margin-top:10px"></div>
 <div class="tblwrap" style="margin-top:10px"><table class="tbl" style="min-width:1500px"><thead><tr><th>No</th><th>工事箇所</th>${COLS.map(c=>`<th>${c.label}</th>`).join('')}<th>抽出項目数</th></tr></thead><tbody id="roadBody"><tr><td colspan="13">まだ解析していません</td></tr></tbody></table></div>
 <div class="note" style="margin-top:8px">※ 自動抽出後は必ず確認してください。図面の文字レイヤーが無いスキャンPDFは、今後OCR補助へ拡張できます。</div>`;
 const excelCard=[...host.querySelectorAll('.card')].find(x=>x.querySelector('#excel'));if(excelCard)host.insertBefore(sec,excelCard);else host.appendChild(sec);
 $('roadRun').onclick=analyze;$('roadExport').onclick=exportExcel;render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
})();
