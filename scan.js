(()=>{
const $=id=>document.getElementById(id),scene={objects:[],yaw:0,pitch:0,camera:4.8,float:true,mouse:true,wave:true};let active=true,selected=0,source=null,region=null,drag=null,display=null,uploadSeq=0,title='Abib',pristine=true,replaceOnCrop=null;
const cv=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const faces=['정면','오른쪽 측면','윗면','바닥면'],views=Array(4).fill(null);
faces.forEach((name,i)=>{const lab=document.createElement('label'),file=document.createElement('input');lab.className='field';lab.textContent=name;file.type='file';file.accept='image/*';file.style.cssText='width:65%;font-size:11px';lab.append(file);$('fourInputs').append(lab);file.onchange=async()=>{views[i]=null;$('fourBuild').disabled=true;const f=file.files[0];if(!f)return;const url=URL.createObjectURL(f);try{const im=new Image();im.src=url;await im.decode();if(file.files[0]!==f)return;views[i]=im;$('fourStatus').textContent=views.filter(Boolean).length+' / 4장 준비됨'}catch{$('fourStatus').textContent='이미지를 읽지 못했어요.'}finally{URL.revokeObjectURL(url);$('fourBuild').disabled=!views.every(Boolean)}}});
function profile(im){
 const c=cv(192,192),g=c.getContext('2d');g.drawImage(im,0,0,192,192);const d=g.getImageData(0,0,192,192).data,edge=[];for(let i=0;i<192;i++)edge.push(i,191*192+i,i*192,i*192+191);
 const alpha=edge.filter(i=>d[i*4+3]<50).length>100,bg=[0,1,2].map(k=>edge.map(i=>d[i*4+k]).sort((a,b)=>a-b)[384]);let xmin=192,xmax=-1,ymin=192,ymax=-1;const rows=[],cols=[];
 for(let y=0;y<192;y++)for(let x=0;x<192;x++){const i=(y*192+x)*4;if(d[i+3]<100||(!alpha&&Math.hypot(d[i]-bg[0],d[i+1]-bg[1],d[i+2]-bg[2])<52))continue;xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);(rows[y]??=[]).push(x);(cols[x]??=[]).push(y)}
 if(xmax-xmin<4||ymax-ymin<4)throw Error('제품 외곽을 찾기 어려워요. 단색 배경에서 다시 찍어 주세요.');
 const w=xmax-xmin+1,h=ymax-ymin+1,crop=cv(480,480);crop.getContext('2d').drawImage(im,xmin/192*im.width,ymin/192*im.height,w/192*im.width,h/192*im.height,0,0,480,480);
 function span(t){const y=Math.round(ymin+t*(h-1));let sum=0,n=0;for(let j=Math.max(ymin,y-2);j<=Math.min(ymax,y+2);j++){const r=rows[j];if(r){sum+=(r.at(-1)-r[0]+1)/w;n++}}return Math.max(.05,sum/(n||1))}
 function extent(t){const r=cols[Math.round(xmin+t*(w-1))];return r?[(r[0]-ymin)/h,(r.at(-1)-ymin+1)/h]:[.5,.5]}
 return{crop,span,extent,aspect:w*im.width/(h*im.height)}
}
$('fourBuild').onclick=()=>{try{if(!pristine&&scene.objects.length>=8)throw Error('먼저 오브제 하나를 삭제해 주세요.');const v=views.map(profile),atlas=cv(960,960),g=atlas.getContext('2d');v.forEach((f,i)=>g.drawImage(f.crop,i%2*480,(i>>1)*480));
 const top=v[2].crop.getContext('2d').getImageData(0,0,480,480).data;let contrast=0,n=0;for(let y=60;y<420;y+=5)for(let x=60;x<420;x+=5){const i=4*(480*y+x);contrast+=Math.abs(top[i]-top[i+20]);n++}
 const relief=Math.min(.08,.008+contrast/n*.0015),height=2/v[0].aspect,depth=Math.min(4,1/v[2].aspect+v[1].aspect/v[0].aspect),positions=[],uv=[],indices=[];
 function pt(x,y,z,u,t,face){const i=positions.length/3;positions.push(x,y,z);uv.push((face%2+.002+.996*u)/2,((face>>1)+.002+.996*t)/2);return i}
 const ring=(j,i)=>{const t=j/32,a=2*Math.PI*i/128,xx=Math.sin(a),f=v[2].extent((xx+1)/2),b=v[3].extent((xx+1)/2),z=Math.cos(a)>=0?((f[1]+b[1])/2-.5):((f[0]+b[0])/2-.5);return [xx*v[0].span(t),(.5-t)*height,z*depth*v[1].span(t)]};
 for(let i=0;i<128;i++){const front=Math.abs(Math.cos((i+.5)*Math.PI/64))>.707,face=front?0:1;for(let j=0;j<32;j++){const ids=[[j,i],[j,i+1],[j+1,i+1],[j+1,i]].map(([k,l])=>{const [x,y,z]=ring(k,l);return pt(x,y,z,front?(x+1)/2:.5-z/depth,k/32,face)});indices.push(ids[0],ids[3],ids[1],ids[1],ids[3],ids[2])}}
 for(const bottom of [false,true]){const start=positions.length/3;for(let r=0;r<=16;r++)for(let i=0;i<=128;i++){let [x,y,z]=ring(bottom?32:0,i);x*=r/16;z*=r/16;const t=.5+z/depth;pt(x,y+(bottom?-1:1)*relief*(1-(r/16)**2),z,(x+1)/2,bottom?1-t:t,bottom?3:2);if(r&&i){const a=start+r*129+i,ids=[a-130,a-1,a,a-130,a,a-129];indices.push(...(bottom?ids.reverse():ids))}}}
 // Orient every triangle away from the object centre, including both caps.
 for(let j=0;j<indices.length;j+=3){const [a,b,c]=indices.slice(j,j+3).map(i=>i*3),p=positions,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];if((uy*vz-uz*vy)*p[a]+(uz*vx-ux*vz)*p[a+1]+(ux*vy-uy*vx)*p[a+2]<0)[indices[j+1],indices[j+2]]=[indices[j+2],indices[j+1]]}
 if(pristine){scene.objects=[];pristine=false}scene.objects.push({name:'4컷 제품 '+(scene.objects.length+1),mesh:{positions,uv,indices},photo:atlas.toDataURL('image/png'),inner:relief*.24,mat:0,angle:0,thickness:1,size:.83,x:0,y:0,z:0});selected=scene.objects.length-1;scene.pitch=.58;scene.yaw=.25;refresh();$('fourStatus').textContent='4면 외형 생성 완료 · 하이라이트를 참고해 윗면 곡률을 추정했어요. 재질에서 글라스를 적용할 수 있어요.'}catch(e){$('fourStatus').textContent=e.message}};

