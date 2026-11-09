// Shared coarse-grid vector-field fluid for pixel ash and magical fire.
// Semi-Lagrangian advection + vorticity confinement + Jacobi pressure projection.
// Simulation grid is intentionally ~1/8 of the pixel-art sprite resolution.
class AirflowField {
  constructor(width, height, cellSize = 8) {
    this.cell = cellSize;
    this.width = Math.ceil(width / cellSize);
    this.height = Math.ceil(height / cellSize);
    const size = this.width * this.height;
    const arr = () => new Float32Array(size);
    this.u = arr(); this.v = arr();
    this.advU = arr(); this.advV = arr();
    this.pressure = arr(); this.nextPressure = arr();
    this.divergence = arr(); this.vorticity = arr();
  }
  clear() {
    for (const field of [this.u,this.v,this.advU,this.advV,this.pressure,
      this.nextPressure,this.divergence,this.vorticity]) field.fill(0);
  }
  // Scalar bilinear sampling avoids per-cell object allocations.
  bilinear(field,x,y) {
    const w=this.width,h=this.height;
    x=Math.max(0,Math.min(w-1.001,x));
    y=Math.max(0,Math.min(h-1.001,y));
    const ix=Math.floor(x),iy=Math.floor(y),a=x-ix,b=y-iy;
    const right=Math.min(ix+1,w-1),lower=Math.min(iy+1,h-1)*w;
    const top=iy*w;
    return (field[top+ix]*(1-a)+field[top+right]*a)*(1-b)+
      (field[lower+ix]*(1-a)+field[lower+right]*a)*b;
  }
  sample(worldX,worldY) {
    const x=worldX/this.cell,y=worldY/this.cell;
    return {x:this.bilinear(this.u,x,y),y:this.bilinear(this.v,x,y)};
  }
  // Tiny vortices from breaking flesh stir nearby particles coherently.
  puff(worldX,worldY,strength=.3) {
    const cx=Math.round(worldX/this.cell),cy=Math.round(worldY/this.cell);
    const w=this.width,h=this.height;
    for (let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
      const x=cx+dx,y=cy+dy;
      if(x<1||y<1||x>=w-1||y>=h-1)continue;
      const n=y*w+x,fall=Math.exp(-(dx*dx+dy*dy)*.38)*strength;
      this.u[n]+=-dy*fall*.32;
      this.v[n]+=dx*fall*.32-fall*.17;
    }
  }
  step(dt,clock,pressed,handX,handY,range,pulse) {
    const s=Math.max(0,Math.min(2.4,dt/16.667));
    if(!s)return;
    const w=this.width,h=this.height,c=this.cell;
    const u=this.u,v=this.v,nu=this.advU,nv=this.advV,div=this.divergence,curl=this.vorticity;
    const decay=Math.pow(.989,s);
    // Semi-Lagrangian advection follows old velocity backward in time.
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const n=y*w+x,bx=x-u[n]*s/c,by=y-v[n]*s/c;
      nu[n]=this.bilinear(u,bx,by)*decay;
      nv[n]=this.bilinear(v,bx,by)*decay;
    }
    // Smooth ambient convection injects energy into the fluid itself.
    const phase=clock*.00044;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const n=y*w+x;
      nu[n]+=Math.sin(y*.43+phase)*Math.cos(x*.27-phase*.7)*.024*s;
      nv[n]+=(Math.cos(x*.38-phase)*Math.sin(y*.29+phase)*.018-.012)*s;
    }
    u.set(nu);v.set(nv);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const n=y*w+x;
      curl[n]=(v[n+1]-v[n-1]-u[n+w]+u[n-w])/(2*c);
    }
    // Vorticity confinement maintains small eddies across many frames.
    for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
      const n=y*w+x;
      const gx=Math.abs(curl[n+1])-Math.abs(curl[n-1]);
      const gy=Math.abs(curl[n+w])-Math.abs(curl[n-w]);
      const m=Math.hypot(gx,gy)+1e-5;
      u[n]+=-gy/m*curl[n]*2.8*s;
      v[n]+=gx/m*curl[n]*2.8*s;
    }
    // Divergence and an iterative pressure solve: approximate incompressible flow.
    let p=this.pressure,q=this.nextPressure;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const n=y*w+x;
      if(!x||!y||x===w-1||y===h-1){
        u[n]=v[n]=div[n]=p[n]=q[n]=0;
      }else{
        div[n]=(u[n+1]-u[n-1]+v[n+w]-v[n-w])/(2*c);
        p[n]=q[n]=0;
      }
    }
    for(let k=0;k<9;k++){
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        const n=y*w+x;
        q[n]=(p[n-1]+p[n+1]+p[n-w]+p[n+w]-div[n]*c*c)*.25;
      }
      [p,q]=[q,p];
    }
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const n=y*w+x;
      u[n]-=(p[n+1]-p[n-1])/(2*c);
      v[n]-=(p[n+w]-p[n-w])/(2*c);
      // A sink is compressible: inject radial flow AFTER pressure projection,
      // and only when the hand is actively pressed.
      if(pressed){
        const dx=handX-x*c,dy=handY-y*c,d=Math.hypot(dx,dy);
        if(d>2&&d<range){
          const fade=Math.pow(1-d/range,1.6);
          const force=(.12+.10*pulse)*fade*s;
          u[n]+=dx/d*force-dy/d*fade*.045*s;
          v[n]+=dy/d*force+dx/d*fade*.045*s;
        }
      }
      const mag=Math.hypot(u[n],v[n]);
      if(mag>2.8){u[n]*=2.8/mag;v[n]*=2.8/mag;}
    }
  }
}
