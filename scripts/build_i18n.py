"""Generate /en, /ru, /ar versions of the Turkish pages and add language links.

Run from the site root:  python3 scripts/build_i18n.py
Turkish pages are the source of truth; re-run after editing them.
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts", "i18n"))
from t1 import T as T1
from t2 import T as T2
from t3 import T as T3

SITE = "https://www.ciftechnology.com/"
PAGES = ["index.html", "urunler.html", "teknik-servis.html", "hakkimizda.html", "iletisim.html"]
LANGS = {"en": ("English", "EN", "en_US"), "ru": ("Русский", "RU", "ru_RU"), "ar": ("العربية", "AR", "ar_AR")}
ALL = {"tr": ("Türkçe", "TR", "tr_TR"), **LANGS}
META_KEYS = {"description", "keywords", "og:title", "og:description"}
LD_KEYS = {"name", "description", "text", "serviceType", "category"}

DICT = {lang: {} for lang in LANGS}
for tr, en, ru, ar in T1 + T2 + T3:
    for lang, val in (("en", en), ("ru", ru), ("ar", ar)):
        DICT[lang][tr] = val

# Product names keep their international (English) form in every language.
GLOSSARY = [
    ("Kolay Uygulama Aparatlı", "Easy-Install Kit"), ("Kolay Uygulama…", "Easy Install…"),
    ("Ekran Koruyucu", "Screen Protector"), ("Temperli Cam", "Tempered Glass"),
    ("Çok Katmanlı", "Multi-Layer"), ("Safir Kaplamalı", "Sapphire-Coated"),
    ("Hayalet Cam", "Privacy Glass"), ("Kumaş Dokulu", "Fabric-Textured"), ("Sert PC", "Hard PC"),
    ("Swarovski Taşlı", "Swarovski Crystal"), ("El İşlemeli", "Hand-Embellished"),
    ("Standlı", "Kickstand"), ("Oleofobik", "Oleophobic"), ("Kılıf", "Case"),
    ("Açık Mavi", "Light Blue"), ("Lacivert", "Navy"), ("Siyah", "Black"),
]

def tr_text(s, lang):
    key = re.sub(r"\s+", " ", s).strip()
    if not key:
        return s
    if key in DICT[lang]:
        out = DICT[lang][key]
    else:
        out = key
        for a, b in GLOSSARY:
            out = out.replace(a, b)
        out = re.sub(r"\bCam\b", "Glass", out)
    lead = s[: len(s) - len(s.lstrip())]
    trail = s[len(s.rstrip()):]
    return lead + out + trail

def page_url(lang, page):
    p = "" if page == "index.html" else page
    return SITE + ("" if lang == "tr" else lang + "/") + p

def head_links(page):
    out = [f'  <link rel="alternate" hreflang="{l}" href="{page_url(l, page)}">' for l in ALL]
    out.append(f'  <link rel="alternate" hreflang="x-default" href="{page_url("tr", page)}">')
    return "\n".join(out) + "\n"

def switcher(page, cur):
    up = "" if cur == "tr" else "../"
    items = []
    for l, (name, short, _) in ALL.items():
        href = up + ("" if l == "tr" else l + "/") + page
        attrs = ' aria-current="true"' if l == cur else ""
        items.append(f'<a href="{href}" hreflang="{l}" lang="{l}" title="{name}"{attrs}>{short}</a>')
    return '<li class="lang-switch" aria-label="Dil / Language">' + "".join(items) + "</li>"

def add_common(src, page, cur):
    src = re.sub(r'  <link rel="alternate" hreflang="[^"]+" href="[^"]+">\n', "", src)
    src = re.sub(r'(  <link rel="canonical" href="[^"]+">\n)', lambda m: m.group(1) + head_links(page), src, count=1)
    src = re.sub(r'<li class="lang-switch".*?</li>', "", src)
    src = src.replace('<li><a class="btn btn-accent"', switcher(page, cur) + '<li><a class="btn btn-accent"', 1)
    return src

TAG = re.compile(r"(<!--.*?-->|<[^>]+>)", re.S)
ATTR = re.compile(r'\b(alt|aria-label|title|content)="([^"]*)"')

def translate_html(src, page, lang):
    parts = TAG.split(src)
    skip = 0
    out = []
    for part in parts:
        if part.startswith("<!--"):
            out.append(part)
            continue
        if part.startswith("<"):
            low = part.lower()
            name = re.match(r"</?\s*([a-zA-Z0-9-]+)", part)
            name = name.group(1).lower() if name else ""
            if name in ("script", "style", "svg") and not low.startswith("</") and not part.endswith("/>"):
                skip += 1
            elif name in ("script", "style", "svg") and low.startswith("</"):
                skip -= 1
            is_meta = name == "meta" and re.search(r'(name|property)="(%s)"' % "|".join(map(re.escape, META_KEYS)), part)
            def attr_sub(m):
                k, v = m.group(1), m.group(2)
                if k == "content" and not is_meta:
                    return m.group(0)
                if k == "title" and part.startswith("<a ") and "hreflang" in part:
                    return m.group(0)
                return f'{k}="{html.escape(tr_text(html.unescape(v), lang), quote=True)}"'
            part = ATTR.sub(attr_sub, part)
            out.append(part)
            continue
        if skip or not part.strip():
            out.append(part)
            continue
        out.append(html.escape(tr_text(html.unescape(part), lang), quote=False))
    res = "".join(out)

    # JSON-LD
    def ld_sub(m):
        data = json.loads(m.group(1))
        def walk(o):
            if isinstance(o, dict):
                for k, v in o.items():
                    if k in LD_KEYS and isinstance(v, str):
                        o[k] = tr_text(v, lang)
                    elif k == "inLanguage":
                        o[k] = lang
                    else:
                        walk(v)
            elif isinstance(o, list):
                for i in o:
                    walk(i)
        walk(data)
        txt = json.dumps(data, ensure_ascii=False, indent=2)
        for p in PAGES[1:]:
            txt = txt.replace(SITE + p, page_url(lang, p))
        return '<script type="application/ld+json">\n' + txt + "\n  </script>"
    res = re.sub(r'<script type="application/ld\+json">(.*?)</script>', ld_sub, res, flags=re.S)

    # document language / direction, canonical, og
    res = res.replace('<html lang="tr">', f'<html lang="{lang}"' + (' dir="rtl"' if lang == "ar" else "") + ">", 1)
    res = re.sub(r'(<link rel="canonical" href=")[^"]+', lambda m: m.group(1) + page_url(lang, page), res, count=1)
    res = re.sub(r'(<meta property="og:url" content=")[^"]+', lambda m: m.group(1) + page_url(lang, page), res, count=1)
    res = res.replace('content="tr_TR"', f'content="{LANGS[lang][2]}"')
    # assets live one level up
    res = re.sub(r'((?:href|src)=")(assets/|favicon\.svg)', r"\1../\2", res)
    if lang == "ar":
        res = res.replace("</head>", '  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700;800&display=swap" rel="stylesheet">\n</head>', 1)
    return res

def main():
    os.chdir(ROOT)
    for page in PAGES:
        src = open(page, encoding="utf-8").read()
        src = add_common(src, page, "tr")
        open(page, "w", encoding="utf-8").write(src)
        for lang in LANGS:
            os.makedirs(lang, exist_ok=True)
            out = translate_html(add_common(src, page, lang), page, lang)
            open(os.path.join(lang, page), "w", encoding="utf-8").write(out)
    # report untranslated Turkish leftovers
    leftovers = set()
    for lang in LANGS:
        for page in PAGES:
            txt = TAG.sub(" ", re.sub(r"<(script|style|svg)[^>]*>.*?</\1>", " ", open(os.path.join(lang, page), encoding="utf-8").read(), flags=re.S))
            for w in re.findall(r"[^\s<>]*[çğışöüÇĞİŞÖÜ][^\s<>]*", html.unescape(txt)):
                leftovers.add(w)
    allowed = {"İzmit", "Ömerağa", "Akdoğan", "Pasajı", "Hürriyet", "Cd.", "Mah.", "Ömerağa'daki"}
    print("leftover Turkish-looking words:", sorted(w for w in leftovers if w.strip(".,;:()") not in allowed)[:60])

if __name__ == "__main__":
    main()
