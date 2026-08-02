#!/usr/bin/env python3
"""Injecte le bloc footer « groupe HectoFlex » + complète le JSON-LD
(parentOrganization + sameAs) sur toutes les pages du site.

Idempotent : relancer le script met à jour le bloc entre les marqueurs.
La liste des marques vit dans marques.json — ajouter une marque = une entrée.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CFG = json.loads((Path(__file__).parent / "marques.json").read_text(encoding="utf-8"))
SITE = CFG["site"]
PARENT = CFG["parent"]
MARQUES = CFG["marques"]
AUTRES = [m for m in MARQUES if m["id"] != SITE]
SAMEAS_ADD = [m["url"] for m in AUTRES]

DEBUT, FIN = "<!-- groupe-hf:debut -->", "<!-- groupe-hf:fin -->"


def bloc_footer(prefix: str) -> str:
    logos = "".join(
        f'<a class="gl" href="{m["url"]}" title="{m["nom"]}">'
        f'<img src="{prefix}img/groupe/{m["logo"]}" alt="{m["nom"]}" loading="lazy" decoding="async"></a>'
        for m in AUTRES
    )
    return (
        f"{DEBUT}\n"
        '<div class="ft-groupe" style="margin-top:26px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);'
        'display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px 22px;'
        'font-size:12.5px;color:#a8a8a8;text-align:center">\n'
        "<style>.ft-groupe a.gl{display:inline-flex;align-items:center;opacity:.75;transition:opacity .15s}"
        ".ft-groupe a.gl:hover{opacity:1}.ft-groupe a.gl img{height:26px;width:auto;display:block}</style>\n"
        "<span>Une marque du groupe HectoFlex Customs Sàrl</span>\n"
        f'<span style="display:inline-flex;align-items:center;gap:20px">{logos}</span>\n'
        f'<a href="{prefix}notre-groupe.html" style="color:#a8a8a8;text-decoration:underline">Notre groupe →</a>\n'
        f"</div>\n{FIN}"
    )


def maj_footer(html: str, prefix: str) -> str:
    html = re.sub(r"\n*" + re.escape(DEBUT) + r".*?" + re.escape(FIN) + r"\n?", "", html, flags=re.S)
    out = re.sub(r"(</div>\s*</footer>)", bloc_footer(prefix) + r"\n\1", html, count=1)
    if out == html:
        out = re.sub(r"(</footer>)", "\n" + bloc_footer(prefix) + r"\n\1", html, count=1)
    return out


NOMS_GROUPE = {m["nom"] for m in MARQUES}


def est_noeud_org(node) -> bool:
    t = node.get("@type", "")
    types = t if isinstance(t, list) else [t]
    if not any(x == "Organization" or "Business" in str(x) for x in types):
        return False
    # Uniquement les nœuds de la marque du site — jamais les partenaires
    # (ex. Auto-Rives Morges) ni l'entité légale parente elle-même.
    return node.get("name") in NOMS_GROUPE


def maj_noeud(node) -> bool:
    changed = False
    if node.get("parentOrganization", {}).get("vatID") != PARENT["vatID"]:
        node["parentOrganization"] = {"@type": "Organization", **PARENT}
        changed = True
    sameas = node.get("sameAs", [])
    if isinstance(sameas, str):
        sameas = [sameas]
    avant = list(sameas)
    sameas = [u for u in sameas if "dtfswiss" not in u]
    for u in SAMEAS_ADD:
        if u not in sameas:
            sameas.append(u)
    if sameas != avant:
        node["sameAs"] = sameas
        changed = True
    return changed


def maj_jsonld(html: str) -> tuple[str, int]:
    n = 0

    def repl(m):
        nonlocal n
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            return m.group(0)
        noeuds = data if isinstance(data, list) else data.get("@graph", [data])
        changed = any(maj_noeud(x) for x in noeuds if isinstance(x, dict) and est_noeud_org(x))
        if not changed:
            return m.group(0)
        n += 1
        return ('<script type="application/ld+json">'
                + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
                + "</script>")

    html = re.sub(r'<script type="application/ld\+json">(.*?)</script>', repl, html, flags=re.S)
    return html, n


def main():
    pages = sorted(ROOT.glob("*.html")) + sorted((ROOT / "pages").glob("*.html"))
    footers = lds = 0
    for f in pages:
        if f.name.startswith("google"):
            continue
        html = f.read_text(encoding="utf-8")
        if "</footer>" not in html:
            continue
        prefix = "" if f.parent == ROOT else "../"
        avant = html
        html = maj_footer(html, prefix)
        if DEBUT in html and avant != html:
            footers += 1
        html, n = maj_jsonld(html)
        lds += n
        if html != avant:
            f.write_text(html, encoding="utf-8")
    print(f"{SITE}: bloc footer sur {footers} pages, JSON-LD complété sur {lds} blocs")


if __name__ == "__main__":
    main()
