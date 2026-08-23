import sharp from "sharp";

function fitKasa(pts){
  let sx=0,sy=0,sxx=0,syy=0,sxy=0,sxz=0,syz=0,sz=0,n=pts.length;
  for(const [x,y] of pts){const z=x*x+y*y;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;sxz+=x*z;syz+=y*z;sz+=z;}
  const A=[[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,n]];
  const b=[sxz,syz,sz];
  // Gauss
  for(let i=0;i<3;i++){
    let p=i; for(let k=i+1;k<3;k++) if(Math.abs(A[k][i])>Math.abs(A[p][i])) p=k;
    [A[i],A[p]]=[A[p],A[i]]; [b[i],b[p]]=[b[p],b[i]];
    for(let k=i+1;k<3;k++){const f=A[k][i]/A[i][i];for(let j=i;j<3;j++)A[k][j]-=f*A[i][j];b[k]-=f*b[i];}
  }
  const s=[0,0,0];
  for(let i=2;i>=0;i--){let v=b[i];for(let j=i+1;j<3;j++)v-=A[i][j]*s[j];s[i]=v/A[i][i];}
  const cx=s[0]/2, cy=s[1]/2, r=Math.sqrt(s[2]+cx*cx+cy*cy);
  return {cx,cy,r};
}

function ransac(pts,iters=4000,tol=2.5){
  let best={inliers:[],model:null};
  for(let it=0;it<iters;it++){
    const s=[0,1,2].map(()=>pts[(Math.random()*pts.length)|0]);
    if(new Set(s.map(p=>p.join(','))).size<3) continue;
    let m; try{ m=fitKasa(s); }catch { continue; }
    if(!isFinite(m.r)||m.r<150||m.r>320) continue;
    const inl=pts.filter(([x,y])=>Math.abs(Math.hypot(x-m.cx,y-m.cy)-m.r)<tol);
    if(inl.length>best.inliers.length) best={inliers:inl,model:m};
  }
  if(best.inliers.length>=10) best.model=fitKasa(best.inliers);
  return best;
}

  const file=process.argv[2];
  const {data,info}=await sharp(file).raw().toBuffer({resolveWithObject:true});
  const {width:W,height:H,channels:C}=info;
  const white=(x,y)=>{const i=(y*W+x)*C;return data[i]>230&&data[i+1]>230&&data[i+2]>230;};
  // Limite basse optionnelle (fraction de la hauteur) : les bulles sont dans
  // la zone photo ; au-delà, le fitter s'accroche aux arêtes du texte blanc du
  // bandeau et sort des cercles fantômes (constaté le 2026-08-21).
  const yMax = Math.round(H * Number(process.argv[3] ?? 0.62));
  const pts=[];
  // Runs horizontaux de l'épaisseur d'un anneau -> point milieu
  for(let y=0;y<yMax;y++){
    let start=-1;
    for(let x=0;x<=W;x++){
      const w = x<W && white(x,y);
      if(w){ if(start<0) start=x; }
      else if(start>=0){ const len=x-start; if(len>=5&&len<=30) pts.push([(start+x-1)/2,y]); start=-1; }
    }
  }
  // Runs verticaux (capte les arcs quasi-horizontaux, haut/bas des cercles)
  for(let x=0;x<W;x++){
    let start=-1;
    for(let y=0;y<=yMax;y++){
      const w = y<H && white(x,y);
      if(w && y<yMax){ if(start<0) start=y; }
      else if(start>=0){ const len=y-start; if(len>=5&&len<=30) pts.push([x,(start+y-1)/2]); start=-1; }
    }
  }
  console.log('points candidats:', pts.length);
  let remaining=pts;
  for(let k=0;k<2;k++){
    const {inliers,model}=ransac(remaining);
    if(!model){console.log('pas de cercle trouvé');break;}
    console.log(`\ncercle ${k+1}: centre (${model.cx.toFixed(1)}, ${model.cy.toFixed(1)}) rayon ${model.r.toFixed(1)}  [${inliers.length} inliers]`);
    console.log(`  -> leftPercent=${(model.cx/W*100).toFixed(1)}%  topPercent=${(model.cy/H*100).toFixed(1)}%  sizePercent(diam/largeur)=${(model.r*2/W*100).toFixed(1)}%`);
    const set=new Set(inliers.map(p=>p.join(',')));
    remaining=remaining.filter(p=>!set.has(p.join(',')));
  }
