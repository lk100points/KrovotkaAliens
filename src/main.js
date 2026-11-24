const THREE = window.__KROVOTKINSKAYA_THREE__;
if (!THREE) throw new Error('Three.js не загрузился: отсутствует игровой движок.');

/* КРОВОТКИНСКАЯ — a procedural browser-based 3D horror game. */
const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const isTouchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const isMobileLayout = () => isTouchDevice || innerWidth < 760;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouchDevice, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouchDevice ? 1.05 : 1.35));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
renderer.shadowMap.autoUpdate = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, .1, 260);
camera.rotation.order = 'YXZ';
scene.add(camera);
const world = new THREE.Group();
scene.add(world);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const v3 = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const rand = (a,b) => a+Math.random()*(b-a);
const mat = (color, roughness=.85, metalness=0, extra={}) => {
  // Bump maps cost a lot on mobile GPUs; retain the authored color maps and relief pattern in the albedo.
  const safeExtra = isMobileLayout() && extra.bumpMap ? {...extra, bumpMap:null, bumpScale:0} : extra;
  return new THREE.MeshStandardMaterial({color,roughness,metalness,...safeExtra});
};
const M = {
  concrete:mat('#62656a'), dark:mat('#17191d'), black:mat('#090b0e'), stone:mat('#c4c3bd'), stone2:mat('#8c8d8e'), gold:mat('#bca36a',.4,.55), glass:mat('#283b42',.22,.35,{transparent:true,opacity:.72}), warm:mat('#d9a15d',.45,0,{emissive:'#6a3515',emissiveIntensity:.7}), red:mat('#8c2732',.6,.1), green:mat('#a5d28d',.4,.1,{emissive:'#4b9c50',emissiveIntensity:1.3}), alien:mat('#7d8b85',.68,.05), alienDark:mat('#303d3e',.35,.1), stalkerSkin:mat('#333b3b',.48,.12), stalkerPlate:mat('#161f21',.32,.32), stalkerVoid:mat('#090e11',.24,.12), stalkerEye:mat('#e78a70',.22,.04,{emissive:'#8f302b',emissiveIntensity:.72}), friendSkin:mat('#929b91',.62,.08), friendPlate:mat('#3e4947',.42,.22), friendEye:mat('#b9dfae',.22,.04,{emissive:'#5d9b68',emissiveIntensity:1.15}), glowGreen:mat('#b5ff9e',.25,.1,{emissive:'#46d66b',emissiveIntensity:2.4}), glowRed:mat('#ff5c4f',.25,.1,{emissive:'#d62326',emissiveIntensity:2.2}), blue:mat('#80c9d6',.25,.1,{emissive:'#246979',emissiveIntensity:1.4}), white:mat('#d9d8d0')
};
Object.values(M).forEach(material=>material.userData.krovShared=true);
let phase='intro', paused=false, pauseFrom='church', quality=(isTouchDevice?'low':'medium');
let yaw=0, pitch=0, player=v3(0,1.65,8), velocity=v3(), health=100, selectedSlot=1;
let inventory={lighter:false,blood:false,water:false,portal:false,carbine:false,keys:false};
let objective='', currentInteract=null, toastTimer=0, dialogueLines=[], dialogueIndex=0, dialogueDone=null;
let interactables=[], colliders=[], enemies=[], projectiles=[], particles=[], flightEnemies=[], flightShots=[], animatedObjects=[];
let introTime=0, sceneTime=0, portalMesh=null, portalTrigger=null, portalShots=[], portalShotCooldown=0, ufo=null, ufoGlow=null, deadAlien=null, friendAlien=null, candleLight=null, candleFlame=null;
let introCinematic=false, introCinematicTime=0, cinematicStrikeDone=false, portalVortexTexture=null;
let flightScore=0, flightGoal=5, flightTime=0, boostUntil=0, playerDamageCooldown=0, waveSpawned=false;
let bloodPoured=false, waterPoured=false, bookRead=false, fireHeld=false, fireHeldRMB=false, fireCooldown=0, cockpitDialogueStarted=false, lighterGlow=null, flightPulseMeshes=[], transitioning=false;
let weaponRig=null, lighterRig=null, portalRig=null, muzzleFlash=null, lighterSpot=null, weaponRecoil=0, weaponIdle=0, pickupPulse=0, equipPulse=0, portalKick=0, flightAimX=0, flightAimY=0, flightTrailClock=0, pulseLights=[], audioCtx=null, masterGain=null;
const ambientMusic=new Audio('./assets/krovotkinskaya_ambient.mp3');ambientMusic.loop=true;ambientMusic.preload='auto';ambientMusic.volume=.4;
let musicTargetVolume=.4,musicFadeToken=0;
function fadeAmbient(target,duration=850,pauseAtEnd=false){const token=++musicFadeToken,start=ambientMusic.volume,started=performance.now();const step=now=>{if(token!==musicFadeToken)return;const t=clamp((now-started)/duration,0,1),ease=1-Math.pow(1-t,3);ambientMusic.volume=start+(target-start)*ease;if(t<1)requestAnimationFrame(step);else if(pauseAtEnd)ambientMusic.pause();};requestAnimationFrame(step);}
function setGameVolume(value){const v=clamp(Number(value),0,100)/100;if(masterGain)masterGain.gain.value=v;musicTargetVolume=v*.62;if(!ambientMusic.paused)ambientMusic.volume=musicTargetVolume;}
function startAmbientMusic(){ambientMusic.volume=0;ambientMusic.play().then(()=>fadeAmbient(musicTargetVolume,1800)).catch(()=>{});}
function pauseAmbientMusic(){fadeAmbient(0,260,true);}
function resumeAmbientMusic(){if(phase!=='intro'&&phase!=='ending')ambientMusic.play().then(()=>fadeAmbient(musicTargetVolume,650)).catch(()=>{});}
const keys=Object.create(null);
let touchMoveX=0,touchMoveY=0,touchSprint=false,lookPointerId=null,lookLastX=0,lookLastY=0,stickPointerId=null;
const tmpDir=v3(), tmpRight=v3(), tmpMove=v3();
const geometryCache=new Map();
function cachedGeometry(key,create){let g=geometryCache.get(key);if(!g){g=create();g.userData.krovShared=true;geometryCache.set(key,g);}return g;}

function makeNoiseTexture(base, accent, size=512, count=3800){
  const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false});
  ctx.fillStyle=base;ctx.fillRect(0,0,size,size);
  // Layered, low-contrast mineral noise: large stains, fine grit, hairline wear and seams.
  for(let i=0;i<count;i++){
    const a=rand(.018,.13);ctx.globalAlpha=a;ctx.fillStyle=Math.random()>.56?accent:'#171719';
    const w=rand(.6,Math.max(2,size*.035)),h=rand(.6,Math.max(2,size*.018));ctx.fillRect(rand(0,size),rand(0,size),w,h);
  }
  ctx.globalAlpha=.12;ctx.strokeStyle=accent;ctx.lineWidth=1;
  for(let i=0;i<22;i++){const x=rand(0,size),y=rand(0,size);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+rand(-45,45),y+rand(8,70));ctx.stroke();}
  ctx.globalAlpha=.08;for(let i=0;i<10;i++){const x=rand(0,size),y=rand(0,size);ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(x,y,rand(10,45),rand(5,24),rand(0,Math.PI),0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=1;const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(isMobileLayout()?2:4,renderer.capabilities.getMaxAnisotropy());t.needsUpdate=true;return t;
}
function makeSurfaceTexture(kind,base,accent,size=512){
  const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle=base;ctx.fillRect(0,0,size,size);
  if(kind==='brick'){
    const bw=104,bh=52;for(let row=-1;row<size/bh+1;row++){const shift=row%2?bw/2:0;for(let col=-1;col<size/bw+1;col++){const x=col*bw+shift,y=row*bh;const v=Math.floor(rand(-13,14));ctx.fillStyle=`rgb(${clamp(98+v,0,255)},${clamp(66+v,0,255)},${clamp(55+v,0,255)})`;ctx.fillRect(x+3,y+3,bw-6,bh-6);ctx.globalAlpha=.16;ctx.fillStyle=accent;ctx.fillRect(x+4,y+4,bw-8,3);ctx.globalAlpha=1;ctx.fillStyle='#292421';ctx.fillRect(x+1,y+bh-3,bw-2,2);}}
  }else if(kind==='stone'){
    const tw=128,th=86;for(let row=0;row<size/th+1;row++){for(let col=0;col<size/tw+1;col++){const x=col*tw+(row%2?tw/2:0),y=row*th,v=Math.floor(rand(-16,17));ctx.fillStyle=`rgb(${clamp(160+v,0,255)},${clamp(155+v,0,255)},${clamp(143+v,0,255)})`;ctx.fillRect(x+2,y+2,tw-4,th-4);ctx.globalAlpha=.12;ctx.fillStyle='#fff';ctx.fillRect(x+4,y+4,tw-8,3);ctx.globalAlpha=1;ctx.fillStyle='#68645d';ctx.fillRect(x+1,y+th-3,tw-2,2);}}
  }else if(kind==='paving'){
    const tile=128;for(let y=0;y<size;y+=tile)for(let x=0;x<size;x+=tile){const v=Math.floor(rand(-10,11));ctx.fillStyle=`rgb(${clamp(76+v,0,255)},${clamp(77+v,0,255)},${clamp(78+v,0,255)})`;ctx.fillRect(x+3,y+3,tile-6,tile-6);ctx.fillStyle='#24272a';ctx.fillRect(x+1,y+tile-4,tile-2,3);ctx.fillRect(x+tile-4,y+1,3,tile-2);ctx.globalAlpha=.12;ctx.strokeStyle='#c4c0b5';ctx.beginPath();ctx.moveTo(x+14,y+22);ctx.lineTo(x+tile-18,y+tile-24);ctx.stroke();ctx.globalAlpha=1;}
  }else if(kind==='wood'){
    for(let x=0;x<size;x+=128){ctx.fillStyle=x%256?'#48332b':'#3c2a23';ctx.fillRect(x,0,124,size);ctx.strokeStyle='#8b6048';ctx.globalAlpha=.2;for(let i=0;i<12;i++){const xx=x+rand(8,116);ctx.beginPath();ctx.moveTo(xx,0);ctx.bezierCurveTo(xx+rand(-12,12),120,xx+rand(-12,12),340,xx+rand(-6,6),size);ctx.stroke();}ctx.globalAlpha=1;ctx.fillStyle='#241b18';ctx.fillRect(x+124,0,4,size);}
  }
  // Fine mineral grain, edge wear and small stains bind the authored pattern together.
  for(let i=0;i<size*10;i++){ctx.globalAlpha=rand(.025,.12);ctx.fillStyle=Math.random()>.55?accent:'#171819';ctx.fillRect(rand(0,size),rand(0,size),rand(.5,3.5),rand(.5,2.5));}
  ctx.globalAlpha=1;const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(isMobileLayout()?2:4,renderer.capabilities.getMaxAnisotropy());t.needsUpdate=true;return t;
}
const SURFACE_SIZE=isMobileLayout()?256:512;
const brickTex=makeSurfaceTexture('brick','#62483f','#bd8d76',SURFACE_SIZE);
const concreteTex=makeNoiseTexture('#55585a','#96938c',SURFACE_SIZE,isMobileLayout()?1900:7200);
const pavingTex=makeSurfaceTexture('paving','#45464a','#a7a297',SURFACE_SIZE);
const stoneTex=makeSurfaceTexture('stone','#a29d90','#e0d9c9',SURFACE_SIZE);
const asphaltTex=makeNoiseTexture('#292d31','#55595c',SURFACE_SIZE,isMobileLayout()?2200:8200);
const woodTex=makeSurfaceTexture('wood','#382a25','#a07b5f',SURFACE_SIZE);
function makeAlienTexture(kind='stalker',size=512){
  const hostile=kind==='stalker',c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false});
  const base=hostile?'#3c4542':'#777d72',deep=hostile?'#171f20':'#3e4b46',light=hostile?'#87918a':'#c0bbae';
  ctx.fillStyle=base;ctx.fillRect(0,0,size,size);
  const wash=ctx.createLinearGradient(0,0,size,size);wash.addColorStop(0,hostile?'#68716b':'#b0b1a2');wash.addColorStop(.48,base);wash.addColorStop(1,deep);ctx.globalAlpha=.48;ctx.fillStyle=wash;ctx.fillRect(0,0,size,size);ctx.globalAlpha=1;
  // Irregular translucent marbling, like mineral deposits beneath wet skin.
  for(let i=0;i<210;i++){const x=rand(0,size),y=rand(0,size),r=rand(4,34);const g=ctx.createRadialGradient(x-r*.2,y-r*.25,1,x,y,r);g.addColorStop(0,hostile?'rgba(151,158,144,.22)':'rgba(223,213,188,.24)');g.addColorStop(.55,hostile?'rgba(19,29,27,.15)':'rgba(43,56,49,.15)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
  // Branching dark capillaries and faint scars; restrained so the UV pattern remains organic.
  ctx.lineCap='round';for(let i=0;i<72;i++){let x=rand(0,size),y=rand(0,size),steps=Math.floor(rand(3,8));ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<steps;j++){x+=rand(-25,25);y+=rand(8,32);ctx.lineTo(x,y);}ctx.strokeStyle=hostile?'rgba(12,20,20,.30)':'rgba(54,34,35,.24)';ctx.lineWidth=rand(.6,2.2);ctx.stroke();if(i%3===0){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+rand(-26,26),y+rand(-18,18));ctx.stroke();}}
  // Pores and fine raised-looking granules.
  for(let i=0;i<size*13;i++){const x=rand(0,size),y=rand(0,size),r=rand(.25,1.8);ctx.fillStyle=Math.random()>.5?(hostile?'rgba(6,12,13,.31)':'rgba(34,40,36,.26)'):(hostile?'rgba(188,194,177,.16)':'rgba(242,229,207,.17)');ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
  // A few elongated folds give the material believable directional structure.
  for(let i=0;i<28;i++){const x=rand(0,size),y=rand(0,size);ctx.strokeStyle=hostile?'rgba(8,13,14,.18)':'rgba(48,48,42,.16)';ctx.lineWidth=rand(1,3);ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+rand(-40,40),y+30,x+rand(-30,30),y+70,x+rand(-50,50),y+rand(70,140));ctx.stroke();}
  ctx.globalAlpha=1;const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=Math.min(isMobileLayout()?2:4,renderer.capabilities.getMaxAnisotropy());tex.needsUpdate=true;return tex;
}
function makeAlienPlateTexture(hostile=true,size=512){
  const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');ctx.fillStyle=hostile?'#151c1e':'#38413d';ctx.fillRect(0,0,size,size);
  for(let y=-32,row=0;y<size+32;y+=48,row++){for(let x=-28;x<size+28;x+=56){const xx=x+(row%2)*28,yy=y;ctx.fillStyle=hostile?(row%2?'#263033':'#1b2426'):(row%2?'#53605a':'#414d48');ctx.beginPath();ctx.moveTo(xx+3,yy+2);ctx.quadraticCurveTo(xx+28,yy-9,xx+53,yy+4);ctx.lineTo(xx+47,yy+39);ctx.quadraticCurveTo(xx+26,yy+51,xx+7,yy+38);ctx.closePath();ctx.fill();ctx.strokeStyle=hostile?'rgba(132,147,137,.25)':'rgba(190,199,180,.22)';ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle='rgba(0,0,0,.34)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(xx+8,yy+35);ctx.lineTo(xx+47,yy+35);ctx.stroke();}}
  for(let i=0;i<size*5;i++){ctx.globalAlpha=rand(.02,.11);ctx.fillStyle=Math.random()>.5?'#b4b8a4':'#050809';ctx.fillRect(rand(0,size),rand(0,size),rand(.5,3),rand(.5,2));}ctx.globalAlpha=1;
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=Math.min(3,renderer.capabilities.getMaxAnisotropy());return tex;
}
M.stalkerSkin.map=makeAlienTexture('stalker',SURFACE_SIZE);M.stalkerSkin.bumpMap=M.stalkerSkin.map;M.stalkerSkin.bumpScale=.055;M.stalkerSkin.needsUpdate=true;
M.friendSkin.map=makeAlienTexture('exile',SURFACE_SIZE);M.friendSkin.bumpMap=M.friendSkin.map;M.friendSkin.bumpScale=.045;M.friendSkin.needsUpdate=true;
M.stalkerPlate.map=makeAlienPlateTexture(true,SURFACE_SIZE);M.stalkerPlate.bumpMap=M.stalkerPlate.map;M.stalkerPlate.bumpScale=.035;M.stalkerPlate.needsUpdate=true;
M.friendPlate.map=makeAlienPlateTexture(false,SURFACE_SIZE);M.friendPlate.bumpMap=M.friendPlate.map;M.friendPlate.bumpScale=.028;M.friendPlate.needsUpdate=true;
brickTex.repeat.set(2.6,2.6);concreteTex.repeat.set(3.5,3.5);pavingTex.repeat.set(5,5);stoneTex.repeat.set(2.7,2.7);asphaltTex.repeat.set(8,8);woodTex.repeat.set(2,2);
function addMesh(parent, geo, material, pos, rot=null, scale=null, cast=false, receive=false){const o=new THREE.Mesh(geo,material);o.position.copy(pos);if(rot)o.rotation.set(rot.x,rot.y,rot.z);if(scale)o.scale.copy(scale);o.castShadow=cast;o.receiveShadow=receive;parent.add(o);return o;}
function box(parent,w,h,d,material,x,y,z,opts={}){const g=cachedGeometry(`b:${w}:${h}:${d}`,()=>new THREE.BoxGeometry(w,h,d));return addMesh(parent,g,material,v3(x,y,z),opts.rot||null,opts.scale||null,opts.cast===true,opts.receive===true)}
function sphere(parent,r,material,x,y,z,sx=1,sy=1,sz=1){const seg=isMobileLayout()?12:16, rings=isMobileLayout()?8:12;const g=cachedGeometry(`s:${r}:${seg}:${rings}`,()=>new THREE.SphereGeometry(r,seg,rings));return addMesh(parent,g,material,v3(x,y,z),null,v3(sx,sy,sz),false,false)}
function cylinder(parent,rt,rb,h,material,x,y,z,segments=16){segments=isMobileLayout()?Math.min(segments,10):segments;const g=cachedGeometry(`c:${rt}:${rb}:${h}:${segments}`,()=>new THREE.CylinderGeometry(rt,rb,h,segments));return addMesh(parent,g,material,v3(x,y,z),null,null,false,false)}
function torus(parent,r,t,material,x,y,z,rx=0,ry=0,rz=0){const radial=isMobileLayout()?20:32,tubular=isMobileLayout()?6:8;const g=cachedGeometry(`t:${r}:${t}:${tubular}:${radial}`,()=>new THREE.TorusGeometry(r,t,tubular,radial));return addMesh(parent,g,material,v3(x,y,z),v3(rx,ry,rz),null,false,false)}
function addLight(parent,color,intensity,distance,x,y,z,decay=2){const l=new THREE.PointLight(color,intensity,distance,decay);l.position.set(x,y,z);parent.add(l);return l;}
function setObjective(text){objective=text;$('objective-text').textContent=text;}
function transitionTo(action){if(transitioning)return;transitioning=true;const cover=$('scene-fade');cover.classList.add('show');setTimeout(()=>{action();setTimeout(()=>{cover.classList.remove('show');transitioning=false;},180);},430);}
function setChapter(chapter,location){$('chapter-name').textContent=chapter;$('location-name').textContent=location;}
function showToast(text,duration=2600){$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=duration;}
function updateHealth(){ $('health-fill').style.width=`${health}%`; $('health-value').textContent=`${Math.ceil(health)} / 100`; }
function updateSlots(){
  const owned={1:inventory.lighter,2:inventory.carbine,3:inventory.portal};
  const slots=[...document.querySelectorAll('.slot')];let firstOwned=0;
  for(const slot of slots){const n=Number(slot.dataset.slot),has=!!owned[n];slot.classList.toggle('hidden',!has);slot.style.display=has?'flex':'none';slot.setAttribute('aria-hidden',String(!has));if(has&&!firstOwned)firstOwned=n;}
  if(!owned[selectedSlot])selectedSlot=firstOwned||0;
  slots.forEach(slot=>slot.classList.toggle('active',Number(slot.dataset.slot)===selectedSlot&&!!owned[Number(slot.dataset.slot)]));
  $('inventory').classList.toggle('hidden',!firstOwned);
  if(weaponRig)weaponRig.visible=(phase==='basement'||phase==='garden')&&inventory.carbine&&selectedSlot===2;
  if(lighterRig)lighterRig.visible=(phase==='church'||phase==='basement')&&inventory.lighter&&selectedSlot===1;
  if(portalRig)portalRig.visible=(phase==='church'||phase==='basement'||phase==='garden')&&inventory.portal&&selectedSlot===3;
}
function setPhase(next){phase=next;sceneTime=0;velocity.set(0,0,0);touchMoveX=0;touchMoveY=0;interactables=[];colliders=[];enemies=[];projectiles=[];portalShots=[];portalShotCooldown=0;particles=[];flightEnemies=[];flightShots=[];animatedObjects=[];currentInteract=null;portalTrigger=null;syncTouchHUD();}
function clearWorld(){while(world.children.length){const child=world.children[0];world.remove(child);child.traverse?.(o=>{if(o.geometry&&!o.geometry.userData.krovShared)o.geometry.dispose();if(o.material){const list=Array.isArray(o.material)?o.material:[o.material];for(const m of list){if(!m.userData.krovShared)m.dispose();}}});}candleLight=null;candleFlame=null;portalMesh=null;portalTrigger=null;portalShots=[];pulseLights=[];}
function baseScene(color,fogColor,fogDensity){
  for(const child of [...scene.children])if(child.isLight)scene.remove(child);
  scene.background=new THREE.Color(color);scene.fog=new THREE.FogExp2(fogColor,fogDensity);
  const hemi=new THREE.HemisphereLight(0xb9c7d8,0x28252a,.88);scene.add(hemi);
  const moon=new THREE.DirectionalLight(0xa9bfd4,.62);moon.position.set(-18,28,14);moon.castShadow=false;scene.add(moon);
  const fill=new THREE.AmbientLight(0x85909b,.24);scene.add(fill);
}
function plane(parent,w,d,material,x=0,y=0,z=0){const geo=cachedGeometry(`p:${w}:${d}`,()=>new THREE.PlaneGeometry(w,d));const p=addMesh(parent,geo,material,v3(x,y,z),v3(-Math.PI/2,0,0),null,false,false);return p;}
function addInteract(mesh,name,action,range=2.25,kind='object'){const entry={mesh,name,action,range,kind,position:mesh.getWorldPosition(v3()),enabled:true};interactables.push(entry);return entry;}
function registerAnimated(object,type='pickup',amplitude=.08,speed=1){object.userData.animBaseY=object.position.y;object.userData.animBaseRot=object.rotation.y;animatedObjects.push({object,type,amplitude,speed,phase:rand(0,Math.PI*2)});return object;}
function collectPickup(object,color=0xc9efc8){
  const entry=interactables.find(item=>item.mesh===object);if(entry)entry.enabled=false;
  object.userData.collecting=true;animatedObjects.push({object,type:'collect',elapsed:0,duration:.28,startScale:object.scale.clone(),color});
  spawnImpact(object.getWorldPosition(v3()),color);pickupPulse=.28;playSfx('pickup');
}
function playPourEffect(color){
  if(!deadAlien)return;const forward=camera.getWorldDirection(v3());const start=camera.position.clone().add(forward.multiplyScalar(.48)).add(v3(.16,-.1,0));const end=deadAlien.position.clone().add(v3(0,1.2,0));const mid=start.clone().lerp(end,.48).add(v3(0,.95,.15));const curve=new THREE.QuadraticBezierCurve3(start,mid,end);const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.72});const stream=addMesh(world,new THREE.TubeGeometry(curve,18,.025,7,false),material,v3(0,0,0),null,null,false,false);stream.userData.life=.55;stream.userData.disposeMaterial=true;particles.push(stream);for(let i=0;i<9;i++){const p=sphere(world,.035,mat(color,.18,0,{emissive:color,emissiveIntensity:1.7,transparent:true,opacity:1}),start.x,start.y,start.z,.8,1.2,.8);p.userData.disposeMaterial=true;p.userData.life=rand(.24,.5);p.userData.velocity=end.clone().sub(start).normalize().multiplyScalar(rand(3,6)).add(v3(rand(-.7,.7),rand(-.2,.6),rand(-.7,.7)));particles.push(p);}spawnImpact(end,color);
}
function addCollider(x,z,w,d){colliders.push({x,z,w,d});}
function blocked(x,z,radius=.35){for(const c of colliders){if(Math.abs(x-c.x)<c.w/2+radius&&Math.abs(z-c.z)<c.d/2+radius)return true;}return false;}
function movePlayer(dt){const speed=(keys.ShiftLeft||keys.ShiftRight||touchSprint)?6.1:3.85;tmpDir.set(-Math.sin(yaw),0,-Math.cos(yaw));tmpRight.set(Math.cos(yaw),0,-Math.sin(yaw));tmpMove.set(0,0,0);if(keys.KeyW||keys.ArrowUp)tmpMove.add(tmpDir);if(keys.KeyS||keys.ArrowDown)tmpMove.sub(tmpDir);if(keys.KeyD||keys.ArrowRight)tmpMove.add(tmpRight);if(keys.KeyA||keys.ArrowLeft)tmpMove.sub(tmpRight);if(Math.abs(touchMoveY)>.025)tmpMove.addScaledVector(tmpDir,touchMoveY);if(Math.abs(touchMoveX)>.025)tmpMove.addScaledVector(tmpRight,touchMoveX);if(tmpMove.lengthSq()>1)tmpMove.normalize();tmpMove.multiplyScalar(speed);velocity.x=THREE.MathUtils.damp(velocity.x,tmpMove.x,11,dt);velocity.z=THREE.MathUtils.damp(velocity.z,tmpMove.z,11,dt);let nx=player.x+velocity.x*dt,nz=player.z+velocity.z*dt;if(phase==='garden'){nx=clamp(nx,-28,28);nz=clamp(nz,-31,31);}else if(phase==='basement'){nx=clamp(nx,-7.2,7.2);nz=clamp(nz,-11.8,11.8);}else{nx=clamp(nx,-8.2,8.2);nz=clamp(nz,-14.2,14.2);}if(!blocked(nx,player.z))player.x=nx;else velocity.x=0;if(!blocked(player.x,nz))player.z=nz;else velocity.z=0;player.y=1.65;}
function setCameraFPS(dt=0){const speed=Math.hypot(velocity.x,velocity.z);const bob=speed>.18?Math.sin(sceneTime*(touchSprint||keys.ShiftLeft?11:8.5))*Math.min(speed/6,1)*.018:0;camera.position.set(player.x,player.y+bob,player.z);const kick=(phase==='garden'||phase==='basement')?weaponRecoil*.055:0;camera.rotation.set(pitch+kick,yaw,0,'YXZ');}
function addFloor(w,d,colorOrMat=mat('#303136'),x=0,z=0){const m=typeof colorOrMat==='string'?mat(colorOrMat):colorOrMat;return plane(world,w,d,m,x,0,z);}
function addWall(w,h,d,material,x,y,z){const o=box(world,w,h,d,material,x,y,z);addCollider(x,z,w,d);return o;}
function addArch(parent,x,y,z,r,material){const geo=new THREE.TorusGeometry(r,.16,10,32,Math.PI);const o=addMesh(parent,geo,material,v3(x,y,z),v3(0,0,Math.PI));return o;}