const activeObj=()=>scene.objects[selected];
runMeshScene($('scanCanvas'),scene);
function refresh(){
 const o=activeObj();$('scanObject').replaceChildren(...scene.objects.map((v,i)=>new Option(v.name,i)));$('scanObject').value=selected;$('scanMat').selectedIndex=o?.mat||0;$('scanName').textContent=o?.name||'빈 장면';$('scanDelete').disabled=!o;$('scanGlb').disabled=!o;$('scanRanges').replaceChildren();
 if(!o)return;for(const [key,label,min,max,step] of [...(o.inner===undefined?[]:[['inner','내부 깊이 연출',0,.04,.001]]),['thickness','추정 두께',.025,1.6,.01],['angle','개별 회전',-180,180,1],['size','크기',.1,1.8,.01],['x','가로 위치',-2.7,2.7,.01],['y','높이',-1.9,1.9,.01],['z','앞뒤 위치',-1.8,1.8,.01]]){
 const row=document.createElement('div'),l=document.createElement('label'),r=document.createElement('input'),out=document.createElement('output');row.className='range';r.type='range';Object.assign(r,{min,max,step,value:o[key]});r.id='scan-'+key;l.htmlFor=r.id;l.textContent=label;out.textContent=(o[key]||0).toFixed(2);r.oninput=()=>{o[key]=+r.value;out.textContent=(o[key]||0).toFixed(2)};l.append(out);row.append(l,r);$('scanRanges').append(row)}
}
function guide(){
 if(!source||!$('scanCrop').clientWidth)return;const c=$('scanCrop'),W=c.width=c.clientWidth*2,H=c.height=300,ctx=c.getContext('2d'),scale=Math.min(W/source.width,H/source.height),w=source.width*scale,h=source.height*scale;display={x:(W-w)/2,y:(H-h)/2,w,h};ctx.drawImage(source,display.x,display.y,w,h);
 if(region){const [a,b,d,e]=region;ctx.lineWidth=3;ctx.strokeStyle='#befe78';ctx.strokeRect(display.x+a*w,display.y+b*h,(d-a)*w,(e-b)*h)}
}
function point(e){const c=$('scanCrop'),r=c.getBoundingClientRect();return [Math.min(1,Math.max(0,((e.clientX-r.left)*c.width/r.width-display.x)/display.w)),Math.min(1,Math.max(0,((e.clientY-r.top)*c.height/r.height-display.y)/display.h))]}
$('scanCrop').onpointerdown=e=>{if(!display)return;drag=point(e);$('scanCrop').setPointerCapture(e.pointerId)};
$('scanCrop').onpointermove=e=>{if(!drag)return;const [x,y]=point(e);region=[Math.min(x,drag[0]),Math.min(y,drag[1]),Math.max(x,drag[0]),Math.max(y,drag[1])];guide()};
$('scanCrop').onpointerup=e=>{if(!drag)return;$('scanCrop').onpointermove(e);drag=null;if(region[2]-region[0]<.02||region[3]-region[1]<.02)region=null;guide()};
function add(example=false){if(!source)return;try{
 const [x,y,x1,y1]=region||[0,0,1,1],w=(x1-x)*source.width,h=(y1-y)*source.height,f=Math.min(1,900/Math.max(w,h)),c=cv(Math.max(2,Math.round(w*f)),Math.max(2,Math.round(h*f)));c.getContext('2d').drawImage(source,x*source.width,y*source.height,w,h,0,0,c.width,c.height);const mesh=photoMesh(c);
 const swap=region&&replaceOnCrop&&scene.objects.includes(replaceOnCrop);if(!example&&pristine){scene.objects=[];pristine=false}if(!swap&&scene.objects.length>=8)throw Error('한 공간에는 8개까지 배치할 수 있어요.');
 const i=swap?scene.objects.indexOf(replaceOnCrop):scene.objects.length;const o={name:title+(region?' · '+(i+1):''),mesh,photo:c.toDataURL('image/png'),mat:0,angle:0,thickness:.34,size:i?.68:1,x:i?((i%2?1:-1)*(1+.28*Math.floor(i/2))):0,y:i?((i%3)-1)*.45:0,z:0};
 if(swap)scene.objects[i]=o;else scene.objects.push(o);selected=i;replaceOnCrop=region?null:o;scene.yaw=scene.pitch=0;scene.camera=4.8;refresh();$('scanStatus').textContent='입체 메시 생성 완료 · 드래그해 옆면과 뒷면을 확인하세요.'
 }catch(err){$('scanStatus').textContent=err.message}}
