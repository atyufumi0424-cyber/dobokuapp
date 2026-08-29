# Training pipeline for the browser civil-drawing AI model.
from pathlib import Path
import math, random, shutil
from PIL import Image, ImageDraw
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "generated"
IMAGES = DATA / "images"
LABELS = DATA / "labels"
for p in (IMAGES, LABELS):
    p.mkdir(parents=True, exist_ok=True)

W, H = 1024, 768
CLASSES = ["manhole", "catch_basin", "side_ditch", "curb"]
random.seed(20260829)

def yolo_box(cls_id, x1, y1, x2, y2):
    cx=((x1+x2)/2)/W; cy=((y1+y2)/2)/H
    bw=(x2-x1)/W; bh=(y2-y1)/H
    return f"{cls_id} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}"

def make_one(i):
    img=Image.new("RGB",(W,H),"white")
    d=ImageDraw.Draw(img)
    labels=[]
    m=random.randint(35,55)
    d.rectangle([m,m,W-m,H-m],outline=(40,40,40),width=2)
    road_y=random.randint(260,430); road_h=random.randint(120,175)
    y1=road_y-road_h//2; y2=road_y+road_h//2
    x1=m+30; x2=W-m-250
    d.rectangle([x1,y1,x2,y2],outline=(90,90,90),width=2)

    # curbs
    for yy in (y1+9,y2-9):
        t=random.randint(5,8)
        d.line([x1,yy,x2,yy],fill=(25,25,25),width=t)
        labels.append(yolo_box(3,x1,yy-(t+4),x2,yy+(t+4)))

    # side ditches
    for yy in random.sample([y1-20,y2+20],k=random.choice([1,2])):
        t=random.randint(6,10)
        d.line([x1,yy,x2,yy],fill=(15,15,15),width=t)
        for sx in range(x1,x2,30):
            d.line([sx,yy,sx+12,yy],fill=(145,145,145),width=1)
        labels.append(yolo_box(2,x1,yy-(t+5),x2,yy+(t+5)))

    # manholes
    for _ in range(random.randint(2,6)):
        cx=random.randint(x1+45,x2-45); cy=random.randint(y1+28,y2-28); r=random.randint(13,21)
        d.ellipse([cx-r,cy-r,cx+r,cy+r],outline=(10,10,10),width=3)
        d.ellipse([cx-r+5,cy-r+5,cx+r-5,cy+r-5],outline=(100,100,100),width=1)
        labels.append(yolo_box(0,cx-r-2,cy-r-2,cx+r+2,cy+r+2))

    # catch basins
    for _ in range(random.randint(3,8)):
        cx=random.randint(x1+35,x2-35); cy=random.choice([y1+9,y2-9])+random.randint(-3,3); s=random.randint(18,27)
        xa,ya,xb,yb=cx-s//2,cy-s//2,cx+s//2,cy+s//2
        d.rectangle([xa,ya,xb,yb],outline=(10,10,10),width=3)
        for gx in range(xa+4,xb,5): d.line([gx,ya+3,gx,yb-3],fill=(120,120,120),width=1)
        labels.append(yolo_box(1,xa-2,ya-2,xb+2,yb+2))

    # drawing noise / unrelated structures
    for _ in range(random.randint(4,9)):
        xa=random.randint(m+20,max(m+21,x2-160)); ya=random.randint(m+25,H-m-110)
        rw=random.randint(40,140); rh=random.randint(25,85)
        d.rectangle([xa,ya,min(xa+rw,x2),min(ya+rh,H-m-25)],outline=(150,150,150),width=1)
    for _ in range(random.randint(6,12)):
        ax=random.randint(m+20,x2-80); ay=random.randint(m+20,H-m-20); bx=ax+random.randint(35,130)
        d.line([ax,ay,bx,ay],fill=(170,170,170),width=1)
        d.line([ax,ay-5,ax,ay+5],fill=(170,170,170),width=1); d.line([bx,ay-5,bx,ay+5],fill=(170,170,170),width=1)

    stem=f"civil_{i:03d}"
    img.save(IMAGES/f"{stem}.jpg",quality=random.randint(85,96))
    (LABELS/f"{stem}.txt").write_text("\n".join(labels),encoding="utf-8")

for i in range(80): make_one(i)

# YOLO expects train/val folders. Split deterministically.
for split in ("train","val"):
    (DATA/split/"images").mkdir(parents=True,exist_ok=True)
    (DATA/split/"labels").mkdir(parents=True,exist_ok=True)
for i in range(80):
    stem=f"civil_{i:03d}"; split="val" if i%5==0 else "train"
    shutil.copy2(IMAGES/f"{stem}.jpg",DATA/split/"images"/f"{stem}.jpg")
    shutil.copy2(LABELS/f"{stem}.txt",DATA/split/"labels"/f"{stem}.txt")

yaml=(DATA/"data.yaml")
yaml.write_text(f"""path: {DATA.as_posix()}\ntrain: train/images\nval: val/images\nnames:\n  0: manhole\n  1: catch_basin\n  2: side_ditch\n  3: curb\n""",encoding="utf-8")

# Small pretrained detector; CPU-friendly training for GitHub Actions.
model=YOLO("yolo11n.pt")
model.train(data=str(yaml),epochs=12,imgsz=512,batch=8,device="cpu",workers=2,patience=5,project=str(ROOT/"runs"),name="civil",exist_ok=True,verbose=True)
best=ROOT/"runs"/"civil"/"weights"/"best.pt"
trained=YOLO(str(best))
out=trained.export(format="onnx",imgsz=512,simplify=True,opset=17,dynamic=False)
model_dir=ROOT.parent/"models"; model_dir.mkdir(exist_ok=True)
shutil.copy2(out,model_dir/"civil_yolo.onnx")
(model_dir/"classes.json").write_text('{"0":"manhole","1":"catch_basin","2":"side_ditch","3":"curb"}',encoding="utf-8")
print("MODEL_READY",model_dir/"civil_yolo.onnx")