// -------------------- INTRO / EXTERIOR --------------------
function buildCathedral(parent,x,z,scale=1){
  const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);parent.add(g);
  const stone=mat('#c3c2bd'), trim=mat('#e0ddd5'), shadow=mat('#757a81'), gold=mat('#9b8358',.42,.55), door=mat('#272a30');
  box(g,13,8.2,8,stone,0,4.1,0);box(g,14,.35,8.8,trim,0,8.15,0);box(g,9,1.5,8.5,trim,0,8.9,0);
  // Facade pilasters, deep portals and circular windows.
  for(let x1 of [-5.2,-2.8,0,2.8,5.2]){box(g,.42,7.2,.56,trim,x1,4.1,4.15);box(g,.7,.35,.75,trim,x1,7.75,4.15);box(g,.7,.35,.75,trim,x1,.55,4.15);}
  for(let x1 of [-4.3,-1.8,1.8,4.3]){const w=sphere(g,.55,shadow,x1,5.7,4.18,1,1,.12);sphere(g,.35,mat('#393e47'),x1,5.7,4.28,1,1,.08);}
  // Main arched entrance.
  box(g,2.6,4.4,.25,door,0,2.2,4.24);addArch(g,0,4.35,4.25,1.3,trim);box(g,2.9,.18,.5,gold,0,4.2,4.36);
  for(let s of [-1,1]){box(g,.35,3.8,.45,trim,s*1.55,2,4.2);cylinder(g,.22,.22,.35,trim,s*1.55,4,4.2);}
  // Central drum and dome.
  cylinder(g,2.65,2.9,2.2,trim,0,10,0,40);for(let i=0;i<16;i++){let a=i*Math.PI/8;const c=box(g,.18,1.55,.35,trim,Math.sin(a)*2.52,10.05,Math.cos(a)*2.52);c.rotation.y=a;}
  const dome=addMesh(g,new THREE.SphereGeometry(2.8,32,20,0,Math.PI*2,0,Math.PI/2),mat('#aaa79d'),v3(0,11.2,0),null,v3(1,1.1,1));
  torus(g,2.65,.1,gold,0,10.65,0);
  cylinder(g,.09,.09,2.2,gold,0,14.1,0,12);sphere(g,.12,gold,0,15.2,0,.65,1,.65);
  // Smaller corner domes and bell towers.
  for(const [sx,sz] of [[-5.1,2.7],[5.1,2.7],[-5.1,-2.7],[5.1,-2.7]]){
    cylinder(g,.92,1.12,1.45,trim,sx,9.2,sz,24);const d=addMesh(g,new THREE.SphereGeometry(1.05,24,16,0,Math.PI*2,0,Math.PI/2),mat('#a8a398'),v3(sx,10.05,sz),null,v3(1,1,1));cylinder(g,.045,.045,1.2,gold,sx,11.1,sz,8);
  }
  // Side windows / stone bands.
  for(let side of [-1,1])for(let z1 of [-2.5,0,2.5]){box(g,.2,4.4,.85,trim,side*6.57,4.2,z1);box(g,.22,2.1,.62,shadow,side*6.69,4.7,z1);}
  return g;
}
function buildIntro(){clearWorld();setPhase('intro');baseScene('#7d8794','#8d97a5',.012);scene.fog.color.set('#8e98a8');scene.fog.density=.012;
  const ground=mat('#555b64');plane(world,180,180,ground,0,-.25,-5);
  // River and embankment.
  const river=mat('#202a35',.18,.5);plane(world,180,34,river,0,-.15,24);
  for(let i=0;i<(isMobileLayout()?24:48);i++){const l=box(world,rand(.15,.8),.018,rand(.4,1.5),mat('#73818a',.3,.2,{transparent:true,opacity:.25}),rand(-42,42),-.04,rand(10,39));l.rotation.y=rand(0,Math.PI);}
  box(world,100,1.4,1.4,mat('#666b70'),0,.35,6);box(world,100,.2,1.8,mat('#85878a'),0,1.1,6);
  // Cathedral is the main distant silhouette.
  const cathedral=buildCathedral(world,-9,-7,.96);cathedral.rotation.y=-.18;
  // Winter trees on the river bank.
  for(let i=0;i<(isMobileLayout()?12:20);i++){let x=rand(-33,33),z=rand(-3,4);if(x>-18&&x<3)continue;const trunk=cylinder(world,.08,.16,2.8,mat('#292b30'),x,1.4,z,7);for(let j=0;j<5;j++){const branch=cylinder(world,.025,.08,rand(1.5,2.5),mat('#303238'),x+rand(-.7,.7),rand(2.2,3.6),z+rand(-.7,.7),6);branch.rotation.z=rand(-.8,.8);}}
  // Steel pedestrian bridge across the frame.
  const bridge=new THREE.Group();bridge.position.set(10,0,-1);bridge.rotation.y=-.12;world.add(bridge);
  box(bridge,28,.38,2.8,mat('#25292e',.45,.65),0,5.4,0);box(bridge,28,.14,2.9,mat('#b6a06a',.4,.5,{emissive:'#735d32',emissiveIntensity:.65}),0,5.65,0);
  for(let x=-13;x<=13;x+=1.15){box(bridge,.07,1.45,.07,mat('#25292d',.55,.6),x,6.25,-1.27);box(bridge,.07,1.45,.07,mat('#25292d',.55,.6),x,6.25,1.27);}
  for(let x=-14;x<=14;x+=2.3){box(bridge,.09,.16,3,mat('#b9a16a',.35,.45,{emissive:'#8c6e37',emissiveIntensity:.9}),x,6.95,0);}
  const archCurve=new THREE.QuadraticBezierCurve3(v3(-14,0,0),v3(0,3.3,0),v3(14,0,0));
  for(const side of [-1,1]){const path=archCurve.getPoints(56).map(p=>v3(p.x,p.y+5.4,side*1.08));const curve=new THREE.CatmullRomCurve3(path);addMesh(bridge,new THREE.TubeGeometry(curve,64,.105,10,false),mat('#3a4245',.34,.72),v3(0,0,0));}
  // Repeated hangers and diagonal web members make the illuminated bridge read as steelwork, not a flat slab.
  for(let x=-13;x<=13;x+=1.05){const rise=3.3*(1-(x/14)**2),height=Math.max(.12,rise);for(const side of [-1,1]){box(bridge,.055,height,.055,mat('#353c40',.4,.72),x,5.4+height/2,side*1.08);if(Math.abs(x)<12){const next=x+1.05,nextRise=3.3*(1-(next/14)**2);const brace=box(bridge,.045,Math.hypot(1.05,nextRise-rise),.045,mat('#343b3f',.4,.72),(x+next)/2,5.4+(rise+nextRise)/2,side*1.08);brace.rotation.z=Math.atan2(nextRise-rise,1.05);}}}
  for(let x=-13;x<=13;x+=2.2){const cross=box(bridge,.06,.06,2.2,mat('#4a5051',.38,.68),x,5.18,0);}
  // Fine bridge lamps.
  for(let x=-12;x<=12;x+=4){cylinder(bridge,.045,.065,2.2,mat('#25292e'),x,7.1,0,8);sphere(bridge,.14,mat('#e2bd76',.25,0,{emissive:'#ffce75',emissiveIntensity:2}),x,8.25,0,.8,1,.8);addLight(bridge,0xffc56e,.7,8,x,8.1,0);}
  // Distant city silhouettes.
  for(let i=0;i<22;i++){let x=rand(-48,48),z=rand(-30,-20),h=rand(5,15);box(world,rand(3,7),h,rand(3,5),mat(i%3?'#69717c':'#545d67'),x,h/2,z);}
  // The incoming saucer, suspended in the haze.
  const saucer=createUFO();saucer.position.set(12,18,-20);saucer.scale.setScalar(.85);world.add(saucer);saucer.userData.intro=true;
  // Weather particles.
  for(let i=0;i<210;i++){const p=sphere(world,.025,mat('#cfd4dd',.4,0,{transparent:true,opacity:rand(.15,.55)}),rand(-42,42),rand(0,25),rand(-20,34));p.userData.fall=rand(2,7);particles.push(p);}
  camera.position.set(2,5.1,33);camera.lookAt(-5,8,-6);camera.rotation.order='YXZ';
  introTime=0;
  $('intro-copy').classList.add('hidden');$('intro-copy').classList.add('active');$('hud').classList.add('hidden');$('ending-screen').classList.add('hidden');
}
function createLightning(){const pts=[];let x=-7,y=20,z=-6;pts.push(v3(x,y,z));for(let i=0;i<10;i++){x+=rand(-1.1,1.1);y-=rand(1,2.6);z+=rand(-.5,.5);pts.push(v3(x,y,z));}const geo=new THREE.BufferGeometry().setFromPoints(pts);const bolt=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xbaff8b,transparent:true,opacity:1}));world.add(bolt);const flash=addLight(world,0x8bff80,24,40,-8,8,-5);const pulse=addLight(world,0xff4440,5,18,-8,8,-5);setTimeout(()=>{world.remove(bolt);world.remove(flash);world.remove(pulse);},520);for(let i=0;i<18;i++){const p=sphere(world,rand(.05,.16),i%2?M.glowGreen:M.glowRed,-8+rand(-2,2),rand(7,14),-5+rand(-2,2));p.userData.life=rand(.25,.6);particles.push(p);}}

