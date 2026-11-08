const $=id=>document.getElementById(id);
const presets=[
 ['Iridescent','#f7f4ff',.10,.99,'radial-gradient(at 27% 20%,white,transparent 29%),conic-gradient(from 35deg,#b9dded,#d7bef8,#626b81,#b3f8d6,#b09eda,#f7dbde,#b9dded)'],
 ['Chrome','#eeeeef',.05,1,'linear-gradient(155deg,#555861 3%,#fdffff 26%,#c9cdd1 42%,#212329 49%,#5e6369 62%,#e9eef0 84%,#42464a)'],
 ['Glass','#e6fff9',.08,.99,'radial-gradient(ellipse at 30% 18%,white 1%,transparent 13%),radial-gradient(at 58% 57%,#9aa7a15c 16%,#dae7dfaa 51%,#424e49 67%,#f0fff5 72%,#707d75 85%)'],
 ['Pearl','#f6dce7',.25,.88,'radial-gradient(at 30% 26%,white,#e5c9d9 38%,#ab91a8 62%,#ead9cd 86%)'],
 ['Clay','#d59170',.83,.91,'radial-gradient(at 30% 24%,#f0c3a1,#ce9071 50%,#915940 85%)'],
 ['Jelly','#b7ec68',.16,.96,'radial-gradient(ellipse at 30% 16%,white,transparent 21%),radial-gradient(at 50% 32%,#d9fb96,#a5db55 51%,#4e762c 84%)']];
