const openPreviousExport=$('export').onclick,previousFormat=$('format').onchange,previousDownload=$('download').onclick;
let aiMode=true,aiDialog=false,modelData='',fileRevision=0;
function changeStudio(mode){
 aiMode=mode==='ai';switchMode(mode==='product');$('freeStudio').hidden=mode!=='free';$('freeTab').classList.toggle('on',mode==='free');
 $('aiStudio').hidden=!aiMode;$('aiTab').classList.toggle('on',aiMode);$('export').disabled=aiMode&&!modelData;
 $('export').title=aiMode&&!modelData?'생성한 GLB를 아래에서 선택하세요':'현재 모델 코드 내보내기';
}
$('aiTab').onclick=()=>changeStudio('ai');$('productTab').onclick=()=>changeStudio('product');$('freeTab').onclick=()=>changeStudio('free');
function readDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}
$('importGLB').onchange=async e=>{const file=e.target.files[0];if(!file)return;const revision=++fileRevision;modelData='';changeStudio('ai');$('importStatus').textContent='GLB 확인 중…';try{
 const header=new DataView(await file.slice(0,12).arrayBuffer());if(header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==file.size)throw Error();
 const data=await readDataURL(file);if(fileRevision!==revision)return;modelData=data.replace(/^data:[^,]*,/, 'data:model/gltf-binary;base64,');$('importStatus').textContent=file.name+' 준비됨 · 상단에서 코드 내보내기를 누르세요.';$('export').disabled=false;
 }catch{if(fileRevision===revision)$('importStatus').textContent='유효한 GLB 2.0 파일을 선택해 주세요.'}};
let exportedSource='';
function prepareAI(){const html=$('format').value==='html';exportedSource=html?'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}model-viewer{width:100vw;height:100dvh}</style><script type="module" src="https://cdn.jsdelivr.net/npm/@google/model-viewer@4/dist/model-viewer.min.js"><\/script><model-viewer src="'+modelData+'" camera-controls auto-rotate shadow-intensity="1"></model-viewer>':"// npm install three @react-three/fiber @react-three/drei\nimport React,{Suspense} from 'react';\nimport {Canvas} from '@react-three/fiber';\nimport {Bounds,OrbitControls,useGLTF} from '@react-three/drei';\nconst model="+JSON.stringify(modelData)+";\nfunction Asset(){const {scene}=useGLTF(model);return <primitive object={scene}/>;}\nexport default function Scene(){return <div style={{height:'100dvh'}}><Canvas><ambientLight intensity={1.6}/><directionalLight position={[3,5,4]} intensity={2}/><Suspense fallback={null}><Bounds fit clip observe><Asset/></Bounds></Suspense><OrbitControls makeDefault/></Canvas></div>;}";
 $('code').textContent=exportedSource.replace(modelData,'[내보낼 때 포함되는 GLB 데이터]');$('copy').disabled=$('download').disabled=false;$('copy').textContent='코드 복사';
}
const priorCopy=$('copy').onclick;
$('copy').onclick=async()=>{if(!aiDialog)return priorCopy();try{await navigator.clipboard.writeText(exportedSource);$('copy').textContent='복사 완료 ✓'}catch{$('copy').textContent='파일 다운로드를 사용하세요'}};
$('export').onclick=()=>{aiDialog=aiMode;if(!aiMode)return openPreviousExport();if(!modelData)return;prepareAI();$('dialog').showModal()};
$('format').onchange=()=>aiDialog?prepareAI():previousFormat();
$('download').onclick=()=>aiDialog?saveProduct(new Blob([exportedSource],{type:'text/plain'}),'GeneratedModel.'+$('format').value):previousDownload();
changeStudio('ai');