// -------------------- CHURCH INTERIOR --------------------
function makeStainedGlassTexture(seed=0){
  const c=document.createElement('canvas');c.width=256;c.height=512;const ctx=c.getContext('2d');
  ctx.fillStyle='#17191e';ctx.fillRect(0,0,256,512);
  const cols=['#526c75','#7f4b50','#a17c48','#53695f','#a6a092'];
  for(let y=0;y<8;y++)for(let x=0;x<4;x++){const pad=7;ctx.fillStyle=cols[(x+y+seed)%cols.length];ctx.globalAlpha=.72;ctx.fillRect(x*64+pad,y*64+pad,50,50);ctx.globalAlpha=.2;ctx.fillStyle='#eff0df';ctx.fillRect(x*64+pad+4,y*64+pad+4,5,42);}
  ctx.globalAlpha=1;ctx.strokeStyle='#26282a';ctx.lineWidth=10;ctx.strokeRect(4,4,248,504);ctx.lineWidth=5;for(let x=64;x<256;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}for(let y=64;y<512;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
function addChurchWindow(x,z,side,index){
  const frame=mat('#4d443b',.65,.12),glass=new THREE.MeshStandardMaterial({map:makeStainedGlassTexture(index),emissive:'#24333c',emissiveIntensity:.42,roughness:.32,side:THREE.DoubleSide});
  box(world,.22,3.65,1.72,frame,x,5.1,z);
  const pane=addMesh(world,new THREE.PlaneGeometry(1.42,3.28),glass,v3(x+(side<0?.13:-.13),5.1,z),v3(0,side<0?Math.PI/2:-Math.PI/2,0),null,false,true);
  box(world,.28,3.85,.12,mat('#8c806d'),x,5.1,z);box(world,.32,.12,1.85,mat('#8c806d'),x,3.24,z);box(world,.32,.12,1.85,mat('#8c806d'),x,6.96,z);
}
function addNaveArch(z){
  const pts=[v3(-8.2,7.2,z),v3(-7.4,8.3,z),v3(-5.8,9.15,z),v3(-3.5,9.75,z),v3(0,9.95,z),v3(3.5,9.75,z),v3(5.8,9.15,z),v3(7.4,8.3,z),v3(8.2,7.2,z)];
  const curve=new THREE.CatmullRomCurve3(pts);addMesh(world,new THREE.TubeGeometry(curve,48,.16,10,false),mat('#77756f',.72),v3(0,0,0));
}
function buildChurch(){
  clearWorld();setPhase('church');baseScene('#20242b','#20242a',.012);scene.add(new THREE.AmbientLight(0x73808e,.25));
  const floorMat=mat('#504c47',.94,0,{map:pavingTex,bumpMap:pavingTex,bumpScale:.075}),wallMat=mat('#a7a194',.94,0,{map:stoneTex,bumpMap:stoneTex,bumpScale:.055}),trim=mat('#d1c8b6',.78,0,{map:stoneTex}),wood=mat('#382a26',.8,0,{map:woodTex,bumpMap:woodTex,bumpScale:.08}),dark=mat('#17191c',.94);
  plane(world,18,30,floorMat,0,0,0);box(world,18,.42,30,dark,0,-.24,0);
  // Tall plaster nave, pilasters and a shallow barrel vault.
  addWall(18,9.2,.55,wallMat,0,4.6,-15);addWall(18,9.2,.55,wallMat,0,4.6,15);addWall(.55,9.2,30,wallMat,-9,4.6,0);addWall(.55,9.2,30,wallMat,9,4.6,0);
  box(world,17.5,.35,29,mat('#5c5b58'),0,9.05,0);
  for(let z=-12;z<=12;z+=4){
    for(const x of [-7.9,7.9]){
      cylinder(world,.46,.55,7.6,trim,x,3.85,z,20);for(let y=.5;y<7.5;y+=1.35)torus(world,.48,.035,mat('#8c8679'),x,y,z,Math.PI/2,0,0);
      box(world,1.1,.42,1.1,trim,x,7.85,z);box(world,1.35,.18,1.35,mat('#817b70'),x,8.12,z);
    }
    addNaveArch(z);
  }
  // Inlaid floor runner and alternating stone slabs.
  box(world,3.4,.025,24,mat('#59423a',.9,0,{map:woodTex}),0,.025,0);
  // The floor plane already uses a tiled stone map; avoid a separate mesh for every slab.
  // Stained-glass clerestory windows, visible as cool colour bands through the nave.
  let winIndex=0;for(const side of [-1,1])for(let z=-10;z<=10;z+=5){addChurchWindow(side*8.68,z,side,winIndex++);}
  // Orthodox icon wall and sanctuary: layered timber, gilded borders and candle rows.
  box(world,11,5.5,.65,wood,0,2.75,-13.7);box(world,11,.2,.78,M.gold,0,5.55,-13.67);
  for(let x=-4.7;x<=4.7;x+=1.55){box(world,1.27,3.8,.12,mat('#4c3931'),x,2.8,-13.3);box(world,1.12,3.55,.035,mat('#8a7354',.75,.1),x,2.8,-13.2);box(world,.06,3.55,.05,M.gold,x-.61,2.8,-13.14);box(world,.06,3.55,.05,M.gold,x+.61,2.8,-13.14);sphere(world,.24,M.gold,x,4.65,-13.12,.8,1.2,.12);}
  box(world,.12,3.9,.17,M.gold,0,7.7,-13.1);box(world,2.1,.12,.16,M.gold,0,8.4,-13.1);sphere(world,.2,M.gold,0,9.05,-13.1,.8,1.1,.8);
  // Carved pews with end caps and kneelers.
  for(let z=-7;z<=7;z+=3.5)for(const x of [-5.2,5.2]){
    box(world,3.15,.42,.68,wood,x,.82,z);box(world,3.2,.16,.74,mat('#5b4034',.72,0,{map:woodTex}),x,1.12,z+.05);box(world,3.1,.16,.3,wood,x,1.52,z-.24);
    for(const dx of [-1.35,1.35]){box(world,.18,1.35,.72,wood,x+dx,.72,z);sphere(world,.12,M.gold,x+dx,.95,z+.39,.8,1,.4);}
    addCollider(x,z,3.2,.8);
  }
  // Hanging iron chandeliers with warm bulbs illuminate just their pools of space.
  for(const z of [-6,2,10]){const ring=torus(world,1.18,.07,mat('#655747',.45,.58),0,7.3,z);cylinder(world,.045,.045,2.4,mat('#403a33'),0,8.55,z,8);for(let i=0;i<8;i++){const a=i*Math.PI/4;sphere(world,.09,M.warm,Math.cos(a)*1.03,7.3,z+Math.sin(a)*1.03,.9,1.1,.9);}addLight(world,0xffc17a,.62,8,0,7.15,z);}
  // Lectern, candle, lighter and the alien-script book are physical readable props.
  const lectern=box(world,1.25,1.2,1.05,mat('#645d53',.9,0,{map:stoneTex}),1.2,.6,-6.8);box(world,1.48,.15,1.25,trim,1.2,1.28,-6.8);cylinder(world,.075,.085,.42,mat('#d8c8a9'),.9,1.56,-6.8,14);
  candleFlame=sphere(world,.065,mat('#ffe9b5',.18,0,{emissive:'#ffb84d',emissiveIntensity:4}),.9,1.83,-6.8,.7,1.8,.7);candleLight=addLight(world,0xffb96d,2.25,11,.9,1.95,-6.8);candleLight.userData.flicker=true;
  const lighter=new THREE.Group();lighter.position.set(1.55,1.41,-6.76);box(lighter,.22,.34,.1,mat('#9ea2a2',.24,.78),0,.15,0);box(lighter,.2,.09,.12,mat('#c6b98d',.28,.7),0,.35,0);box(lighter,.08,.03,.13,mat('#33383a',.3,.5),0,.4,-.005);sphere(lighter,.028,M.glowRed,0,.23,.057,.8,.8,.3);world.add(lighter);registerAnimated(lighter,'pickup',.035,1.6);
  addInteract(lighter,'ЗАБРАТЬ ЗАЖИГАЛКУ',()=>{if(!inventory.lighter){inventory.lighter=true;collectPickup(lighter,0xffd18b);equipPulse=.42;showToast('ЗАЖИГАЛКА ДОБАВЛЕНА В ИНВЕНТАРЬ');selectedSlot=1;updateSlots();setObjective('Прочитать книгу на аналое.');}else showToast('ЗАЖИГАЛКА УЖЕ У ВАС');},2.5,'pickup');
  const book=new THREE.Group();book.position.set(.45,1.41,-6.82);box(book,.78,.12,.62,mat('#322826',.76,0,{map:woodTex}),0,0,0);box(book,.035,.13,.6,mat('#bba77a'),-.37,.01,0);box(book,.66,.008,.5,mat('#bcb39b'),.02,.067,0);for(let i=0;i<6;i++)box(book,.36,.006,.012,mat('#514a3e'),.02,.074,-.19+i*.075);registerAnimated(book,'book',.012,.8);world.add(book);
  const rune=torus(world,.7,.05,M.glowGreen,0,.22,-11.9,Math.PI/2,0,0);rune.visible=false;
  addInteract(book,'ПРОЧИТАТЬ КНИГУ',()=>{if(!bookRead){bookRead=true;rune.visible=true;hatchGlow.intensity=1.4;hatchInteract.enabled=true;showToast('ЗНАКИ НЕ ПОХОЖИ НИ НА ОДИН ЧЕЛОВЕЧЕСКИЙ АЛФАВИТ');setObjective('Свеча зажгла метку у входа в подвал.');playSfx('pickup');}else showToast('СИМВОЛЫ МЕНЯЮТСЯ, ПОКА ТЫ НА НИХ СМОТРИШЬ.');},2.5,'book');
  // Concealed trapdoor is not interactable until the book has been examined.
  const hatch=box(world,2.45,.18,2.25,wood,0,.08,-12);hatch.rotation.y=.04;const hatchGlow=addLight(world,0x9effa1,0,5,0,.6,-12);
  for(let i=0;i<8;i++){const step=box(world,2.1,.18,.52,mat('#3a3834'),0,.14+i*.08,-10.2-i*.43);step.rotation.x=-.03;}
  const hatchInteract=addInteract(hatch,'СПУСТИТЬСЯ В ПОДВАЛ',()=>{if(!bookRead){showToast('СНАЧАЛА ПРОЧИТАЙ КНИГУ.');return;}transitionTo(()=>{buildBasement();showToast('НИЖНИЙ УРОВЕНЬ / СЕКТОР −01');});},2.8,'door');hatchInteract.enabled=false;
  for(let i=0;i<52;i++){const p=sphere(world,rand(.009,.02),mat('#ead4ad',.3,0,{transparent:true,opacity:.26}),rand(-4,4),rand(.5,7),rand(-11,-4));p.userData.dust=true;particles.push(p);}
  // A cool shaft through the entry and warm candlelight create readable contrast, not crushed blacks.
  const entryFill=addLight(world,0x829bb8,1.05,20,0,6,10);const altarFill=addLight(world,0xffd19a,.58,15,0,4,-11);const sideFill=addLight(world,0x8c9aa8,.42,12,-7,5,-1);
  // Dust-lit shafts from high stained glass; subtle volumetric geometry keeps the nave readable.
  for(const side of [-1,1])for(const z of [-8,2,10]){const beamMat=new THREE.MeshBasicMaterial({color:side<0?0x9cb7d0:0xc6a68a,transparent:true,opacity:.035,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});const beam=addMesh(world,new THREE.ConeGeometry(2.35,7.2,18,1,true),beamMat,v3(side*7.5,4.25,z),null,null,false,false);beam.quaternion.setFromUnitVectors(v3(0,1,0),v3(-side*.58,-.78,.08).normalize());}
  for(const side of [-1,1])for(const z of [-10,0,10])addLight(world,side<0?0x8bb6cf:0xd5a07b,.34,8,side*7.6,5.1,z);
  player.set(0,1.65,10.3);yaw=0;pitch=0;setCameraFPS();setChapter('ГЛАВА 01 / ХРАМ','ХРАМ ХРИСТА СПАСИТЕЛЯ');setObjective('Осмотреть церковь. Найти зажигалку и прочитать книгу.');
  $('hud').classList.remove('hidden');$('intro-copy').classList.add('hidden');$('flight-hud').classList.add('hidden');$('shift-prompt').classList.add('hidden');$('crosshair').classList.remove('hidden');updateSlots();
  if(!inventory.lighter)selectedSlot=0;
}

function buildBasement(){clearWorld();setPhase('basement');baseScene('#171a1d','#17191c',.014);scene.add(new THREE.AmbientLight(0x727b83,.28));
  const concrete=mat('#696762',.96,0,{map:concreteTex,bumpMap:concreteTex,bumpScale:.07}), floor=mat('#343638',.94,0,{map:pavingTex,bumpMap:pavingTex,bumpScale:.06}), metal=mat('#454b4f',.5,.58), brick=mat('#57443d',.96,0,{map:brickTex,bumpMap:brickTex,bumpScale:.07});
  plane(world,16,26,floor,0,0,0);box(world,16,.5,26,concrete,0,-.28,0);box(world,16,.5,26,concrete,0,5.1,0);
  addWall(16,5,.5,brick,0,2.5,-13);addWall(16,5,.5,concrete,0,2.5,13);addWall(.5,5,26,brick,-8,2.5,0);addWall(.5,5,26,concrete,8,2.5,0);
  // Exposed brick, service conduits and old municipal infrastructure.
  for(let side of [-1,1]){
    const pipe=cylinder(world,.12,.12,22,metal,side*6.9,4.4,0,12);pipe.rotation.x=Math.PI/2;
    const thin=cylinder(world,.045,.045,22,mat('#74716a',.5,.6),side*6.45,4.75,0,8);thin.rotation.x=Math.PI/2;
    for(let z=-8;z<=8;z+=4){box(world,.4,.2,.5,metal,side*6.9,3.9,z);box(world,.16,.18,.18,mat('#7b7060'),side*6.45,4.75,z);}
    for(let z=-10;z<=10;z+=5){box(world,.38,4.8,.38,brick,side*7.65,2.4,z);box(world,.5,.18,.5,metal,side*7.65,4.85,z);}
  }
  // Floor drains, cable trays, warning labels and a low service bench.
  for(let z=-10;z<=10;z+=5){box(world,2.4,.025,.72,mat('#1d2224',.4,.7),0,.018,z);for(let i=-5;i<=5;i++)box(world,.035,.028,.68,metal,i*.2,.04,z);}
  box(world,2.6,.08,.75,metal,-5.3,.08,5.8);for(let i=0;i<7;i++)box(world,.08,.6,.08,mat('#514b40'),-6.4+i*.36,.38,5.8);
  const controlPanel=box(world,.95,1.25,.12,mat('#343b3c',.48,.4),7.55,2.1,-8);box(world,.7,.7,.035,mat('#192322',.35,.2,{emissive:'#102520',emissiveIntensity:.3}),7.48,2.2,-7.91);for(let i=0;i<4;i++)sphere(world,.06,i%2?M.glowRed:M.glowGreen,7.2+i*.19,2.28,-7.86,.8,.8,.4);
  const warning=makeWallText('SECTOR 09  /  KEEP OUT','#d1b37b');addMesh(world,new THREE.PlaneGeometry(1.8,.45),new THREE.MeshBasicMaterial({map:warning,transparent:true}),v3(7.72,3.25,-8),v3(0,-Math.PI/2,0));
  for(let z=-9;z<=9;z+=6){box(world,.35,.12,.35,metal,0,4.65,z);const lamp=sphere(world,.1,mat('#c49b67',.3,0,{emissive:'#bd7136',emissiveIntensity:1.5}),0,4.5,z);addLight(world,0xff9c54,.55,6,0,4.3,z);box(world,12,.035,.12,mat('#8b8576'),0,.02,z);}
  // Stairwell at the back.
  for(let i=0;i<9;i++){const step=box(world,3,.2,.55,mat('#343536'),0,.15+i*.22,-10+i*.7);}
  box(world,3,.35,1.4,mat('#252629'),0,2.15,-4.1);
  // Dead alien on the examination slab: strange, but not graphic.
  box(world,3.2,.65,2.3,metal,0,.65,-3.6);box(world,3.4,.12,2.5,mat('#686a66'),0,1.03,-3.6);addCollider(0,-3.6,3.2,2.3);
  deadAlien=createAlien(v3(0,1.12,-3.6),false,true);world.add(deadAlien);addInteract(deadAlien,'ИСПОЛЬЗОВАТЬ СОБРАННЫЕ СОСТАВЫ',performRitual,3.0,'ritual');
  // Blood chalice and vial of holy water.
  const chalice=new THREE.Group();chalice.position.set(-4,0,1);world.add(chalice);cylinder(chalice,.14,.23,.34,M.gold,0,.28,0,16);cylinder(chalice,.055,.1,.22,M.gold,0,.06,0,16);cylinder(chalice,.23,.23,.055,M.gold,0,.48,0,20);cylinder(chalice,.18,.18,.02,mat('#4d131c',.25,0,{emissive:'#31050a',emissiveIntensity:.3}),0,.47,0,20);
  registerAnimated(chalice,'pickup',.08,1.1);addInteract(chalice,'ВЗЯТЬ ЧАШУ С КРОВЬЮ',()=>{if(!inventory.blood){inventory.blood=true;collectPickup(chalice,0xb9434d);showToast('ЧАША С КРОВЬЮ ДОБАВЛЕНА');setObjective('Найти святую воду.');updateSlots();}else showToast('ЧАША УЖЕ У ВАС');},2.5,'pickup');
  const bottle=new THREE.Group();bottle.position.set(4,0,1);world.add(bottle);cylinder(bottle,.18,.22,.62,mat('#8a9a9a',.2,.1,{transparent:true,opacity:.72}),0,.34,0,20);cylinder(bottle,.08,.08,.17,M.gold,0,.73,0,16);cylinder(bottle,.12,.12,.04,mat('#d7d0b6'),0,.83,0,16);sphere(bottle,.14,M.blue,0,.25,0,1,.5,1);
  registerAnimated(bottle,'pickup',.07,1.35);addInteract(bottle,'ЗАБРАТЬ СВЯТУЮ ВОДУ',()=>{if(!inventory.water){inventory.water=true;collectPickup(bottle,0x9ddbe4);showToast('СВЯТАЯ ВОДА ДОБАВЛЕНА');setObjective('Вернуться к существу и использовать предметы по порядку.');updateSlots();}else showToast('ВОДА УЖЕ У ВАС');},2.5,'pickup');
  // A hand-painted clue on a wall.
  const sigil=torus(world,.75,.055,M.glowGreen,-5,2.1,-12,0,0,0);sigil.rotation.y=Math.PI/2;
  const runeText=makeWallText('S A  /  09  /  N', '#b1c69a');const sign=addMesh(world,new THREE.PlaneGeometry(2.8,.55),new THREE.MeshBasicMaterial({map:runeText,transparent:true,opacity:.85}),v3(-7.73,2.7,-8),v3(0,Math.PI/2,0));
  for(let x=-6;x<=6;x+=2){box(world,.1,4.6,.1,metal,x,2.3,-12.55);box(world,.12,.08,25,metal,x,4.85,0);}
  const backFill=addLight(world,0x80919b,.48,17,0,3,-10);const slabFill=addLight(world,0x9cb7a6,.42,8,0,3,-3.6);
  player.set(0,1.65,9.5);yaw=0;pitch=0;setCameraFPS();bloodPoured=false;waterPoured=false;setChapter('ГЛАВА 01 / НИЖНИЙ УРОВЕНЬ','ПОДВАЛ');setObjective('Найти чашу с кровью и святую воду.');
}
function makeWallText(text,color='#d8d2c1'){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.clearRect(0,0,512,128);ctx.fillStyle=color;ctx.font='24px monospace';ctx.textAlign='center';ctx.fillText(text,256,70);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}

// -------------------- ALIEN CHARACTER / STORY --------------------
function createAlien(position,hostile=false,lying=false){
  const root=new THREE.Group();root.position.copy(position);
  root.userData.isAlien=true;root.userData.hostile=hostile;root.userData.creatureType=hostile?'stalker':'exile';
  const skin=hostile?M.stalkerSkin:M.friendSkin,plate=hostile?M.stalkerPlate:M.friendPlate;
  const voidMat=M.stalkerVoid,eye=hostile?M.stalkerEye:M.friendEye;

  // Thin, vertically stretched anatomy; only 14 meshes per enemy keep the
  // upgraded silhouettes affordable on phones as well as desktop GPUs.
  const torso=new THREE.Group();torso.position.set(0,1.28,0);torso.rotation.x=hostile?-.15:-.04;root.add(torso);root.userData.torso=torso;
  cylinder(torso,.24,.405,1.25,skin,0,0,0,12);
  box(torso,.43,.62,.14,plate,0,.03,-.18,{rot:v3(-.08,0,0)});
  box(torso,.33,.07,.19,voidMat,0,.12,.08,{rot:v3(.04,0,0)});

  const headPivot=new THREE.Group();headPivot.position.set(0,.9,-.04);headPivot.rotation.x=hostile?-.2:.02;torso.add(headPivot);root.userData.headPivot=headPivot;
  sphere(headPivot,.31,skin,0,.12,0,.76,1.56,.68);
  // Narrow, recessed facial shield instead of a cartoon-like visor.
  sphere(headPivot,.205,voidMat,0,.055,.225,.78,1.35,.22);
  const eyeL=box(headPivot,.105,.018,.024,eye,-.105,.14,.276,{rot:v3(0,0,-.055)});
  const eyeR=box(headPivot,.105,.018,.024,eye,.105,.14,.276,{rot:v3(0,0,.055)});
  eyeL.scale.x=hostile?1.05:.72;eyeR.scale.x=hostile?1.05:.72;
  const brow=box(headPivot,.32,.035,.07,plate,0,.255,.235,{rot:v3(-.08,0,0)});
  const jaw=box(headPivot,.16,.22,.15,voidMat,0,-.18,.22,{rot:v3(.12,0,0)});root.userData.jaw=jaw;
  // Layered neck gill folds and small shoulder armor make the silhouette read as a designed creature.
  for(let i=0;i<3;i++){const rib=torus(torso,.22+i*.035,.018,plate,0,-.12-i*.13,.045,Math.PI/2,0,0);rib.scale.set(1,.72,1);}
  for(const side of [-1,1]){const pauldron=sphere(torso,.17,plate,side*.37,.37,-.03,1.15,.62,1.25);pauldron.rotation.z=side*.24;}


  const arms=[],legs=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*.36,.44,0);torso.add(arm);arms.push(arm);
    const armMesh=cylinder(arm,.055,.125,1.42,skin,0,-.58,0,9);
    armMesh.rotation.z=side*.045;
    const leg=new THREE.Group();leg.position.set(side*.16,-.55,0);torso.add(leg);legs.push(leg);
    const legMesh=cylinder(leg,.065,.125,1.08,skin,0,-.18,0,9);
    legMesh.rotation.z=-side*.025;
  }
  root.userData.arms=arms;root.userData.legs=legs;root.userData.leftArm=arms[0];root.userData.rightArm=arms[1];
  root.userData.animClock=rand(0,5);root.userData.gaitPhase=rand(0,Math.PI*2);

  // Two uneven dorsal spines and one dark trailing membrane create a broken outline.
  for(let i=0;i<2;i++){
    const side=i===0?-1:1;
    const tendon=cylinder(root,.02,.085,.92,plate,side*.22,1.82,-.3,7);
    tendon.rotation.z=side*.34;tendon.rotation.x=-.42;
  }
  const membrane=box(root,.24,.78,.035,hostile?voidMat:plate,0,1.5,-.36,{rot:v3(.16,0,.025)});
  membrane.scale.x=.75;
  if(!hostile){
    torus(root,.15,.022,M.gold,0,1.16,.32,Math.PI/2,0,0);
    box(root,.055,.25,.025,M.friendEye,0,1.16,.35);
  }else{root.userData.eyeMaterial=eye;root.userData.stalkSeed=rand(0,10);}
  if(lying){root.rotation.z=Math.PI/2;root.rotation.y=-.25;root.position.y=.38;root.userData.lying=true;}
  return root;
}
function animateAlien(root,dt,speed=0,moving=false){
  if(!root?.userData?.torso)return;
  const data=root.userData;data.animClock=(data.animClock||0)+dt;const t=data.animClock;
  const hostile=data.creatureType==='stalker';
  const gait=moving?Math.min(1,speed/(hostile?4.2:3.5)):0;
  if(hostile){
    const uneven=Math.sin(t*7.2+data.gaitPhase),counter=Math.sin(t*7.2+data.gaitPhase+Math.PI);
    data.torso.position.y=1.32+Math.abs(uneven)*.055*gait+Math.sin(t*1.7)*.018;
    data.torso.rotation.z=Math.sin(t*3.1+data.gaitPhase)*.045+uneven*.025*gait;
    data.torso.rotation.x=-.13-(gait*.13)+Math.sin(t*2.1)*.025;
    data.arms?.forEach((arm,i)=>{
      const phase=i===0?uneven:counter;
      arm.rotation.x=-.12+phase*.78*gait+(i===0?-.08:.13);
      arm.rotation.z=(i===0?-.08:.1)+Math.sin(t*2+i)*.035;
    });
    data.legs?.forEach((leg,i)=>{leg.rotation.x=Math.sin(t*7.2+i*Math.PI+data.gaitPhase)*.72*gait;});
    if(data.headPivot){
      data.headPivot.rotation.y=Math.sin(t*.63+data.stalkSeed)*.22;
      data.headPivot.rotation.x=-.18+Math.sin(t*1.25+data.stalkSeed)*.09;
      data.headPivot.rotation.z=Math.sin(t*.47+data.stalkSeed)*.045;
    }
    if(data.jaw)data.jaw.rotation.x=.12+Math.sin(t*2.4)*.035;
  }else{
    data.torso.position.y=1.32+Math.sin(t*1.8)*.018;
    data.torso.rotation.z=Math.sin(t*2.1)*.018;
    data.arms?.forEach((arm,i)=>{arm.rotation.x=Math.sin(t*2.2+i*Math.PI)*.12;});
    data.legs?.forEach((leg,i)=>{leg.rotation.x=Math.sin(t*2.2+i*Math.PI)*.06;});
    if(data.aiming&&data.rightArm){
      data.rightArm.rotation.x=THREE.MathUtils.damp(data.rightArm.rotation.x,-1.32,7.5,dt);
      data.rightArm.rotation.z=THREE.MathUtils.damp(data.rightArm.rotation.z,.18,7.5,dt);
    }
    if(data.headPivot){data.headPivot.rotation.y=Math.sin(t*.55)*.12;data.headPivot.rotation.x=Math.sin(t*.8)*.035;}
    if(data.jaw)data.jaw.rotation.x=.025+Math.sin(t*1.8)*.018;
  }
}
function performRitual(){if(!deadAlien)return;if(!inventory.blood&&!bloodPoured){showToast('СНАЧАЛА НУЖНА ЧАША С КРОВЬЮ.');return;}if(inventory.blood&&!bloodPoured){inventory.blood=false;bloodPoured=true;playPourEffect(0x9b2838);showToast('КРОВЬ ПРОЛИТА НА СУЩЕСТВО. ТЕПЕРЬ — СВЯТАЯ ВОДА.');setObjective('Полить существо святой водой.');return;}if(!inventory.water&&!waterPoured){showToast('ТЕПЕРЬ НУЖНА СВЯТАЯ ВОДА.');return;}if(inventory.water&&!waterPoured){inventory.water=false;waterPoured=true;playPourEffect(0x91e2eb);showToast('СВЯТАЯ ВОДА КАСАЕТСЯ КОЖИ.');setTimeout(triggerResurrection,650);}}
function triggerResurrection(){if(!bloodPoured||!waterPoured)return;
  if(deadAlien){deadAlien.visible=false;world.remove(deadAlien);deadAlien=null;interactables=interactables.filter(i=>i.kind!=='ritual');}friendAlien=createAlien(v3(0,0,-3.5),false,false);friendAlien.scale.setScalar(.93);world.add(friendAlien);friendAlien.position.set(0,0,-3.5);
  const aura=sphere(world,.9,M.glowGreen,0,1,-3.5,1,.1,1);aura.material.transparent=true;aura.material.opacity=.24;setTimeout(()=>world.remove(aura),1400);
  showToast('СУЩЕСТВО ВЕРНУЛОСЬ К ЖИЗНИ',3000);beginDialogue('СУЩЕСТВО',[
    'Не двигайся. Ты вернул меня — значит, ещё не всё потеряно.',
    'Вторжение началось здесь. Через эту церковь. Они открыли проход под куполом.',
    'Я был единственным, кто отказался служить им. Поэтому меня и оставили здесь.',
    'Я должен остаться. Но тебе понадобится кое-что получше свечи.',
    'Съешь таблетку. Не задавай вопросов. Она просто позволит увидеть выход.'
  ],()=>{
    showToast('НЕИЗВЕСТНАЯ ТАБЛЕТКА: ПРИНЯТА',2400);
    setTimeout(()=>{inventory.portal=true;inventory.carbine=true;selectedSlot=3;equipPulse=.82;updateSlots();if(portalRig)portalRig.userData.kick=.38;setObjective('Выбрать портальную пушку и выстрелить в стену.');showToast('ПОЛУЧЕНО: АВТОМАТ · ПОРТАЛЬНАЯ ПУШКА. ПКМ / Q — ВЫСТРЕЛ',4600);},500);
  });
}
function beginDialogue(speaker,lines,onDone){dialogueLines=lines;dialogueIndex=0;dialogueDone=onDone;$('dialogue-speaker').textContent=speaker;$('dialogue-text').textContent=lines[0];$('dialogue').classList.remove('hidden');}
function advanceDialogue(){if($('dialogue').classList.contains('hidden'))return;dialogueIndex++;if(dialogueIndex>=dialogueLines.length){$('dialogue').classList.add('hidden');const cb=dialogueDone;dialogueDone=null;if(cb)cb();}else $('dialogue-text').textContent=dialogueLines[dialogueIndex];}
function ensurePortalVortexTexture(){
  if(portalVortexTexture)return portalVortexTexture;
  const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');
  const bg=ctx.createRadialGradient(256,256,10,256,256,260);bg.addColorStop(0,'#071d24');bg.addColorStop(.38,'#123b42');bg.addColorStop(.72,'#07171d');bg.addColorStop(1,'#020609');ctx.fillStyle=bg;ctx.fillRect(0,0,512,512);
  for(let i=0;i<9;i++){const r=38+i*23;ctx.beginPath();ctx.arc(256,256,r,Math.PI*.08+i*.12,Math.PI*1.83+i*.12);ctx.strokeStyle=`rgba(${80+i*3},${190+i*5},${168+i*3},${.34-i*.022})`;ctx.lineWidth=1.5+(i%3);ctx.stroke();}
  ctx.lineCap='round';for(let i=0;i<5;i++){const offset=i*Math.PI*2/5;ctx.beginPath();for(let j=0;j<=90;j++){const a=j/90*Math.PI*3.2+offset,r=22+j*2.25,x=256+Math.cos(a)*r,y=256+Math.sin(a)*r;if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.strokeStyle=i%2?'rgba(151,255,222,.48)':'rgba(197,100,87,.32)';ctx.lineWidth=4.5;ctx.shadowBlur=14;ctx.shadowColor=i%2?'#68ffd3':'#b34744';ctx.stroke();ctx.shadowBlur=0;}
  for(let i=0;i<160;i++){const a=rand(0,Math.PI*2),r=rand(72,245),x=256+Math.cos(a)*r,y=256+Math.sin(a)*r;ctx.fillStyle=i%4?'rgba(178,255,229,.34)':'rgba(243,129,111,.4)';ctx.fillRect(x,y,rand(1,3),rand(1,7));}
  const vignette=ctx.createRadialGradient(256,256,165,256,256,256);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.8)');ctx.fillStyle=vignette;ctx.fillRect(0,0,512,512);
  portalVortexTexture=new THREE.CanvasTexture(c);portalVortexTexture.colorSpace=THREE.SRGBColorSpace;portalVortexTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return portalVortexTexture;
}
function createPortalAt(pos,normal=v3(0,0,1)){
  if(portalMesh){world.remove(portalMesh);interactables=interactables.filter(it=>it.mesh!==portalTrigger);if(portalTrigger)world.remove(portalTrigger);}
  const g=new THREE.Group();g.position.copy(pos);g.quaternion.setFromUnitVectors(v3(0,0,1),normal.clone().normalize());world.add(g);
  const outer=torus(g,1.13,.085,mat('#5f9f9c',.23,.3,{emissive:'#287c83',emissiveIntensity:2.25}),0,0,0);
  torus(g,.98,.035,mat('#d8a78b',.2,.2,{emissive:'#ac5539',emissiveIntensity:1.6}),0,0,.012);
  const inner=torus(g,.84,.018,mat('#7ff0d1',.18,.2,{emissive:'#3dbb9e',emissiveIntensity:1.5}),0,0,.025);
  const discMaterial=new THREE.MeshBasicMaterial({color:0x9bffe2,transparent:true,opacity:.88,side:THREE.DoubleSide,depthWrite:false});
  const disc=addMesh(g,cachedGeometry('portal:disc',()=>new THREE.CircleGeometry(.88,48)),discMaterial,v3(0,0,.035));
  const vortexMat=new THREE.MeshBasicMaterial({map:ensurePortalVortexTexture(),color:0xc2ffe8,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false});
  const vortex=addMesh(g,cachedGeometry('portal:vortex',()=>new THREE.CircleGeometry(.79,48)),vortexMat,v3(0,0,.045));
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const p=sphere(g,.035,i%2?M.glowGreen:M.glowRed,Math.cos(a)*1.19,Math.sin(a)*1.19,.02,.8,.8,.8);}
  const light=addLight(g,0x4fc5b4,2.5,9,0,0,.4);g.userData.portalDisc=disc;g.userData.vortex=vortex;g.userData.inner=inner;g.userData.light=light;
  portalMesh=g;
  const triggerMat=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});
  portalTrigger=addMesh(world,cachedGeometry('portal:trigger',()=>new THREE.BoxGeometry(1.45,2.0,.35)),triggerMat,pos.clone().add(normal.clone().multiplyScalar(1.32)));
  addInteract(portalTrigger,'ВОЙТИ В ПОРТАЛ',()=>transitionTo(buildGarden),2.9,'portal');
  showToast('ПОРТАЛ СТАБИЛИЗИРОВАН. ПРОХОД ОТКРЫТ.',2600);
}
function firePortalShot(){
  if(phase!=='basement'||!inventory.portal||selectedSlot!==3){if(phase==='garden'&&selectedSlot===3)showToast('ПОРТАЛЬНОЕ УСТРОЙСТВО В ЭТОМ МИРЕ НЕ ОТВЕЧАЕТ.');return;}
  if(portalShotCooldown>0||portalShots.length)return;
  if(portalMesh){showToast('ПОРТАЛ УЖЕ ОТКРЫТ. ВОЙДИ В НЕГО.');return;}
  world.updateMatrixWorld(true);raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const hits=raycaster.intersectObjects(world.children,true);let target=null;
  for(const hit of hits){
    if(hit.distance<1.5||hit.distance>29)continue;
    const object=hit.object;let parent=object,skip=false;
    while(parent&&parent!==world){if(parent.userData?.isAlien||parent.userData?.isPortalTrigger){skip=true;break;}parent=parent.parent;}
    if(skip||!hit.face)continue;
    const normal=hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(object.matrixWorld)).normalize();
    // Portals only attach to substantial vertical architecture, never to floors, props or ceilings.
    if(Math.abs(normal.y)>.34)continue;
    if(object.material?.transparent&&object.material.opacity<.15)continue;
    target={point:hit.point.clone().addScaledVector(normal,.08),normal,distance:hit.distance};break;
  }
  if(!target){showToast('НЕТ ПОДХОДЯЩЕЙ СТЕНЫ. НАВЕДИСЬ НА КАМЕНЬ ИЛИ БЕТОН.',2800);return;}
  const direction=camera.getWorldDirection(v3()),startPoint=camera.position.clone().addScaledVector(direction,.8);
  const bolt=sphere(world,.105,mat('#c8ffe9',.16,.05,{emissive:'#5dffcd',emissiveIntensity:3.7}),startPoint.x,startPoint.y,startPoint.z,1,1,1);
  const glow=addLight(bolt,0x67ffd1,1.8,4,0,0,0);
  const lineGeo=new THREE.BufferGeometry().setFromPoints([startPoint,startPoint]);
  const line=new THREE.Line(lineGeo,new THREE.LineBasicMaterial({color:0x7dffdb,transparent:true,opacity:.9}));world.add(line);
  portalShots.push({mesh:bolt,line,start:startPoint,target:target.point,normal:target.normal,elapsed:0,duration:Math.max(.18,target.distance/38)});
  portalShotCooldown=.7;portalKick=.42;if(portalRig)portalRig.userData.kick=.42;
  playSfx('portal');setObjective('Энергетический заряд летит к точке контакта...');
}
function updatePortalShots(dt){
  for(let i=portalShots.length-1;i>=0;i--){const shot=portalShots[i];shot.elapsed+=dt;const t=clamp(shot.elapsed/shot.duration,0,1);const eased=1-Math.pow(1-t,2);const current=shot.start.clone().lerp(shot.target,eased);
    shot.mesh.position.copy(current);shot.line.geometry.dispose();shot.line.geometry=new THREE.BufferGeometry().setFromPoints([shot.start,current]);
    if(t>=1){world.remove(shot.mesh);world.remove(shot.line);shot.line.material.dispose();portalShots.splice(i,1);spawnImpact(shot.target.clone(),0x79ffda);createPortalAt(shot.target,shot.normal);setObjective('Подойти к порталу и войти в него.');}
  }
  portalShotCooldown=Math.max(0,portalShotCooldown-dt);
}

