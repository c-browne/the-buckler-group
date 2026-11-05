from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"assets-images/tbg-logo-new.png"
OUTPUT=ROOT/"assets-images/tbg-institutional-social-v3.jpg"
W,H=1200,630
navy=(7,17,31)
gold=(183,144,75)
cream=(247,243,234)
secondary=(207,197,177)
im=Image.new("RGB",(W,H),navy)
d=ImageDraw.Draw(im)
def font(size,serif=False):
    paths=(["/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf","/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf"] if serif else ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"])
    for p in paths:
        if Path(p).exists():return ImageFont.truetype(p,size)
    return ImageFont.load_default()
logo=Image.open(SOURCE).convert("RGBA")
# Preserve the original crest without artificial glow; reduce its footprint.
logo.thumbnail((255,255),Image.Resampling.LANCZOS)
# Original logo may contain a large opaque background. Keep its existing appearance intact.
x=600-logo.width//2
im.paste(logo,(x,28),logo)
d=ImageDraw.Draw(im)
def centered(t,y,f,color,spacing=0):
    if spacing:
        widths=[d.textlength(c,font=f) for c in t]
        total=sum(widths)+spacing*(len(t)-1)
        xx=(W-total)/2
        for c,w in zip(t,widths):
            d.text((xx,y),c,font=f,fill=color,stroke_width=0)
            xx+=w+spacing
    else:
        d.text((W/2,y),t,font=f,fill=color,anchor="mt")
centered("THE BUCKLER GROUP",300,font(55,True),cream,2)
d.line((480,383,720,383),fill=gold,width=2)
centered("Building Order. Advancing Opportunity.",413,font(30,True),cream)
centered("CARIBBEAN INSTITUTIONAL ADVISORY & DEVELOPMENT",492,font(19),secondary,1)
im.save(OUTPUT,"JPEG",quality=94,optimize=True,subsampling=0)
print(OUTPUT)

# Rebuild on source updates.
