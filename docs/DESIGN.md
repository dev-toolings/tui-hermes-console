# DESIGN.md — Hermes Console

Règles visuelles de la Console. Le thème vient de **BoardUI** (`@boardui/ui/styles`) :
Hermes ne le redéfinit pas, il ajoute seulement des alias dans
`apps/web/src/app/globals.css`. Ce document existe surtout pour une raison :
**en dark, plusieurs tokens BoardUI partagent la même valeur**, et s'en servir
naïvement produit des bordures et des fonds invisibles.

## 1. Les surfaces, par niveau de gris

BoardUI sépare les surfaces **par la clarté, pas par un contour**. C'est écrit dans
leur propre CSS et ça explique tout le reste.

| Token             | light     | dark      | Rôle                                        |
| ----------------- | --------- | --------- | ------------------------------------------- |
| `--background`    | `#ffffff` | `#121212` | le champ dominant (frame + colonne contenu) |
| `--panel`         | `#ffffff` | `#121212` | identique au fond : les deux fusionnent     |
| `--surface`       | `#f7f7f7` | `#171717` | cards, widgets, rail — le 2ᵉ niveau         |
| `--card`          | `#ffffff` | `#262626` | contrôles surélevés                         |
| `--popover`       | `#ffffff` | `#262626` | popovers, dialogs                           |
| `--muted`         | `#f7f7f7` | `#262626` | chips, remplissages secondaires             |
| `--border`        | `#ebebeb` | `#262626` | **couture**, pas un trait dessiné           |
| `--input`         | `#ebebeb` | `#404040` | le seul bord réellement visible             |

```
dark :  #121212  ████  background / panel      ← la nappe
        #171717  ████  surface                 ← cards, blocs en creux
        #262626  ████  card / popover / muted / border
        #404040  ████  input                   ← le seul trait dessiné
```

## 2. Le piège : `--border` == `--card` == `--muted` en dark

`CardSurface` (`components/ui/boardui.tsx`) rend un `bg-card`, soit **#262626 en
dark**. Or `--border` et `--muted` valent exactement la même chose. Donc :

- `border-border` posé **sur** une card / un dialog → contraste **0**, trait invisible
- `bg-muted` posé **sur** une card / un dialog → contraste **0**, bloc sans fond

En light le problème n'existe pas (`--border` == `--input` == `#ebebeb`,
`--muted` == `--surface` == `#f7f7f7`), ce qui le rend facile à manquer.

## 3. Les deux alias Hermes

Déclarés dans `globals.css`, ils valent la même chose que l'original en light et
descendent/montent d'un cran en dark :

```css
--color-seam: var(--input);    /* border-seam  → #ebebeb light · #404040 dark */
--color-inset: var(--surface); /* bg-inset     → #f7f7f7 light · #171717 dark */
```

### Quand utiliser quoi

| Le trait / le fond est posé sur…      | Bordure         | Remplissage    |
| ------------------------------------- | --------------- | -------------- |
| `bg-background`, `bg-surface`, sidebar | `border-border` | `bg-muted`     |
| `bg-card`, `bg-popover`, dialog, `bg-muted` | `border-seam` | `bg-inset`   |

Autrement dit : **dès qu'on est à l'intérieur d'une card ou d'un dialog, c'est
`seam` + `inset`.** Sur la nappe (`#121212`) ou sur une `surface` (`#171717`),
`border-border` est la couture voulue par le design system — ne pas la remplacer.

### Ne pas empiler deux `inset`

Un `bg-inset` dans un conteneur déjà en `bg-inset` redevient plat — le problème
d'origine, un cran plus bas. Dans `hermes-token-guide.tsx`, les blocs `Card` et
`Row` sont donc **bordure seule** (`border-seam`, sans fond) : ils hébergent des
`Pre` / `Code` en `bg-inset` qui, eux, doivent ressortir.

Règle générale : un conteneur qui accueille des blocs en creux garde une
bordure, pas un fond.

## 4. Le Dialog de BoardUI

Son contour et ses séparateurs header/footer sont codés en dur en
`border-border` sur `bg-card`, dans `node_modules` — aucune classe à passer.
`globals.css` les retinte, uniquement en dark et uniquement sur les enfants
directs :

```css
.dark [role="dialog"],
.dark [role="dialog"] > [class*="border-b"],
.dark [role="dialog"] > [class*="border-t"] { border-color: var(--input); }
```

Reste non corrigé, côté librairie : le bouton flottant « Disposition »
(`shell/primitives.tsx`, `border-border` sur `bg-popover`). Son `shadow-elevated`
le détache suffisamment.

## 5. Autres alias Hermes

`globals.css` conserve les rôles métier utilisés par les écrans de mission :
`--color-success` / `--color-warning` (+ variantes `-muted`) mappés sur les
états BoardUI, la famille `--color-ai-*` (surfaces et icônes du chat), et les
ombres `--shadow-board-*`. Ne pas réintroduire de couleur en dur : passer par ces
alias ou par les tokens BoardUI.

## 6. Vérifier avant de livrer

Toute revue d'UI se fait **dans le navigateur, en dark**, via Chrome DevTools MCP.
Le script d'audit ci-dessous liste les bordures et les fonds qui n'ont aucun
contraste avec ce qu'il y a derrière :

```js
// evaluate_script sur la page à auditer, en thème dark
() => {
  const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
  const alpha = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return 1;
    const p = m[1].split(","); return p.length > 3 ? parseFloat(p[3]) : 1; };
  const effBg = (el) => { let n = el; while (n) { const b = getComputedStyle(n).backgroundColor;
    if (rgb(b).length === 3 && alpha(b) > 0.5) return rgb(b); n = n.parentElement; } return [18, 18, 18]; };
  const dist = (a, b) => a.reduce((s, c, i) => s + Math.abs(c - b[i]), 0);
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const s = getComputedStyle(el), behind = effBg(el.parentElement);
    const cls = (el.className || "").toString().slice(0, 80);
    const a = alpha(s.backgroundColor);
    if (a >= 0.05 && /bg-/.test(cls)) {
      const comp = rgb(s.backgroundColor).map((c, i) => c * a + behind[i] * (1 - a));
      if (dist(comp, behind) < 8) out.push("fond plat: " + cls);
    }
    if (parseFloat(s.borderTopWidth) >= 0.5 && alpha(s.borderTopColor) > 0.2
        && dist(rgb(s.borderTopColor), behind) < 12) out.push("bordure invisible: " + cls);
  }
  return [...new Set(out)];
}
```

Il remonte des faux positifs, à écarter à la lecture : les wrappers pleine page
(`bg-background`, `bg-panel`), les éléments qui portent déjà un bord dessiné
(`border-input`), et les anneaux « découpe » volontairement à la couleur de la
surface (`border-card` sur une pastille de statut). Tout le reste est un vrai
défaut.

Checklist rapide :

- [ ] nouvelle bordure / nouveau fond **dans une card ou un dialog** → `seam` / `inset`
- [ ] rendu vérifié en dark **et** en light (les alias sont neutres en light)
- [ ] audit ci-dessus vide sur les pages touchées
- [ ] `bun run typecheck` · `bun run lint` · `bun test`