// -------------------- GARDEN QUARTERS --------------------
function makeResidentialBuilding(x,z,w,d,h,style=0){
  const group=new THREE.Group();group.position.set(x,0,z);world.add(group);addCollider(x,z,w,d);
  const facade=style===0?mat('#805b4d',.92,0,{map:brickTex,bumpMap:brickTex,bumpScale:.07}):style===1?mat('#b7b4aa',.92,0,{map:stoneTex,bumpMap:stoneTex,bumpScale:.045}):mat('#647a78',.62,.12,{map:concreteTex,bumpMap:concreteTex,bumpScale:.035});
  const trim=mat('#b9b5ab',.76,.14),dark=mat('#20272a',.38,.35),glassCold=mat('#31464d',.2,.42,{emissive:'#102329',emissiveIntensity:.3}),glassWarm=mat('#b09266',.25,.18,{emissive:'#9d6731',emissiveIntensity:.48}),balcony=mat('#444b4b',.52,.48);
  box(group,w,h,d,facade,0,h/2,0);
  // Repeated windows and rails are instanced in batches instead of thousands of separate meshes.
  const batches=new Map();
  const detail=(bw,bh,bd,material,px,py,pz,rx=0,ry=0,rz=0)=>{
    const key=`${bw}:${bh}:${bd}:${material.id}`;let batch=batches.get(key);
    if(!batch){batch={w:bw,h:bh,d:bd,material,items:[]};batches.set(key,batch);}
    batch.items.push({x:px,y:py,z:pz,rx,ry,rz});
  };
  const floors=Math.floor((h-2)/2.5),colsFront=Math.max(2,Math.floor(w/2.0)),colsSide=Math.max(2,Math.floor(d/2.0));
  for(let floor=0;floor<floors;floor++){
    const y=1.65+floor*2.42;
    detail(w+.14,.12,d+.14,trim,0,y-.86,0);
    for(let c=0;c<colsFront;c++){
      const xx=-w/2+(c+.5)*w/colsFront;
      for(const face of [-1,1]){
        const zz=face*(d/2+.075);
        detail(1.06,1.42,.09,dark,xx,y,zz);
        detail(.9,1.23,.055,(Math.random()>.68)?glassWarm:glassCold,xx,y,zz+face*.055);
        detail(.055,1.46,.13,trim,xx-.56,y,zz);detail(.055,1.46,.13,trim,xx+.56,y,zz);
        detail(1.16,.055,.13,trim,xx,y-.76,zz);detail(1.16,.055,.13,trim,xx,y+.76,zz);
        if((c+floor+style)%3===0){
          detail(1.24,.12,.8,balcony,xx,y-.78,face*(d/2+.42));
          detail(1.18,.55,.06,balcony,xx,y-.48,face*(d/2+.78));
          for(let k=-2;k<=2;k++)detail(.035,.52,.045,trim,xx+k*.25,y-.48,face*(d/2+.78));
        }
      }
    }
    for(let c=0;c<colsSide;c++){
      const zz=-d/2+(c+.5)*d/colsSide;
      for(const face of [-1,1]){
        const xx=face*(w/2+.075);
        detail(.09,1.42,1.02,dark,xx,y,zz);
        detail(.055,1.23,.87,(Math.random()>.72)?glassWarm:glassCold,xx+face*.055,y,zz);
        detail(.13,1.46,.055,trim,xx,y,zz-.54);detail(.13,1.46,.055,trim,xx,y,zz+.54);
      }
    }
  }
  for(const [key,batch] of batches){
    const geo=cachedGeometry(`b:${batch.w}:${batch.h}:${batch.d}`,()=>new THREE.BoxGeometry(batch.w,batch.h,batch.d));
    const instanced=new THREE.InstancedMesh(geo,batch.material,batch.items.length);
    instanced.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const dummy=new THREE.Object3D();
    batch.items.forEach((item,i)=>{dummy.position.set(item.x,item.y,item.z);dummy.rotation.set(item.rx,item.ry,item.rz);dummy.scale.set(1,1,1);dummy.updateMatrix();instanced.setMatrixAt(i,dummy.matrix);});
    instanced.instanceMatrix.needsUpdate=true;instanced.frustumCulled=true;instanced.computeBoundingSphere();group.add(instanced);
  }
  // Corners, parapet and lobby are unique silhouettes, so keep them as individual architecture.
  for(const xx of [-w/2+.18,w/2-.18])box(group,.18,h+.25,d+.2,trim,xx,h/2,0);
  for(const zz of [-d/2-.08,d/2+.08])box(group,w+.2,.16,.16,trim,0,h-.12,zz);
  box(group,w+.35,.45,d+.35,mat('#454b4b',.7,.28),0,h+.18,0);
  for(let i=-1;i<=1;i++)box(group,.52,.8,.56,mat('#626866',.62,.32),i*w*.22,h+.78,0);
  box(group,w+.4,.28,d+.6,mat('#33383a',.48,.28),0,2.35,d/2+.22);
  const lobbyCols=Math.max(2,Math.floor(w/2.4));
  for(let c=0;c<lobbyCols;c++){const xx=-w/2+(c+.5)*w/lobbyCols;detail(1.45,1.95,.12,dark,xx,1.15,d/2+.08);detail(1.28,1.7,.055,glassWarm,xx,1.15,d/2+.16);}
  for(let side of [-1,1])box(group,.18,2.5,d+.3,trim,side*(w/2+.08),1.25,0);
  if(lobbyCols){
    const lobbyBatch=batches.get(`1.45:1.95:0.12:${dark.id}`);const lobbyGlass=batches.get(`1.28:1.7:0.055:${glassWarm.id}`);
    for(const batch of [lobbyBatch,lobbyGlass])if(batch){const geo=cachedGeometry(`b:${batch.w}:${batch.h}:${batch.d}`,()=>new THREE.BoxGeometry(batch.w,batch.h,batch.d));const inst=new THREE.InstancedMesh(geo,batch.material,batch.items.length);const dmy=new THREE.Object3D();batch.items.forEach((it,i)=>{dmy.position.set(it.x,it.y,it.z);dmy.rotation.set(it.rx,it.ry,it.rz);dmy.updateMatrix();inst.setMatrixAt(i,dmy.matrix);});inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();group.add(inst);}
  }
  return group;
}
function createUFO(){
  const g=new THREE.Group();const hull=mat('#252d33',.28,.76),rim=mat('#8a9695',.24,.72),glass=mat('#5c7d7d',.16,.4,{transparent:true,opacity:.88}),lights=mat('#d9f0c5',.17,.1,{emissive:'#9bff81',emissiveIntensity:2.7}),dark=mat('#11191d',.32,.65);
  const disk=addMesh(g,new THREE.CylinderGeometry(2.75,3.55,.58,72),hull,v3(0,0,0));disk.scale.z=.78;
  torus(g,2.88,.16,rim,0,-.23,0).scale.z=.78;torus(g,2.52,.055,dark,0,-.32,0).scale.z=.78;
  const dome=addMesh(g,new THREE.SphereGeometry(1.56,48,28,0,Math.PI*2,0,Math.PI/2),glass,v3(0,.23,0));dome.scale.set(1,.78,.84);
  torus(g,1.5,.045,rim,0,.2,0);
  cylinder(g,.14,.38,.48,hull,0,.35,0,32);
  for(let i=0;i<24;i++){const a=i*Math.PI/12;const x=Math.cos(a)*2.87,z=Math.sin(a)*2.22;sphere(g,.095,lights,x,-.13,z,.9,.8,.9);}
  for(let i=0;i<8;i++){const a=i*Math.PI/4;const pod=new THREE.Group();pod.position.set(Math.cos(a)*2.25,-.08,Math.sin(a)*1.72);g.add(pod);sphere(pod,.21,dark,0,0,0,1,.75,1);sphere(pod,.11,lights,0,-.03,.05,.9,.9,.9);}
  // Twin forward emitters are visible from the chase camera and flash on every shot.
  for(const side of [-1,1]){const cannon=addMesh(g,new THREE.CylinderGeometry(.11,.16,.72,16),dark,v3(side*.62,-.22,-2.55),v3(Math.PI/2,0,0));cannon.rotation.x=Math.PI/2;torus(g,.13,.028,rim,side*.62,-.22,-2.88,Math.PI/2,0,0);sphere(g,.075,lights,side*.62,-.22,-2.92,.8,.8,.45);}
  const muzzleGlow=addLight(g,0xff6258,0,7,0,-.22,-3.0);const muzzleCore=sphere(g,.14,mat('#ffd5c8',.14,0,{emissive:'#ff6a59',emissiveIntensity:3}),0,-.22,-2.96,1,1,.65);muzzleCore.visible=false;
  const top=sphere(g,.18,lights,0,1.05,0,1,.55,1);
  const thrusters=[];for(let i=0;i<4;i++){const a=i*Math.PI/2;const t=new THREE.Group();t.position.set(Math.cos(a)*1.85,-.47,Math.sin(a)*1.46);g.add(t);const plume=addMesh(t,new THREE.ConeGeometry(.22,.95,16),mat('#a7ffd3',.2,.05,{emissive:'#45e7a4',emissiveIntensity:2.2,transparent:true,opacity:.56}),v3(0,-.55,0),v3(Math.PI,0,0));const core=sphere(t,.12,lights,0,-.1,0,1,1.4,1);thrusters.push({group:t,plume,core});}
  const underGlow=addLight(g,0x6df4c8,3.5,13,0,-.75,0);const cockpitGlow=addLight(g,0x8dded1,.9,5,0,.45,0);
  g.userData.hull=disk;g.userData.thrusters=thrusters;g.userData.underGlow=underGlow;g.userData.velocity=v3();g.userData.boost=0;g.userData.flightAnim=rand(0,4);g.userData.acceleration=0;g.userData.muzzleGlow=muzzleGlow;g.userData.muzzleCore=muzzleCore;g.userData.shotFlash=0;
  return g;
}

