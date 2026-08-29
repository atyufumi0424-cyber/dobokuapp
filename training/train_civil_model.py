# Training pipeline for the browser civil-drawing AI model.
from pathlib import Path
import random, shutil
from PIL import Image, ImageDraw
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "generated"
IMAGES = DATA / "images"
LABELS = DATA / "labels"
for p in (IMAGES, LABELS):
    p.mkdir(parents=True, exist_ok=True)

W, H = 1024, 768
random.seed(20260829)

def yolo_box(cls_id, x1, y1, x2, y2):
    x1=max(0,min(W-1,x1)); x2=max(1,min(W,x2)); y1=max(0,min(H-1,y1)); y2=max(1,min(H,y2))
    cx=((x1+x2)/2)/W; cy=((y1+y2)/2)/H
    bw=(x2-x1)/W; bh=(y2-y1)/H
    return f"{cls_id} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}"

def dim_line(d, x1, y, x2):
    d.line([x1,y,x2,y],fill=(165,165,165),width=1)
    d.line([x1,y-5,x1,y+5],fill=(165,165,165),width=1)
    d.line([x2,y-5,x2,y+5],fill=(165,165,165),width=1)


def make_one(i):
    img=Image.new("RGB",(W,H),"white")
    d=ImageDraw.Draw(img)
    labels=[]
    m=random.randint(28,48)
    d.rectangle([m,m,W-m,H-m],outline=(35,35,35),width=random.randint(1,3))

    # title / legend blocks like real printed civil drawings
    if random.random()<0.9:
        bx1=W-random.randint(230,300); by1=random.randint(70,140); bx2=W-m-12; by2=by1+random.randint(150,240)
        d.rectangle([bx1,by1,bx2,by2],outline=(90,90,90),width=1)
        for yy in range(by1+28,by2,28): d.line([bx1,yy,bx2,yy],fill=(190,190,190),width=1)
        d.line([bx1+60,by1,bx1+60,by2],fill=(190,190,190),width=1)
    if random.random()<0.8:
        tx1=W-random.randint(250,320); ty1=H-random.randint(160,205); tx2=W-m-10; ty2=H-m-10
        d.rectangle([tx1,ty1,tx2,ty2],outline=(100,100,100),width=1)
        for yy in range(ty1+32,ty2,32): d.line([tx1,yy,tx2,yy],fill=(190,190,190),width=1)
        d.line([tx1+72,ty1,tx1+72,ty2],fill=(190,190,190),width=1)

    # site boundary / lot
    sx1=m+random.randint(30,75); sy1=m+random.randint(60,105)
    sx2=W-random.randint(300,350); sy2=H-m-random.randint(70,115)
    d.rectangle([sx1,sy1,sx2,sy2],outline=(70,70,70),width=2)

    # road corridor, usually through center
    road_y=random.randint(int(H*.38),int(H*.55)); road_h=random.randint(115,180)
    y1=road_y-road_h//2; y2=road_y+road_h//2
    x1=sx1+random.randint(0,20); x2=sx2-random.randint(0,20)
    d.rectangle([x1,y1,x2,y2],outline=(105,105,105),width=2)
    # center line / road markings
    if random.random()<0.7:
        for xx in range(x1+10,x2-10,44): d.line([xx,road_y,xx+22,road_y],fill=(180,180,180),width=1)

    # curbs: mix solid and double-line style
    for yy in (y1+random.randint(6,12), y2-random.randint(6,12)):
        t=random.randint(3,7)
        d.line([x1,yy,x2,yy],fill=(30,30,30),width=t)
        if random.random()<0.6: d.line([x1,yy+random.choice([-6,6]),x2,yy+random.choice([-6,6])],fill=(130,130,130),width=1)
        labels.append(yolo_box(3,x1,yy-(t+5),x2,yy+(t+5)))

    # side ditches: long thin objects with hatch/dashes
    for yy in random.sample([y1-random.randint(13,25), y2+random.randint(13,25)], k=random.choice([1,2])):
        t=random.randint(4,9)
        d.line([x1,yy,x2,yy],fill=(20,20,20),width=t)
        for xx in range(x1,x2,random.randint(22,34)):
            d.line([xx,yy-3,min(xx+12,x2),yy+3],fill=(145,145,145),width=1)
        labels.append(yolo_box(2,x1,yy-(t+6),x2,yy+(t+6)))

    # manholes: inside road, sometimes near edges
    for _ in range(random.randint(2,7)):
        cx=random.randint(x1+28,x2-28); cy=random.randint(y1+22,y2-22); r=random.randint(10,22)
        d.ellipse([cx-r,cy-r,cx+r,cy+r],outline=(12,12,12),width=random.randint(2,4))
        if random.random()<0.85: d.ellipse([cx-r+4,cy-r+4,cx+r-4,cy+r-4],outline=(100,100,100),width=1)
        if random.random()<0.35: d.line([cx-r+3,cy,cx+r-3,cy],fill=(120,120,120),width=1)
        labels.append(yolo_box(0,cx-r-3,cy-r-3,cx+r+3,cy+r+3))

    # catch basins: mostly along curb, varied square/rectangular symbols
    for _ in range(random.randint(3,10)):
        cx=random.randint(x1+25,x2-25); cy=random.choice([y1+8,y2-8])+random.randint(-4,4)
        sw=random.randint(16,29); sh=random.randint(14,27)
        xa,ya,xb,yb=cx-sw//2,cy-sh//2,cx+sw//2,cy+sh//2
        d.rectangle([xa,ya,xb,yb],outline=(12,12,12),width=random.randint(2,3))
        if random.random()<0.8:
            for gx in range(xa+3,xb,5): d.line([gx,ya+2,gx,yb-2],fill=(120,120,120),width=1)
        labels.append(yolo_box(1,xa-3,ya-3,xb+3,yb+3))

    # paved / excavation / concrete blocks to imitate quantity drawings
    for _ in range(random.randint(2,5)):
        rw=random.randint(70,170); rh=random.randint(45,115)
        xa=random.randint(sx1+10,max(sx1+11,sx2-rw-10))
        choices=[random.randint(sy1+10,max(sy1+11,y1-35)), random.randint(min(sy2-40,y2+30),max(min(sy2-39,y2+31),sy2-rh-5))]
        ya=random.choice(choices)
        xb=min(sx2-5,xa+rw); yb=min(sy2-5,ya+rh)
        if xb-xa<25 or yb-ya<20: continue
        d.rectangle([xa,ya,xb,yb],outline=(110,110,110),width=1)
        if random.random()<0.7:
            for k in range(-rh,rw+rh,12):
                ax=max(xa,xa+k); ay=max(ya,ya-k); bx=min(xb,xa+k+rh); by=min(yb,ya+rh)
                if ax<bx: d.line([ax,by,bx,ay],fill=(215,215,215),width=1)

    # tree / pole / unrelated circular symbols as hard negatives
    for _ in range(random.randint(3,9)):
        cx=random.choice([random.randint(sx1+10,sx2-10), random.randint(m+8,W-m-8)])
        cy=random.choice([random.randint(sy1+5,max(sy1+6,y1-25)), random.randint(min(sy2-20,y2+25),sy2-5)])
        r=random.randint(7,17)
        d.ellipse([cx-r,cy-r,cx+r,cy+r],outline=(150,150,150),width=1)
        for a in range(0,360,60):
            pass

    # dimension lines, ticks and pseudo-text strokes
    for _ in range(random.randint(12,28)):
        ax=random.randint(m+15,W-m-80); ay=random.randint(m+15,H-m-15); bx=min(W-m-5,ax+random.randint(25,150))
        dim_line(d,ax,ay,bx)
    for _ in range(random.randint(20,45)):
        ax=random.randint(m+10,W-m-50); ay=random.randint(m+10,H-m-10)
        d.line([ax,ay,ax+random.randint(8,36),ay],fill=(135,135,135),width=1)

    stem=f"civil_{i:03d}"
    img.save(IMAGES/f"{stem}.jpg",quality=random.randint(82,96))
    (LABELS/f"{stem}.txt").write_text("\n".join(labels),encoding="utf-8")

