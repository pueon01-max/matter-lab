/* Photo-calibrated round packaging. Both the preview and GLB use the same ring sections. */
const productDefault={cx:440/879,cy:483/1100,rx:300/879,ry:231/1100,edge:98/1100,depth:.51,gap:0,light:1,gloss:.18,yaw:0,pitch:Math.asin(231/300),zoom:1};
let product={...productDefault},photo=null,atlas=null,studioActive=true,revision=0,label='Abib · Orchid compact',dragProduct=null;
const canvas2=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
function profiles(s){
 const section=(name,levels,offset)=>({name,levels:levels.map(([r,t])=>({r,t,y:s.depth*(.5-t)+offset}))});
 return [section('Base',[[.948,1],[.97,.94],[.984,.85],[.985,.68]],-s.gap),section('Inner band',[[.967,.70],[.97,.62],[.974,.36]],0),section('Glass lid',[[.981,.37],[.997,.30],[1,.07],[.996,0]],s.gap)];
}
function extractTextures(img,s){
 const w=img.naturalWidth,h=img.naturalHeight,top=canvas2(1024,1024),side=canvas2(1024,192);
 const x=s.cx*w,y=s.cy*h,rx=s.rx*w,ry=s.ry*h;
 top.getContext('2d').drawImage(img,x-rx,y-ry,2*rx,2*ry,0,0,1024,1024);
 const ctx=side.getContext('2d');for(let i=0;i<side.width;i++){
  const a=(i+.5)/side.width*2*Math.PI,dx=Math.sin(a),front=Math.abs(Math.cos(a));
  const sx=Math.max(0,Math.min(w-2,x+rx*.985*dx)),sy=y+ry*front;
  ctx.drawImage(img,sx,sy,Math.max(1,rx/220),Math.max(2,s.edge*h),i,0,1,side.height);
 }
 return {top,side}
}
function drawProduct(canvas,s,tex,parts){
 const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,cx=W*.5,cy=H*.50,R=Math.min(W*.37,H*.41)*s.zoom,pitch=s.pitch,k=Math.sin(pitch),v=Math.cos(pitch),tau=2*Math.PI;
 const grad=ctx.createRadialGradient(W*.56,H*.39,0,W*.5,H*.5,W*.72);grad.addColorStop(0,'#30333a');grad.addColorStop(1,'#0d0f12');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
 ctx.save();ctx.translate(cx+R*.07,cy+R*.83);ctx.scale(R*1.15,R*.18);const sh=ctx.createRadialGradient(0,0,0,0,0,1);sh.addColorStop(0,'#08090bbc');sh.addColorStop(1,'#08090b00');ctx.fillStyle=sh;ctx.fillRect(-1,-1,2,2);ctx.restore();
 const planeY=y=>cy-R*y*v;
 function cap(level,withPhoto){
 const rad=R*level.r,py=planeY(level.y);
 ctx.save();ctx.translate(cx,py);ctx.scale(rad,rad*k);ctx.beginPath();ctx.arc(0,0,1,0,tau);ctx.clip();ctx.rotate(s.yaw);if(withPhoto)ctx.drawImage(tex.top,-1,-1,2,2);else{ctx.fillStyle='#33363c';ctx.fillRect(-1,-1,2,2)}ctx.restore();
 }
 ctx.filter=s.light===1?'none':'brightness('+s.light+')';
 for(const part of parts){
 const lv=part.levels;
 for(let j=0;j<lv.length-1;j++){
 const lo=lv[j],hi=lv[j+1];const n=160;
 for(let i=0;i<n;i++){
 const a=-Math.PI/2+i*Math.PI/n,b=a+Math.PI/n;
 const x1=cx+Math.sin(a)*R*hi.r,x2=cx+Math.sin(b)*R*hi.r;
 const topY=planeY(hi.y)+Math.cos(a)*R*hi.r*k,botY=planeY(lo.y)+Math.cos(a)*R*lo.r*k;
 const slope=(Math.cos(b)-Math.cos(a))*R*hi.r*k/Math.max(.001,x2-x1);ctx.save();ctx.transform(1,slope,0,1,x1,topY);
 const u=(((a+b)/2+s.yaw)%tau+tau)%tau/tau;
 ctx.drawImage(tex.side,Math.min(tex.side.width-1,Math.floor(u*tex.side.width)),hi.t*(tex.side.height-1),1,Math.max(1,(lo.t-hi.t)*(tex.side.height-1)),0,0,x2-x1+.5,Math.max(1,botY-topY+1));ctx.restore();
 }}
 cap(lv.at(-1),part.name==='Glass lid');
 }
 const top=parts.at(-1).levels.at(-1);ctx.save();ctx.translate(cx,planeY(top.y));ctx.scale(R*top.r,R*top.r*k);ctx.beginPath();ctx.arc(0,0,1,0,tau);ctx.clip();
 const sheen=ctx.createLinearGradient(-.9,-.8,.85,.65);sheen.addColorStop(0,'rgba(220,234,255,'+(s.gloss*.29)+')');sheen.addColorStop(.46,'rgba(255,255,255,0)');sheen.addColorStop(.81,'rgba(235,245,255,'+(s.gloss*.16)+')');sheen.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=sheen;ctx.fillRect(-1,-1,2,2);ctx.restore();ctx.filter='none'
}
function productRefresh(rebuild=false){
 if(!photo||!studioActive)return;
 if(rebuild||!atlas)atlas=extractTextures(photo,product);
 const canvas=$('productCanvas'),ratio=Math.min(devicePixelRatio||1,1.6);
 canvas.width=Math.max(1,Math.round(canvas.clientWidth*ratio));canvas.height=Math.max(1,Math.round(canvas.clientHeight*ratio));drawProduct(canvas,product,atlas,profiles(product));
 const g=$('guide'),cw=g.width=480,ch=g.height=170,gc=g.getContext('2d'),factor=Math.min(cw/photo.naturalWidth,ch/photo.naturalHeight),w=photo.naturalWidth*factor,h=photo.naturalHeight*factor,dx=(cw-w)/2,dy=(ch-h)/2;gc.drawImage(photo,dx,dy,w,h);gc.strokeStyle='#bbff80';gc.lineWidth=1.6;gc.beginPath();gc.ellipse(dx+w*product.cx,dy+h*product.cy,w*product.rx,h*product.ry,0,0,2*Math.PI);gc.stroke()
}
function controlSet(id,rows,crop=false){
 const group=$(id);group.replaceChildren();for(const [key,name,min,max,step] of rows){const row=document.createElement('div');row.className='range';const l=document.createElement('label'),o=document.createElement('output'),r=document.createElement('input');l.textContent=name;l.htmlFor=r.id='product-'+key;r.type='range';Object.assign(r,{min,max,step,value:product[key]});o.textContent=Number(product[key]).toFixed(2);l.append(o);r.oninput=()=>{product[key]=+r.value;o.textContent=product[key].toFixed(2);productRefresh(crop)};row.append(l,r);group.append(row)}
}
function controls(){controlSet('cropControls',[['cx','중심 X',.02,.98,.001],['cy','중심 Y',.02,.98,.001],['rx','가로 반경',.03,.50,.001],['ry','세로 반경',.02,.50,.001],['edge','측면 샘플 높이',.01,.45,.001]],true);controlSet('partControls',[['depth','케이스 두께',.1,1.2,.01],['gap','뚜껑 · 밴드 · 베이스 간격',0,.6,.01]]);controlSet('finishControls',[['gloss','윗면 하이라이트',0,1,.01],['light','노출',.55,1.65,.01]])}
async function loadProduct(src,name,custom){const ticket=++revision;try{const img=new Image();img.src=src;await img.decode();if(ticket!==revision)return;photo=img;label=name;product={...productDefault};if(custom){Object.assign(product,{cx:.5,cy:.45,rx:.38,ry:Math.min(.32,.38*img.naturalWidth/img.naturalHeight*.73),edge:.09});$('calibration').open=true} $('productName').textContent=name;$('productStatus').textContent=custom?'초록 타원을 사진 속 뚜껑 테두리에 맞춰 주세요.':'원본 사진에서 추출한 윗면과 측면 텍스처';controls();productRefresh(true)}catch{$('productStatus').textContent='이 이미지를 읽지 못했어요. PNG 또는 JPG로 다시 선택해 주세요.'}}
$('productFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;const u=URL.createObjectURL(f);try{await loadProduct(u,f.name,true)}finally{URL.revokeObjectURL(u);e.target.value=''}};
$('restore').onclick=()=>loadProduct('abib-reference.webp','Abib · Orchid compact',false);
function bindOrbit(el,s,draw){
 let last=null,pending=false;const update=()=>{if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;draw()})}};
 el.onpointerdown=e=>{last=[e.clientX,e.clientY];el.setPointerCapture(e.pointerId)};
 el.onpointermove=e=>{if(!last)return;const p=s();p.yaw+=(e.clientX-last[0])*.009;p.pitch=Math.min(1.52,Math.max(.06,p.pitch-(e.clientY-last[1])*.008));last=[e.clientX,e.clientY];update()};el.onpointerup=el.onpointercancel=()=>last=null;el.onwheel=e=>{e.preventDefault();const p=s();p.zoom=Math.min(1.85,Math.max(.55,p.zoom*Math.exp(-e.deltaY*.001)));update()}
}
bindOrbit($('productCanvas'),()=>product,productRefresh);new ResizeObserver(()=>productRefresh()).observe($('productCanvas'));
$('productReset').onclick=()=>{Object.assign(product,{yaw:0,pitch:productDefault.pitch,zoom:1});productRefresh()};$('productFull').onclick=()=>document.fullscreenElement?document.exitFullscreen():$('productView').requestFullscreen();
function switchMode(on){studioActive=on;$('productStudio').hidden=!on;$('freeStudio').hidden=on;$('productTab').classList.toggle('on',on);$('freeTab').classList.toggle('on',!on);if(on)productRefresh()}
$('productTab').onclick=()=>switchMode(true);$('freeTab').onclick=()=>switchMode(false);
loadProduct('abib-reference.webp',label,false);
async function makeGLB(s,tex){
 const gltf={asset:{version:'2.0',generator:'Matter Lab'},extensionsUsed:['KHR_materials_clearcoat'],scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Product',children:[1,2,3]}],meshes:[],materials:[],textures:[{source:0},{source:1}],images:[],buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
 const chunks=[];let total=0;
 function view(data,target){const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);const id=gltf.bufferViews.push({buffer:0,byteOffset:total,byteLength:bytes.length,...(target?{target}:{})})-1;chunks.push(bytes);total+=bytes.length;const pad=(4-total%4)%4;if(pad){chunks.push(new Uint8Array(pad));total+=pad}return id}
 function acc(data,type,components,indices=false,position=false){const entry={bufferView:view(data,indices?34963:34962),componentType:indices?5123:5126,count:data.length/components,type};if(position){entry.min=[Infinity,Infinity,Infinity];entry.max=[-Infinity,-Infinity,-Infinity];data.forEach((v,i)=>{const k=i%3;entry.min[k]=Math.min(entry.min[k],v);entry.max[k]=Math.max(entry.max[k],v)})}return gltf.accessors.push(entry)-1}
 for(const c of [tex.top,tex.side]){const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));gltf.images.push({bufferView:view(new Uint8Array(await blob.arrayBuffer())),mimeType:'image/png'})}
 for(const [name,texture] of [['Photo finish',0],['Edge finish',1],['Interior',null]])gltf.materials.push({name,doubleSided:true,pbrMetallicRoughness:{baseColorFactor:texture===null?[.08,.085,.1,1]:[1,1,1,1],...(texture===null?{}:{baseColorTexture:{index:texture}}),metallicFactor:.02,roughnessFactor:.69-s.gloss*.48}});
 gltf.materials[0].extensions={KHR_materials_clearcoat:{clearcoatFactor:Math.min(1,.35+s.gloss*.65),clearcoatRoughnessFactor:.14}};
 function primitive(pos,norm,uv,idx,material){return{attributes:{POSITION:acc(new Float32Array(pos),'VEC3',3,false,true),NORMAL:acc(new Float32Array(norm),'VEC3',3),TEXCOORD_0:acc(new Float32Array(uv),'VEC2',2)},indices:acc(new Uint16Array(idx),'SCALAR',1,true),material}}
 const segments=144;
 function disk(lv,up,material){const p=[0,lv.y,0],n=[0,up,0],uv=[.5,.5],idx=[];for(let i=0;i<=segments;i++){const a=i*2*Math.PI/segments,x=Math.sin(a),z=Math.cos(a);p.push(x*lv.r,lv.y,z*lv.r);n.push(0,up,0);uv.push(.5+.5*x,.5+.5*z);if(i)idx.push(0,up===1?i:i+1,up===1?i+1:i)}return primitive(p,n,uv,idx,material)}
 for(const part of profiles(s)){const p=[],n=[],uv=[],idx=[],levels=part.levels;for(let j=0;j<levels.length;j++){const l=levels[j],lo=levels[Math.max(0,j-1)],hi=levels[Math.min(levels.length-1,j+1)],slope=(hi.r-lo.r)/(hi.y-lo.y),len=Math.hypot(1,slope);for(let i=0;i<=segments;i++){const u=i/segments,a=u*2*Math.PI,x=Math.sin(a),z=Math.cos(a);p.push(l.r*x,l.y,l.r*z);n.push(x/len,-slope/len,z/len);uv.push(u,l.t);if(j&&i){const q=j*(segments+1)+i;idx.push(q-segments-2,q-segments-1,q,q-segments-2,q,q-1)}}}
 const primitives=[primitive(p,n,uv,idx,1),disk(levels[0],-1,2),disk(levels.at(-1),1,part.name==='Glass lid'?0:2)];gltf.nodes.push({name:part.name,mesh:gltf.meshes.length});gltf.meshes.push({name:part.name,primitives})}
 gltf.buffers[0].byteLength=total;const json=new TextEncoder().encode(JSON.stringify(gltf)),jslen=(json.length+3)&~3,buf=new Uint8Array(28+jslen+total),dv=new DataView(buf.buffer);
 const u32=(offset,value)=>dv.setUint32(offset,value,true);u32(0,0x46546c67);u32(4,2);u32(8,buf.length);u32(12,jslen);u32(16,0x4e4f534a);buf.fill(32,20,20+jslen);buf.set(json,20);u32(20+jslen,total);u32(24+jslen,0x004e4942);let offset=28+jslen;for(const b of chunks){buf.set(b,offset);offset+=b.length}return new Blob([buf],{type:'model/gltf-binary'})
}
function saveProduct(blob,filename){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000)}
$('glb').onclick=async()=>{if(!atlas)return;const b=$('glb');b.disabled=true;try{saveProduct(await makeGLB(product,atlas),'Matter-Product.glb');$('productStatus').textContent='윗면·측면 텍스처와 세 파트를 GLB로 내보냈어요.'}finally{b.disabled=false}};
const oldExport=$('export').onclick,oldFormat=$('format').onchange,oldDownload=$('download').onclick;let exportProduct=false,exportToken=0;
async function productCode(){
 const token=++exportToken,format=$('format').value;
 $('code').textContent='코드 생성 중…';$('copy').disabled=$('download').disabled=true;
 try{let code;if(format==='html'){
 const textureImages=[atlas.top,atlas.side].map(c=>c.toDataURL('image/webp',.97));
 code='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Product study</title><style>*{margin:0}canvas{display:block;width:100vw;height:100dvh;touch-action:none}</style><canvas></canvas><script>'+[profiles,drawProduct,bindOrbit].map(f=>f.toString()).join('\n')+'\nconst s='+JSON.stringify(product)+',c=document.querySelector("canvas");Promise.all('+JSON.stringify(textureImages)+'.map(src=>{const im=new Image();im.src=src;return im.decode().then(()=>im)})).then(([top,side])=>{function draw(){const d=Math.min(devicePixelRatio,1.6);c.width=c.clientWidth*d;c.height=c.clientHeight*d;drawProduct(c,s,{top,side},profiles(s))}bindOrbit(c,()=>s,draw);new ResizeObserver(draw).observe(c);draw()});<\/script>'
 }else{
 const blob=await makeGLB(product,atlas);const uri=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob)});const p=product;
 code=`// npm install three @react-three/fiber @react-three/drei
import React, {Suspense} from 'react';
import {Canvas} from '@react-three/fiber';
import {OrbitControls,useGLTF} from '@react-three/drei';
const modelURL=${JSON.stringify(uri)};
function Product(){const {scene}=useGLTF(modelURL);return <primitive object={scene} rotation={[0,${-p.yaw},0]}/>}
export default function ProductScene(){return <div style={{height:'100dvh'}}><Canvas orthographic camera={{position:[0,${4*Math.sin(p.pitch)},${4*Math.cos(p.pitch)}],zoom:${175*p.zoom},near:0.01,far:100}}><color attach="background" args={['#17191d']}/><ambientLight intensity={${1.6*p.light}}/><directionalLight position={[-3,5,4]} intensity={${1.2*p.light}}/><Suspense fallback={null}><Product/></Suspense><OrbitControls makeDefault maxPolarAngle={Math.PI*.48}/></Canvas></div>}`;}
 if(token!==exportToken)return;$('code').textContent=code;$('copy').textContent='코드 복사';$('copy').disabled=$('download').disabled=false;
 }catch{if(token===exportToken)$('code').textContent='내보내지 못했어요. 다시 시도해 주세요.'}
}
$('export').onclick=()=>{exportProduct=studioActive;if(!studioActive){++exportToken;$('copy').disabled=$('download').disabled=false;return oldExport()}if(!atlas)return;$('dialog').showModal();productCode()};
$('format').onchange=()=>exportProduct?productCode():oldFormat();
$('download').onclick=()=>exportProduct?saveProduct(new Blob([$('code').textContent],{type:'text/plain'}),'ProductScene.'+$('format').value):oldDownload();
