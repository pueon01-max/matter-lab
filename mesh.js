/* Build a closed, rounded object from one photo.
   1. Find the product: flood-fill the background in from the border (so white highlights inside stay solid).
   2. Smooth the outline so the sides don't come out as pixel steps.
   3. Give it a "pebble" profile: flat-ish faces with a rounded rim, instead of a balloon dome.
   4. Paint the texture so the rim never samples the background (edge colours bleed outwards),
      and give the back a soft, blurred version of the photo instead of a mirrored copy. */
function photoMesh(source){
 const size=150,scale=size/Math.max(source.width,source.height),w=Math.max(3,Math.round(source.width*scale)),h=Math.max(3,Math.round(source.height*scale));
 const c=document.createElement('canvas');c.width=w;c.height=h;const cx=c.getContext('2d');cx.drawImage(source,0,0,w,h);const rgba=cx.getImageData(0,0,w,h).data;
 const rim=[];for(let i=0;i<w;i++)rim.push(i,(h-1)*w+i);for(let j=1;j<h-1;j++)rim.push(j*w,j*w+w-1);
 const alpha=rim.filter(i=>rgba[i*4+3]<64).length>rim.length*.3;
 const bg=[0,1,2].map(k=>{const vals=rim.map(i=>rgba[i*4+k]).sort((a,b)=>a-b);return vals[vals.length>>1]});
 const spread=Math.max(...[0,1,2].map(k=>{const vals=rim.map(i=>rgba[i*4+k]).sort((a,b)=>a-b);return vals[(vals.length*.85)|0]-vals[(vals.length*.15)|0]}));
 const tol=Math.min(70,Math.max(26,spread*1.4+18));
 const isBg=i=>alpha?rgba[i*4+3]<64:Math.hypot(rgba[i*4]-bg[0],rgba[i*4+1]-bg[1],rgba[i*4+2]-bg[2])<tol;
 // flood the background from the border; anything not reached is the object (holes inside get filled)
 const outside=new Uint8Array(w*h),queue=[];for(const i of rim)if(isBg(i)&&!outside[i]){outside[i]=1;queue.push(i)}
 for(let q=0;q<queue.length;q++){const k=queue[q],x=k%w,y=(k/w)|0;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const n=yy*w+xx;if(!outside[n]&&isBg(n)){outside[n]=1;queue.push(n)}}}
 let soft=new Float32Array(w*h);for(let i=0;i<soft.length;i++)soft[i]=outside[i]?0:1;
 // two blur passes then threshold = a smoother outline with specks removed
 for(let pass=0;pass<2;pass++){const next=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h){n++;continue}s+=soft[yy*w+xx];n++}next[y*w+x]=s/n}soft=next}
 const mask=new Uint8Array(w*h);for(let i=0;i<mask.length;i++)mask[i]=soft[i]>.5?1:0;
 // keep the main piece (captions, dust and reflections are usually small separate islands)
 const checked=new Uint8Array(mask.length),parts=[];
 for(let start=0;start<mask.length;start++){if(!mask[start]||checked[start])continue;const cells=[start];checked[start]=1;for(let j=0;j<cells.length;j++){const k=cells[j],x=k%w,y=(k/w)|0;for(const d of [[-1,0],[1,0],[0,-1],[0,1]]){const xx=x+d[0],yy=y+d[1],n=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[n]&&!checked[n]){checked[n]=1;cells.push(n)}}}parts.push(cells)}
 const biggest=parts.reduce((m,p)=>Math.max(m,p.length),0);for(const p of parts)if(p.length<biggest*.12)for(const i of p)mask[i]=0;
 const count=mask.reduce((a,b)=>a+b,0);if(count<12)throw Error('윤곽을 찾지 못했어요. 제품 영역을 더 가깝게 선택해 주세요.');
 let x0=w,y0=h,x1=0,y1=0;for(let i=0;i<mask.length;i++){if(mask[i]){x0=Math.min(x0,i%w);x1=Math.max(x1,i%w);y0=Math.min(y0,(i/w)|0);y1=Math.max(y1,(i/w)|0)}}
 const width=w+1,height=h+1,dist=new Float32Array(width*height),inside=(x,y)=>x>=0&&x<w&&y>=0&&y<h&&mask[y*w+x];
 for(let y=0;y<=h;y++)for(let x=0;x<=w;x++)dist[y*width+x]=inside(x-1,y-1)&&inside(x,y-1)&&inside(x-1,y)&&inside(x,y)?1e4:0;
 for(let y=1;y<=h;y++)for(let x=1;x<=w;x++){const i=y*width+x;dist[i]=Math.min(dist[i],dist[i-1]+1,dist[i-width]+1,dist[i-width-1]+1.414,x<w?dist[i-width+1]+1.414:1e4)}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*width+x;dist[i]=Math.min(dist[i],dist[i+1]+1,dist[i+width]+1,dist[i+width+1]+1.414,x>0?dist[i+width-1]+1.414:1e4)}
 const maxD=Math.max(1,...dist),bevel=Math.max(2,maxD*.42),unit=2/Math.max(x1-x0+1,y1-y0+1),positions=[],uv=[],indices=[],lookup=new Map(),rimV=[];
 function vertex(x,y,face){const i=y*width+x,key=i*2+(face===1?1:0);if(lookup.has(key))return lookup.get(key);const idx=positions.length/3,d=dist[i],p=Math.min(1,d/bevel),round=Math.sqrt(1-(1-p)*(1-p)),z=.05+.83*round+.12*(d/maxD);
  positions.push((x-(x0+x1+1)/2)*unit,((y0+y1+1)/2-y)*unit,face*z);
  const u=Math.min(1,Math.max(0,x/w)),v=Math.min(1,Math.max(0,y/h));uv.push(face===1?u*.5:.5+u*.5,v);
  rimV[idx]=d===0;lookup.set(key,idx);return idx}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!inside(x,y))continue;const corners=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]],f=corners.map(([a,b])=>vertex(a,b,1)),b=corners.map(([a,b])=>vertex(a,b,-1));indices.push(f[0],f[2],f[1],f[0],f[3],f[2],b[0],b[1],b[2],b[0],b[2],b[3]);
 const edges=[!inside(x,y-1),!inside(x+1,y),!inside(x,y+1),!inside(x-1,y)];edges.forEach((needed,i)=>{if(needed){const j=(i+1)%4;indices.push(f[i],f[j],b[j],f[i],b[j],b[i])}})}
 if(positions.length/3>65535)throw Error('윤곽이 너무 복잡해요. 제품 하나만 선택해 주세요.');
 const neighbours=Array.from({length:positions.length/3},()=>new Set());
 for(let j=0;j<indices.length;j+=3){const a=indices[j],b=indices[j+1],c=indices[j+2];for(const [v,u] of [[a,b],[b,c],[c,a]]){neighbours[v].add(u);neighbours[u].add(v)}}
 // round off the pixel steps along the outline (x/y only, outline vertices only)
 const rimN=neighbours.map((list,i)=>rimV[i]?[...list].filter(j=>rimV[j]&&Math.sign(positions[3*j+2])===Math.sign(positions[3*i+2])):[]);
 for(let pass=0;pass<10;pass++){const old=positions.slice();rimN.forEach((list,i)=>{if(list.length<2)return;for(let k=0;k<2;k++){let sum=0;for(const v of list)sum+=old[3*v+k];positions[3*i+k]=old[3*i+k]*.4+.6*sum/list.length}})}
 for(let pass=0;pass<3;pass++){const old=positions.slice();neighbours.forEach((list,i)=>{for(let k=0;k<3;k++){if(rimV[i]&&k<2)continue;let sum=0;for(const v of list)sum+=old[3*v+k];positions[3*i+k]=old[3*i+k]*.45+.55*sum/list.size}})}
 // texture atlas: left = photo (edge colours bled outwards), right = soft back side
 const tf=Math.min(1,900/Math.max(source.width,source.height)),Tw=Math.max(2,Math.round(source.width*tf)),Th=Math.max(2,Math.round(source.height*tf));
 const low=document.createElement('canvas');low.width=w;low.height=h;const lx=low.getContext('2d'),ld=lx.createImageData(w,h),known=mask.slice(),col=new Float32Array(w*h*3);
 for(let i=0;i<w*h;i++)if(known[i])for(let k=0;k<3;k++)col[i*3+k]=rgba[i*4+k];
 for(let pass=0;pass<14;pass++){const add=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(known[i])continue;let s=[0,0,0],n=0;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const j=yy*w+xx;if(known[j]){n++;for(let k=0;k<3;k++)s[k]+=col[j*3+k]}}if(n)add.push([i,s.map(v=>v/n)])}for(const [i,s] of add){known[i]=1;for(let k=0;k<3;k++)col[i*3+k]=s[k]}}
 for(let i=0;i<w*h;i++){for(let k=0;k<3;k++)ld.data[i*4+k]=known[i]?col[i*3+k]:bg[k];ld.data[i*4+3]=255}lx.putImageData(ld,0,0);
 const cut=document.createElement('canvas');cut.width=Tw;cut.height=Th;const ux=cut.getContext('2d');
 const m=document.createElement('canvas');m.width=w;m.height=h;const md=m.getContext('2d').createImageData(w,h);for(let i=0;i<w*h;i++){md.data[i*4+3]=mask[i]?255:0}m.getContext('2d').putImageData(md,0,0);
 ux.drawImage(source,0,0,Tw,Th);ux.globalCompositeOperation='destination-in';ux.imageSmoothingEnabled=true;ux.filter='blur(1.5px)';ux.drawImage(m,0,0,Tw,Th);ux.filter='none';ux.globalCompositeOperation='source-over';
 const front=document.createElement('canvas');front.width=Tw;front.height=Th;const fx=front.getContext('2d');fx.drawImage(low,0,0,Tw,Th);fx.drawImage(cut,0,0);
 const atlas=document.createElement('canvas');atlas.width=Tw*2;atlas.height=Th;const ax=atlas.getContext('2d');ax.drawImage(front,0,0);
 ax.save();ax.translate(Tw*2,0);ax.scale(-1,1);ax.filter='blur('+Math.round(Tw/40)+'px) saturate(.75) brightness(.86)';ax.drawImage(front,0,0);ax.restore();ax.filter='none';
 return{positions,uv,indices,texture:atlas}
}
/* Depth-buffered triangle renderer, independent of graphics acceleration. */
function runMeshScene(canvas,scene){
 const gpu=canvas.getContext('webgl',{alpha:false,antialias:true});if(gpu){try{return webGLMesh(canvas,gpu,scene)}catch(error){console.warn(error);const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement}}
 const ctx=canvas.getContext('2d',{alpha:false}),textures=new Map(),bg=document.createElement('canvas'),bctx=bg.getContext('2d');let drag=null,hx=0,hy=0,last=0,stop=false,t=0;
 function texture(src){if(!textures.has(src)){const v={img:new Image(),data:null};textures.set(src,v);v.img.onload=()=>{const c=document.createElement('canvas'),f=Math.min(1,768/Math.max(v.img.width,v.img.height));c.width=v.w=Math.max(1,Math.round(v.img.width*f));c.height=v.h=Math.max(1,Math.round(v.img.height*f));const x=c.getContext('2d');x.drawImage(v.img,0,0,c.width,c.height);v.data=x.getImageData(0,0,c.width,c.height).data};v.img.src=src}return textures.get(src)}
 canvas.style.touchAction='none';canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(drag){scene.yaw+=(e.clientX-drag[0])*.014;scene.pitch+=(e.clientY-drag[1])*.014;drag=[e.clientX,e.clientY]}else{hx=(e.offsetX/canvas.clientWidth-.5)*.18;hy=(e.offsetY/canvas.clientHeight-.5)*.18}};canvas.onpointerleave=()=>{hx=hy=0};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;canvas.onwheel=e=>{e.preventDefault();scene.camera=Math.max(2.6,Math.min(11,scene.camera+e.deltaY*.006))};
 let depth,cache=new WeakMap();function frame(now){
 if(stop||!canvas.isConnected)return;requestAnimationFrame(frame);if(!canvas.clientWidth||now-last<42)return;t+=Math.min(.08,(now-last)/1000);last=now;
 const W=Math.min(740,Math.round(canvas.clientWidth)),H=Math.max(1,Math.round(W*canvas.clientHeight/canvas.clientWidth));if(canvas.width!==W||canvas.height!==H||!depth){bg.width=canvas.width=W;bg.height=canvas.height=H;depth=new Float32Array(W*H)}
 const grad=bctx.createLinearGradient(0,0,W,H);grad.addColorStop(0,'#383b44');grad.addColorStop(.53,'#222631');grad.addColorStop(1,'#14181c');bctx.fillStyle=grad;bctx.fillRect(0,0,W,H);
 if(scene.wave){bctx.lineWidth=1;for(let k=0;k<13;k++){bctx.beginPath();for(let x=0;x<=W+8;x+=8){const y=H*(.68+.12*Math.sin(x/W*4+t*.22+k*.10)+k*.018);if(x)bctx.lineTo(x,y);else bctx.moveTo(x,y)}bctx.strokeStyle='rgba(177,201,213,.095)';bctx.stroke()}}
 const image=bctx.getImageData(0,0,W,H),pixels=image.data;depth.fill(-1e10);const yaw=scene.yaw+(scene.mouse?hx:0),pitch=scene.pitch+(scene.mouse?hy:0),cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 for(const [index,o] of scene.objects.entries()){const tx=texture(o.photo);if(!tx.data)continue;const m=o.mesh,N=m.positions.length/3;let v=cache.get(m);if(!v){v=new Float32Array(N*6);cache.set(m,v)}const float=scene.float?.055*Math.sin(t+index):0;
 const oc=Math.cos((o.angle||0)*Math.PI/180),os=Math.sin((o.angle||0)*Math.PI/180);
 for(let i=0;i<N;i++){const n=i*3,j=i*6,mx=m.positions[n],mz=m.positions[n+2]*o.thickness,x=(oc*mx+os*mz)*o.size+o.x,y=m.positions[n+1]*o.size+o.y+float,z=(oc*mz-os*mx)*o.size+o.z,xx=cy*x+sy*z,zz=cy*z-sy*x,yy=cp*y-sp*zz,q=sp*y+cp*zz;const sc=H*1.67/Math.max(.15,scene.camera-q);v[j]=W/2+xx*sc;v[j+1]=H/2-yy*sc;v[j+2]=q;v[j+3]=xx;v[j+4]=yy;v[j+5]=q}
 const ids=m.indices,uv=m.uv;for(let ii=0;ii<ids.length;ii+=3){const ai=ids[ii],bi=ids[ii+1],ci=ids[ii+2],a=ai*6,b=bi*6,c=ci*6,ax=v[a],ay=v[a+1],bx=v[b],by=v[b+1],cx=v[c],yy=v[c+1];const area=(bx-ax)*(yy-ay)-(by-ay)*(cx-ax);if(area>=-.008)continue;
 const xlo=Math.max(0,Math.floor(Math.min(ax,bx,cx))),xhi=Math.min(W-1,Math.ceil(Math.max(ax,bx,cx))),ylo=Math.max(0,Math.floor(Math.min(ay,by,yy))),yhi=Math.min(H-1,Math.ceil(Math.max(ay,by,yy)));
 const ux=v[b+3]-v[a+3],uy=v[b+4]-v[a+4],uz=v[b+5]-v[a+5],vx=v[c+3]-v[a+3],vy=v[c+4]-v[a+4],vz=v[c+5]-v[a+5];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
 const diffuse=.64+.36*Math.max(0,-.42*nx+.64*ny+.65*nz),shine=Math.pow(Math.max(0,-.35*nx+.40*ny+.847*nz),28),rim=(1-Math.min(1,Math.abs(nz)))**2;
 const light=o.mat===0?.62+.46*diffuse:diffuse,inv=1/area;
 for(let y=ylo;y<=yhi;y++)for(let x=xlo;x<=xhi;x++){const dx=x+.5-ax,dy=y+.5-ay,fb=(dx*(yy-ay)-dy*(cx-ax))*inv,fc=((bx-ax)*dy-(by-ay)*dx)*inv,fa=1-fb-fc;if(fa<0||fb<0||fc<0)continue;
 const z=fa*v[a+2]+fb*v[b+2]+fc*v[c+2],i=y*W+x;if(z<=depth[i])continue;depth[i]=z;const u=fa*uv[ai*2]+fb*uv[bi*2]+fc*uv[ci*2],vt=fa*uv[ai*2+1]+fb*uv[bi*2+1]+fc*uv[ci*2+1],si=(Math.min(tx.h-1,Math.max(0,vt*tx.h|0))*tx.w+Math.min(tx.w-1,Math.max(0,(u+(o.inner&&u<.5&&vt>.5?Math.sin(yaw)*o.inner*Math.sin(u*2*Math.PI)*Math.sin((vt-.5)*2*Math.PI):0))*tx.w|0)))*4;const k=i*4;
 for(let ch=0;ch<3;ch++){let rgb=tx.data[si+ch]*light;if(o.mat===1)rgb=rgb*(.91-.16*rim)+pixels[k+ch]*.09+shine*48+rim*[57,65,78][ch];else if(o.mat===2)rgb=rgb*.8+[30,8,22][ch]+shine*105+rim*30;else if(o.mat===3)rgb=(tx.data[si+ch]*.65+65)*diffuse;else if(o.mat===4)rgb=rgb*.65+40+36*Math.cos(nx*3+ny*4+ch*2)+shine*100;else if(o.mat===5)rgb=45+155*(.5+.5*Math.sin(ny*6+nx*2))**3+shine*75;pixels[k+ch]=rgb}
 }}
 }ctx.putImageData(image,0,0)}
 requestAnimationFrame(frame);return()=>{stop=true}
}
function webGLMesh(c,gl,s){
 const make=(type,src)=>{const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh};
 function program(v,f){const p=gl.createProgram();gl.attachShader(p,make(gl.VERTEX_SHADER,v));gl.attachShader(p,make(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p}
 const vertex='attribute vec3 p,n;attribute vec2 u;varying vec3 norm;varying vec2 uv;uniform vec3 offset;uniform vec4 obj;uniform vec4 cam;vec3 ry(vec3 v,float a){return vec3(cos(a)*v.x+sin(a)*v.z,v.y,-sin(a)*v.x+cos(a)*v.z);}vec3 turn(vec3 v){v=ry(v,cam.x);return vec3(v.x,cos(cam.y)*v.y-sin(cam.y)*v.z,sin(cam.y)*v.y+cos(cam.y)*v.z);}void main(){vec3 v=turn(ry(p*vec3(1.,1.,obj.y),obj.z)*obj.x+offset);float d=cam.z-v.z;gl_Position=vec4(v.x*3.34/cam.w,v.y*3.34,d*1.005-.15,d);norm=turn(ry(n/vec3(1.,1.,obj.y),obj.z));uv=u;}';
 const frag='precision mediump float;uniform sampler2D photo;uniform float mode,inner,yaw;uniform vec2 res;uniform float t,wave;varying vec2 uv;varying vec3 norm;vec3 field(vec2 p){return mix(vec3(.20,.22,.26),vec3(.065,.08,.105),p.x*.6+p.y*.3)+wave*.027*sin(p.y*27.+2.4*sin(p.x*5.+t*.24));}void main(){vec3 n=normalize(norm);vec3 base=texture2D(photo,uv+vec2(uv.x<.5&&uv.y>.5?sin(yaw)*inner*sin(uv.x*6.283)*sin((uv.y-.5)*6.283):0.,0.)).rgb;float lit=.65+.35*max(0.,dot(n,normalize(vec3(-.42,.64,.65))));float shine=pow(max(0.,dot(n,normalize(vec3(-.35,.4,.847)))),32.);float rim=pow(1.-abs(n.z),2.);vec3 col=base*(.62+.46*lit)+shine*.10+rim*vec3(.10,.11,.13);if(mode>.5&&mode<1.5)col=base*(.91-.16*rim)+.09*field(gl_FragCoord.xy/res+n.xy*.065)+shine*.19+rim*vec3(.22,.255,.306);else if(mode>1.5&&mode<2.5)col=base*.76+vec3(.10,.025,.08)+shine*.55+rim*.16;else if(mode>2.5&&mode<3.5)col=(base*.65+.25)*lit;else if(mode>3.5&&mode<4.5)col=base*.65+.16+.14*cos(n.x*3.+n.y*4.+vec3(0.,2.,4.))+shine*.4;else if(mode>4.5)col=vec3(.18+.66*pow(.5+.5*sin(n.y*6.+n.x*2.),3.)+shine*.5);gl_FragColor=vec4(col,1.);}';
 const bg=program('attribute vec2 p;varying vec2 st;void main(){st=p*.5+.5;gl_Position=vec4(p,0.,1.);}','precision mediump float;varying vec2 st;uniform float t,wave;void main(){vec3 a=mix(vec3(.20,.22,.26),vec3(.065,.08,.105),st.x*.6+st.y*.3);gl_FragColor=vec4(a+wave*.027*sin(st.y*27.+2.4*sin(st.x*5.+t*.24)),1.);}'),pg=program(vertex,frag),buf=(type,data)=>{const b=gl.createBuffer();gl.bindBuffer(type,b);gl.bufferData(type,data,gl.STATIC_DRAW);return b},tri=buf(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]));
 const cache=new Map();function resource(o){let r=cache.get(o.mesh);if(r)return r;const m=o.mesh,p=m.positions,n=new Float32Array(p.length);for(let j=0;j<m.indices.length;j+=3){const a=3*m.indices[j],b=3*m.indices[j+1],c=3*m.indices[j+2],ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];for(const k of [a,b,c]){n[k]+=uy*vz-uz*vy;n[k+1]+=uz*vx-ux*vz;n[k+2]+=ux*vy-uy*vx}}r={p:buf(gl.ARRAY_BUFFER,new Float32Array(p)),n:buf(gl.ARRAY_BUFFER,n),u:buf(gl.ARRAY_BUFFER,new Float32Array(m.uv)),idx:buf(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(m.indices)),tex:gl.createTexture(),ready:false};cache.set(m,r);const img=new Image();img.onload=()=>{if(!cache.has(m))return;gl.bindTexture(gl.TEXTURE_2D,r.tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR);for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);r.ready=true};img.src=o.photo;return r}
 const attr=(pr,k,b,size)=>{const i=gl.getAttribLocation(pr,k);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,size,gl.FLOAT,false,0,0)},loc=(pr,k)=>gl.getUniformLocation(pr,k);let drag=null,hx=0,hy=0,stop=false;
 c.onpointerdown=e=>{drag=[e.clientX,e.clientY];c.setPointerCapture(e.pointerId)};c.onpointermove=e=>{if(drag){s.yaw+=(e.clientX-drag[0])*.014;s.pitch+=(e.clientY-drag[1])*.014;drag=[e.clientX,e.clientY]}else{hx=(e.offsetX/c.clientWidth-.5)*.18;hy=(e.offsetY/c.clientHeight-.5)*.18}};c.onpointerup=c.onpointercancel=()=>drag=null;c.onpointerleave=()=>{hx=hy=0};c.onwheel=e=>{e.preventDefault();s.camera=Math.max(2.6,Math.min(11,s.camera+e.deltaY*.006))};
 function frame(now){if(stop||!c.isConnected)return;requestAnimationFrame(frame);if(!c.clientWidth)return;const w=Math.round(c.clientWidth*Math.min(devicePixelRatio,1.6)),h=Math.round(c.clientHeight*Math.min(devicePixelRatio,1.6));if(c.width!==w||c.height!==h){c.width=w;c.height=h;gl.viewport(0,0,w,h)}
 gl.disable(gl.DEPTH_TEST);gl.useProgram(bg);for(const key of ['p','n','u'])gl.disableVertexAttribArray(gl.getAttribLocation(pg,key));attr(bg,'p',tri,2);gl.uniform1f(loc(bg,'t'),now*.001);gl.uniform1f(loc(bg,'wave'),s.wave?1:0);gl.drawArrays(gl.TRIANGLES,0,3);gl.clear(gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.useProgram(pg);gl.uniform4f(loc(pg,'cam'),s.yaw+(s.mouse?hx:0),s.pitch+(s.mouse?hy:0),s.camera,w/h);gl.uniform2f(loc(pg,'res'),w,h);gl.uniform1f(loc(pg,'t'),now*.001);gl.uniform1f(loc(pg,'wave'),s.wave?1:0);
 for(const [m,r] of cache)if(!s.objects.some(o=>o.mesh===m)){for(const k of ['p','n','u','idx'])gl.deleteBuffer(r[k]);gl.deleteTexture(r.tex);cache.delete(m)}
 for(const [i,o] of s.objects.entries()){const r=resource(o);if(!r.ready)continue;attr(pg,'p',r.p,3);attr(pg,'n',r.n,3);attr(pg,'u',r.u,2);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,r.idx);gl.bindTexture(gl.TEXTURE_2D,r.tex);gl.uniform3f(loc(pg,'offset'),o.x,o.y+(s.float?.055*Math.sin(now*.001+i):0),o.z);gl.uniform4f(loc(pg,'obj'),o.size,o.thickness,(o.angle||0)*Math.PI/180,0);gl.uniform1f(loc(pg,'inner'),o.inner||0);gl.uniform1f(loc(pg,'yaw'),s.yaw);gl.uniform1f(loc(pg,'mode'),o.mat);gl.drawElements(gl.TRIANGLES,o.mesh.indices.length,gl.UNSIGNED_SHORT,0)}}
 requestAnimationFrame(frame);return()=>{stop=true}
}
