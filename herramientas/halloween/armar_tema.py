# Arma tema-halloween.css reemplazando {{nombre}} por los dibujos (data URI) de svgs.py.
import json, re, subprocess, sys, os
aqui = os.path.dirname(os.path.abspath(__file__))
subprocess.run([sys.executable, os.path.join(aqui, "svgs.py"), os.path.join(aqui, "_svgs.json")], check=True, capture_output=True)
d = json.load(open(os.path.join(aqui, "_svgs.json")))
src = open(sys.argv[2] if len(sys.argv) > 2 else os.path.join(aqui, "tema-halloween.src.css"), encoding="utf-8").read()
faltan = set(re.findall(r"\{\{(\w+)\}\}", src)) - set(d)
if faltan: raise SystemExit("faltan dibujos: %s" % faltan)
out = re.sub(r"\{\{(\w+)\}\}", lambda m: d[m.group(1)], src)
open(sys.argv[1], "w", encoding="utf-8").write(out)
print("tema-halloween.css", len(out) // 1024, "KB")