let gardenSkyTexture=null;
let gardenSkyMaterial=null;
function ensureGardenSky(){
  if(!gardenSkyTexture){
    const c=document.createElement('canvas');c.width=1024;c.height=512;
    const ctx=c.getContext('2d');
    const g=ctx.createLinearGradient(0,0,0,512);
    g.addColorStop(0,'#1d2a39');g.addColorStop(.34,'#394651');g.addColorStop(.62,'#68717a');g.addColorStop(.79,'#a27f73');g.addColorStop(1,'#69696a');
    ctx.fillStyle=g;ctx.fillRect(0,0,1024,512);
    // Low, stretched evening cloud banks. They sit on the horizon instead of
    // making the courtyard look like a floating platform in open space.
    ctx.save();ctx.filter='blur(22px)';
    for(let i=0;i<34;i++){
      const y=235+Math.random()*115,x=Math.random()*1024,w=70+Math.random()*210,h=5+Math.random()*22;
      ctx.fillStyle=`rgba(${95+Math.floor(Math.random()*45)},${105+Math.floor(Math.random()*38)},${112+Math.floor(Math.random()*35)},${.07+Math.random()*.13})`;
      ctx.beginPath();ctx.ellipse(x,y,w,h,Math.random()*.05,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
    // A very restrained warm break at the horizon gives the dusk a real depth cue.
    const glow=ctx.createRadialGradient(650,350,10,650,350,320);
    glow.addColorStop(0,'rgba(205,157,122,.22)');glow.addColorStop(1,'rgba(205,157,122,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,160,1024,320);
    gardenSkyTexture=new THREE.CanvasTexture(c);gardenSkyTexture.colorSpace=THREE.SRGBColorSpace;gardenSkyTexture.wrapS=THREE.RepeatWrapping;gardenSkyTexture.anisotropy=2;
  }
  if(!gardenSkyMaterial){gardenSkyMaterial=new THREE.MeshBasicMaterial({map:gardenSkyTexture,side:THREE.BackSide,depthWrite:false,fog:false});gardenSkyMaterial.userData.krovShared=true;}
  const dome=addMesh(world,cachedGeometry('garden:skyDome',()=>new THREE.SphereGeometry(148,40,24)),gardenSkyMaterial,v3(0,0,0));
  dome.renderOrder=-10;dome.frustumCulled=false;
}
function addGardenHorizon(){
  const rows=[];
  const addRow=(side,count,axis)=>{
    for(let i=0;i<count;i++){
      const along=(i-(count-1)/2)*13.5+rand(-2,2);
      let x,z,face;
      if(axis==='z'){x=along;z=side*70;face=side===-1?1:-1;}
      else{x=side*70;z=along;face=side===-1?1:-1;}
      const w=rand(7,13),d=rand(7,12),h=rand(16,34),style=Math.floor(rand(0,3));
      rows.push({x,z,w,d,h,style,face,axis});
    }
  };
  addRow(-1,13,'z');addRow(1,13,'z');addRow(-1,9,'x');addRow(1,9,'x');
  const materials=[
    mat('#3b454d',.92,0),mat('#544b48',.94,0),mat('#4c5a5a',.9,.03)
  ];
  const geo=cachedGeometry('garden:horizonBlock',()=>new THREE.BoxGeometry(1,1,1));
  for(let style=0;style<3;style++){
    const list=rows.filter(b=>b.style===style);if(!list.length)continue;
    const batch=new THREE.InstancedMesh(geo,materials[style],list.length);const dummy=new THREE.Object3D();
    list.forEach((b,i)=>{dummy.position.set(b.x,b.h/2-.05,b.z);dummy.scale.set(b.w,b.h,b.d);dummy.updateMatrix();batch.setMatrixAt(i,dummy.matrix);});
    batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();world.add(batch);
  }
  // Sparse lit windows on the inward-facing silhouettes, batched into one draw call.
  const winGeo=cachedGeometry('garden:horizonWindow',()=>new THREE.BoxGeometry(.42,.68,.055));
  const winMat=mat('#c39a70',.45,0,{emissive:'#9c5e34',emissiveIntensity:.48});
  const windows=[];
  for(const b of rows){
    const n=Math.max(2,Math.floor(b.w/2.5));
    for(let col=0;col<n;col++){
      if(Math.random()>.58)continue;
      const along=-b.w/2+(col+.5)*b.w/n;
      for(let floor=0;floor<Math.floor(b.h/4);floor++){
        if(Math.random()>.38)continue;
        const y=2+floor*3.5;
        const pos=b.axis==='z'?v3(b.x+along,y,b.z+b.face*(b.d/2+.04)):v3(b.x+b.face*(b.w/2+.04),y,b.z+along);
        windows.push({pos,rot:b.axis==='z'?0:Math.PI/2});
      }
    }
  }
  if(windows.length){
    const batch=new THREE.InstancedMesh(winGeo,winMat,windows.length),dummy=new THREE.Object3D();
    windows.forEach((w,i)=>{dummy.position.copy(w.pos);dummy.rotation.y=w.rot;dummy.updateMatrix();batch.setMatrixAt(i,dummy.matrix);});
    batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();world.add(batch);
  }
}
function buildGarden(){
  clearWorld();setPhase('garden');flightScore=0;playerDamageCooldown=0;waveSpawned=false;
  baseScene('#59636d','#777b7c',.0017);
  scene.background.set('#59636d');scene.fog=new THREE.FogExp2('#7b7b78',.00185);
  scene.add(new THREE.HemisphereLight(0xd2d9df,0x413b36,.78));
  const duskSun=new THREE.DirectionalLight(0xffc18a,.92);duskSun.position.set(-38,26,35);duskSun.castShadow=false;scene.add(duskSun);
  scene.add(new THREE.AmbientLight(0x88939b,.2));
  ensureGardenSky();addGardenHorizon();

  const pavement=mat('#45494c',.98,0,{map:asphaltTex});
  const paving=mat('#686864',.96,0,{map:pavingTex});
  const stone=mat('#aaa79f',.9,0,{map:stoneTex});
  const edge=mat('#777873',.84,.05);
  const water=mat('#1b3035',.13,.52,{transparent:true,opacity:.94});
  plane(world,220,220,pavement,0,-.12,0);
  // Broad continuous walkways join the entrances and leave a clear central route.
  plane(world,27,64,paving,-4,-.075,0);
  plane(world,34,6,paving,0,-.07,20);
  plane(world,34,5,paving,0,-.07,-27);

  // Reflecting pool moved to the eastern half of the court. Its collider matches
  // the visible water exactly, leaving a continuous western route to the Pandora case.
  const poolX=8.2,poolZ=-5.5,poolW=12.6,poolD=7.4;
  box(world,15.1,.54,9.8,edge,poolX,-.28,poolZ);
  box(world,14.3,.14,9.0,mat('#343b3c'),poolX,-.045,poolZ);
  plane(world,poolW,poolD,water,poolX,.055,poolZ);
  addCollider(poolX,poolZ,15.1,9.8);
  for(const side of [-1,1]){
    box(world,15.2,.24,.28,stone,poolX,.12,poolZ+side*4.82);
    box(world,.28,.24,9.8,stone,poolX+side*7.46,.12,poolZ);
  }
  // Narrow stone coping joints and soft reflection bands.
  for(let x=-6.8;x<=6.8;x+=1.7)box(world,.025,.018,9.2,mat('#cbc5b8'),poolX+x,.25,poolZ);
  const poolLights=[[-1.5,-5],[1.7,-5],[0,4]];
  for(const [dx,dz] of poolLights){
    const ripple=torus(world,.42,.012,mat('#8ca5a4',.2,.2,{transparent:true,opacity:.2}),poolX+dx,.08,poolZ+dz,Math.PI/2,0,0);
    ripple.userData.waterRipple=true;animatedObjects.push({object:ripple,type:'ripple',amplitude:.04,speed:.55,phase:rand(0,6)});
  }

  // Modern residential blocks form a real street canyon around a landscaped courtyard.
  // Every footprint is registered as a solid obstacle and aligned to a walkable approach.
  const buildings=[
    [-22,-18,10,12,25,0],[-22,0,10,12,21,1],[-22,19,10,10,19,0],
    [22,-18,10,12,27,2],[22,1,10,12,23,1],[22,20,10,10,20,2]
  ];
  for(const [x,z,w,d,h,style] of buildings)makeResidentialBuilding(x,z,w,d,h,style);

  // Ground-floor retail, positioned on the courtyard side of each block.
  const shopMat=mat('#b58b61',.28,0,{emissive:'#714326',emissiveIntensity:.38});
  for(const [x,z,w] of [[-22,-11.5,7],[22,-11.5,7],[-22,6.5,7],[22,7.5,7],[-22,24.5,7],[22,25.5,7]]){
    const faceZ=z;
    box(world,w,2.85,.3,mat('#252c30',.55,.25),x,1.42,faceZ);
    for(let i=-1;i<=1;i++){
      box(world,1.25,1.9,.075,darkWindowMaterial(),x+i*1.85,1.36,faceZ-.19);
      box(world,.065,2.08,.09,trimFacade(),x+i*1.85-.65,1.36,faceZ-.25);
    }
    box(world,w+.25,.12,.72,mat('#3c4444'),x,2.88,faceZ-.18);
    box(world,w*.58,.055,.06,shopMat,x,3.06,faceZ-.58);
  }

  // Raised planters and trees are instanced in batches. The visible footprints
  // remain collision-aware, but dozens of foliage meshes no longer become
  // dozens of separate draw calls.
  const treeSpots=[[-13,-15],[-13,7],[-13,21],[14,-19],[14,9],[14,22]];
  const trunkMat=mat('#44372f',.92,0),leafA=mat('#34483e',.96,0),leafB=mat('#405548',.96,0),bushMat=mat('#465b4c',.98,0);
  const dummy=new THREE.Object3D();
  const addInstances=(name,geometry,material,items)=>{
    if(!items.length)return;
    const mesh=new THREE.InstancedMesh(geometry,material,items.length);
    items.forEach((it,i)=>{dummy.position.copy(it.p);dummy.rotation.set(it.rx||0,it.ry||0,it.rz||0);dummy.scale.copy(it.s);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();world.add(mesh);
  };
  const planterBase=[],planterCap=[],trunks=[],canopyA=[],canopyB=[],bushes=[];
  for(const [x,z] of treeSpots){
    addCollider(x,z,2.8,2.4);
    planterBase.push({p:v3(x,.2,z),s:v3(3.1,.38,2.7)});
    planterCap.push({p:v3(x,.47,z),s:v3(2.85,.16,2.45)});
    trunks.push({p:v3(x,2,z),s:v3(1,1,1)});
    canopyA.push({p:v3(x-.18,3.35,z),s:v3(1.4,1.32,1.12)});
    canopyB.push({p:v3(x+.48,3.55,z+.12),s:v3(1.1,1.05,.98)});
    for(let i=0;i<6;i++)bushes.push({p:v3(x+rand(-1.12,1.12),.78,z+rand(-.9,.9)),s:v3(.45,.19,.33)});
  }
  addInstances('planter-base',cachedGeometry('garden:planter-base',()=>new THREE.BoxGeometry(1,1,1)),mat('#424846',.96,0),planterBase);
  addInstances('planter-cap',cachedGeometry('garden:planter-cap',()=>new THREE.BoxGeometry(1,1,1)),mat('#77776f',.92,0),planterCap);
  addInstances('tree-trunks',cachedGeometry('garden:tree-trunk',()=>new THREE.CylinderGeometry(.17,.23,3,10)),trunkMat,trunks);
  const foliageGeo=cachedGeometry('garden:foliage',()=>new THREE.SphereGeometry(1,12,8));
  addInstances('tree-canopy-a',foliageGeo,leafA,canopyA);addInstances('tree-canopy-b',foliageGeo,leafB,canopyB);addInstances('tree-bushes',foliageGeo,bushMat,bushes);
  // Benches and low bollards are placed in alcoves, never across the main route.
  for(const [x,z] of [[-10,-2],[-10,11],[15,1],[15,15]]){
    box(world,2.25,.16,.62,mat('#343b3d'),x,.68,z);
    box(world,2.2,.09,.56,woodTexMaterial(),x,.8,z);
    for(const dx of [-.92,.92])box(world,.12,.62,.14,mat('#666a66'),x+dx,.33,z);
    addCollider(x,z,2.35,.72);
  }
  for(const x of [-15.3,15.3])for(const z of [-20,-2,17]){
    cylinder(world,.065,.095,4.8,mat('#242a2d',.48,.55),x,2.4,z,10);
    sphere(world,.14,mat('#e5c18a',.18,0,{emissive:'#dba66d',emissiveIntensity:1.75}),x,4.78,z);
    addLight(world,0xffc58b,.55,11,x,4.45,z);
    addCollider(x,z,.22,.22);
  }

  // Tactile paving and drain marks use one instanced batch, not dozens of
  // individual draw calls.
  const tactileItems=[];
  for(let z=-25;z<=27;z+=3.4)for(const x of [-8.7,-6.7,10.5,12.5]){
    tactileItems.push({p:v3(x,.012,z),s:v3(.035,.018,1.9)});
  }
  const tactileMat=mat('#9a968b',.9,0);
  const tactileGeo=cachedGeometry('garden:tactile-line',()=>new THREE.BoxGeometry(1,1,1));
  const tactileMesh=new THREE.InstancedMesh(tactileGeo,tactileMat,tactileItems.length),tactileDummy=new THREE.Object3D();
  tactileItems.forEach((it,i)=>{tactileDummy.position.copy(it.p);tactileDummy.scale.copy(it.s);tactileDummy.updateMatrix();tactileMesh.setMatrixAt(i,tactileDummy.matrix);});
  tactileMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);tactileMesh.instanceMatrix.needsUpdate=true;tactileMesh.computeBoundingSphere();world.add(tactileMesh);
  const grassBedMat=mat('#33383a',.86,.05),grassMat=mat('#65745c',.94,0),grassItems=[];
  for(const [x,z] of [[-8,15],[1,14],[15,-15],[-15,0]]){
    box(world,1.15,.055,2.05,grassBedMat,x,.12,z);
    for(let i=0;i<6;i++)grassItems.push({p:v3(x+rand(-.5,.5),.28,z+rand(-.8,.8)),s:v3(.028,rand(.18,.42),.028),rz:rand(-.16,.16)});
  }
  addInstances('plaza-grass',cachedGeometry('garden:grass-blade',()=>new THREE.BoxGeometry(1,1,1)),grassMat,grassItems);
  // Alien growth is clustered into two GPU batches; restrained red tips signal
  // contamination without covering the courtyard in noisy props.
  const growthStemMat=mat('#293638',.42,.24,{emissive:'#10231f',emissiveIntensity:.28});
  const growthStemGeo=cachedGeometry('garden:growth-stem',()=>new THREE.CylinderGeometry(.035,.13,1,8));
  const growthTipGeo=cachedGeometry('garden:growth-tip',()=>new THREE.SphereGeometry(1,10,7));
  const growthStems=[],growthTips=[];
  for(const [x,z] of [[-15,-21],[15,-22],[-15,12],[15,20],[-10,-27],[12,-27]]){
    for(let j=0;j<3;j++){
      const h=rand(1.7,3.5),ox=rand(-.2,.2),oz=rand(-.2,.2),rz=rand(-.24,.24);
      growthStems.push({p:v3(x+ox,h/2,z+oz),s:v3(1,h,1),rz});
      growthTips.push({p:v3(x+ox+Math.sin(rz)*h*.18,h-.08,z+oz),s:v3(.09,.108,.072)});
    }
  }
  const growthStemBatch=new THREE.InstancedMesh(growthStemGeo,growthStemMat,growthStems.length),growthTipBatch=new THREE.InstancedMesh(growthTipGeo,M.glowRed,growthTips.length),growthDummy=new THREE.Object3D();
  growthStems.forEach((it,i)=>{growthDummy.position.copy(it.p);growthDummy.rotation.set(0,0,it.rz);growthDummy.scale.copy(it.s);growthDummy.updateMatrix();growthStemBatch.setMatrixAt(i,growthDummy.matrix);});
  growthTips.forEach((it,i)=>{growthDummy.position.copy(it.p);growthDummy.scale.copy(it.s);growthDummy.rotation.set(0,0,0);growthDummy.updateMatrix();growthTipBatch.setMatrixAt(i,growthDummy.matrix);});
  growthStemBatch.instanceMatrix.needsUpdate=true;growthStemBatch.computeBoundingSphere();growthTipBatch.instanceMatrix.needsUpdate=true;growthTipBatch.computeBoundingSphere();
  world.add(growthStemBatch,growthTipBatch);
  // The Pandora case and parked saucer are aligned along the unobstructed western promenade.
  const chestX=-5.3,chestZ=-20.2;
  const chest=new THREE.Group();chest.position.set(chestX,0,chestZ);world.add(chest);
  box(chest,1.9,.95,1.32,mat('#352a26',.46,.36,{map:woodTex}),0,.55,0);
  const lid=box(chest,1.98,.22,1.4,mat('#514036',.43,.48),0,1.12,0);
  box(chest,1.85,.08,1.3,M.gold,0,1.0,0);box(chest,.22,.42,.17,mat('#c9ae67',.24,.74),0,.7,.75);sphere(chest,.12,M.glowGreen,0,.76,.87,.7,1,.35);
  chest.visible=false;
  addInteract(chest,'ОТКРЫТЬ ЯЩИК ПАНДОРЫ',()=>{
    if(flightScore<flightGoal){showToast('ЗАМОК НЕ ОТКРЫВАЕТСЯ. ОПАСНОСТЬ ЕЩЁ РЯДОМ.');return;}
    if(!inventory.keys){
      inventory.keys=true;ufo.visible=true;colliders.push({x:chestX,z:chestZ,w:2.2,d:1.6});showToast('ВНУТРИ — КЛЮЧИ ОТ ЛЕТАЮЩЕЙ ТАРЕЛКИ');
      setObjective('Добраться до тарелки и активировать её.');
      lid.rotation.x=-.72;lid.position.y=1.34;addLight(chest,0xbaff8b,2.4,7,0,1.6,0);playSfx('pickup');
    }else showToast('ЯЩИК ПУСТ.');
  },2.8,'chest');
  const ship=createUFO();ship.position.set(chestX,.35,-29.2);ship.scale.setScalar(1.32);world.add(ship);ship.visible=false;ufo=ship;
  const shipTrigger=box(world,.35,.35,.35,mat('#000000',1,0,{transparent:true,opacity:0}),chestX,1,-29.2);
  addInteract(shipTrigger,'СЕСТЬ В ЛЕТАЮЩУЮ ТАРЕЛКУ',()=>{if(!inventory.keys){showToast('ТАРЕЛКА ЗАПЕРТА. НУЖНЫ КЛЮЧИ.');return;}transitionTo(startFlight);},3.6,'ship');

  // Warm shop windows and street lamps contrast with the cold sky and red alien growths.
  const skyFill=addLight(world,0xa6bacb,.48,76,-9,24,20);
  const courtyardFill=addLight(world,0xffbd80,.24,28,-5,7,1);

  spawnGardenWave();
  player.set(0,1.65,23);yaw=0;pitch=0;setCameraFPS();
  setChapter('ГЛАВА 02 / САДОВЫЕ КВАРТАЛЫ','САДОВЫЕ КВАРТАЛЫ');
  setObjective('Отбиться от пришельцев.');
  selectedSlot=2;updateSlots();
  $('flight-hud').classList.add('hidden');$('shift-prompt').classList.add('hidden');$('flight-reticle').classList.add('hidden');$('crosshair').classList.remove('hidden');
}
function darkWindowMaterial(){return mat('#1d292e',.28,.35,{emissive:'#19282b',emissiveIntensity:.45});}
function trimFacade(){return mat('#b8b4aa',.7,.18);}
function woodTexMaterial(){return mat('#574638',.82,0,{map:woodTex,bumpMap:woodTex,bumpScale:.05});}

function spawnGardenWave(){
  const spots=[[-12,-25],[-2,-27],[11,-24],[-10,4],[9,5],[-9,15],[5,13],[0,-3]];
  spots.forEach((p,i)=>{
    const mesh=createAlien(v3(p[0],0,p[1]),true,false);
    mesh.scale.set(1,.08,1);mesh.visible=false;world.add(mesh);
    enemies.push({
      mesh,hp:3,speed:rand(3.55,4.15),attack:rand(.8,1.7),phase:rand(0,5),
      windup:0,stagger:0,activateIn:.12+i*.58,emerge:0.72,
      path:[],pathIndex:0,pathTimer:.1+i*.09,lastTargetCell:-1,stalkerCue:rand(1,3)
    });
  });
  waveSpawned=true;
}

// Compact grid A* navigation. The grid is rebuilt only when a hunter's path is
// stale, so enemies can route around building footprints, planters and the pool
// without performing expensive collision probes on every rendered frame.
const GARDEN_NAV={minX:-29,minZ:-32,step:1.2,width:49,height:54};
const NAV_NEIGHBORS=[[-1,-1,1.414],[-1,0,1],[-1,1,1.414],[0,-1,1],[0,1,1],[1,-1,1.414],[1,0,1],[1,1,1.414]];
function gardenCell(x,z){
  const c=Math.floor((x-GARDEN_NAV.minX)/GARDEN_NAV.step);
  const r=Math.floor((z-GARDEN_NAV.minZ)/GARDEN_NAV.step);
  return {c:clamp(c,0,GARDEN_NAV.width-1),r:clamp(r,0,GARDEN_NAV.height-1)};
}
function gardenCellWorld(c,r){
  return {x:GARDEN_NAV.minX+(c+.5)*GARDEN_NAV.step,z:GARDEN_NAV.minZ+(r+.5)*GARDEN_NAV.step};
}
function gardenCellIndex(c,r){return r*GARDEN_NAV.width+c;}
function findNearestGardenCell(c,r,radius=5){
  for(let ring=0;ring<=radius;ring++){
    for(let dz=-ring;dz<=ring;dz++)for(let dx=-ring;dx<=ring;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dz))!==ring)continue;
      const cc=c+dx,rr=r+dz;if(cc<0||rr<0||cc>=GARDEN_NAV.width||rr>=GARDEN_NAV.height)continue;
      const p=gardenCellWorld(cc,rr);if(!blocked(p.x,p.z,.52))return {c:cc,r:rr};
    }
  }
  return null;
}
function findGardenPath(sx,sz,tx,tz){
  let start=gardenCell(sx,sz),goal=gardenCell(tx,tz);
  const sPos=gardenCellWorld(start.c,start.r);
  if(blocked(sPos.x,sPos.z,.5))start=findNearestGardenCell(start.c,start.r,3)||start;
  const gPos=gardenCellWorld(goal.c,goal.r);
  if(blocked(gPos.x,gPos.z,.5))goal=findNearestGardenCell(goal.c,goal.r,5)||goal;
  const startId=gardenCellIndex(start.c,start.r),goalId=gardenCellIndex(goal.c,goal.r);
  if(startId===goalId)return [];
  const total=GARDEN_NAV.width*GARDEN_NAV.height;
  const costs=new Float32Array(total);costs.fill(Infinity);
  const parents=new Int32Array(total);parents.fill(-1);
  const closed=new Uint8Array(total);
  const heap=[],heapF=[];
  const heuristic=(c,r)=>{const dx=Math.abs(c-goal.c),dz=Math.abs(r-goal.r);return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz);};
  const push=(id,f)=>{
    let i=heap.length;heap.push(id);heapF.push(f);
    while(i>0){const p=(i-1)>>1;if(heapF[p]<=f)break;heap[i]=heap[p];heapF[i]=heapF[p];i=p;}
    heap[i]=id;heapF[i]=f;
  };
  const pop=()=>{
    const id=heap[0],last=heap.pop(),f=heapF.pop();
    if(heap.length){let i=0;while(true){let l=i*2+1,r=l+1;if(l>=heap.length)break;let m=r<heap.length&&heapF[r]<heapF[l]?r:l;if(heapF[m]>=f)break;heap[i]=heap[m];heapF[i]=heapF[m];i=m;}heap[i]=last;heapF[i]=f;}
    return id;
  };
  costs[startId]=0;push(startId,heuristic(start.c,start.r));
  let found=false,iterations=0;
  while(heap.length&&iterations++<total){
    const id=pop();if(closed[id])continue;closed[id]=1;
    if(id===goalId){found=true;break;}
    const c=id%GARDEN_NAV.width,r=(id/GARDEN_NAV.width)|0;
    for(const [dx,dz,stepCost] of NAV_NEIGHBORS){
      const nc=c+dx,nr=r+dz;if(nc<0||nr<0||nc>=GARDEN_NAV.width||nr>=GARDEN_NAV.height)continue;
      const nid=gardenCellIndex(nc,nr);if(closed[nid])continue;
      const p=gardenCellWorld(nc,nr);if(blocked(p.x,p.z,.52))continue;
      if(dx&&dz){
        const px=gardenCellWorld(c+dx,r),pz=gardenCellWorld(c,r+dz);
        if(blocked(px.x,px.z,.52)||blocked(pz.x,pz.z,.52))continue;
      }
      const cost=costs[id]+stepCost;
      if(cost<costs[nid]){costs[nid]=cost;parents[nid]=id;push(nid,cost+heuristic(nc,nr));}
    }
  }
  if(!found)return [];
  const path=[];let id=goalId;
  while(id!==startId&&id>=0){
    const c=id%GARDEN_NAV.width,r=(id/GARDEN_NAV.width)|0;
    path.push(gardenCellWorld(c,r));id=parents[id];
  }
  path.reverse();return path;
}
// -------------------- FLIGHT / FINAL INTERIOR --------------------
function createFlightEnemy(){const root=createAlien(v3(rand(-20,20),rand(5,16),rand(-36,-22)),true,false);root.scale.setScalar(rand(.56,.74));world.add(root);return {mesh:root,hp:2,speed:rand(4.2,5.8),attack:0,phase:rand(0,6)};}
function startFlight(){
  clearWorld();flightPulseMeshes=[];fireHeld=false;fireHeldRMB=false;fireCooldown=0;flightAimX=0;flightAimY=0;flightTrailClock=0;setPhase('flight');baseScene('#131b24','#202a31',.0025);scene.background.set('#27313a');scene.add(new THREE.HemisphereLight(0x9fb5c9,0x151b21,.95));
  plane(world,180,180,mat('#303a3d',.92,0,{map:asphaltTex}),0,-3,0);
  // A broad roofscape under the vehicle, with varied blocks and lit windows in the haze.
  for(let i=0;i<92;i++){
    const x=rand(-78,78),z=rand(-78,78),w=rand(5,13),d=rand(5,13),h=rand(7,27);const shell=mat(i%4===0?'#626967':i%3===0?'#4b555b':'#3d454a',.9,0,{map:i%3===0?brickTex:concreteTex});
    const b=box(world,w,h,d,shell,x,h/2-3,z);box(world,w+.12,.3,d+.12,mat('#6d706b'),x,h-2.8,z);
    for(let yy=2;yy<h-2;yy+=2.6)for(let xx=-w/2+1;xx<w/2-1;xx+=2.2){if(Math.random()>.28){const win=box(world,.82,1.12,.05,Math.random()>.76?mat('#c09b6e',.28,0,{emissive:'#ad753c',emissiveIntensity:.55}):mat('#233239',.3,.22),x+xx,yy-2,z-d/2-.04);}}
    if(i%5===0){cylinder(world,.16,.16,2.5,mat('#252c30'),x, h-1.4,z,8);}
  }
  // A distant dome and a broken ring of green-red signal lights anchor the flight back toward the church.
  const landmark=buildCathedral(world,-15,-55,.34);landmark.rotation.y=-.18;
  for(let i=0;i<18;i++){const p=sphere(world,.14,i%2?M.glowGreen:M.glowRed,rand(-70,70),rand(5,24),rand(-75,-35),1,1,1);p.userData.dust=true;particles.push(p);}
  ufo=createUFO();ufo.position.set(0,9,12);ufo.scale.setScalar(1.3);world.add(ufo);
  for(let i=0;i<8;i++)flightEnemies.push(createFlightEnemy());
  flightScore=0;flightTime=0;boostUntil=0;player.set(0,1.65,0);camera.position.set(0,15,29);camera.lookAt(0,9,0);yaw=0;pitch=0;
  $('flight-hud').classList.remove('hidden');$('shift-prompt').classList.add('hidden');$('flight-reticle').classList.remove('hidden');$('crosshair').classList.add('hidden');setChapter('ГЛАВА 03 / ВОЗДУШНЫЙ КОРИДОР','НАД МОСКВОЙ');setObjective('Удержаться в воздухе и уничтожить 5 преследователей.');$('hud').classList.remove('hidden');
}

