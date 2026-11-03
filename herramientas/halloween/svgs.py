# Dibujos genéricos del tema Halloween (propios, sin personajes de Dota), como data URI para CSS.
import urllib.parse

def uri(svg):
    svg = " ".join(svg.split())
    return "url(\"data:image/svg+xml," + urllib.parse.quote(svg, safe=" =:/;,'()-.") + "\")"

MURCI = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 40'><path fill='{c}' d='M50 31c-3.6 0-5.6-3.6-5.6-7.4L41 13l4 3.4 3.2-3 1.8 2.8 1.8-2.8 3.2 3 4-3.4-3.4 10.6c0 3.8-2 7.4-5.6 7.4z"
         "M44.4 22.4C36 9.6 18.4 5.6 1 9.4c8.6 3.6 10.8 9.4 10.2 16 5.6-4.2 12-4 15.2 1.2 4.2-4.4 10.4-4.4 13.6 1.2 1.2-2.6 2.6-4.2 4.4-5.4z"
         "M55.6 22.4C64 9.6 81.6 5.6 99 9.4c-8.6 3.6-10.8 9.4-10.2 16-5.6-4.2-12-4-15.2 1.2-4.2-4.4-10.4-4.4-13.6 1.2-1.2-2.6-2.6-4.2-4.4-5.4z'/></svg>")

CALABAZA = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 56'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffb04d'/><stop offset='.6' stop-color='#f2690f'/><stop offset='1' stop-color='#a63a06'/></linearGradient></defs>"
            "<ellipse cx='20' cy='33' rx='17' ry='20' fill='url(#g)'/><ellipse cx='44' cy='33' rx='17' ry='20' fill='url(#g)'/><ellipse cx='32' cy='33' rx='18' ry='22' fill='url(#g)'/>"
            "<path d='M31 12c0-6 3-9 8-11l2 3c-4 2-5 4-5 8z' fill='#5d7a2c'/>"
            "<g fill='#ffe07a'><path d='M17 30l6-8 5 8z'/><path d='M47 30l-6-8-5 8z'/><path d='M15 39c10 9 24 9 34 0l-4 1-2-3-3 4-3-4-3 4-3-4-3 4-3-4-2 3z'/></g></svg>")

TELARANA = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none' stroke='{c}' stroke-width='.8' stroke-linecap='round'>"
            "<path d='M0 0L100 100M0 0L100 40M0 0L40 100M0 0L100 8M0 0L8 100'/>"
            + "".join("<path d='M%d 0Q%.1f %.1f %.1f %.1fQ%.1f %.1f %.1f %.1fQ%.1f %.1f %.1f %.1fQ%.1f %.1f 0 %d'/>" % (
                r, r * .86, r * .1, r * .93, r * .37, r * .8, r * .55, r * .7, r * .7, r * .5, r * .82, r * .37, r * .93, r * .1, r * .86, r)
                for r in (18, 34, 52, 72, 94)) + "</svg>")

GOTEO = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 16' preserveAspectRatio='none'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#6a2fd6'/><stop offset='1' stop-color='#3b1290'/></linearGradient></defs>"
         "<path fill='url(#g)' d='M0 0H240V4C232 4 231 9 227 9C223 9 223 4 214 4C204 4 206 14 199 14C192 14 195 4 184 4C172 4 174 7 168 7C162 7 163 4 150 4C138 4 140 12 133 12C126 12 128 4 116 4C104 4 106 8 100 8C94 8 96 4 82 4C70 4 72 15 64 15C56 15 58 4 46 4C36 4 37 8 31 8C25 8 26 4 14 4C6 4 6 10 2 10C0 10 0 6 0 4Z'/></svg>")

