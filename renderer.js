const vertex='attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const fragment=`precision highp float;
uniform vec2 res,rot;uniform float time,zoom,grid,lightPower;uniform vec3 back;
uniform vec4 profile[32];uniform int count;uniform vec4 pos[8],mat[8],tint[8];
mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
float shape(vec3 p,float k,float t){
 if(k<.5){p.yz*=turn(.4);p.xy*=turn(-.15);float a=atan(p.y,p.x),r=length(p.xy);float wig=.09*sin(3.*a+t*.64)+.04*cos(5.*a-t*.3);float lobe=.22*cos(5.*a+.4)+.10*sin(3.*a+t*.32);float major=.68+lobe+wig;float tube=.40+.075*cos(5.*a+.9);return length(vec2(r-major,p.z-.26*sin(3.*a+.65+t*.27)))-tube;}
 if(k<1.5)return length(p)-.96;if(k<2.5){p.yz*=turn(.42);return length(vec2(length(p.xy)-.69,p.z))-.34;}
 vec3 q=abs(p)-(k<3.5?vec3(.58):vec3(.82,.53,.045));return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-(k<3.5?.26:.07);}
vec2 map(vec3 p){vec2 h=vec2(100.,0.);for(int i=0;i<8;i++){if(i>=count)break;vec3 q=(p-pos[i].xyz)/pos[i].w;q.y-=.032*sin(time*.8+float(i));q.xz*=turn(rot.x+.18*sin(time*.24+float(i)));q.yz*=turn(rot.y);float d;if(mat[i].x>4.5){float index=clamp((q.y+1.)*7.5,0.,14.999);int a=int(floor(index));float r=0.,next=0.;for(int j=0;j<16;j++){vec4 row=profile[i*4+j/4];int col=j-(j/4)*4;float v=col==0?row.x:col==1?row.y:col==2?row.z:row.w;if(j==a)r=v;if(j==a+1)next=v;}if(a>=15)next=r;d=max(length(q.xz)-mix(r,next,fract(index)),abs(q.y)-1.)*.65;}else{d=shape(q,mat[i].x,time);}d*=pos[i].w;if(d<h.x)h=vec2(d,float(i));}return h;}
vec3 env(vec3 r){float y=r.y;vec3 e=mix(vec3(.13,.14,.16),vec3(.8,.85,.92),smoothstep(-.5,.48,y));e*=1.-.86*smoothstep(.02,.22,abs(r.x+.28*r.z))*smoothstep(.32,.08+1.,-y+.4);e+=vec3(1.3)*smoothstep(.78,.88,dot(r,normalize(vec3(-.6,.65,.4))));e+=vec3(.9)*smoothstep(.65,.73,dot(r,normalize(vec3(.9,.16,-.25))));return e;}
void main(){vec2 uv=(gl_FragCoord.xy-.5*res)/res.y;vec3 ro=vec3(0.,.9,zoom),rd=normalize(vec3(uv.x,uv.y-.13,-1.8));float floorD=(-1.68-ro.y)/min(-.0001,rd.y);vec3 fp=ro+rd*floorD;float g=0.;if(rd.y<-.01){vec2 cell=abs(fract(fp.xz*.73+.5)-.5);g=1.-smoothstep(.004,.016,min(cell.x,cell.y));g*=smoothstep(.02,.45,-rd.y);}
vec3 bg=back*(.94+.10*uv.y)-.16*g*grid;float sh=0.;for(int i=0;i<8;i++){if(i>=count)break;sh+=.22*exp(-1.45*dot(fp.xz-pos[i].xz,fp.xz-pos[i].xz)/pos[i].w);}bg*=1.-min(sh,.36);float travel=0.;vec2 hit;
for(int j=0;j<85;j++){hit=map(ro+rd*travel);if(hit.x<.0018||travel>14.)break;travel+=max(.001,hit.x*.68);}
vec3 col=bg;if(hit.x<.003&&travel<14.){vec3 p=ro+rd*travel;vec2 e=vec2(.002,0.);vec3 n=normalize(vec3(map(p+e.xyy).x-map(p-e.xyy).x,map(p+e.yxy).x-map(p-e.yxy).x,map(p+e.yyx).x-map(p-e.yyx).x));vec4 m=vec4(0.),c=vec4(1.);for(int i=0;i<8;i++){if(abs(float(i)-hit.y)<.1){m=mat[i];c=tint[i];}}
vec3 r=reflect(rd,n);float fres=pow(1.-max(0.,dot(n,-rd)),2.3);vec3 reflectColor=env(r);float lum=dot(reflectColor,vec3(.3,.59,.11));reflectColor=mix(reflectColor,vec3(.55+lum*.23),m.z*.78);
vec3 film=.60+.40*cos(vec3(.5,2.65,4.7)+dot(n,vec3(1.7,-1.2,.9))*2.6+fres*3.);vec3 metal=reflectColor*c.rgb;float mode=m.y;if(mode<.5){metal=reflectColor*mix(vec3(.93),film,.68)*c.rgb+.09*film;}else if(mode>1.5&&mode<2.5){metal=mix(bg*c.rgb,env(refract(rd,n,.67))*c.rgb,.38)+reflectColor*(.19+.72*fres);}else if(mode>2.5&&mode<3.5){metal=c.rgb*(.45+.55*max(0.,dot(n,normalize(vec3(-.6,1.,1.)))))+reflectColor*.25;}else if(mode>3.5&&mode<4.5){metal=c.rgb*(.46+.58*max(0.,dot(n,normalize(vec3(-.6,1.,1.)))));}else if(mode>4.5){metal=c.rgb*(.36+.72*max(0.,n.y))+.33*reflectColor+fres*.14;}
col=mix(c.rgb*(.51+.39*n.y),metal,m.w)*lightPower;col=pow(max(col,0.),vec3(.85));}gl_FragColor=vec4(col,1.);}`;
function startView(canvas,state){
 if(state.photoScene)return softwareView(canvas,state);
 let running=true;
 function useSoftware(){
   if(!running)return;
   running=false;
   const replacement=canvas.cloneNode(false);
   canvas.replaceWith(replacement);
   softwareView(replacement,state);
 }
 const gl=canvas.getContext('webgl',{alpha:false,antialias:false});if(!gl)return softwareView(canvas,state);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();useSoftware()},{once:true});
 try{
 function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
 const pg=gl.createProgram();gl.attachShader(pg,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(pg,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(pg);if(!gl.getProgramParameter(pg,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(pg));gl.useProgram(pg);
 const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const attr=gl.getAttribLocation(pg,'p');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
 const u={};for(const k of ['res','rot','time','zoom','grid','lightPower','back','count','pos','mat','tint','profile'])u[k]=gl.getUniformLocation(pg,['pos','mat','tint','profile'].includes(k)?k+'[0]':k);
 let drag=null,hover=[0,0];canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;canvas.onpointermove=e=>{if(drag){state.rot[0]+=(e.clientX-drag[0])*.01;state.rot[1]+=(e.clientY-drag[1])*.01;drag=[e.clientX,e.clientY]}else{const box=canvas.getBoundingClientRect();hover=[((e.clientX-box.left)/box.width-.5)*.18,((e.clientY-box.top)/box.height-.5)*.18]}};canvas.onpointerleave=()=>hover=[0,0];canvas.addEventListener('wheel',e=>{if(!state.scroll)return;e.preventDefault();state.zoom=Math.max(4,Math.min(11,state.zoom+e.deltaY*.006))},{passive:false});
 const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
 let prev=performance.now();function draw(now){if(!running||!canvas.isConnected)return;if(!canvas.clientWidth){requestAnimationFrame(draw);return}const dt=Math.min(.06,(now-prev)/1000);prev=now;if(state.play)state.time+=dt;const scale=Math.min(1.35,880/canvas.clientWidth);const w=Math.max(1,Math.round(canvas.clientWidth*scale)),h=Math.max(1,Math.round(canvas.clientHeight*scale));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h)}
 gl.uniform2f(u.res,w,h);gl.uniform2f(u.rot,...state.rot.map((x,i)=>x+(state.tilt?hover[i]:0)));gl.uniform1f(u.time,state.time);gl.uniform1f(u.zoom,state.zoom);gl.uniform1f(u.grid,state.grid);gl.uniform1f(u.lightPower,state.light);gl.uniform3fv(u.back,rgb(state.bg));gl.uniform1i(u.count,state.objects.length);gl.uniform4fv(u.pos,state.objects.flatMap(o=>[o.x,o.y,o.z,o.size]));gl.uniform4fv(u.mat,state.objects.flatMap(o=>[o.shape,o.mode,o.rough,o.shine]));gl.uniform4fv(u.tint,state.objects.flatMap(o=>[...rgb(o.color),1]));gl.uniform4fv(u.profile,state.objects.flatMap(o=>o.profile||Array(16).fill(.75)));gl.drawArrays(gl.TRIANGLES,0,3);requestAnimationFrame(draw)}requestAnimationFrame(draw);
 }catch(error){console.warn('WebGL initialization failed',error);useSoftware()}
}