function createCockpit(){cockpitDialogueStarted=false;clearWorld();setPhase('cockpit');baseScene('#101216','#090b0e',.012);scene.add(new THREE.AmbientLight(0x78828b,.25));
  const hull=mat('#34393b',.42,.55), inner=mat('#171c20',.8,.2), glass=mat('#66858a',.15,.3,{transparent:true,opacity:.22}), panel=mat('#24292d',.4,.4);
  // Compact circular cabin shell and front viewport.
  cylinder(world,6,6.5,13,hull,0,0,0,48).rotation.x=Math.PI/2;
  const floor=box(world,10,.35,13,inner,0,-1.1,0);box(world,10,.35,13,inner,0,4.7,0);
  for(let side of [-1,1]){box(world,.45,5.6,13,hull,side*5,1.75,0);for(let z=-5;z<=5;z+=2.5){box(world,.35,.3,.5,panel,side*4.7,2,z);}}
  // Forward window shows the church dome through the mist.
  box(world,8.5,4.6,.2,glass,0,1.9,-6.15);box(world,8.9,.25,.3,hull,0,4.25,-6.2);box(world,8.9,.25,.3,hull,0,-.4,-6.2);box(world,.25,4.8,.3,hull,-4.35,1.9,-6.2);box(world,.25,4.8,.3,hull,4.35,1.9,-6.2);
  // Distant glowing cathedral silhouette.
  const distant=buildCathedral(world,0,-25,.35);distant.position.y=-2.5;
  for(let x=-3;x<=3;x+=1.5){box(world,1,.35,1,panel,x,-.65,-3.8);sphere(world,.08,x===0?M.glowRed:M.glowGreen,x,-.42,-3.8);}
  const chair=box(world,2.3,2.3,2.5,mat('#292a2b'),0,0,1.2);box(world,2.6,.3,1.1,hull,0,1,2.2);
  friendAlien=createAlien(v3(0,0,4.1),false,false);friendAlien.scale.setScalar(.95);friendAlien.rotation.y=Math.PI;world.add(friendAlien);const sidearm=new THREE.Group();box(sidearm,.16,.18,.48,mat('#1c2427',.32,.6),0,0,0);box(sidearm,.09,.08,.22,mat('#758783',.28,.5),0,.12,.22);box(sidearm,.1,.22,.14,mat('#242b2f',.45,.55),0,-.16,-.04);sphere(sidearm,.055,M.glowRed,0,.02,.255,.75,.75,.55);sidearm.position.set(.18,-.82,.25);sidearm.visible=false;friendAlien.userData.rightArm.add(sidearm);friendAlien.userData.sidearm=sidearm;friendAlien.userData.aiming=false;
  camera.position.set(0,1.65,-1.7);yaw=0;pitch=0;camera.rotation.set(0,0,0,'YXZ');
  setChapter('ГЛАВА 04 / ВОЗВРАЩЕНИЕ','НАД ХРАМОМ');setObjective('Обернуться.');$('flight-hud').classList.add('hidden');$('shift-prompt').classList.add('hidden');$('crosshair').classList.add('hidden');$('flight-reticle').classList.add('hidden');
  sceneTime=0;
}
function startFinalDialogue(){beginDialogue('ВЫ',['Откуда ты?'],()=>{beginDialogue('СУЩЕСТВО',[
  'Из прошлого.',
  'Ты думал, что я остался в церкви? Я остался в той версии, которую ты помнишь.',
  'А теперь попробуй вспомнить, кто из нас первым открыл дверь.'
],()=>{showToast('ОН ПОДНИМАЕТ ОРУЖИЕ. СЕЙЧАС.');if(friendAlien?.userData.sidearm)friendAlien.userData.sidearm.visible=true;if(friendAlien)friendAlien.userData.aiming=true;setTimeout(()=>{beginDialogue('СУЩЕСТВО',['Ты всё равно не успеешь.'],()=>{setObjective('Опередить его. Нажать E.');});},600);});});}
function endCycle(){if(phase!=='cockpit')return;$('dialogue').classList.add('hidden');showToast('СИНХРОНИЗАЦИЯ НАРУШЕНА',900);const flash=$('damage-flash');flash.style.opacity='.9';setTimeout(()=>{flash.style.opacity='0';$('hud').classList.add('hidden');$('ending-screen').classList.remove('hidden');if(document.pointerLockElement)document.exitPointerLock();phase='ending';paused=false;let cycles=1;try{cycles=Number(localStorage.getItem('krovotkinskaya_cycles')||0)+1;localStorage.setItem('krovotkinskaya_cycles',String(cycles));}catch{}$('ending-code').textContent=`CYCLE ${String(cycles).padStart(3,'0')} · TERMINATED / RESTARTING`;},350);}

// -------------------- INPUT / INTERACTION --------------------
function interact(){if(!$('dialogue').classList.contains('hidden')){advanceDialogue();return;}if(!currentInteract){return;}const item=currentInteract;if(item.mesh.visible===false&&item.kind!=='portal')return;item.action();}
function findInteraction(){
  let best=null,bestD=Infinity;const forward=camera.getWorldDirection(v3());
  for(const it of interactables){if(!it.mesh.visible||it.enabled===false)continue;const p=it.mesh.getWorldPosition(v3());const to=p.clone().sub(camera.position);const d=to.length();if(d>it.range||d<.1)continue;const facing=forward.dot(to.normalize());if(facing<.48)continue;if(d<bestD){best=it;bestD=d;}}
  currentInteract=best;$('interact-prompt').classList.toggle('hidden',!best||phase==='intro'||phase==='flight'||phase==='cockpit');if(best)$('interact-label').textContent=best.name;
}

function tryResurrectionInteraction(){if(phase==='basement'&&deadAlien){const d=deadAlien.position.distanceTo(player);if(d<3){performRitual();return true;}}return false;}
function shootEnergy(){
  if((phase!=='garden'&&phase!=='basement')||!inventory.carbine||selectedSlot!==2)return;
  const dir=camera.getWorldDirection(v3());const start=camera.position.clone().add(dir.clone().multiplyScalar(.78));
  const bolt=sphere(world,.085,M.glowGreen,start.x,start.y,start.z,.8,.8,2.4);bolt.userData.velocity=dir.multiplyScalar(52);bolt.userData.life=1.8;bolt.userData.kind='player';projectiles.push(bolt);
  weaponRecoil=Math.min(.24,weaponRecoil+.12);playSfx('shoot');if(weaponRig?.userData.flash){weaponRig.userData.flash.visible=true;}if(muzzleFlash)muzzleFlash.intensity=8;
}

function updateBasementCombat(dt){
  fireCooldown=Math.max(0,fireCooldown-dt);if(fireHeld&&fireCooldown<=0){shootEnergy();fireCooldown=.105;}
  for(let i=projectiles.length-1;i>=0;i--){const bolt=projectiles[i];bolt.position.addScaledVector(bolt.userData.velocity,dt);bolt.userData.life-=dt;if(bolt.userData.life<=0){world.remove(bolt);projectiles.splice(i,1);}}
}
function fireFlightShot(){
  if(phase!=='flight'||!ufo)return;
  raycaster.setFromCamera(new THREE.Vector2(flightAimX,flightAimY),camera);
  const origin=ufo.localToWorld(v3(0,-.2,-3.05));ufo.userData.shotFlash=.12;if(ufo.userData.muzzleGlow)ufo.userData.muzzleGlow.intensity=7;if(ufo.userData.muzzleCore)ufo.userData.muzzleCore.visible=true;const aimPoint=raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(110));
  const dir=aimPoint.sub(origin).normalize();const bolt=sphere(world,.14,M.glowRed,origin.x,origin.y,origin.z,.8,.8,2.4);bolt.userData.velocity=dir.multiplyScalar(64);bolt.userData.life=2.4;flightShots.push(bolt);playSfx('shoot');
}

function flightAimPoint(){raycaster.setFromCamera(new THREE.Vector2(flightAimX,flightAimY),camera);return raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(110));}

function createWeaponView(){
  if(weaponRig)camera.remove(weaponRig);weaponRig=new THREE.Group();weaponRig.position.set(.36,-.32,-.68);weaponRig.rotation.set(-.03,-.05,0);
  const steel=mat('#242c30',.32,.72),edge=mat('#66716e',.28,.72),polymer=mat('#252a2c',.7,.08),glow=mat('#9effa2',.2,.08,{emissive:'#52f878',emissiveIntensity:2.2});
  box(weaponRig,.22,.2,.82,polymer,0,0,0);box(weaponRig,.15,.13,.58,steel,0,.11,-.03);box(weaponRig,.12,.14,.4,edge,0,.15,-.2);
  cylinder(weaponRig,.045,.07,.66,steel,0,.015,-.56,16).rotation.x=Math.PI/2; cylinder(weaponRig,.075,.095,.18,edge,0,.015,-.88,16).rotation.x=Math.PI/2;
  box(weaponRig,.11,.24,.18,polymer,0,-.2,.18,{rot:v3(-.22,0,0)});box(weaponRig,.18,.06,.22,edge,0,.2,.04);
  box(weaponRig,.1,.08,.21,steel,0,.24,-.27);box(weaponRig,.04,.12,.055,edge,0,.3,-.28);
  box(weaponRig,.08,.1,.35,polymer,.17,-.12,.2,{rot:v3(.18,0,-.1)});
  cylinder(weaponRig,.105,.14,.54,mat('#333a3c',.82,.02),.16,-.28,.22,12).rotation.x=-.34;sphere(weaponRig,.12,mat('#505a59',.75,.05),.13,-.47,-.01,1,.8,1.15);
  const core=sphere(weaponRig,.055,glow,0,.09,-.3,.85,.72,1.8);const sideStrip=box(weaponRig,.025,.055,.32,glow,.119,.03,-.12);
  muzzleFlash=new THREE.PointLight(0x8bff9c,0,6);muzzleFlash.position.set(0,.02,-1.02);weaponRig.add(muzzleFlash);
  const flash=sphere(weaponRig,.09,mat('#d7ffce',.12,0,{emissive:'#a4ff9b',emissiveIntensity:4}),0,.02,-1.02,1,1,2);flash.visible=false;weaponRig.userData.flash=flash;weaponRig.userData.core=core;camera.add(weaponRig);
  if(lighterRig)camera.remove(lighterRig);lighterRig=new THREE.Group();lighterRig.position.set(.38,-.31,-.58);lighterRig.rotation.set(.04,-.14,-.08);
  cylinder(lighterRig,.11,.14,.4,mat('#333a3c',.82,.02),0,-.25,.12,12).rotation.x=-.35;sphere(lighterRig,.12,mat('#505a59',.75,.05),0,-.42,-.02,1,.8,1.1);box(lighterRig,.12,.22,.055,mat('#adb1ad',.22,.76),0,0,0);box(lighterRig,.12,.05,.065,mat('#c8bb8c',.25,.7),0,.13,0);sphere(lighterRig,.024,M.glowRed,0,.06,.033,.8,.8,.4);
  const spark=sphere(lighterRig,.035,mat('#ffd99a',.2,0,{emissive:'#ff9c42',emissiveIntensity:3}),0,.19,0,.7,1.5,.7);spark.visible=false;lighterRig.userData.spark=spark;camera.add(lighterRig);
  if(!lighterGlow){lighterGlow=new THREE.PointLight(0xffb86c,0,8,2);camera.add(lighterGlow);lighterGlow.position.set(.04,-.12,-.22);lighterSpot=new THREE.SpotLight(0xffd39a,0,12,Math.PI/7,0.58,1.4);lighterSpot.position.set(.04,-.13,-.2);const target=new THREE.Object3D();target.position.set(.02,-.18,-7.2);camera.add(target);lighterSpot.target=target;camera.add(lighterSpot);}
  if(portalRig)camera.remove(portalRig);portalRig=new THREE.Group();portalRig.position.set(.37,-.34,-.72);portalRig.rotation.set(-.08,-.12,-.08);
  const portalSteel=mat('#273238',.3,.72),portalEdge=mat('#82918e',.25,.72),portalDark=mat('#121a1d',.48,.38),portalGlow=mat('#9ef7c5',.18,.1,{emissive:'#49d9a1',emissiveIntensity:2.6});
  box(portalRig,.2,.22,.75,portalDark,0,0,0);box(portalRig,.27,.12,.48,portalSteel,0,.12,-.08);box(portalRig,.13,.25,.3,portalDark,0,-.19,.12,{rot:v3(-.2,0,0)});
  const ring=torus(portalRig,.22,.052,portalEdge,0,.05,-.43,Math.PI/2,0,0);portalRig.userData.ring=ring;const portalCore=sphere(portalRig,.135,portalGlow,0,.05,-.43,.65,.65,.32);portalRig.userData.core=portalCore;
  for(let k=0;k<3;k++)box(portalRig,.045,.28,.07,portalEdge,(k-1)*.12,.01,.19);
  portalRig.userData.kick=0;camera.add(portalRig);portalRig.visible=false;
}

