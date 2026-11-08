/* Build a portable, scroll-driven microsite entirely in the visitor's browser. */
(()=>{
const id=name=>document.getElementById(name);
const nodes={title:id('builderTitle'),layout:id('builderLayout'),finish:id('builderFinish'),bg:id('builderBg'),zoom:id('builderZoom'),tilt:id('builderTilt')};
let assets=null,active=true,token=0,previewURL='',html='',renderPending=0;
const entities={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const escape=value=>value.replace(/[&<>"']/g,ch=>entities[ch]);
function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
function analyze(img){
 const scale=Math.min(1,1440/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
 const original=surface(w,h);original.getContext('2d').drawImage(img,0,0,w,h);
 const ratio=Math.min(1,350/Math.max(w,h)),mw=Math.max(1,Math.round(w*ratio)),mh=Math.max(1,Math.round(h*ratio)),small=surface(mw,mh),ctx=small.getContext('2d');ctx.drawImage(original,0,0,mw,mh);const p=ctx.getImageData(0,0,mw,mh).data,n=mw*mh;
 const rim=[];for(let x=0;x<mw;x++){rim.push(x,(mh-1)*mw+x)}for(let y=1;y<mh-1;y++){rim.push(y*mw,y*mw+mw-1)}
 const palette=[0,1,2].map(k=>{const vals=rim.filter(i=>p[i*4+3]>200).map(i=>p[i*4+k]).sort((a,b)=>a-b);return vals[Math.floor(vals.length/2)]??30});
 const bg='#'+palette.map(v=>v.toString(16).padStart(2,'0')).join('');
 const seen=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
 const alpha=rim.filter(i=>p[4*i+3]<20).length>rim.length*.25;
 function visit(i){if(seen[i])return;seen[i]=1;const j=i*4,dist=Math.hypot(p[j]-palette[0],p[j+1]-palette[1],p[j+2]-palette[2]);if(p[j+3]<15||(!alpha&&dist<63)){seen[i]=2;queue[tail++]=i}}
 rim.forEach(visit);while(head<tail){const i=queue[head++];if(i%mw)visit(i-1);if(i%mw<mw-1)visit(i+1);if(i>=mw)visit(i-mw);if(i+mw<n)visit(i+mw)}
 const mask=surface(mw,mh),mc=mask.getContext('2d'),out=mc.createImageData(mw,mh);let x0=mw,y0=mh,x1=-1,y1=-1,kept=0;
 for(let i=0;i<n;i++){if(seen[i]===2||p[4*i+3]<15)continue;out.data[4*i+3]=255;kept++;x0=Math.min(x0,i%mw);x1=Math.max(x1,i%mw);y0=Math.min(y0,Math.floor(i/mw));y1=Math.max(y1,Math.floor(i/mw))}
 const isolated=kept>n*.012&&kept<n*.86&&x1>x0&&y1>y0;let subject=original;
 if(isolated){mc.putImageData(out,0,0);const cut=surface(w,h),cc=cut.getContext('2d');cc.drawImage(original,0,0);cc.globalCompositeOperation='destination-in';cc.drawImage(mask,0,0,w,h);
 const x=Math.max(0,Math.floor(x0*w/mw)-2),y=Math.max(0,Math.floor(y0*h/mh)-2);subject=surface(Math.min(w-x,Math.ceil((x1-x0+1)*w/mw)+4),Math.min(h-y,Math.ceil((y1-y0+1)*h/mh)+4));subject.getContext('2d').drawImage(cut,-x,-y)}
 return {bg,isolated,original:original.toDataURL('image/webp',.94),subject:subject.toDataURL('image/webp',.94)}
}
function motion(){
 const root=document.documentElement,stage=document.querySelector('.stage'),object=document.querySelector('.obj'),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;let x=0,y=0,scheduled=false;
 function update(){scheduled=false;const depth=Math.min(1,Math.max(0,scrollY/innerHeight)),zoom=root.dataset.zoom==='true'&&!reduce?depth*.42:0;
 object.style.transform='perspective(1000px) translate3d('+x*12+'px,'+(y*9-zoom*28)+'px,0) rotateX('+(-y*8)+'deg) rotateY('+x*11+'deg) scale('+(1+zoom)+')';stage.style.setProperty('--shine',(50+x*37)+'%');document.querySelector('progress').value=depth}
 function queue(){if(!scheduled){scheduled=true;requestAnimationFrame(update)}}
 stage.onpointermove=e=>{if(reduce||root.dataset.tilt!=='true')return;const r=stage.getBoundingClientRect();x=(e.clientX-r.left)/r.width*2-1;y=(e.clientY-r.top)/r.height*2-1;queue()};stage.onpointerleave=()=>{x=y=0;queue()};addEventListener('scroll',queue,{passive:true});addEventListener('resize',queue);update()
}
function build(){
 const name=escape(nodes.title.value.trim()||'Untitled'),layout=nodes.layout.value,bg=nodes.bg.value,subject=layout==='poster'?assets.original:assets.subject;
 const rgb=[1,3,5].map(i=>parseInt(bg.slice(i,i+2),16));const ink=(rgb[0]*.299+rgb[1]*.587+rgb[2]*.114)>150?'#181917':'#f7f7f4';
 return '<!doctype html><html lang="ko" data-tilt="'+nodes.tilt.checked+'" data-zoom="'+nodes.zoom.checked+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+name+'</title><style>'+ `
 *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:Arial,sans-serif}a{color:inherit;text-decoration:none}header{position:absolute;z-index:3;top:0;left:0;right:0;display:flex;justify-content:space-between;padding:24px 5%;align-items:center}header b{font-weight:600;font-size:20px;letter-spacing:-.06em}header a,.detail a{font:11px monospace;letter-spacing:.08em}main{height:145vh}.stage{height:100vh;height:100svh;position:sticky;top:0;display:grid;place-items:center;overflow:hidden;background:radial-gradient(at 50% 42%,color-mix(in srgb,var(--bg) 89%,white),var(--bg) 68%)}.obj{width:72%;height:68%;position:relative;will-change:transform;transition:transform .18s ease-out;display:grid;place-items:center}.obj img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 20px 17px #0003)}.finish{position:absolute;inset:0;mask:var(--mask) center/contain no-repeat;pointer-events:none}.glass .finish{background:linear-gradient(108deg,transparent 22%,#ffffff52 48%,transparent 55%);background-size:210% 100%;background-position:var(--shine,50%) center;mix-blend-mode:screen}.pearl .finish{background:linear-gradient(120deg,#ff98ab70,#9b91ff70,#98ffd068);mix-blend-mode:color}.intro{position:absolute;bottom:6%;left:5%;right:5%;display:flex;align-items:end;justify-content:space-between;pointer-events:none}h1{font-family:Georgia,serif;font-size:clamp(44px,8vw,128px);font-weight:400;line-height:.95;letter-spacing:-.075em;margin:0;overflow-wrap:anywhere;max-width:85%}.intro a{font:15px monospace;pointer-events:auto}.detail{min-height:90svh;padding:6vh 5%;display:grid;grid-template-columns:1fr 1.35fr;align-items:center;gap:6%;border-top:1px solid color-mix(in srgb,var(--ink) 15%,transparent)}.detail h2{font:400 clamp(30px,5vw,88px) Georgia;letter-spacing:-.06em;margin:0 0 24px}.detail img{width:100%;max-height:80svh;object-fit:contain}.poster .obj{width:100%;height:100%}.poster .obj img{object-fit:cover}.poster .stage:after{content:'';position:absolute;inset:65% 0 0;background:linear-gradient(transparent,#0008);pointer-events:none}.poster .intro{z-index:1;color:white}.split .obj{width:56%;margin-left:32%}.split .intro{bottom:41%;max-width:42%}progress{position:fixed;z-index:4;top:0;width:100%;height:2px;appearance:none;border:0;background:transparent;pointer-events:none}progress::-webkit-progress-bar{background:transparent}progress::-webkit-progress-value{background:var(--ink)}@media(max-width:550px){header{padding:20px}.detail{grid-template-columns:1fr}.split .intro{bottom:11%}.obj{width:83%}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.obj{transition:none}}
 `+'</style><body class="'+layout+' '+nodes.finish.value+'" style="--bg:'+bg+';--ink:'+ink+'"><progress max="1" value="0"></progress><header id="top"><b>'+name+'</b><a href="#detail">DETAIL ↘</a></header><main><section class="stage"><div class="obj"><img alt="'+name+'" src="'+subject+'"><div class="finish"></div></div><div class="intro"><h1>'+name+'</h1><a href="#detail" aria-label="상세 이미지">↓</a></div></section></main><section id="detail" class="detail"><div><h2>'+name+'</h2><a href="#top">BACK TO TOP ↑</a></div><img alt="'+name+' 원본 시안" src="'+assets.original+'"></section><script>document.querySelector(".finish").style.setProperty("--mask", "url("+document.querySelector(".obj img").src+")");('+motion.toString()+')();<\/script></body></html>'
}
function render(){if(!assets)return;html=build();const next=URL.createObjectURL(new Blob([html],{type:'text/html'}));id('builderFrame').src=next;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=next}
Object.values(nodes).forEach(el=>el.oninput=()=>{clearTimeout(renderPending);renderPending=setTimeout(render,150)});
async function load(src,name){const job=++token;id('builderStatus').textContent='시안에서 색과 윤곽을 읽는 중…';try{const img=new Image();img.src=src;await img.decode();if(job!==token)return;assets=analyze(img);nodes.title.value=name;nodes.bg.value=assets.bg;nodes.layout.value=assets.isolated?'product':'poster';render();id('builderStatus').textContent=assets.isolated?'피사체와 배경을 분리해 웹사이트를 생성했어요.':'원본 구도를 살린 풀스크린 사이트를 생성했어요.'}catch{if(job===token)id('builderStatus').textContent='이미지를 읽지 못했어요. PNG 또는 JPG로 다시 선택해 주세요.'}}
id('builderFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;const url=URL.createObjectURL(f);try{await load(url,f.name.replace(/\.[^.]+$/,''))}finally{URL.revokeObjectURL(url);e.target.value=''}};
function download(){if(!assets)return;html=build();saveProduct(new Blob([html],{type:'text/html'}),'My-Website.html')}
id('builderDownload').onclick=download;id('builderFull').onclick=()=>document.fullscreenElement?document.exitFullscreen():id('builderFrame').parentElement.requestFullscreen();
const prevExport=id('export').onclick;
id('export').onclick=()=>active?download():prevExport();
function select(mode){active=mode==='builder';changeStudio(active?'free':mode);if(active){id('freeStudio').hidden=true;id('freeTab').classList.remove('on');id('export').title='생성된 사이트 HTML 다운로드'}id('builderStudio').hidden=!active;id('builderTab').classList.toggle('on',active);if(mode==='ai'&&!id('generator').getAttribute('src'))id('generator').src=id('generator').dataset.src}
for(const [key,mode] of [['builderTab','builder'],['aiTab','ai'],['productTab','product'],['freeTab','free']])id(key).onclick=()=>select(mode);
select('builder');load('abib-reference.webp','Abib')
})()