function object(name,shape,mode,x,y,z,size){const p=presets[mode];return{name,shape,mode,x,y,z,size,color:p[1],rough:p[2],shine:p[3]}}
const state={objects:[object('Bloom',0,0,-.13,.32,0,1.13),object('Orb',1,1,-1.85,.85,-.62,.22),object('Pearl',1,3,1.60,-.36,-.18,.32)],rot:[.12,-.16],time:0,play:true,grid:true,light:1,bg:'#d4d6d2',zoom:6.55,tilt:true,scroll:true};
let current=0;const obj=()=>state.objects[current];function setPreset(i){const p=presets[i];Object.assign(obj(),{mode:i,color:p[1],rough:p[2],shine:p[3]});refresh()}
presets.forEach((p,i)=>{const b=document.createElement('button');b.innerHTML='<div class="sample"><em>0'+(i+1)+'</em><span class="ball"></span></div><b>'+p[0]+'</b>';b.style.setProperty('--ball',p[4]);b.onclick=()=>setPreset(i);$('swatches').append(b)});
function ranges(id,items,target){const root=$(id);root.replaceChildren();items.forEach(([label,key,min,max,step])=>{const wrap=document.createElement('div');wrap.className='range';const l=document.createElement('label'),input=document.createElement('input'),out=document.createElement('output');input.type='range';input.min=min;input.max=max;input.step=step;input.value=target[key];input.id='slider-'+key;l.htmlFor=input.id;l.textContent=label;out.textContent=Number(target[key]).toFixed(2);input.oninput=()=>{target[key]=+input.value;out.textContent=(+input.value).toFixed(2)};l.append(out);wrap.append(l,input);root.append(wrap)})}
function refresh(){const o=obj();$('selected').replaceChildren(...state.objects.map((v,i)=>new Option(v.name+' · '+String(i+1).padStart(2,'0'),i)));$('selected').value=current;$('shape').querySelector('[value="5"]').disabled=!o.profile;$('shape').value=o.shape;$('color').value=o.color;$('bg').value=state.bg;$('sceneName').textContent=presets[o.mode][0]+' study';[...$('swatches').children].forEach((b,i)=>b.classList.toggle('active',i===o.mode));ranges('props',[['거칠기','rough',0,1,.01],['반사 강도','shine',0,1,.01]],o);ranges('positions',[['가로 위치','x',-3,3,.01],['높이','y',-1,2,.01],['깊이','z',-2,2,.01],['크기','size',.12,1.6,.01]],o);ranges('sceneprops',[['조명 밝기','light',.45,1.6,.01],['카메라 거리','zoom',4,11,.05]],state);$('remove').disabled=state.objects.length===1;$('add').disabled=state.objects.length>=8}
$('shape').onchange=e=>obj().shape=+e.target.value;$('selected').onchange=e=>{current=+e.target.value;refresh()};$('color').oninput=e=>obj().color=e.target.value;$('bg').oninput=e=>state.bg=e.target.value;$('add').onclick=()=>{if(state.objects.length>=8)return;state.objects.push(object('Object',1,5,.9,.7,.4,.45));current=state.objects.length-1;refresh()};$('remove').onclick=()=>{if(state.objects.length>1){state.objects.splice(current,1);current=0;refresh()}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(t=>t.classList.toggle('active',b===t));$('space').hidden=b.dataset.tab!=='space';$('object').hidden=!$('space').hidden;refresh()});for(const id of ['tilt','scroll'])$(id).onchange=e=>state[id]=e.target.checked;
$('play').onclick=()=>{state.play=!state.play;$('play').textContent=state.play?'Ⅱ':'▷';$('play').title=state.play?'애니메이션 일시정지':'애니메이션 재생'};$('grid').onclick=()=>state.grid=!state.grid;$('reset').onclick=()=>{state.rot=[.12,-.16];state.zoom=6.55;refresh()};$('expand').onclick=()=>document.fullscreenElement?document.exitFullscreen():$('viewport').requestFullscreen();
let uploadVersion=0;
async function ingest(file){
 if(!file)return;
 const version=++uploadVersion;
 $('filelabel').textContent='사진 읽는 중…';
 $('drop').querySelector('small').textContent='사진에서 오브제 윤곽을 찾고 있어요';
 try{let bmp;
try{bmp=await createImageBitmap(file)}catch{
 const url=URL.createObjectURL(file);
 try{bmp=new Image();bmp.src=url;await bmp.decode()}finally{URL.revokeObjectURL(url)}
}
if(version!==uploadVersion){bmp.close?.();return}const c=document.createElement('canvas');c.width=c.height=64;const aspect=bmp.width/bmp.height;const ctx=c.getContext('2d');ctx.drawImage(bmp,0,0,64,64);bmp.close?.();const d=ctx.getImageData(0,0,64,64).data,edge=[0,1,2].map(j=>(d[j]+d[252+j]+d[16128+j]+d[16380+j])/4);const rows=Array.from({length:64},()=>[64,-1]);let pix=[],box=[64,64,0,0];for(let y=1;y<63;y++)for(let x=1;x<63;x++){const k=4*(y*64+x);if(d[k+3]<80)continue;const rgb=[d[k],d[k+1],d[k+2]];if(Math.hypot(...rgb.map((v,j)=>v-edge[j]))<32&&d[3]>80)continue;rows[y][0]=Math.min(rows[y][0],x);rows[y][1]=Math.max(rows[y][1],x);pix.push(rgb);box=[Math.min(x,box[0]),Math.min(y,box[1]),Math.max(x,box[2]),Math.max(y,box[3])]}if(!pix.length)pix=[edge];const avg=[0,1,2].map(j=>pix.reduce((v,c)=>v+c[j],0)/pix.length),sat=Math.max(...avg)-Math.min(...avg),lum=avg.reduce((a,b)=>a+b)/3,spread=Math.sqrt(pix.reduce((v,c)=>v+(c.reduce((a,b)=>a+b)/3-lum)**2,0)/pix.length);const mode=sat<25?(spread>47?1:lum>190?2:3):spread>62?0:spread>36?5:4;const photoName=file.name.replace(/\.[^.]+$/,'')||'Photo';
if(state.objects.length<8){
 state.objects.push(object(photoName,1,mode,0,.38,1.2,.9));current=state.objects.length-1;
}else{Object.assign(obj(),{name:photoName,x:0,y:.38,z:1.2,size:.9})}
setPreset(mode);const w=box[2]-box[0]+1,h=box[3]-box[1]+1,fill=pix.length/Math.max(1,w*h);obj().shape=w/h>1.55?4:fill>.87?3:fill<.58?2:1;if(w>3&&h>5&&pix.length>35){obj().profile=Array.from({length:16},(_,i)=>{const y=Math.round(box[3]-i*(h-1)/15),near=rows.slice(Math.max(box[1],y-1),Math.min(box[3]+1,y+2)).filter(v=>v[1]>=v[0]);return near.length?Math.min(1.6,aspect*near.reduce((sum,v)=>sum+v[1]-v[0]+1,0)/(near.length*h)):0.03});obj().shape=5}obj().color='#'+avg.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');$('filelabel').textContent=file.name;$('drop').querySelector('small').textContent='윤곽과 재질 적용 완료 · 직접 수정 가능';$('uploadIcon').textContent='✓';
state.zoom=6.55;state.rot=[.12,-.10];
const firstUpload=!state.photoScene;
state.photoScene=true;
if(firstUpload){
 if(state.objects[0].name==='Bloom'&&state.objects[0].x===-.13&&state.objects[0].size===1.13){state.objects[0].x=-1.65;state.objects[0].size=.43}
 const canvas=$('view'),replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);
 softwareView(replacement,state);
}
refresh();
$('sceneName').textContent=photoName;
$('viewport').scrollIntoView({block:'nearest',behavior:'smooth'})}catch{if(version!==uploadVersion)return;$('drop').querySelector('small').textContent='다시 클릭해서 파일 선택';$('filelabel').textContent='이미지를 읽을 수 없어요. JPG 또는 PNG로 다시 올려 주세요'}}
$('file').onchange=e=>{const file=e.target.files[0];e.target.value='';ingest(file)};$('drop').ondragover=e=>e.preventDefault();$('drop').ondrop=e=>{e.preventDefault();ingest(e.dataTransfer.files[0])};
function htmlCode(){return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Matter Lab scene</title><style>*{margin:0}canvas{width:100vw;height:100dvh;display:block;touch-action:none}</style><canvas id="scene"></canvas><script>const vertex='+JSON.stringify(vertex)+',fragment='+JSON.stringify(fragment)+';\n'+softwareView.toString()+'\n'+startView.toString()+'\nstartView(document.querySelector("canvas"),'+JSON.stringify(state,null,2)+');<\/script>'}
function jsxCode(){return `// npm install three @react-three/fiber react react-dom
import React, {useMemo,useRef,useEffect} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
const sceneData=${JSON.stringify(state,null,2)};
const fragmentShader=${JSON.stringify(fragment)};
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
function Surface(){
 const s=useMemo(()=>structuredClone(sceneData),[]);
 const {gl}=useThree();
 const hover=useRef([0,0]);
 useEffect(()=>{const el=gl.domElement;let drag=null;
 const down=e=>{drag=[e.clientX,e.clientY];el.setPointerCapture(e.pointerId)};
 const move=e=>{if(drag){s.rot[0]+=(e.clientX-drag[0])*.01;s.rot[1]+=(e.clientY-drag[1])*.01;drag=[e.clientX,e.clientY]}else{const b=el.getBoundingClientRect();hover.current=[((e.clientX-b.left)/b.width-.5)*.18,((e.clientY-b.top)/b.height-.5)*.18]}};
 const up=()=>{drag=null};const leave=()=>{hover.current=[0,0]};
 const wheel=e=>{if(s.scroll){e.preventDefault();s.zoom=THREE.MathUtils.clamp(s.zoom+e.deltaY*.006,4,11)}};
 const events={pointerdown:down,pointermove:move,pointerup:up,pointercancel:up,pointerleave:leave,wheel};
 for(const [k,v] of Object.entries(events))el.addEventListener(k,v,{passive:false});return()=>{for(const [k,v] of Object.entries(events))el.removeEventListener(k,v)}},[gl,s]);
 const uniforms=useMemo(()=>{const o=s.objects;
 const vectors=f=>Array.from({length:8},(_,i)=>new THREE.Vector4(...(o[i]?f(o[i]):[0,0,0,0])));
 return {profile:{value:Array.from({length:32},(_,i)=>new THREE.Vector4(...(o[Math.floor(i/4)]?.profile||Array(16).fill(.75)).slice((i%4)*4,(i%4)*4+4)))},res:{value:new THREE.Vector2()},rot:{value:new THREE.Vector2()},time:{value:s.time},zoom:{value:s.zoom},grid:{value:+s.grid},lightPower:{value:s.light},back:{value:new THREE.Vector3(...rgb(s.bg))},count:{value:o.length},pos:{value:vectors(v=>[v.x,v.y,v.z,v.size])},mat:{value:vectors(v=>[v.shape,v.mode,v.rough,v.shine])},tint:{value:vectors(v=>[...rgb(v.color),1])}}},[s]);
 useFrame((_,dt)=>{gl.getDrawingBufferSize(uniforms.res.value);if(s.play)uniforms.time.value+=Math.min(dt,.06);uniforms.zoom.value=s.zoom;uniforms.rot.value.set(...s.rot.map((v,i)=>v+(s.tilt?hover.current[i]:0)))});
 return <mesh frustumCulled={false}><planeGeometry args={[2,2]}/><shaderMaterial uniforms={uniforms} fragmentShader={fragmentShader} vertexShader={'void main(){gl_Position=vec4(position.xy,0.,1.);}'}/></mesh>;
}
export default function MatterScene(){return <div style={{width:'100%',height:'100dvh',touchAction:'none'}}><Canvas><Surface/></Canvas></div>}`};
function showCode(){$('code').textContent=$('format').value==='html'?htmlCode():jsxCode();$('copy').textContent='코드 복사'}$('export').onclick=()=>{showCode();$('dialog').showModal()};$('format').onchange=showCode;$('close').onclick=()=>$('dialog').close();$('download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([$('code').textContent],{type:'text/plain'}));a.download='MatterScene.'+$('format').value;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('code').textContent);$('copy').textContent='복사 완료 ✓'}catch{const range=document.createRange();range.selectNodeContents($('code'));getSelection().removeAllRanges();getSelection().addRange(range);$('copy').textContent='선택됨 · ⌘/Ctrl+C'}};
refresh();try{startView($('view'),state)}catch(e){$('sceneName').textContent=e.message;console.error(e)}