N=160
for i in range(N): make_one(i)

for split in ("train","val"):
    if (DATA/split).exists(): shutil.rmtree(DATA/split)
    (DATA/split/"images").mkdir(parents=True,exist_ok=True)
    (DATA/split/"labels").mkdir(parents=True,exist_ok=True)
for i in range(N):
    stem=f"civil_{i:03d}"; split="val" if i%5==0 else "train"
    shutil.copy2(IMAGES/f"{stem}.jpg",DATA/split/"images"/f"{stem}.jpg")
    shutil.copy2(LABELS/f"{stem}.txt",DATA/split/"labels"/f"{stem}.txt")

yaml=(DATA/"data.yaml")
yaml.write_text(f"""path: {DATA.as_posix()}\ntrain: train/images\nval: val/images\nnames:\n  0: manhole\n  1: catch_basin\n  2: side_ditch\n  3: curb\n""",encoding="utf-8")

model=YOLO("yolo11n.pt")
model.train(
    data=str(yaml), epochs=24, imgsz=640, batch=8, device="cpu", workers=2,
    patience=8, project=str(ROOT/"runs"), name="civil", exist_ok=True, verbose=True,
    degrees=2.0, translate=0.05, scale=0.20, perspective=0.0005, fliplr=0.5,
    mosaic=0.7, mixup=0.05
)
best=ROOT/"runs"/"civil"/"weights"/"best.pt"
trained=YOLO(str(best))
out=trained.export(format="onnx",imgsz=640,simplify=True,opset=17,dynamic=False)
model_dir=ROOT.parent/"models"; model_dir.mkdir(exist_ok=True)
shutil.copy2(out,model_dir/"civil_yolo.onnx")
(model_dir/"classes.json").write_text('{"0":"manhole","1":"catch_basin","2":"side_ditch","3":"curb"}',encoding="utf-8")
print("MODEL_READY",model_dir/"civil_yolo.onnx")
