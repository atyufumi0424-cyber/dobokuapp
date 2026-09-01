(()=>{
const $=id=>document.getElementById(id);
let active=false;
function isPdf(){const f=$('file')?.files?.[0];return !!f&&(f.type==='application/pdf'||/\.pdf$/i.test(f.name))}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitPdf(){for(let i=0;i<80;i++){if(window.pdfjsLib)return window.pdfjsLib;await sleep(200)}throw new Error('PDFライブラリを読み込めません')}
async function imageFromPage(page,maxSide=2400){
 const base=page.getViewport({scale:1});
 const scale=Math.min(3,maxSide/Math.max(base.width,base.height));
 const vp=page.getViewport({scale});
 const c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);
 await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
 const im=new Image();await new Promise((res,rej)=>{im.onload=res;im.onerror=rej;im.src=c.toDataURL('image/png')});return im;
}
function displayImage(im){
 source=im;
 const iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height,s=Math.min(1,1800/iw,2400/ih);
 cv.width=Math.max(1,Math.round(iw*s));cv.height=Math.max(1,Math.round(ih*s));
 ctx.clearRect(0,0,cv.width,cv.height);ctx.drawImage(im,0,0,cv.width,cv.height);
}
function renderAggregated(boxes,dims,maxScore){
 lastBoxes=boxes;dimensions=dims;
 $('maxScore').textContent=Number.isFinite(maxScore)?(maxScore*100).toFixed(1)+'%':'-';
 tbody.innerHTML=boxes.length?'':'<tr><td colspan="2">検出なし</td></tr>';
 for(const b of boxes)tbody.insertAdjacentHTML('beforeend',`<tr><td>${NAMES[b.cls]}（${b.page}ページ）</td><td>${(b.score*100).toFixed(1)}%</td></tr>`);
 dimBody.innerHTML=dims.length?'':'<tr><td colspan="3">寸法を検出できませんでした</td></tr>';
 for(const d of dims)dimBody.insertAdjacentHTML('beforeend',`<tr><td>${d.type}（${d.page}ページ）</td><td>${d.value}</td><td>${d.unit}</td></tr>`);
 updateSummary();
}
async function analyzePdf(all=true){
 if(active)return;const f=$('file')?.files?.[0];if(!f||!isPdf())return;
 active=true;run.disabled=true;ocrOnly.disabled=true;
 try{
   const pdfjs=await waitPdf();const pdf=await pdfjs.getDocument({data:await f.arrayBuffer()}).promise;
   const allBoxes=[],allDims=[];let maxScore=0,firstImage=null;
   for(let p=1;p<=pdf.numPages;p++){
     setStatus(`PDF ${p}/${pdf.numPages}ページを${all?'AI＋寸法':'寸法'}解析中…`,'run');
     const page=await pdf.getPage(p),im=await imageFromPage(page);if(p===1)firstImage=im;displayImage(im);
     if(all&&session){
       const m=prep(),res=await session.run({[session.inputNames[0]]:m.tensor}),parsed=parse(res[session.outputNames[0]],m,Number(thr.value));
       maxScore=Math.max(maxScore,parsed.mx||0);parsed.boxes.forEach(b=>allBoxes.push({...b,page:p}));
     }
     const T=await waitLib('Tesseract',15000);if(!T)throw new Error('OCRライブラリを読み込めません');
     const res=await T.recognize(im,'eng',{logger:m=>{if(m.status==='recognizing text')setStatus(`PDF ${p}/${pdf.numPages}ページ 寸法OCR ${Math.round((m.progress||0)*100)}%`,'run')},tessedit_char_whitelist:'0123456789.WLHSmxX:=/- '});
     extractDimensions(res.data.text||'');dimensions.forEach(d=>allDims.push({...d,page:p,k:`${p}|${d.k}`}));
     await sleep(10);
   }
   if(firstImage)displayImage(firstImage);
   renderAggregated(allBoxes,allDims,maxScore);
   excel.disabled=!(allBoxes.length||allDims.length);
   setStatus(`PDF全${pdf.numPages}ページ解析完了：AI ${allBoxes.length}件・寸法 ${allDims.length}件`,'ok');
 }catch(e){setStatus('PDF全ページ解析エラー：'+(e.message||e),'err')}
 finally{active=false;run.disabled=!session;ocrOnly.disabled=false}
}
function intercept(e){
 if(!isPdf())return;
 const t=e.target;if(t===$('run')){e.preventDefault();e.stopImmediatePropagation();analyzePdf(true)}
 else if(t===$('ocrOnly')){e.preventDefault();e.stopImmediatePropagation();analyzePdf(false)}
}
document.addEventListener('click',intercept,true);
const fi=$('file');if(fi)fi.addEventListener('change',async()=>{const f=fi.files?.[0];if(!f||!isPdf())return;try{const pdfjs=await waitPdf();const pdf=await pdfjs.getDocument({data:await f.arrayBuffer()}).promise;setTimeout(()=>setStatus(`PDFを読み込みました（全${pdf.numPages}ページ）。解析時は全ページを処理します。`,'ok'),100)}catch{}},true);
})();
