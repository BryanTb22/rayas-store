# Recorta el fondo de una foto de set (deja el personaje con fondo transparente) usando el modelo u2net.
# uso: python3 recortar.py <entrada.jpg> <salida.png> [ancho_final]
import sys, numpy as np, onnxruntime as ort
from PIL import Image, ImageFilter
import os
MODELO = os.environ.get("U2NET", "u2net.onnx")  # descargar de https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx
ses = ort.InferenceSession(MODELO, providers=["CPUExecutionProvider"])
def mascara(im):
    w, h = im.size
    x = im.convert("RGB").resize((320, 320), Image.LANCZOS)
    a = np.asarray(x).astype(np.float32) / 255.0
    a = (a - np.array([0.485, 0.456, 0.406])) / np.array([0.229, 0.224, 0.225])
    a = a.transpose(2, 0, 1)[None].astype(np.float32)
    out = ses.run(None, {ses.get_inputs()[0].name: a})[0][0][0]
    out = (out - out.min()) / (out.max() - out.min() + 1e-6)
    m = Image.fromarray((out * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)
    return m
def recortar(entrada, salida, ancho=None):
    im = Image.open(entrada).convert("RGBA")
    m = mascara(im).filter(ImageFilter.GaussianBlur(1))
    # el pedestal y el haz de luz suelen colarse: se limpia un poco con la luminancia
    im.putalpha(m)
    bb = im.getbbox()
    im = im.crop(bb)
    if ancho: im = im.resize((ancho, int(im.height * ancho / im.width)), Image.LANCZOS)
    im.save(salida, optimize=True)
    print(salida, im.size)
if __name__ == "__main__":
    recortar(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else None)
