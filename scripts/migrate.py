"""One-time extraction of the original, self-contained editor."""
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
original = root / 'sincronizar-audio (4).html'
html = original.read_text(encoding='utf-8')
for folder in ['src/styles', 'src/js', 'public/vendor', 'docs', '.github/workflows']:
    (root / folder).mkdir(parents=True, exist_ok=True)
css = re.search(r'<style>(.*?)</style>', html, re.S).group(1)
scripts = re.findall(r'<script>(.*?)</script>', html, re.S)
(root / 'public/vendor/mediabunny.js').write_text(scripts[0], encoding='utf-8')
(root / 'src/styles/base.css').write_text(css.strip() + '\n', encoding='utf-8')
js = scripts[1]
markers = [0, js.index('/* ---------- análisis'), js.index('/* ---------- desfase'), js.index('/* ---------- exportación ----------'), js.index('/* ---------- utilidades'), js.index('/* ---------- línea de tiempo'), js.index('/* ---------- tema claro') , len(js)]
names = ['app', 'analysis', 'playback', 'audio-export', 'video-export', 'timeline', 'theme']
for i, name in enumerate(names):
    code = js[markers[i]:markers[i+1]]
    (root / f'src/js/{name}.js').write_text(code.strip() + '\n', encoding='utf-8')
html = re.sub(r'<style>.*?</style>', '<meta name="description" content="Sincroniza, mezcla y recorta video y audio localmente en tu navegador.">\n<meta name="theme-color" content="#f2f2f7">\n<link rel="icon" href="public/favicon.svg" type="image/svg+xml">\n<link rel="stylesheet" href="src/styles/base.css">\n<link rel="stylesheet" href="src/styles/ios.css">', html, flags=re.S)
html = re.sub(r'<script>.*?</script>', '', html, flags=re.S)
html = html.replace('</body>', '\n'.join(f'<script defer src="{p}"></script>' for p in ['public/vendor/mediabunny.js'] + [f'src/js/{n}.js' for n in names]) + '\n</body>')
html = html.replace('width=device-width, initial-scale=1', 'width=device-width, initial-scale=1, viewport-fit=cover')
html = html.replace('<title>Sincronizar audio con video</title>', '<title>Sync Studio · Editor de audio y video</title>')
html = html.replace('<h1>Sincronizar</h1>', '<a class="brand" href="./" aria-label="Sync Studio, inicio"><span class="brand-icon" aria-hidden="true">≋</span> Sync Studio <span class="brand-tag">LOCAL</span></a>')
html = html.replace('<main>', '''<a class="skip-link" href="#workspace">Saltar al editor</a>
<main id="workspace">
<section class="intro" aria-labelledby="title"><div class="eyebrow">TU IMAGEN. EL SONIDO PERFECTO.</div><h1 id="title">Todo en su tiempo.</h1><p>Une tu video con el mejor audio.<br>Sincroniza, ajusta y crea, sin salir del navegador.</p><div class="privacy"><span aria-hidden="true">●</span> Tus archivos se quedan en tu dispositivo</div></section>
<div class="section-heading"><h2><span>01</span> Importa tus archivos</h2><span>Video + audio externo</span></div>''')
html = html.replace('Elegir…', 'Elegir archivo o arrastrar aquí')
html = html.replace('<div class="status" id="status">', '<div class="status" id="status" role="status" aria-live="polite">')
html = html.replace('<section class="card" style="margin-top:16px">', '<div class="section-heading"><h2><span>02</span> Tu espacio de edición</h2><span>Previsualiza y recorta</span></div><section class="card preview-card" aria-label="Vista previa y línea de tiempo"><div class="preview-stage"><div class="empty-preview" id="emptyPreview"><span class="empty-play" aria-hidden="true">▷</span><strong>Aquí comienza tu próxima edición</strong><span>Importa un video para verlo en este espacio</span></div>')
html = html.replace('<video id="video" playsinline></video>', '<video id="video" playsinline aria-label="Vista previa del video"></video></div>')
html = html.replace('<section class="card list locked" id="ctrls">', '<div class="section-heading"><h2><span>03</span> Ajusta la mezcla</h2><span>Control al milisegundo</span></div><section class="card list locked" id="ctrls" aria-label="Mezcla y recorte">')
html = html.replace('<label>Desfase (ms)</label>', '<label for="offMs">Desfase (ms)</label>')
html = html.replace('<canvas id="tl">', '<canvas id="tl" role="img" aria-label="Línea de tiempo; también puedes ajustar inicio, fin y desfase con los campos numéricos">')
html = html.replace('<span id="bmsg"></span>', '<span id="bmsg" role="status" aria-live="polite">Listo para crear</span>')
html = html.replace('<div class="seg" id="themeSeg">', '<div class="seg" id="themeSeg" role="group" aria-label="Apariencia">')
html = html.replace(' class="i i-play" viewBox="0 0 24 24" class="i i-play"', ' class="i i-play" viewBox="0 0 24 24"')
html = html.replace('</main>', '<footer>Sync Studio <span>Hecho para encontrar la sincronía.</span></footer></main>')
html = re.sub(r'<svg class="i([^\"]*)"', r'<svg aria-hidden="true" focusable="false" class="i\1"', html)
(root / 'index.html').write_text(html, encoding='utf-8')