function detectBoard(img){
 const w=180,h=Math.max(50,Math.min(280,Math.round(180*img.height/img.width))),c=cv(w,h),ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);
 const d=ctx.getImageData(0,0,w,h).data,bg=[0,1,2].map(k=>{const samples=[];for(let i=0;i<w*h;i+=3)samples.push(d[i*4+k]);return samples.sort((a,b)=>a-b)[samples.length>>1]});
 const mask=new Uint8Array(w*h);for(let y=3;y<h-3;y++)for(let x=4;x<w-4;x++){const i=y*w+x;mask[i]=d[i*4+3]>180&&Math.hypot(...bg.map((b,k)=>d[i*4+k]-b))>83?1:0}
 const groups=[];for(let i=0;i<mask.length;i++){if(!mask[i])continue;mask[i]=0;const queue=[i];let xmin=w,xmax=0,ymin=h,ymax=0;for(let j=0;j<queue.length;j++){const k=queue[j],x=k%w,y=(k/w)|0;xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);for(const n of [k-1,k+1,k-w,k+w,k-w-1,k+w+1,k+w-1,k-w+1])if(mask[n]){mask[n]=0;queue.push(n)}}
 const bw=xmax-xmin+1,bh=ymax-ymin+1;if(queue.length>w*h*.0025&&bw>w*.066&&bh>h*.044&&bw<w*.48&&bh<h*.44&&bw/bh<4&&bh/bw<4)groups.push({xmin,xmax,ymin,ymax,area:queue.length})}
 const picks=groups.sort((a,b)=>b.area-a.area).filter((a,i,all)=>!all.slice(0,i).some(b=>Math.abs(a.xmin+a.xmax-b.xmin-b.xmax)<w*.12&&Math.abs(a.ymin+a.ymax-b.ymin-b.ymax)<h*.14));
 if(picks.length<5)return [];
 const rows=new Set(picks.map(g=>Math.floor((g.ymin+g.ymax)/2/h*4))),cols=new Set(picks.map(g=>Math.floor((g.xmin+g.xmax)/2/w*4)));if(rows.size<2||cols.size<2)return [];
 return picks.slice(0,8).sort((a,b)=>Math.abs(a.ymin-b.ymin)<h*.12?a.xmin-b.xmin:a.ymin-b.ymin).map(g=>[Math.max(0,(g.xmin-2)/w),Math.max(0,(g.ymin-2)/h),Math.min(1,(g.xmax+3)/w),Math.min(1,(g.ymax+3)/h)])
}