function updateGarden(dt){
  movePlayer(dt);setCameraFPS();
  if(lighterRig)lighterRig.visible=false;
  if(weaponRig)weaponRig.visible=!!inventory.carbine&&selectedSlot===2;
  if(lighterGlow)lighterGlow.intensity=0;
  fireCooldown=Math.max(0,fireCooldown-dt);
  if(fireHeld&&fireCooldown<=0){shootEnergy();fireCooldown=.105;}

  const playerCell=gardenCell(player.x,player.z);
  for(const e of enemies){
    const mesh=e.mesh;
    if(e.activateIn>0){
      e.activateIn-=dt;
      if(e.activateIn<=0){e.activateIn=0;mesh.visible=true;showToast('ДВИЖЕНИЕ В ТЕМНОТЕ',900);}
      continue;
    }
    if(e.emerge>0){
      e.emerge=Math.max(0,e.emerge-dt);
      const k=1-e.emerge/.72;mesh.scale.y=.08+.92*(k*k*(3-2*k));
    }
    if(!mesh.visible||mesh.userData.dying)continue;
    e.attack=Math.max(0,e.attack-dt);e.stagger=Math.max(0,e.stagger-dt);
    const dx=player.x-mesh.position.x,dz=player.z-mesh.position.z;
    const dist=Math.hypot(dx,dz);
    e.stalkerCue-=dt;if(dist<9&&e.stalkerCue<=0){playSfx('stalker');e.stalkerCue=rand(4.5,7.5);}

    if(dist>2.05){
      e.pathTimer-=dt;
      const movedTarget=Math.abs(playerCell.c-(e.lastTargetCell%GARDEN_NAV.width))>2||
        Math.abs(playerCell.r-Math.floor(e.lastTargetCell/GARDEN_NAV.width))>2;
      if(e.pathTimer<=0||movedTarget||(e.path.length>0&&e.pathIndex>=e.path.length)){
        e.path=findGardenPath(mesh.position.x,mesh.position.z,player.x,player.z);
        e.pathIndex=0;e.pathTimer=.72+Math.random()*.16;
        e.lastTargetCell=gardenCellIndex(playerCell.c,playerCell.r);
      }
      let waypoint=e.path[e.pathIndex];
      while(waypoint&&Math.hypot(waypoint.x-mesh.position.x,waypoint.z-mesh.position.z)<.72){
        e.pathIndex++;waypoint=e.path[e.pathIndex];
      }
      let vx=waypoint?waypoint.x-mesh.position.x:dx;
      let vz=waypoint?waypoint.z-mesh.position.z:dz;
      const vl=Math.hypot(vx,vz)||1;vx/=vl;vz/=vl;
      // Near the player, hunters break into a quick, low lunge instead of
      // walking in a straight, harmless line.
      const alert=dist<14?1:0;
      const speed=e.speed+alert*(dist<7?1.85:1.05);
      const sep=v3();
      for(const other of enemies){
        if(other===e||!other.mesh.visible||other.mesh.userData.dying)continue;
        const ox=mesh.position.x-other.mesh.position.x,oz=mesh.position.z-other.mesh.position.z,od=Math.hypot(ox,oz);
        if(od>0&&od<1.55){sep.x+=ox/od*(1.55-od);sep.z+=oz/od*(1.55-od);}
      }
      vx+=sep.x*.48;vz+=sep.z*.48;const len=Math.hypot(vx,vz)||1;vx/=len;vz/=len;
      if(!e.stagger){
        const nx=mesh.position.x+vx*speed*dt,nz=mesh.position.z+vz*speed*dt;
        // Axis-separated movement permits sliding along a facade without clipping.
        let moved=false;
        if(!blocked(nx,mesh.position.z,.48)){mesh.position.x=nx;moved=true;}
        if(!blocked(mesh.position.x,nz,.48)){mesh.position.z=nz;moved=true;}
        if(!moved)e.pathTimer=0;
      }
      mesh.rotation.y=Math.atan2(dx,dz);
      animateAlien(mesh,dt,speed,true);
    }else{
      animateAlien(mesh,dt,0,false);
      if(e.attack<=0&&!e.winding){
        e.attack=1.45;e.windup=.46;e.winding=true;e.didLunge=false;
        mesh.userData.attackPulse=.46;
      }
      if(e.winding){
        e.windup-=dt;
        if(!e.didLunge&&e.windup<.22){
          e.didLunge=true;
          const len=Math.max(.001,dist),nx=dx/len,nz=dz/len;
          if(!blocked(mesh.position.x+nx*.95,mesh.position.z+nz*.95,.48)){
            mesh.position.x+=nx*.95;mesh.position.z+=nz*.95;
          }
        }
        if(mesh.userData.torso){mesh.userData.torso.rotation.x=-.42;mesh.userData.torso.rotation.z+=Math.sin(sceneTime*26)*.045;}
        if(mesh.userData.arms){mesh.userData.arms[0].rotation.x=-1.02;mesh.userData.arms[1].rotation.x=-1.38;}
        if(mesh.userData.jaw)mesh.userData.jaw.rotation.x=-.3;
        if(e.windup<=0){
          e.winding=false;
          const finalDist=Math.hypot(player.x-mesh.position.x,player.z-mesh.position.z);
          if(finalDist<2.65&&playerDamageCooldown<=0){
            health=Math.max(0,health-17);updateHealth();
            $('damage-flash').style.opacity='.62';camera.rotation.x+=.045;camera.rotation.z+=rand(-.035,.035);
            setTimeout(()=>$('damage-flash').style.opacity='0',190);
            playSfx('hit');playerDamageCooldown=.9;
          }
          e.attack=1.28;
        }
      }
    }
    mesh.position.y=Math.sin(sceneTime*2.8+e.phase)*.018;
  }

  playerDamageCooldown=Math.max(0,playerDamageCooldown-dt);
  for(let i=projectiles.length-1;i>=0;i--){
    const b=projectiles[i],previous=b.position.clone();
    b.position.addScaledVector(b.userData.velocity,dt);b.userData.life-=dt;
    let hit=false;
    for(const e of enemies){
      if(!e.mesh.visible||e.mesh.userData.dying||e.activateIn>0)continue;
      const body=e.mesh.position.clone().add(v3(0,1.55,0));
      const head=e.mesh.position.clone().add(v3(0,2.48,0));
      const bodyPoint=new THREE.Vector3(),headPoint=new THREE.Vector3();
      const segment=new THREE.Line3(previous,b.position);
      segment.closestPointToPoint(body,true,bodyPoint);
      segment.closestPointToPoint(head,true,headPoint);
      if(bodyPoint.distanceTo(body)<.7||headPoint.distanceTo(head)<.48){
        e.hp--;e.stagger=.28;e.mesh.userData.hitFlash=.22;hit=true;
        spawnImpact(b.position.clone(),0x9dff9e);
        if(e.hp<=0){destroyEnemy(e,0x9dff9e);flightScore++;showToast('ЦЕЛЬ УСТРАНЕНА',700);playSfx('enemyDown');}
        else{showToast(headPoint.distanceTo(head)<.48?'ПОПАДАНИЕ В ГОЛОВУ':'ПОПАДАНИЕ',450);}
        break;
      }
    }
    if(hit||b.userData.life<=0){world.remove(b);projectiles.splice(i,1);}
  }
  if(flightScore>=flightGoal){
    const chest=interactables.find(i=>i.kind==='chest');
    if(chest){chest.mesh.visible=true;}
    setObjective('Найти ящик Пандоры.');
  }
  if(health<=0){health=100;updateHealth();buildGarden();showToast('СИСТЕМА ВОССТАНОВЛЕНА. ПОПРОБУЙ ЕЩЁ РАЗ.');}
}
function spawnImpact(pos,color){for(let i=0;i<(isMobileLayout()?4:6);i++){const p=sphere(world,.045,mat(color,.25,0,{emissive:color,emissiveIntensity:1.5,transparent:true,opacity:1}),pos.x,pos.y,pos.z);p.userData.disposeMaterial=true;p.userData.life=rand(.18,.42);p.userData.velocity=v3(rand(-2.5,2.5),rand(-.2,2.4),rand(-2.5,2.5));particles.push(p);}}
function destroyEnemy(enemy,color=0xa4ffbc){if(!enemy?.mesh||enemy.mesh.userData.dying)return;const mesh=enemy.mesh;mesh.userData.dying=true;animatedObjects.push({object:mesh,type:'enemyDeath',elapsed:0,duration:.42,startScale:mesh.scale.clone()});spawnImpact(mesh.position.clone().add(v3(0,1.1,0)),color);}

// -------------------- FLIGHT UPDATE --------------------
function performUltraStrike(){
  if(phase!=='flight'||performance.now()<boostUntil)return;boostUntil=performance.now()+4600;ufo.userData.boost=1.35;
  const ring=torus(world,1.1,.14,mat('#9effc2',.2,.15,{emissive:'#5cff9b',emissiveIntensity:2.6,transparent:true,opacity:.95}),ufo.position.x,ufo.position.y,ufo.position.z,Math.PI/2,0,0);ring.userData.pulseLife=.95;flightPulseMeshes.push(ring);
  const shock=addLight(world,0x9effc2,7,22,ufo.position.x,ufo.position.y,ufo.position.z);shock.userData.lightPulse=.6;pulseLights.push(shock);
  for(const e of flightEnemies){if(e.mesh.visible&&!e.mesh.userData.dying&&e.mesh.position.distanceTo(ufo.position)<13){destroyEnemy(e,0xa4ffbc);flightScore=Math.min(flightGoal,flightScore+1);}}
  playSfx('boost');showToast('УЛЬТРАУДАР',1100);
}

function updateFlight(dt){
  flightTime+=dt;fireCooldown=Math.max(0,fireCooldown-dt);if((fireHeldRMB||fireHeld)&&fireCooldown<=0){fireFlightShot();fireCooldown=.13;}
  if(weaponRig)weaponRig.visible=false;if(lighterRig)lighterRig.visible=false;if(portalRig)portalRig.visible=false;if(lighterGlow)lighterGlow.intensity=0;if(lighterSpot)lighterSpot.intensity=0;
  const boosting=!!(keys.ShiftLeft||keys.ShiftRight)&&flightScore<flightGoal;
  if(ufo.userData.boost>0)ufo.userData.boost=Math.max(0,ufo.userData.boost-dt);
  for(let i=flightPulseMeshes.length-1;i>=0;i--){const ring=flightPulseMeshes[i];ring.userData.pulseLife-=dt;const k=1+(0.95-ring.userData.pulseLife)*6.5;ring.scale.setScalar(k);ring.material.opacity=Math.max(0,ring.userData.pulseLife);if(ring.userData.pulseLife<=0){world.remove(ring);flightPulseMeshes.splice(i,1);}}
  const input=v3(clamp((keys.KeyD?1:0)-(keys.KeyA?1:0)+touchMoveX,-1,1),(keys.Space?1:0)-(keys.ControlLeft||keys.ControlRight?1:0),(keys.KeyS?1:0)-(keys.KeyW?1:0)-touchMoveY);if(input.lengthSq()>0)input.normalize();
  const maxSpeed=boosting?29:15.5;const targetVelocity=input.multiplyScalar(maxSpeed);const accel=boosting?7.2:3.8;ufo.userData.velocity.lerp(targetVelocity,1-Math.exp(-accel*dt));
  ufo.position.addScaledVector(ufo.userData.velocity,dt);ufo.position.x=clamp(ufo.position.x,-43,43);ufo.position.y=clamp(ufo.position.y,3,28);ufo.position.z=clamp(ufo.position.z,-42,40);
  const speed=ufo.userData.velocity.length();const speedN=clamp(speed/30,0,1);ufo.rotation.z=THREE.MathUtils.damp(ufo.rotation.z,-ufo.userData.velocity.x*.018,4.5,dt);ufo.rotation.x=THREE.MathUtils.damp(ufo.rotation.x,ufo.userData.velocity.z*.014,4.5,dt);ufo.rotation.y=THREE.MathUtils.damp(ufo.rotation.y,-ufo.userData.velocity.x*.015,3.2,dt);
  ufo.userData.flightAnim+=dt*(boosting?14:6);ufo.userData.thrusters.forEach((thruster,i)=>{const pulse=.85+Math.sin(ufo.userData.flightAnim+i*1.7)*.14;thruster.plume.scale.set(1,boosting?1.85*pulse:1.05*pulse,1);thruster.core.scale.y=boosting?1.65:1;});ufo.userData.underGlow.intensity=3+speedN*5;ufo.userData.hull.material.emissive.setHex(boosting?0x123c37:0x000000);ufo.userData.hull.material.emissiveIntensity=boosting?1.15:0;
  // A soft chase camera lags behind acceleration and banks into turns.
  const camTarget=ufo.position.clone().add(v3(-ufo.userData.velocity.x*.32,7.2,15.8));camera.position.lerp(camTarget,1-Math.exp(-3.2*dt));
  const aimTarget=ufo.position.clone().add(v3(flightAimX*22,flightAimY*17,-28));camera.lookAt(aimTarget);camera.fov=THREE.MathUtils.damp(camera.fov,boosting?82:76,3.2,dt);camera.updateProjectionMatrix();
  flightTrailClock-=dt;if(speed>7&&flightTrailClock<=0){flightTrailClock=isMobileLayout()?(boosting?.09:.16):(boosting?.055:.11);const trail=sphere(world,.08,mat('#8dffd0',.2,0,{emissive:'#4be9ae',emissiveIntensity:1.5,transparent:true,opacity:.55}),ufo.position.x,ufo.position.y-.7,ufo.position.z+1.8,.85,1.4,2.8);trail.userData.disposeMaterial=true;trail.userData.life=.35;trail.userData.velocity=v3(rand(-.3,.3),-.4,2.5);particles.push(trail);}
  for(const e of flightEnemies){if(!e.mesh.visible||e.mesh.userData.dying)continue;const d=new THREE.Vector3().subVectors(ufo.position,e.mesh.position);const dist=d.length();if(dist>1.8){d.normalize();const orbit=v3(-d.z,Math.sin(flightTime+e.phase)*.15,d.x);e.mesh.position.addScaledVector(d,e.speed*dt);e.mesh.position.addScaledVector(orbit,Math.sin(flightTime*1.4+e.phase)*dt*1.2);}e.mesh.position.y+=Math.sin(flightTime*3+e.phase)*dt*.65;e.mesh.lookAt(ufo.position);animateAlien(e.mesh,dt,e.speed,true);}
  for(let i=flightShots.length-1;i>=0;i--){const b=flightShots[i],previous=b.position.clone();b.position.addScaledVector(b.userData.velocity,dt);b.userData.life-=dt;let hit=false;
    for(const e of flightEnemies){if(e.mesh.visible&&!e.mesh.userData.dying){const center=e.mesh.position.clone().add(v3(0,1.25,0)),point=new THREE.Vector3();new THREE.Line3(previous,b.position).closestPointToPoint(center,true,point);if(point.distanceTo(center)<.95){e.hp--;hit=true;spawnImpact(b.position.clone(),0xff9275);if(e.hp<=0){destroyEnemy(e,0xff9275);flightScore++;playSfx('enemyDown');}else showToast('ПОПАДАНИЕ',350);break;}}}
    if(hit||b.userData.life<=0){world.remove(b);flightShots.splice(i,1);}
  }
  $('flight-heading').textContent=`КУРС ${String(Math.round((ufo.rotation.y*180/Math.PI+360)%360)).padStart(3,'0')}°`;if(isTouchDevice){const shift=$('touch-controls').querySelector('[data-touch="transition"]');if(shift)shift.textContent=flightScore>=flightGoal?'SHIFT':'BOOST';}
  $('flight-boost').textContent=boosting?'ТУРБО / АКТИВНО':performance.now()<boostUntil?'УЛЬТРА / КД':'F / УДАР ГОТОВ';$('flight-score').textContent=`${Math.min(flightScore,flightGoal)} / ${flightGoal}`;
  const active=flightEnemies.filter(e=>e.mesh.visible&&!e.mesh.userData.dying).length;if(active<5&&flightScore<flightGoal&&Math.random()<dt*.85)flightEnemies.push(createFlightEnemy());
  const reticle=$('flight-reticle');reticle.style.left=`${(50+flightAimX*35).toFixed(2)}%`;reticle.style.top=`${(50-flightAimY*30).toFixed(2)}%`;reticle.classList.toggle('boosting',boosting);
  if(flightScore>=flightGoal){$('shift-prompt').classList.remove('hidden');setObjective('Нажать SHIFT, чтобы пройти сквозь пространство.');}
}

// -------------------- AUDIO --------------------
function initAudio(){if(audioCtx)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audioCtx=new AC();masterGain=audioCtx.createGain();masterGain.gain.value=Number($('volume-slider').value)/100;masterGain.connect(audioCtx.destination);}
function playSfx(type){if(!audioCtx||!masterGain)return;if(audioCtx.state==='suspended')audioCtx.resume();const now=audioCtx.currentTime;const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.connect(gain);gain.connect(masterGain);if(type==='shoot'){osc.type='sawtooth';osc.frequency.setValueAtTime(330,now);osc.frequency.exponentialRampToValueAtTime(58,now+.13);gain.gain.setValueAtTime(.16,now);gain.gain.exponentialRampToValueAtTime(.001,now+.18);osc.start(now);osc.stop(now+.19);}else if(type==='hit'){osc.type='triangle';osc.frequency.setValueAtTime(90,now);osc.frequency.exponentialRampToValueAtTime(35,now+.2);gain.gain.setValueAtTime(.18,now);gain.gain.exponentialRampToValueAtTime(.001,now+.22);osc.start(now);osc.stop(now+.23);}else if(type==='boost'){osc.type='sawtooth';osc.frequency.setValueAtTime(100,now);osc.frequency.exponentialRampToValueAtTime(680,now+.32);gain.gain.setValueAtTime(.14,now);gain.gain.exponentialRampToValueAtTime(.001,now+.38);osc.start(now);osc.stop(now+.4);}else if(type==='stalker'){osc.type='triangle';osc.frequency.setValueAtTime(58,now);osc.frequency.exponentialRampToValueAtTime(31,now+.55);gain.gain.setValueAtTime(.001,now);gain.gain.linearRampToValueAtTime(.105,now+.08);gain.gain.exponentialRampToValueAtTime(.001,now+.62);osc.start(now);osc.stop(now+.64);}else if(type==='portal'){osc.type='sawtooth';osc.frequency.setValueAtTime(74,now);osc.frequency.exponentialRampToValueAtTime(920,now+.22);osc.frequency.exponentialRampToValueAtTime(180,now+.6);gain.gain.setValueAtTime(.001,now);gain.gain.linearRampToValueAtTime(.17,now+.035);gain.gain.exponentialRampToValueAtTime(.001,now+.72);osc.start(now);osc.stop(now+.74);const sub=audioCtx.createOscillator(),sg=audioCtx.createGain();sub.type='sine';sub.frequency.setValueAtTime(42,now);sub.frequency.exponentialRampToValueAtTime(24,now+.55);sub.connect(sg);sg.connect(masterGain);sg.gain.setValueAtTime(.12,now);sg.gain.exponentialRampToValueAtTime(.001,now+.62);sub.start(now);sub.stop(now+.64);}else{osc.type='sine';osc.frequency.setValueAtTime(180,now);osc.frequency.exponentialRampToValueAtTime(550,now+.16);gain.gain.setValueAtTime(.1,now);gain.gain.exponentialRampToValueAtTime(.001,now+.22);osc.start(now);osc.stop(now+.23);}}

