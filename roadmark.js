(()=>{
const COLS=[
 {key:'solid150',label:'実線\nW=15cm',unit:'m',col:'C'},
 {key:'dash150',label:'破線\nW=15cm',unit:'m',col:'D'},
 {key:'zebra150',label:'ｾﾞﾌﾞﾗ線\nW=15cm',unit:'m',col:'E'},
 {key:'solid300',label:'実線\nW=30cm',unit:'m',col:'F'},
 {key:'dash300',label:'破線\nW=30cm',unit:'m',col:'G'},
 {key:'zebra300',label:'ｾﾞﾌﾞﾗ線\nW=30cm',unit:'m',col:'H'},
 {key:'solid450',label:'実線\nW=45cm',unit:'m',col:'I'},
 {key:'dash450',label:'破線\nW=45cm',unit:'m',col:'J'},
 {key:'zebra450',label:'ｾﾞﾌﾞﾗ線\nW=45cm',unit:'m',col:'K'},
 {key:'converted150',label:'文字・\n矢印・\n記号\nW=15cm\n換算',unit:'m',col:'L'},
 {key:'erase150',label:'区画線\n消去\nW=15cm\n換算',unit:'m',col:'M'},
 {key:'color',label:'路面\nカラー\n標示\n(m2)',unit:'m2',col:'N'},
 {key:'guard',label:'交通\n誘導員\n(人)',unit:'人',col:null}
];
let groups=[], reviewRows=[];
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitPdf(){for(let i=0;i<75;i++){if(window.pdfjsLib)return window.pdfjsLib;await sleep(200)}throw new Error('PDFライブラリを読み込めません')}
function norm(s){return String(s||'').normalize('NFKC').replace(/：/g,':').replace(/[‐‑–—−]/g,'-').replace(/ｾﾞﾌﾞﾗ/g,'ゼブラ').replace(/\s+/g,' ').trim()}
function districtMarkers(text){const re=/(\d{1,2})\s*[\.．]\s*([^\n]{1,30}?町)/g,out=[];let m;while((m=re.exec(text)))out.push({index:m.index,no:Number(m[1]),name:norm(m[2]).replace(/\s/g,'')});return out}
function parseExpression(after,ctx){
 const a=norm(after), c=norm(ctx); let m;
 m=a.match(/^L\s*=\s*([0-9.]+)\s*m?\s*[×x*]\s*([0-9.]+)\s*(?:本|個|ヶ|箇所|箇)?\s*=\s*([0-9.]+)\s*m/i);
 if(m){const base=+m[1],count=+m[2],stated=+m[3],calc=base*count;return {value:stated,base,count,stated,calc,formula:`${base}×${count}=${stated}`,check:Math.abs(calc-stated)<=0.11?'ok':'mismatch'}}
 m=a.match(/^L\s*=\s*([0-9.]+)\s*m?\s*\+\s*([0-9.]+)\s*m?\s*=\s*([0-9.]+)\s*m/i);
 if(m){const a1=+m[1],a2=+m[2],stated=+m[3],calc=a1+a2;return {value:stated,stated,calc,formula:`${a1}+${a2}=${stated}`,check:Math.abs(calc-stated)<=0.11?'ok':'mismatch'}}
 m=a.match(/^L\s*=\s*([0-9.]+)\s*m?\s*[×x*]\s*([0-9.]+)\s*(?:本|個|ヶ|箇所|箇)?/i);
 if(m){const base=+m[1],count=+m[2],calc=base*count;return {value:calc,base,count,calc,formula:`${base}×${count}`,check:'computed'}}
 m=a.match(/^L\s*=\s*([0-9.]+)\s*m\s*\/\s*箇所/i);
 if(m){const base=+m[1], cm=c.match(/[×x]\s*([0-9.]+)\s*(?:箇所|ヶ|個)/),count=cm?+cm[1]:1;return {value:base*count,base,count,calc:base*count,formula:`${base}/箇所 × ${count}`,check:cm?'computed':'review'}}
 m=a.match(/^L\s*=\s*([0-9.]+)\s*m/i);
 return m?{value:+m[1],stated:+m[1],formula:`L=${+m[1]}m`,check:'ok'}:null;
}
function classify(ctx){
 const c=norm(ctx);
 if(/消去/.test(c))return {key:'erase150',confidence:'high'};
 if(/カラー|グリーンライン|グリーンベルト/.test(c))return {key:'color',confidence:'medium'};
 if(/交通\s*誘導/.test(c))return {key:'guard',confidence:'medium'};
 if(/W\s*150\s*換算/i.test(c))return {key:'converted150',confidence:'high'};
 const wm=c.match(/W\s*(150|300|450)/i);if(!wm)return {key:null,confidence:'low',reason:'幅W150/W300/W450を特定できません'};
 const w=wm[1],zebra=/ゼブラ/.test(c)&&!/ゼブラ\s*枠|ゼブラ枠/.test(c),dash=/破線/.test(c),solid=/実線/.test(c);
 if(zebra)return {key:'zebra'+w,confidence:'high'};
 if(dash&&solid)return {key:null,confidence:'low',reason:'実線と破線の両方が近接しています'};
 if(dash)return {key:'dash'+w,confidence:'high'};
 if(solid)return {key:'solid'+w,confidence:'high'};
 return {key:null,confidence:'low',reason:'実線/破線を特定できません'};
}
function itemName(ctx){
 const c=norm(ctx);
 const patterns=[
  [/矢印予告直進左\(右\)折/,'矢印 予告直進左(右)折'],[/矢印直進左折/,'矢印 直進左折'],[/矢印直進右折/,'矢印 直進右折'],
  [/矢印直進/,'矢印 直進'],[/矢印右折/,'矢印 右折'],[/矢印予告左折/,'矢印 予告左折'],
  [/交差点マーク/,'交差点マーク'],[/指導停止線/,'指導停止線'],[/横断指導線/,'横断指導線'],
  [/ゼブラ枠/,'ゼブラ枠'],[/ゼブラ/,'ゼブラ'],[/外側線/,'外側線'],[/中央線/,'中央線'],[/矢羽根/,'矢羽根']
 ];
 const q=c.match(/文字\s*[「"]([^」"]+)/);if(q)return `文字「${q[1]}」`;
 for(const [re,name] of patterns)if(re.test(c))return name;
 return '区画線';
}
function parseSegment(no,name,text,pageNo){
 const t=norm(text),rows=[],issues=[];const re=/L\s*=/ig;let m,seq=0;
 while((m=re.exec(t))){
   const before=t.slice(Math.max(0,m.index-150),m.index),after=t.slice(m.index,m.index+130),context=norm(before+' '+after);
   const ex=parseExpression(after,before);if(!ex||!Number.isFinite(ex.value)||ex.value<=0||ex.value>10000)continue;
   const cl=classify(context),label=itemName(before);
   const row={id:`${pageNo}-${no}-${++seq}`,page:pageNo,item:label,value:ex.value,key:cl.key,source:context.slice(-220),formula:ex.formula,calcCheck:ex.check,review:false,reasons:[]};
   if(ex.check==='mismatch'){row.review=true;row.reasons.push(`計算不一致: ${ex.formula}（計算=${ex.calc}）`)}
   if(ex.check==='review'){row.review=true;row.reasons.push('箇所数を確定できません')}
   if(!cl.key){row.review=true;row.reasons.push(cl.reason||'分類不明')}
   if(label==='区画線'){row.review=true;row.reasons.push('項目名を特定できません')}
   rows.push(row);
 }
 const seen=new Map();
 for(const r of rows){const k=[r.item,r.key,r.value].join('|');const arr=seen.get(k)||[];arr.push(r);seen.set(k,arr)}
 for(const arr of seen.values())if(arr.length>1)for(let i=1;i<arr.length;i++){const a=arr[i-1].source,b=arr[i].source;if(a===b || a.slice(-100)===b.slice(-100)){arr[i].review=true;arr[i].reasons.push('同一注記の重複抽出候補')}}
 const totals={};COLS.forEach(c=>totals[c.key]=0);
 rows.filter(r=>r.key&&!r.review).forEach(r=>totals[r.key]+=r.value);
 rows.filter(r=>r.review).forEach(r=>issues.push(r));
 return {no,name,page:pageNo,rows,issues,totals};
}
async function extractPdf(file){
 const pdfjs=await waitPdf(),buf=await file.arrayBuffer(),pdf=await pdfjs.getDocument({data:buf}).promise,all=[];
 for(let p=1;p<=pdf.numPages;p++){
   setState(`PDF ${p}/${pdf.numPages}ページを精度優先で解析中…`,'run');
   const page=await pdf.getPage(p),tc=await page.getTextContent();
   const text=tc.items.map(x=>x.str).join(' '),markers=districtMarkers(text);
   if(!markers.length){const g=parseSegment(p,'ページ'+p,text,p);if(g.rows.length)all.push(g);continue}
   for(let i=0;i<markers.length;i++){const start=markers[i].index,end=i+1<markers.length?markers[i+1].index:text.length;all.push(parseSegment(markers[i].no,markers[i].name,text.slice(start,end),p))}
 }
 return all.sort((a,b)=>a.no-b.no||a.page-b.page);
}
function mergeGroups(raw){
 const map=new Map();
 for(const g of raw){
   const k=String(g.no);
   if(!map.has(k)){const totals={};COLS.forEach(c=>totals[c.key]=0);map.set(k,{no:g.no,name:g.name,pages:[],rows:[],issues:[],totals})}
   const dst=map.get(k);dst.pages.push(g.page);dst.rows.push(...g.rows);dst.issues.push(...g.issues);COLS.forEach(c=>dst.totals[c.key]+=g.totals[c.key]||0);
 }
 return [...map.values()].sort((a,b)=>a.no-b.no);
}
function setState(t,k=''){const e=$('roadState');if(e){e.textContent=t;e.className='status '+k}}
function render(){
 const body=$('roadBody'),sum=$('roadSummary'),rev=$('roadReviewBody'),rb=$('roadReviewBadge');if(!body||!sum)return;
 const grand={};COLS.forEach(c=>grand[c.key]=0);groups.forEach(g=>COLS.forEach(c=>grand[c.key]+=g.totals[c.key]||0));
 sum.innerHTML=COLS.slice(0,10).map(c=>`<div class="metric"><small>${c.label.replace(/\n/g,' ')}</small><strong>${(grand[c.key]||0).toFixed(1)}${c.unit}</strong></div>`).join('');
 body.innerHTML=groups.length?groups.map(g=>`<tr><td>${g.no}</td><td>${g.name}</td><td>${[...new Set(g.pages)].join(',')}</td>${COLS.slice(0,12).map(c=>`<td>${(g.totals[c.key]||0).toFixed(1)}</td>`).join('')}<td>${g.rows.filter(r=>!r.review).length}</td><td>${g.issues.length}</td></tr>`).join(''):'<tr><td colspan="17">まだ解析していません</td></tr>';
 reviewRows=groups.flatMap(g=>g.issues.map(r=>({...r,districtNo:g.no,districtName:g.name})));
 if(rb){rb.textContent=reviewRows.length?`要確認 ${reviewRows.length}件`:'要確認 0件';rb.className='badge '+(reviewRows.length?'err':'ok')}
 if(rev)rev.innerHTML=reviewRows.length?reviewRows.map(r=>`<tr><td>${r.page}</td><td>${r.districtNo} ${r.districtName}</td><td>${r.item}</td><td>${r.value}</td><td>${r.reasons.join(' / ')}</td><td>${r.source}</td></tr>`).join(''):'<tr><td colspan="6">要確認項目はありません</td></tr>';
 $('roadExport').disabled=!groups.length;
}
function borderStyle(){return {top:{style:'thin',color:{rgb:'000000'}},bottom:{style:'thin',color:{rgb:'000000'}},left:{style:'thin',color:{rgb:'000000'}},right:{style:'thin',color:{rgb:'000000'}}}}
function styleQuantitySheet(ws,rowCount){
 ws['!merges']=[XLSX.utils.decode_range('A1:N1'),XLSX.utils.decode_range('A2:B2')];
 ws['!cols']=[{wch:26},{wch:2},...Array(12).fill({wch:10})];
 ws['!rows']=[{hpt:28},{hpt:24},{hpt:78},...Array(Math.max(0,rowCount-4)).fill({hpt:27}),{hpt:27}];
 for(let r=0;r<rowCount;r++)for(let c=0;c<14;c++){const a=XLSX.utils.encode_cell({r,c}),cell=ws[a]||(ws[a]={t:'s',v:''});cell.s=cell.s||{};cell.s.font={name:'Yu Gothic',sz:r===0?16:11,bold:r===0||r===2||r===rowCount-1};cell.s.alignment={vertical:'center',horizontal:c===0?'left':'center',wrapText:true};if(r>=2)cell.s.border=borderStyle();if(r===2)cell.s.fill={fgColor:{rgb:'F2F2F2'}};if(r===rowCount-1)cell.s.fill={fgColor:{rgb:'F7F7F7'}};if(r>=3&&r<rowCount&&c>=2&&typeof cell.v==='number')cell.s.numFmt='0.0'}
}
function makeSheetAOA(g){
 const head=['項目','',...COLS.slice(0,12).map(c=>c.label)],rows=[['数量計算書'],[`${g.no} ${g.name}`,'','','','','','','','','','','','単位：m',''],head];
 for(const r of g.rows.filter(x=>!x.review)){const a=Array(14).fill('');a[0]=r.item;const idx=COLS.slice(0,12).findIndex(c=>c.key===r.key);if(idx>=0)a[2+idx]=r.value;rows.push(a)}
 while(rows.length<27)rows.push(Array(14).fill(''));
 const sub=['小計',''];COLS.slice(0,12).forEach((c,i)=>sub[2+i]=Number((g.totals[c.key]||0).toFixed(1)));rows.push(sub);return rows;
}
function styleSummary(ws,rowCount){ws['!merges']=[XLSX.utils.decode_range('A1:P1')];ws['!cols']=[{wch:5},{wch:20},{wch:2},...Array(13).fill({wch:11})];ws['!rows']=[{hpt:28},{hpt:78},...Array(Math.max(0,rowCount-2)).fill({hpt:28})];for(let r=0;r<rowCount;r++)for(let c=0;c<16;c++){const a=XLSX.utils.encode_cell({r,c}),cell=ws[a]||(ws[a]={t:'s',v:''});cell.s=cell.s||{};cell.s.font={name:'Yu Gothic',sz:r===0?16:10,bold:r===0||r===1||r>=rowCount-2};cell.s.alignment={vertical:'center',horizontal:c===1?'left':'center',wrapText:true};if(r>=1)cell.s.border=borderStyle();if(r===1)cell.s.fill={fgColor:{rgb:'F2F2F2'}};if(r>=2&&c>=3&&typeof cell.v==='number')cell.s.numFmt='0.0'}}
function exportExcel(){
 if(!window.XLSX||!groups.length)return;
 const wb=XLSX.utils.book_new(),grand={};COLS.forEach(c=>grand[c.key]=0);
 const summary=[['区画線　数量集計表','','','','','','','','','','','','','単位：m','',''],['No','工事箇所','',...COLS.map(c=>c.label)]];
 groups.forEach(g=>{summary.push([g.no,g.name,'',...COLS.map(c=>Number((g.totals[c.key]||0).toFixed(1)))]);COLS.forEach(c=>grand[c.key]+=g.totals[c.key]||0)});
 summary.push(['','合計','',...COLS.map(c=>Number((grand[c.key]||0).toFixed(1)))]);
 summary.push(['','設計数量','',...COLS.map(c=>Number(Math.round((grand[c.key]||0)*10)/10))]);
 const ws=XLSX.utils.aoa_to_sheet(summary);styleSummary(ws,summary.length);XLSX.utils.book_append_sheet(wb,ws,'集計表');
 for(const g of groups){const aoa=makeSheetAOA(g),s=XLSX.utils.aoa_to_sheet(aoa);styleQuantitySheet(s,aoa.length);XLSX.utils.book_append_sheet(wb,s,String(g.no).slice(0,31))}
 const audit=[['判定','ページ','地区','項目','数量','計算式/根拠','理由','元図面抽出文字']];
 groups.forEach(g=>g.rows.forEach(r=>audit.push([r.review?'要確認':'自動採用',r.page,`${g.no} ${g.name}`,r.item,r.value,r.formula||'',r.reasons.join(' / '),r.source])));
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(audit),'解析根拠');
 if(reviewRows.length){const rev=[['ページ','地区','項目','数量','要確認理由','元図面抽出文字'],...reviewRows.map(r=>[r.page,`${r.districtNo} ${r.districtName}`,r.item,r.value,r.reasons.join(' / '),r.source])];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rev),'要確認一覧')}
 const name=reviewRows.length?'区画線_数量計算書_要確認あり.xlsx':'区画線_数量計算書_確認済候補.xlsx';
 XLSX.writeFile(wb,name,{cellStyles:true});
 setState(reviewRows.length?`Excelを出力しました。要確認 ${reviewRows.length}件は数量集計から除外しています。`:'要確認0件。Excelを出力しました。','ok');
}
async function analyze(){
 const f=$('file')?.files?.[0];if(!f)return setState('先にPDF図面を選択してください','warn');
 if(!(f.type==='application/pdf'||/\.pdf$/i.test(f.name)))return setState('精度優先の区画線モードはPDF図面に対応しています','warn');
 $('roadRun').disabled=true;
 try{const raw=await extractPdf(f);groups=mergeGroups(raw);render();const accepted=groups.reduce((s,g)=>s+g.rows.filter(r=>!r.review).length,0),review=groups.reduce((s,g)=>s+g.issues.length,0);setState(`解析完了：自動採用 ${accepted}件／要確認 ${review}件。要確認値は集計へ入れていません。`,review?'warn':'ok')}
 catch(e){setState('区画線解析エラー：'+(e.message||e),'err')}finally{$('roadRun').disabled=false}
}
function inject(){
 const host=document.querySelector('.app');if(!host)return;const sec=document.createElement('section');sec.className='card';sec.innerHTML=`
 <div class="sectionTitle">🛣️ 区画線 数量計算モード（精度優先）</div>
 <div class="note">PDF全ページの記載を解析します。計算不一致・分類不明・重複候補は自動集計せず「要確認」に分離します。</div>
 <div class="row" style="margin-top:10px"><button id="roadRun" class="btn">区画線数量を解析</button><button id="roadExport" class="btn green" disabled>数量計算書Excel出力</button><span id="roadReviewBadge" class="badge">要確認 0件</span></div>
 <div id="roadState" class="status">PDF図面を選択して「区画線数量を解析」を押してください</div>
 <div id="roadSummary" class="results" style="margin-top:10px"></div>
 <div class="tblwrap" style="margin-top:10px"><table class="tbl" style="min-width:1900px"><thead><tr><th>No</th><th>工事箇所</th><th>ページ</th>${COLS.slice(0,12).map(c=>`<th>${c.label.replace(/\n/g,'<br>')}</th>`).join('')}<th>採用</th><th>要確認</th></tr></thead><tbody id="roadBody"><tr><td colspan="17">まだ解析していません</td></tr></tbody></table></div>
 <div class="sectionTitle" style="margin-top:16px">⚠️ 要確認</div>
 <div class="tblwrap"><table class="tbl" style="min-width:1100px"><thead><tr><th>ページ</th><th>地区</th><th>項目</th><th>数量</th><th>理由</th><th>元図面の抽出文字</th></tr></thead><tbody id="roadReviewBody"><tr><td colspan="6">要確認項目はありません</td></tr></tbody></table></div>
 <div class="note" style="margin-top:8px">※ この結果は自動拾いの補助です。契約・発注・請求などに使用する前に、元図面との照合と担当者確認を行ってください。</div>`;
 const excelCard=[...host.querySelectorAll('.card')].find(x=>x.querySelector('#excel'));if(excelCard)host.insertBefore(sec,excelCard);else host.appendChild(sec);
 $('roadRun').onclick=analyze;$('roadExport').onclick=exportExcel;render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
})();