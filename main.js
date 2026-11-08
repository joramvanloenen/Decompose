(() => {
'use strict';
const W=364,H=204,VW=236, names=['OUTER FLESH','FUNERAL CLOTH','DRIED REMAINS','ANCIENT BONES'];
const filenames=['Coprse01_alive.png','Coprse02_Cloth.png','Coprse03_Dried.png','Coprse04_Skeleton.png'];
const $=id=>document.getElementById(id),canvas=$('game'),g=canvas.getContext('2d',{alpha:false});g.imageSmoothingEnabled=false;
const layers=[], particles=[], charges=new Map(), dust=[];
let background,cam=0,wantCam=0,hand={x:VW/2,y:120},hold=false,hover=false,pan=0,energy=0,harvest=0,taint=0,t=0,previous=performance.now();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function load(url){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error(url));i.src=url})}
async function init(){
 try{
 const imgs=await Promise.all(['assets/Coprse_BG.jpg',...filenames.map(n=>'assets/'+n)].map(load));
 background=imgs[0];
 for(let k=0;k<4;k++){
 const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(imgs[k+1],0,0);
 layers.push({canvas:c,context:x,pixels:x.getImageData(0,0,W,H).data,source:imgs[k+1],dirty:false});
 }
 for(let i=0;i<42;i++)dust.push({x:Math.random()*W,y:Math.random()*H,p:Math.random()*6});
 $('loading').style.opacity='0';setTimeout(()=>$('loading')?.remove(),600);
 requestAnimationFrame(frame);
 }catch(err){$('loading').textContent='ASSET ERROR: '+err.message;console.error(err)}
}
function topPixel(x,y){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return -1;const off=(y*W+x)*4+3;for(let k=0;k<layers.length;k++)if(layers[k].pixels[off]>24)return k;return -1}
function overTaint(x,y){return ((x-188)/17)**2+((y-128)/8)**2<1}
function pointer(e){
 const r=canvas.getBoundingClientRect(),ar=VW/H,bar=r.width/r.height;let x,y;
 if(bar>ar){let w=r.height*ar;x=(e.clientX-r.left-(r.width-w)/2)/w*VW;y=(e.clientY-r.top)/r.height*H}
 else{let h=r.width/ar;x=(e.clientX-r.left)/r.width*VW;y=(e.clientY-r.top-(r.height-h)/2)/h*H}
 hand={x:clamp(x,0,VW),y:clamp(y,0,H)};hover=true;
}
canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);pointer(e);hold=true;$('hint').style.opacity=0});
canvas.addEventListener('pointermove',pointer);
canvas.addEventListener('pointerenter',()=>hover=true);
canvas.addEventListener('pointerleave',()=>{if(!hold)hover=false});
for(const n of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(n,()=>hold=false);
for(const [id,dir] of [['panLeft',-1],['panRight',1]]){
 const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);pan=dir});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>pan=0);
 b.addEventListener('click',()=>wantCam=clamp(wantCam+dir*40,0,W-VW));
}
addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){pan=e.key==='ArrowLeft'?-1:1;e.preventDefault()}});
addEventListener('keyup',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight')pan=0});
$('helpBtn').onclick=()=>$('instructions').showModal();
$('closeHelp').onclick=$('begin').onclick=()=>$('instructions').close();
$('restart').onclick=()=>{
 for(const l of layers){l.context.clearRect(0,0,W,H);l.context.drawImage(l.source,0,0);l.pixels=l.context.getImageData(0,0,W,H).data;l.dirty=false}
 particles.length=0;charges.clear();energy=harvest=taint=0;updateHud();
};
function gather(dt){
 if(!hold)return;
 const x=hand.x+cam,y=hand.y;
 for(let i=0,n=Math.max(5,Math.round(dt*.85));i<n;i++){
 const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*9,px=Math.round(x+Math.cos(a)*r),py=Math.round(y+Math.sin(a)*r),k=topPixel(px,py);
 if(k<0)continue;
 const key=k*W*H+py*W+px;if(!charges.has(key))charges.set(key,{x:px,y:py,k,phase:0});
 }
}
function charged(dt){
 for(const [key,p] of charges){
 p.phase+=dt*(.0035+.001*Math.random());
 if(p.phase>=1){
 const l=layers[p.k],i=(p.y*W+p.x)*4;
 if(l.pixels[i+3]){
 l.pixels[i+3]=0;l.dirty=true;harvest++;
 const poisoned=p.k===2&&overTaint(p.x,p.y);
 if(poisoned)taint=clamp(taint+1.2,0,100);
 particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*.36,vy:-.18-Math.random()*.4,life:0,poisoned});
 }
 charges.delete(key);
 }
 }
}
function floatPixels(dt){
 const tx=hand.x+cam,ty=hand.y;
 for(let i=particles.length-1;i>=0;i--){
 const p=particles[i],dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy)||1;
 const accel=clamp(1.2/(d+8),.003,.075)*dt*.15;
 p.vx=p.vx*.982+dx/d*accel;p.vy=p.vy*.982+dy/d*accel;
 p.x+=p.vx*dt*.07;p.y+=p.vy*dt*.07;p.life+=dt;
 if((d<5&&hover)||p.life>3800){if(d<10&&!p.poisoned)energy++;particles.splice(i,1)}
 }
}
function updateHud(){
 $('essence').textContent=String(energy).padStart(5,'0');
 $('harvest').textContent=harvest+' PIXELS HARVESTED';
 $('healthBar').style.width=(100-taint)+'%';
 $('status').textContent=taint>55?'CORRUPTION CRITICAL':taint>8?'TAINT DETECTED':'EXTRACTION READY';
}
function drawHand(){
 if(!hover&&!hold)return;
 const x=Math.round(hand.x),y=Math.round(hand.y);g.save();g.translate(x,y);g.shadowBlur=hold?9:4;g.shadowColor='#ab37ed';
 g.fillStyle='#14221b';g.fillRect(4,12,9,12);g.fillRect(-7,6,15,11);
 g.fillStyle='#536c61';g.fillRect(-7,7,14,9);g.fillRect(-3,1,9,12);g.fillRect(3,13,9,10);
 g.fillStyle='#acc1a8';g.fillRect(-6,4,11,4);g.fillRect(-4,0,8,4);
 for(let f=0;f<4;f++){const px=-7+f*4,py=-2-Math.abs(f-1.5)*1.8;
 g.fillStyle='#536c61';g.fillRect(px,py-9,3,9);g.fillStyle='#acc1a8';g.fillRect(px,py-10,2,7);
 g.fillStyle=hold?'#da71fa':'#819d90';g.fillRect(px,py-11,2,2)}
 g.fillStyle='#8d45b6';g.fillRect(-8,-2,3,5);
 if(hold){g.strokeStyle='#c454ff';g.lineWidth=1;g.beginPath();g.arc(0,-1,10+Math.sin(t*.009)*.6,0,Math.PI*2);g.stroke();
 for(let i=0;i<5;i++){let a=t*.003+i*1.256;g.fillStyle=i%2?'#e3afff':'#aa37ef';g.fillRect(Math.cos(a)*13|0,Math.sin(a)*13-2|0,2,2)}}
 g.restore();
}
function render(){
 g.clearRect(0,0,VW,H);g.drawImage(background,-Math.round(cam),0);
 for(let k=layers.length-1;k>=0;k--)g.drawImage(layers[k].canvas,-Math.round(cam),0);
 if(topPixel(188,128)===2){g.globalAlpha=.65+.25*Math.sin(t*.006);g.fillStyle='#a32670';g.fillRect(187-cam,128,3,2);g.fillRect(182-cam,125,2,2);g.fillRect(193-cam,126,2,2);g.globalAlpha=1}
 for(const p of charges.values()){let x=Math.round(p.x-cam);if(x<0||x>=VW)continue;
 g.fillStyle=p.phase>.6?'#f2b8ff':p.phase>.22?'#d953ff':'#9b2ae4';g.fillRect(x,p.y,1,1);
 if(p.phase>.65){g.fillStyle='#cd36ff44';g.fillRect(x-1,p.y-1,3,3)}}
 for(const p of particles){let x=p.x-cam;if(x<-5||x>VW+5)continue;
 g.fillStyle=p.poisoned?'#f4378d':'#6821a6';g.fillRect(Math.round(x),Math.round(p.y),1,1);
 if(Math.random()<.25){g.fillStyle='#8e2ecd';g.fillRect(Math.round(x-p.vx*3),Math.round(p.y-p.vy*3),1,1)}}
 for(const m of dust){g.fillStyle='#80df7c';g.globalAlpha=.1+.12*Math.sin(t*.001+m.p);g.fillRect(Math.round(m.x-cam*.25),Math.round(m.y),1,1)}
 g.globalAlpha=1;drawHand();
}
function frame(now){
 const dt=Math.min(40,now-previous);previous=now;t+=dt;
 wantCam=clamp(wantCam+pan*dt*.09,0,W-VW);cam+=(wantCam-cam)*Math.min(1,dt*.016);
 gather(dt);charged(dt);
 for(const l of layers)if(l.dirty){l.context.putImageData(new ImageData(new Uint8ClampedArray(l.pixels),W,H),0,0);l.dirty=false}
 floatPixels(dt);updateHud();$('position').style.left=((cam/(W-VW))*92)+'%';
 if(hold){const k=topPixel(hand.x+cam,hand.y);if(k>=0)$('layerName').textContent=names[k]}
 render();requestAnimationFrame(frame);
}
init();
})();