# Paleta Halloween para Rayas Store: copia las hojas de estilo cambiando SOLO los colores.
#   amarillo/dorado  -> calabaza (más oscuro = naranja intenso, más claro = luz de vela)
#   fucsia           -> morado de bruja
#   azul marino      -> azul medianoche (un poco más oscuro y violeta)
#   lila claro       -> niebla lila
# Todo lo demás (blancos, verdes, rojos, colores de rareza) queda igual.
import re, sys, os, colorsys

def h2rgb(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c * 2 for c in h)
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]

def clamp(x, a, b): return max(a, min(b, x))

def tr(r, g, b):
    H, L, S = colorsys.rgb_to_hls(r, g, b); d = H * 360
    if S > .45 and 30 <= d <= 58:                       # amarillo -> calabaza / vela
        hue = clamp(20 + (L - .35) * 42, 18, 38)
        return colorsys.hls_to_rgb(hue / 360, L * .97, clamp(S, .9, 1))
    if S > .45 and 315 <= d <= 350:                     # fucsia -> morado bruja
        return colorsys.hls_to_rgb(266 / 360, L, .88)
    if 205 <= d <= 250 and L < .5 and S > .15:          # azul marino -> medianoche
        return colorsys.hls_to_rgb(234 / 360, L * .9, S)
    if 205 <= d <= 250 and L >= .5 and S > .2:          # lila claro -> niebla
        return colorsys.hls_to_rgb(240 / 360, L, S * .85)
    return None

def hexs(rgb): return '#' + ''.join('%02x' % round(clamp(c, 0, 1) * 255) for c in rgb)

def sub_hex(m):
    s = m.group(0)
    if len(s) not in (4, 7): return s
    o = tr(*h2rgb(s)); return hexs(o) if o else s

def sub_rgba(m):
    r, g, b = [int(float(x)) / 255 for x in m.group(2, 3, 4)]
    o = tr(r, g, b)
    if not o: return m.group(0)
    R, G, B = [round(clamp(c, 0, 1) * 255) for c in o]
    return "%s(%d, %d, %d%s)" % (m.group(1), R, G, B, m.group(5) or '')

def recolor(t):
    t = re.sub(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b', sub_hex, t)
    t = re.sub(r'(rgba?)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,[^)]*)?\)', sub_rgba, t)
    return t

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    for n in sys.argv[3:]:
        t = open(os.path.join(src, n), encoding="utf-8").read()
        t2 = recolor(t)
        open(os.path.join(dst, "hw-" + n), "w", encoding="utf-8").write("/* Copia con paleta Halloween (generada). Original: " + n + " */\n" + t2)
        print(n, "colores cambiados:", sum(1 for a, b in zip(re.findall(r'#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\)', t), re.findall(r'#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\)', t2)) if a != b))