async function load(src,name,example=false){const id=++uploadSeq;try{const img=new Image();img.src=src;await img.decode();if(id!==uploadSeq)return;source=img;title=name;region=drag=replaceOnCrop=null;guide();
 const picks=example?[]:detectBoard(img);
 if(picks.length){
 const room=pristine?8:8-scene.objects.length,items=picks.slice(0,room),first=pristine?0:scene.objects.length;
 for(const box of items){region=box;add(false)}
 const made=scene.objects.length-first;for(let j=0;j<made;j++){const o=scene.objects[first+j];o.size=.45;o.x=((j%4)-1.5)*.92;o.y=.58-Math.floor(j/4)*1.12}
 region=items[0]||null;selected=first<scene.objects.length?first:0;scene.camera=5;refresh();guide();$('scanStatus').textContent=made?made+'개 윤곽을 개별 메시로 추가했어요. 선택 메뉴에서 각각 편집하세요.':'공간이 가득 찼어요. 오브제를 삭제한 뒤 다시 추가하세요.'
 }else add(example)}catch{$('scanStatus').textContent='사진을 읽지 못했어요. PNG 또는 JPG를 선택해 주세요.'}}
$('scanFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;const u=URL.createObjectURL(f);try{await load(u,f.name.replace(/\.[^.]+$/,''))}finally{URL.revokeObjectURL(u);e.target.value=''}};
$('scanAdd').onclick=()=>add();$('scanDelete').onclick=()=>{scene.objects.splice(selected,1);selected=Math.max(0,selected-1);pristine=false;refresh()};$('scanMat').onchange=e=>{if(activeObj())activeObj().mat=e.target.selectedIndex};$('scanObject').onchange=e=>{selected=+e.target.value;refresh()};$('scanReset').onclick=()=>Object.assign(scene,{yaw:0,pitch:0,camera:4.8});$('scanFull').onclick=()=>document.fullscreenElement?document.exitFullscreen():$('scanView').requestFullscreen();for(const [id,key] of [['scanFloat','float'],['scanMouse','mouse'],['scanWave','wave']])$(id).onchange=e=>scene[key]=e.target.checked;
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000)}
async function glb(){
 const doc={asset:{version:'2.0',generator:'Matter Lab silhouette mesh'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],textures:[],images:[],buffers:[{}],bufferViews:[],accessors:[]},chunks=[];let bytes=0;
 function view(arr){const len=arr.byteLength,i=doc.bufferViews.push({buffer:0,byteOffset:bytes,byteLength:len})-1;chunks.push(new Uint8Array(arr.buffer,arr.byteOffset,len));bytes+=len;const pad=(4-bytes%4)%4;if(pad){chunks.push(new Uint8Array(pad));bytes+=pad}return i}
 function acc(arr,type,n,idx=false){const a={bufferView:view(arr),componentType:idx?5123:5126,count:arr.length/n,type};if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];arr.forEach((v,i)=>{const k=i%3;a.min[k]=Math.min(a.min[k],v);a.max[k]=Math.max(a.max[k],v)})}return doc.accessors.push(a)-1}
 for(const [i,o] of scene.objects.entries()){const raw=atob(o.photo.split(',')[1]),data=Uint8Array.from(raw,c=>c.charCodeAt(0));doc.images.push({mimeType:'image/png',bufferView:view(data)});doc.textures.push({source:i});const mat={doubleSided:true,pbrMetallicRoughness:{baseColorTexture:{index:i},metallicFactor:o.mat===5?.96:.04,roughnessFactor:o.mat===3?.9:.27}};
 if(o.mat===1||o.mat===2){doc.extensionsUsed=[...new Set([...(doc.extensionsUsed||[]),'KHR_materials_transmission'])];mat.extensions={KHR_materials_transmission:{transmissionFactor:o.mat===1?.82:.35}}}
 if(o.mat===4){doc.extensionsUsed=[...new Set([...(doc.extensionsUsed||[]),'KHR_materials_iridescence'])];mat.extensions={KHR_materials_iridescence:{iridescenceFactor:1}}}doc.materials.push(mat);
 const mesh=o.mesh,positions=new Float32Array(mesh.positions.map((v,i)=>i%3===2?v*o.thickness:v)),normals=new Float32Array(positions.length);
 for(let j=0;j<mesh.indices.length;j+=3){const [a,b,c]=mesh.indices.slice(j,j+3).map(i=>3*i);const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];for(const k of [a,b,c]){normals[k]+=uy*vz-uz*vy;normals[k+1]+=uz*vx-ux*vz;normals[k+2]+=ux*vy-uy*vx}}
 for(let j=0;j<normals.length;j+=3){const len=Math.hypot(normals[j],normals[j+1],normals[j+2])||1;for(let k=0;k<3;k++)normals[j+k]/=len}
 doc.meshes.push({primitives:[{attributes:{POSITION:acc(positions,'VEC3',3),NORMAL:acc(normals,'VEC3',3),TEXCOORD_0:acc(new Float32Array(mesh.uv),'VEC2',2)},indices:acc(new Uint16Array(mesh.indices),'SCALAR',1,true),material:i}]});doc.nodes.push({name:o.name,mesh:i,translation:[o.x,o.y,o.z],rotation:[0,Math.sin(o.angle*Math.PI/360),0,Math.cos(o.angle*Math.PI/360)],scale:[o.size,o.size,o.size]});doc.scenes[0].nodes.push(i)}
 doc.buffers[0].byteLength=bytes;const json=new TextEncoder().encode(JSON.stringify(doc)),jl=(json.length+3)&~3,out=new Uint8Array(28+jl+bytes),dv=new DataView(out.buffer);for(const [k,v] of [[0,0x46546c67],[4,2],[8,out.length],[12,jl],[16,0x4e4f534a],[20+jl,bytes],[24+jl,0x004e4942]])dv.setUint32(k,v,true);out.fill(32,20,20+jl);out.set(json,20);let off=28+jl;for(const c of chunks){out.set(c,off);off+=c.length}return new Blob([out],{type:'model/gltf-binary'})
}
$('scanGlb').onclick=async()=>download(await glb(),'Object-Space.glb');
const previousExport=$('export').onclick;$('export').onclick=()=>{if(!active)return previousExport();const data=JSON.stringify(scene).replace(/</g,'\\u003c');const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Object Space</title><style>*{margin:0}canvas{display:block;width:100vw;height:100dvh}</style><canvas aria-label="360° object space"></canvas><script>'+webGLMesh.toString()+'\n'+runMeshScene.toString()+'\nrunMeshScene(document.querySelector("canvas"),'+data+');<\/script>';download(new Blob([html],{type:'text/html'}),'Object-Space.html')};
for(const key of ['builderTab','aiTab','productTab','freeTab']){const el=$(key),prior=el.onclick;el.onclick=()=>{active=false;$('scanStudio').hidden=true;$('scanTab').classList.remove('on');prior()}}
$('scanTab').onclick=()=>{$('freeTab').onclick();active=true;$('freeStudio').hidden=true;$('freeTab').classList.remove('on');$('scanStudio').hidden=false;$('scanTab').classList.add('on');$('export').title='인터랙티브 3D 장면 HTML 다운로드';guide()};
$('scanTab').onclick();load('abib-reference.webp','Abib',true)
})()