def cementerio(fill='#03050f', borde='rgba(255,140,60,.35)'):
    rejas = "".join("<path d='M%d 126V84l3-6 3 6V126'/>" % x for x in range(566, 722, 13))
    return ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 160'>"
            "<g fill='" + fill + "' stroke='" + borde + "' stroke-width='1.4'>"
            "<path d='M100 126V82a26 26 0 0 1 52 0V126Z' transform='rotate(-5 126 126)'/>"
            "<path d='M224 124V72h-14V62h14V48h11v14h14v10h-14V124Z'/>"
            "<path d='M318 122l4-64 8-12 8 12 4 64Z'/>"
            "<path d='M452 124V96a18 18 0 0 1 36 0V124Z' transform='rotate(6 470 124)'/>"
            "<path d='M980 126V74c0-18 14-30 30-30s30 12 30 30V126Z'/>"
            "<path d='M1088 124V86h-11v-8h11V66h9v12h11v8h-11V124Z' transform='rotate(4 1092 124)'/>"
            "</g>"
            "<g fill='none' stroke='" + fill + "' stroke-width='3'>" + rejas + "<path d='M560 96H724M560 116H724'/></g>"
            "<path fill='" + fill + "' d='M852 126c4-26 2-48-6-70-8 2-18-4-24-14 8 4 16 4 22 0-6-10-6-22 0-32 2 10 8 18 14 22 2-12 8-22 18-28-4 10-4 20 0 28 6-4 14-6 22-4-8 4-14 12-16 20 8 0 16 4 20 12-8-4-16-4-22 0 6 20 8 42 4 66Z'/>"
            "<path fill='" + fill + "' d='M0 128C150 112 260 120 380 116C520 110 600 124 760 118C900 112 1040 124 1200 128V160H0Z'/>"
            "<g fill='#1a2147'><text x='1010' y='96' font-family='Georgia,serif' font-size='16' font-weight='700' text-anchor='middle'>RIP</text></g>"
            "</svg>")

ARANA = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 52'><defs><radialGradient id='c' cx='40%' cy='35%' r='70%'><stop offset='0' stop-color='#5b4a9e'/><stop offset='1' stop-color='#1c1538'/></radialGradient></defs><g stroke='#3d3270' stroke-width='3' stroke-linecap='round' fill='none'>"
         "<path d='M24 22L10 10 4 18M24 26L6 24 2 34M26 30L10 38 8 48M28 32L18 44 18 52M36 22l14-12 6 8M36 26l18-2 4 10M34 30l16 8 2 10M32 32l10 12v8'/></g>"
         "<ellipse cx='30' cy='30' rx='10' ry='12' fill='url(#c)'/><circle cx='30' cy='16' r='8' fill='url(#c)'/><path d='M26 27h8M25 32h10' stroke='#ff7a1a' stroke-width='1.6' stroke-linecap='round'/>"
         "<circle cx='27' cy='15' r='2.2' fill='#ff7a1a'/><circle cx='33' cy='15' r='2.2' fill='#ff7a1a'/></svg>")

SOMBRERO = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 60'><ellipse cx='40' cy='50' rx='38' ry='9' fill='#170b33'/>"
            "<path d='M20 49C26 36 30 22 38 10c4-6 12-8 18-6-6 2-9 6-10 12-2 10 2 22 8 33Z' fill='#24104f'/>"
            "<path d='M22 44c10 4 26 4 34 0l2 5c-10 4-28 4-38 0Z' fill='#ff7a1a'/><rect x='35' y='42' width='9' height='8' rx='1.5' fill='#ffd36b'/></svg>")

FANTASMA = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 72'><path d='M6 70V30C6 14 18 2 32 2s26 12 26 28v40l-9-7-8 7-9-7-8 7-8-7Z' fill='#eef0ff'/>"
            "<ellipse cx='23' cy='30' rx='5' ry='7' fill='#121433'/><ellipse cx='41' cy='30' rx='5' ry='7' fill='#121433'/><ellipse cx='32' cy='46' rx='6' ry='7' fill='#121433'/></svg>")

ESTRELLAS = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><g fill='#fff'>"
             + "".join("<circle cx='%d' cy='%d' r='%.1f' opacity='%.2f'/>" % s for s in [
                 (22, 40, 1.1, .8), (90, 120, .7, .5), (160, 30, .9, .7), (230, 90, .6, .45), (300, 20, 1.2, .8), (370, 140, .7, .5), (40, 210, .8, .55),
                 (120, 260, 1, .7), (210, 200, .6, .4), (280, 300, .9, .6), (350, 250, .7, .5), (60, 340, .9, .65), (170, 370, .7, .45), (330, 380, 1.1, .75), (250, 150, .5, .4)])
             + "</g></svg>")

if __name__ == "__main__":
    import json, sys
    d = {"murci": uri(MURCI.format(c="#06030f")), "murciNaranja": uri(MURCI.format(c="#ff7a1a")), "calabaza": uri(CALABAZA),
         "telarana": uri(TELARANA.format(c="rgba(220,215,255,.75)")), "goteo": uri(GOTEO), "cementerio": uri(cementerio()), "cementerioLJ": uri(cementerio(fill="#080405", borde="rgba(225,45,40,.38)")),
         "arana": uri(ARANA), "sombrero": uri(SOMBRERO), "fantasma": uri(FANTASMA), "estrellas": uri(ESTRELLAS)}
    json.dump(d, open(sys.argv[1], "w"), indent=0)
    print({k: len(v) for k, v in d.items()})