// -------------------- TOUCH CONTROLS --------------------
function doInteract(){
  if(phase==='cockpit'&&sceneTime>2.2&&$('dialogue').classList.contains('hidden')){endCycle();return;}
  if(phase==='basement'&&tryResurrectionInteraction())return;
  interact();
}
function doSecondaryAction(){
  if(phase==='flight'){fireFlightShot();return;}
  if(phase==='basement'&&selectedSlot===3){firePortalShot();return;}
  if(phase==='garden'&&selectedSlot===3)showToast('ПОРТАЛЬНОЕ УСТРОЙСТВО В ЭТОМ МИРЕ НЕ ОТВЕЧАЕТ');
}
function bindTouchControls(){
  if(!isTouchDevice)return;
  const controls=$('touch-controls'),stick=$('move-stick'),knob=$('stick-knob'),look=$('touch-look');
  if(!controls||!stick||!knob||!look)return;
  controls.classList.remove('hidden');
  const setStick=(e)=>{const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=43,len=Math.hypot(dx,dy),scale=len>max?max/len:1;const px=dx*scale,py=dy*scale;const ax=px/max,ay=-py/max,mag=Math.min(1,Math.hypot(ax,ay));const corrected=mag<.12?0:(mag-.12)/.88/Math.max(mag,.001);touchMoveX=ax*corrected;touchMoveY=ay*corrected;knob.style.transform=`translate(${px}px,${py}px)`;};
  const resetStick=()=>{touchMoveX=0;touchMoveY=0;knob.style.transform='translate(0,0)';stickPointerId=null;};
  stick.addEventListener('pointerdown',e=>{if(stickPointerId!==null)return;stickPointerId=e.pointerId;stick.setPointerCapture(e.pointerId);setStick(e);e.preventDefault();});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointerId)setStick(e);});
  stick.addEventListener('pointerup',e=>{if(e.pointerId===stickPointerId)resetStick();});
  stick.addEventListener('pointercancel',resetStick);
  look.addEventListener('pointerdown',e=>{if(lookPointerId!==null)return;lookPointerId=e.pointerId;lookLastX=e.clientX;lookLastY=e.clientY;look.setPointerCapture(e.pointerId);e.preventDefault();});
  look.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointerId)return;const dx=e.clientX-lookLastX,dy=e.clientY-lookLastY;lookLastX=e.clientX;lookLastY=e.clientY;if(phase==='flight'){flightAimX=clamp(flightAimX+dx/Math.max(320,innerWidth)*2.25,-.78,.78);flightAimY=clamp(flightAimY-dy/Math.max(240,innerHeight)*2.0,-.68,.68);}else{yaw-=dx*.0036;pitch=clamp(pitch-dy*.0032,-1.35,1.35);}e.preventDefault();});
  const endLook=e=>{if(e.pointerId===lookPointerId)lookPointerId=null;};look.addEventListener('pointerup',endLook);look.addEventListener('pointercancel',endLook);
  document.querySelectorAll('[data-touch]').forEach(btn=>{
    const action=btn.dataset.touch;
    const down=e=>{e.preventDefault();btn.classList.add('pressed');btn.setPointerCapture?.(e.pointerId);
      if(action==='interact')doInteract();
      else if(action==='fire'){fireHeld=true;if(phase==='flight'){fireFlightShot();fireCooldown=.13;}else{shootEnergy();fireCooldown=.105;}}
      else if(action==='sprint'){if(phase==='flight'&&flightScore>=flightGoal){transitionTo(()=>{createCockpit();playSfx('boost');$('flight-reticle').classList.add('hidden');});}else{touchSprint=true;keys.ShiftLeft=true;}}
      else if(action==='portal')doSecondaryAction();
      else if(action==='ultra')performUltraStrike();
      else if(action==='transition'&&phase==='flight'){if(flightScore>=flightGoal){transitionTo(()=>{createCockpit();playSfx('boost');$('flight-reticle').classList.add('hidden');});}else{touchSprint=true;keys.ShiftLeft=true;}}
      else if(action==='up')keys.Space=true;
      else if(action==='down')keys.ControlLeft=true;
    };
    const up=e=>{if(e)e.preventDefault();btn.classList.remove('pressed');if(action==='fire')fireHeld=false;if(action==='sprint'||action==='transition'){touchSprint=false;keys.ShiftLeft=false;}if(action==='up')keys.Space=false;if(action==='down')keys.ControlLeft=false;};
    btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('lostpointercapture',up);
  });
}
function syncTouchHUD(){if(!isTouchDevice)return;const controls=$('touch-controls');if(!controls)return;controls.classList.toggle('flight-mode',phase==='flight');$('flight-reticle').classList.toggle('hidden',phase!=='flight');const shift=controls.querySelector('[data-touch="transition"]');if(shift)shift.textContent=flightScore>=flightGoal?'SHIFT':'BOOST';}
function clearTouchState(){touchMoveX=0;touchMoveY=0;touchSprint=false;stickPointerId=null;lookPointerId=null;keys.ShiftLeft=false;keys.Space=false;keys.ControlLeft=false;fireHeld=false;document.querySelectorAll('.touch-btn.pressed').forEach(b=>b.classList.remove('pressed'));const knob=$('stick-knob');if(knob)knob.style.transform='translate(0,0)';}
window.addEventListener('blur',clearTouchState);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTouchState();});
window.addEventListener('orientationchange',()=>{setTimeout(()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();applyQuality();},180);});
window.addEventListener('contextmenu',e=>{if(isTouchDevice)e.preventDefault();});
window.addEventListener('gesturestart',e=>{if(isTouchDevice)e.preventDefault();},{passive:false});

// -------------------- UI / STATE --------------------
function openPause(){if(paused||phase==='intro'||phase==='ending')return;paused=true;fireHeld=false;fireHeldRMB=false;pauseAmbientMusic();pauseFrom=phase;$('pause-screen').classList.remove('hidden');if(document.pointerLockElement)document.exitPointerLock();}
function closePause(){paused=false;resumeAmbientMusic();$('pause-screen').classList.add('hidden');if(phase!=='intro'&&phase!=='ending')canvas.requestPointerLock?.();}
function resetGame(){introCinematic=false;introCinematicTime=0;cinematicStrikeDone=false;$('cinematic-overlay').classList.add('hidden');inventory={lighter:false,blood:false,water:false,portal:false,carbine:false,keys:false};health=100;updateHealth();flightScore=0;selectedSlot=1;cockpitDialogueStarted=false;bloodPoured=false;waterPoured=false;bookRead=false;fireHeld=false;fireHeldRMB=false;introTime=0;flightAimX=0;flightAimY=0;paused=false;buildIntro();updateSlots();$('ending-screen').classList.add('hidden');$('pause-screen').classList.add('hidden');$('hud').classList.add('hidden');$('flight-hud').classList.add('hidden');$('flight-reticle').classList.add('hidden');$('crosshair').classList.remove('hidden');$('intro-copy').classList.add('hidden');}
function handleKeyDown(e){keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.repeat)return;
  if(e.code==='Escape'){if(paused)closePause();else openPause();return;}
  if(e.code==='KeyE'){doInteract();return;}
  if(e.code==='KeyQ'){doSecondaryAction();return;}
  if(e.code==='Enter'&&!$('dialogue').classList.contains('hidden')){advanceDialogue();return;}
  if(e.code==='Digit1'&&inventory.lighter){selectedSlot=1;updateSlots();}if(e.code==='Digit2'&&inventory.carbine){selectedSlot=2;updateSlots();}if(e.code==='Digit3'&&inventory.portal){selectedSlot=3;updateSlots();}
  if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&phase==='flight'&&flightScore>=flightGoal){transitionTo(()=>{createCockpit();playSfx('boost');$('flight-reticle').classList.add('hidden');});return;}if(e.code==='KeyF'&&phase==='flight'){performUltraStrike();}
}
function handleKeyUp(e){keys[e.code]=false;}
function handleMouseMove(e){if(document.pointerLockElement!==canvas||paused)return;if(phase==='intro')return;if(phase==='flight'){flightAimX=clamp(flightAimX+e.movementX/Math.max(480,innerWidth)*1.65,-.72,.72);flightAimY=clamp(flightAimY-e.movementY/Math.max(360,innerHeight)*1.65,-.62,.62);return;}const sens=.00215;yaw-=e.movementX*sens;pitch-=e.movementY*sens;pitch=clamp(pitch,-1.42,1.42);}
function handleMouseDown(e){if(phase==='intro'||phase==='ending')return;if(paused)return;if(e.button===0&&(phase==='garden'||phase==='basement')&&inventory.carbine&&selectedSlot===2){fireHeld=true;shootEnergy();fireCooldown=.105;}if(e.button===2){e.preventDefault();if(phase==='flight'){fireHeldRMB=true;fireFlightShot();fireCooldown=.16;}else doSecondaryAction();}}
window.addEventListener('mouseup',e=>{if(e.button===0)fireHeld=false;if(e.button===2)fireHeldRMB=false;});
canvas.addEventListener('mousedown',handleMouseDown);canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',handleKeyDown);window.addEventListener('keyup',handleKeyUp);window.addEventListener('mousemove',handleMouseMove);
function beginOpeningCinematic(){try{screen.orientation?.lock?.('landscape').catch(()=>{});}catch{}initAudio();audioCtx?.resume();setGameVolume($('volume-slider').value);startAmbientMusic();introCinematic=true;introCinematicTime=0;cinematicStrikeDone=false;$('intro-copy').classList.add('hidden');$('cinematic-overlay').classList.remove('hidden');}
$('start-button').addEventListener('click',beginOpeningCinematic);$('cinematic-skip').addEventListener('click',()=>{if(!introCinematic)return;introCinematicTime=9.5;});
$('pause-button').addEventListener('click',openPause);$('resume-button').addEventListener('click',closePause);$('restart-button').addEventListener('click',()=>{resetGame();closePause();});$('loop-button').addEventListener('click',()=>{resetGame();});
$('volume-slider').addEventListener('input',e=>{const n=Number(e.target.value);$('volume-value').textContent=`${n}%`;setGameVolume(n);try{localStorage.setItem('krovotkinskaya_volume',String(n));}catch{}});
function applyQuality(){const ratios={high:1.3,medium:1.08,low:isTouchDevice?.82:.92};const cap=isTouchDevice?Math.min(ratios[quality],.9):ratios[quality];renderer.setPixelRatio(Math.min(devicePixelRatio||1,cap));renderer.shadowMap.enabled=false;renderer.setSize(innerWidth,innerHeight);}
$('quality-select').addEventListener('change',e=>{quality=e.target.value;applyQuality();try{localStorage.setItem('krovotkinskaya_quality',quality);}catch{}});
$('inventory').addEventListener('click',e=>{const slot=e.target.closest('.slot');if(!slot)return;const n=Number(slot.dataset.slot);if((n===1&&inventory.lighter)||(n===2&&inventory.carbine)||(n===3&&inventory.portal)){selectedSlot=n;updateSlots();}});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&!paused&&phase!=='intro'&&phase!=='ending'&&!$('pause-screen').classList.contains('hidden'))return;if(document.pointerLockElement!==canvas&&!paused&&phase!=='intro'&&phase!=='ending'){openPause();}});

// -------------------- FRAME LOOP --------------------
function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(p.userData.life!==undefined){p.userData.life-=dt;if(p.userData.velocity)p.position.addScaledVector(p.userData.velocity,dt);p.material.opacity=p.userData.life>0?Math.min(1,p.userData.life*3):0;if(p.userData.life<=0){world.remove(p);if(p.geometry&&!p.geometry.userData.krovShared)p.geometry.dispose();if(p.userData.disposeMaterial)p.material?.dispose();particles.splice(i,1);}}else if(p.userData.fall){p.position.y-=p.userData.fall*dt;if(p.position.y<0)p.position.y=22;}else if(p.userData.dust){p.position.y+=Math.sin(sceneTime*1.4+p.position.x)*dt*.035;p.position.x+=Math.sin(sceneTime*.7+p.position.z)*dt*.02;}}}
function updateInteractions(){if(['church','basement','garden'].includes(phase)&&!paused){findInteraction();}else{$('interact-prompt').classList.add('hidden');}}
function updateIntro(dt){
  introTime+=dt;
  const saucer=world.children.find(o=>o.userData.intro);
  if(saucer){saucer.position.x=12-introTime*.42;saucer.position.y=18+Math.sin(introTime*1.2)*.3;if(introTime>2.8&&introTime<3.2&&!saucer.userData.struck){saucer.userData.struck=true;createLightning();}if(introTime>5)saucer.position.y=17;}
  if(!introCinematic){camera.position.x=THREE.MathUtils.damp(camera.position.x,1.8,0.14,dt);camera.position.y=THREE.MathUtils.damp(camera.position.y,5.1,0.14,dt);camera.lookAt(-5,8,-6);if(introTime>7.2&&$('intro-copy').classList.contains('hidden'))$('intro-copy').classList.remove('hidden');return;}
  introCinematicTime+=dt;const t=introCinematicTime;
  const shots=[
    {t:0,p:v3(1.8,5.1,33),a:v3(-5,8,-6)},
    {t:2.1,p:v3(-1.5,6.2,22),a:v3(-8,9,-7)},
    {t:4.5,p:v3(-5.8,6.1,16),a:v3(-9,8.5,-7)},
    {t:6.7,p:v3(-8.6,4.5,12),a:v3(-9,5.2,-7)},
    {t:8.3,p:v3(-9,3.1,9),a:v3(-9,3.2,-7)}
  ];
  let idx=0;while(idx<shots.length-2&&t>shots[idx+1].t)idx++;const from=shots[idx],to=shots[idx+1],u=clamp((t-from.t)/(to.t-from.t),0,1),ease=u*u*(3-2*u);
  camera.position.lerpVectors(from.p,to.p,ease);const aim=from.a.clone().lerp(to.a,ease);camera.lookAt(aim);
  const overlay=$('cinematic-overlay');if(overlay){overlay.classList.remove('hidden');let line='03:17 / КАМЕРА НАБЛЮДЕНИЯ';if(t>2.1)line='НЕИЗВЕСТНЫЙ ОБЪЕКТ ВХОДИТ В АТМОСФЕРУ';if(t>4.5)line='ТРАЕКТОРИЯ ОБЪЕКТА ИЗМЕНЕНА';if(t>6.7)line='СИГНАЛ ПОСТУПАЕТ ИЗНУТРИ ХРАМА';$('cinematic-caption').textContent=line;overlay.classList.toggle('cinematic-impact',t>4.52&&t<4.86);}
  if(t>4.52&&!cinematicStrikeDone){cinematicStrikeDone=true;createLightning();}
  if(t>9.4){introCinematic=false;transitionTo(()=>{$('cinematic-overlay').classList.add('hidden');buildChurch();createWeaponView();if(!isTouchDevice)canvas.requestPointerLock?.();});}
}
function animateProps(dt){
  weaponIdle+=dt;weaponRecoil=Math.max(0,weaponRecoil-dt*.9);pickupPulse=Math.max(0,pickupPulse-dt);equipPulse=Math.max(0,equipPulse-dt);
  for(let i=animatedObjects.length-1;i>=0;i--){const item=animatedObjects[i],o=item.object;if(!o.visible)continue;const t=sceneTime*(item.speed||1)+(item.phase||0);if(item.type==='collect'){item.elapsed+=dt;const k=Math.max(0,1-item.elapsed/item.duration);o.scale.copy(item.startScale).multiplyScalar(k);o.rotation.y+=dt*12;o.position.y+=dt*.8;if(item.elapsed>=item.duration){o.visible=false;world.remove(o);animatedObjects.splice(i,1);}continue;}if(item.type==='enemyDeath'){item.elapsed+=dt;const k=Math.max(0,1-item.elapsed/item.duration);o.scale.copy(item.startScale).multiplyScalar(k);o.rotation.y+=dt*5;o.position.y-=dt*.28;if(item.elapsed>=item.duration){o.visible=false;world.remove(o);animatedObjects.splice(i,1);}continue;}if(item.type==='pickup'){o.position.y=o.userData.animBaseY+Math.sin(t)*item.amplitude;o.rotation.y=o.userData.animBaseRot+Math.sin(t*.55)*.18;}else if(item.type==='book'){o.rotation.z=Math.sin(t)*.012;o.rotation.y=o.userData.animBaseRot+Math.sin(t*.45)*.035;}else if(item.type==='ripple'){o.scale.setScalar(1+Math.sin(t)*.12);o.material.opacity=.12+Math.sin(t)*.08;}}
  if(candleFlame){const flick=.82+Math.sin(sceneTime*17)*.11+Math.sin(sceneTime*31)*.06;candleFlame.scale.set(.7*flick,1.7*flick,.7*flick);candleFlame.rotation.z=Math.sin(sceneTime*12)*.08;}
  if(candleLight)candleLight.intensity=1.8+Math.sin(sceneTime*18)*.22+Math.sin(sceneTime*29)*.13;
  if(weaponRig){weaponRig.visible=(phase==='garden'||phase==='basement')&&!!inventory.carbine&&selectedSlot===2;weaponRig.position.y=-.32+Math.sin(weaponIdle*7)*.006-weaponRecoil*.72+equipPulse*.46;weaponRig.position.x=.36+Math.sin(weaponIdle*3.5)*.008;weaponRig.rotation.x=-.03+weaponRecoil*1.1;if(weaponRig.userData.flash&&weaponRecoil<.03)weaponRig.userData.flash.visible=false;if(muzzleFlash)muzzleFlash.intensity=weaponRecoil>.02?6:0;}
  $('crosshair').classList.toggle('firing',weaponRecoil>.025&&(phase==='garden'||phase==='basement'));
  if(lighterRig){lighterRig.visible=(phase==='church'||phase==='basement')&&!!inventory.lighter&&selectedSlot===1;lighterRig.rotation.z=-.08+Math.sin(weaponIdle*2)*.025;lighterRig.position.y=-.31+Math.sin(weaponIdle*2.2)*.009+equipPulse*.42;if(lighterRig.userData.spark)lighterRig.userData.spark.visible=lighterRig.visible&&Math.sin(sceneTime*13)>0.94;}
  if(lighterGlow)lighterGlow.intensity=(inventory.lighter&&selectedSlot===1&&(phase==='church'||phase==='basement'))?2.05:0;if(lighterSpot)lighterSpot.intensity=(inventory.lighter&&selectedSlot===1&&(phase==='church'||phase==='basement'))?3.2:0;
  if(portalRig){portalRig.visible=(phase==='church'||phase==='basement'||phase==='garden')&&inventory.portal&&selectedSlot===3;const portalOnline=phase==='basement';portalRig.userData.core.material.emissive.setHex(portalOnline?0x49d9a1:0x812e36);portalRig.userData.kick=Math.max(0,portalRig.userData.kick-dt*1.8);portalRig.position.y=-.34+Math.sin(weaponIdle*2.4)*.012-portalRig.userData.kick*.24+equipPulse*.4;portalRig.rotation.x=-.08+Math.sin(weaponIdle*2.8)*.018+portalRig.userData.kick*.55;portalRig.userData.ring.rotation.z+=dt*2.8;portalRig.userData.core.material.emissiveIntensity=portalOnline?2.2+Math.sin(sceneTime*9)*.7:.28+Math.sin(sceneTime*5)*.12;}
  if(portalMesh?.userData?.vortex){portalMesh.userData.vortex.rotation.z-=dt*.82;portalMesh.userData.portalDisc.rotation.z+=dt*.24;portalMesh.userData.light.intensity=2.2+Math.sin(sceneTime*5.4)*.45;}if(pickupPulse>0&&phase!=='flight'){camera.fov=THREE.MathUtils.damp(camera.fov,76-pickupPulse*5,12,dt);camera.updateProjectionMatrix();}else if(phase!=='flight')camera.fov=THREE.MathUtils.damp(camera.fov,76,4,dt);
  if(friendAlien&&friendAlien.parent===world)animateAlien(friendAlien,dt,.15,false);if(ufo&&phase==='garden'){ufo.position.y=.35+Math.sin(sceneTime*1.5)*.1;ufo.rotation.y=Math.sin(sceneTime*.5)*.025;}if(ufo?.userData?.muzzleGlow){ufo.userData.shotFlash=Math.max(0,ufo.userData.shotFlash-dt);ufo.userData.muzzleGlow.intensity=ufo.userData.shotFlash*58;if(ufo.userData.muzzleCore)ufo.userData.muzzleCore.visible=ufo.userData.shotFlash>0;}
  for(let i=pulseLights.length-1;i>=0;i--){const light=pulseLights[i];light.userData.lightPulse-=dt;light.intensity=Math.max(0,light.userData.lightPulse*12);if(light.userData.lightPulse<=0){world.remove(light);pulseLights.splice(i,1);}}
}
function update(dt){if(paused)return;sceneTime+=dt;animateProps(dt);if(portalShots.length||portalShotCooldown>0)updatePortalShots(dt);
  if(phase==='intro'){updateIntro(dt);updateParticles(dt);return;}
  if(phase==='church'||phase==='basement'){movePlayer(dt);setCameraFPS();if(phase==='basement')updateBasementCombat(dt);if(phase==='church'&&weaponRig)weaponRig.visible=false;}
  if(phase==='garden')updateGarden(dt);
  if(phase==='flight')updateFlight(dt);
  if(phase==='cockpit'){
    if(sceneTime<3.2){yaw=THREE.MathUtils.damp(yaw,Math.PI,1.25,dt);camera.rotation.set(pitch,yaw,0,'YXZ');}
    if(sceneTime>3.2&&!cockpitDialogueStarted){cockpitDialogueStarted=true;startFinalDialogue();}
  }
  if(toastTimer>0){toastTimer-=dt*1000;if(toastTimer<=0)$('toast').classList.remove('visible');}
  updateParticles(dt);updateInteractions();
}

let lastFrameTime=0;function animate(now=0){requestAnimationFrame(animate);const targetFPS=paused?12:(isMobileLayout()?40:60);if(now-lastFrameTime<1000/targetFPS)return;lastFrameTime=now;const dt=Math.min(clock.getDelta(),.04);update(dt);renderer.render(scene,camera);} 
function handleResize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();applyQuality();}
window.addEventListener('resize',handleResize);

// Initial boot.
try{const savedVolume=Number(localStorage.getItem('krovotkinskaya_volume')??65);$('volume-slider').value=String(clamp(savedVolume,0,100));$('volume-value').textContent=`${clamp(savedVolume,0,100)}%`;quality=localStorage.getItem('krovotkinskaya_quality')||(isTouchDevice?'low':'medium');if(!['high','medium','low'].includes(quality))quality=isTouchDevice?'low':'medium';$('quality-select').value=quality;setGameVolume($('volume-slider').value);applyQuality();}catch{}
bindTouchControls();buildIntro();syncTouchHUD();$('loading-cover').classList.add('done');setTimeout(()=>$('loading-cover').remove(),850);animate();
