"""Разбирает PDF пробных тестов SAT (Reading & Writing) в файл импорта для CRM.

Запуск: python tools/parse_tests.py <выходной json> <test1.pdf> [<test2.pdf> ...]

Выходной JSON импортируется на сайте: «Данные → Добавить из файла» (тесты хранятся только в облаке).
НЕ коммитить выходной JSON: в нём вопросы, ключи и объяснения, а репозиторий публичный.

Поддерживаются две вёрстки FlashSAT:
  * «November» — карточки вопросов (номер в кружке, серый блок текста, варианты в две колонки),
    в конце ключ «READING AND WRITING — MODULE N / 1. B»; Math-модули пропускаются;
  * «December» — сплошной текст «1 / текст / вопрос / A) …», ключ + таблица «# Ans Explanation».

Каждый тест -> questionSets[]: {id, title, subtitle, skills, kind: 'test', modules, questions, answers, explanations}
  modules: [{title, count, minutes}] — вопросы идут подряд, модуль 1, затем модуль 2;
  question: {n, module, skill, stimulus, stem, choices: [{letter, html}]}
HTML строится из текста PDF с экранированием; сохраняются подчёркивания, курсив, жирный,
нижние/верхние индексы и таблицы; растровые графики вставляются как <img src="data:image/png;base64,…">.
id теста стабилен (uuid5 от имени файла), повторный импорт обновляет тест, а не дублирует.
"""
import base64
import html
import json
import os
import re
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone

import fitz  # PyMuPDF

sys.stdout.reconfigure(encoding='utf-8')

MODULE_MINUTES = 32
QUESTIONS_PER_MODULE = 27
LETTERS = ['A', 'B', 'C', 'D']
SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉'

# --- Общие утилиты --------------------------------------------------------------------------------


def esc(s):
    return html.escape(s, quote=False)


class Char:
    __slots__ = ('c', 'x0', 'y0', 'x1', 'y1', 'font', 'size', 'color', 'style', 'k')

    def __init__(self, c, bbox, font, size, color):
        self.c = c
        self.x0, self.y0, self.x1, self.y1 = bbox
        self.font, self.size, self.color = font, size, color
        self.style = frozenset()
        self.k = (self.x0, 0)  # порядок в строке: (x начала спана, номер символа в спане)


class Line:
    """Строка текста: символы одной базовой линии, отсортированные по x."""

    def __init__(self, chars):
        # внутри спана — порядок потока (лигатуры «fi» иначе переставляются), спаны — по x
        self.chars = sorted(chars, key=lambda ch: ch.k)
        main = [ch for ch in self.chars if ch.c.strip()] or self.chars
        self.x0 = min(ch.x0 for ch in main)
        self.x1 = max(ch.x1 for ch in main)
        self.y0 = min(ch.y0 for ch in main)
        self.y1 = max(ch.y1 for ch in main)
        self.page = 0
        self.gy = 0.0  # «глобальный» y: страница * 10000 + y

    @property
    def text(self):
        return plain(self.chars)

    def font_of_first(self):
        for ch in self.chars:
            if ch.c.strip():
                return ch
        return self.chars[0]


def plain(chars):
    out, prev = [], None
    for ch in chars:
        if prev is not None and ch.x0 - prev.x1 > max(1.5, prev.size * 0.18) and not out[-1].endswith(' ') \
                and ch.c != ' ' and ch.c not in SUBSCRIPT_DIGITS:
            out.append(' ')
        out.append(ch.c)
        prev = ch
    return ''.join(out)


def styled_html(chars):
    """Символы строки -> HTML с тегами для стилей (u, em, strong, sub, sup)."""
    order = ['strong', 'em', 'u', 'sub', 'sup']
    parts, cur, buf, prev = [], frozenset(), [], None

    def flush():
        if not buf:
            return
        text = esc(''.join(buf))
        for tag in reversed([t for t in order if t in cur]):
            text = f'<{tag}>{text}</{tag}>'
        parts.append(text)
        buf.clear()

    for ch in chars:
        gap = prev is not None and ch.x0 - prev.x1 > max(1.5, prev.size * 0.18) and ch.c != ' ' \
            and prev.c != ' ' and 'sub' not in ch.style and 'sup' not in ch.style and ch.c not in SUBSCRIPT_DIGITS
        if gap:
            # пробел наследует стиль, только если стиль общий (подчёркнутая фраза из нескольких слов)
            common = cur & ch.style
            if common != cur:
                flush()
                cur = common
            buf.append(' ')
        if ch.style != cur:
            flush()
            cur = ch.style
        buf.append(ch.c)
        prev = ch
    flush()
    return ''.join(parts)


def join_lines_html(lines):
    """Строки одного абзаца -> HTML; перенос по дефису склеивается без пробела."""
    out = ''
    for i, ln in enumerate(lines):
        h = styled_html(trim_chars(ln.chars))
        if not h:
            continue
        if out:
            prev_text = lines[i - 1].text.rstrip()
            out += '' if prev_text.endswith('-') and not prev_text.endswith('--') else ' '
        out += h
    # пробел внутри закрывающего/открывающего тега: «<u>word</u> <u>next</u>» -> «<u>word next</u>»
    for tag in ('u', 'em', 'strong'):
        out = out.replace(f'</{tag}> <{tag}>', ' ')
    return out.strip()


def trim_chars(chars):
    i, j = 0, len(chars)
    while i < j and not chars[i].c.strip():
        i += 1
    while j > i and not chars[j - 1].c.strip():
        j -= 1
    return chars[i:j]


def group_lines(chars):
    """Группирует символы в строки по вертикали. Мелкие индексы прилипают к строке, которую перекрывают."""
    big = [c for c in chars if c.size >= 6]
    big.sort(key=lambda c: ((c.y0 + c.y1) / 2, c.x0))
    rows = []
    for ch in big:
        cy = (ch.y0 + ch.y1) / 2
        for row in rows:
            if abs(row['cy'] - cy) <= max(2.5, ch.size * 0.35) and not (ch.size < row['size'] * 0.9):
                row['chars'].append(ch)
                break
        else:
            rows.append({'cy': cy, 'size': ch.size, 'chars': [ch]})
    # индексы (меньший кегль) — к ближайшей строке, которую они перекрывают по y
    final = []
    for row in rows:
        if row['size'] < 9.4 and len(row['chars']) <= 3 and all(c.c.isdigit() or c.c in '+−-' for c in row['chars']):
            host = None
            for other in rows:
                if other is row or other['size'] <= row['size']:
                    continue
                ys = [c for c in other['chars']]
                y0 = min(c.y0 for c in ys)
                y1 = max(c.y1 for c in ys)
                if y0 - 2 <= row['cy'] <= y1 + 2 and any(
                        abs(c.x1 - row['chars'][0].x0) < 3 or abs(c.x0 - row['chars'][-1].x1) < 3 for c in ys):
                    host = other
                    break
            if host:
                for c in row['chars']:
                    c.style = c.style | {'sub' if row['cy'] > host['cy'] else 'sup'}
                host['chars'].extend(row['chars'])
                continue
        final.append(row)
    return [Line(r['chars']) for r in final if any(c.c.strip() for c in r['chars'])]


# --- Чтение страницы -----------------------------------------------------------------------------


class Page:
    def __init__(self, doc, index, fonts):
        self.index = index
        self.page = doc[index]
        self.drawings = self.page.get_drawings()
        self.tables = []
        try:
            self.tables = [t for t in self.page.find_tables().tables if t.row_count >= 2 and t.col_count >= 2]
        except Exception:
            self.tables = []
        self.images = [i for i in self.page.get_image_info() if i['bbox'][2] - i['bbox'][0] > 60]
        self.fonts = fonts
        self.chars = []
        raw = self.page.get_text('rawdict')
        for b in raw['blocks']:
            for ln in b.get('lines', []):
                for sp in ln['spans']:
                    for seq, ch in enumerate(sp['chars']):
                        if ch['c'] in '​﻿':
                            continue
                        size = sp['size']
                        if sp['font'].startswith('KaTeX_Math'):
                            size *= 0.83  # формулы KaTeX набраны крупнее основного текста
                        c = Char(ch['c'], ch['bbox'], sp['font'], size, sp['color'])
                        c.k = (sp['bbox'][0], seq)
                        c.style = fonts.style(sp['font'])
                        self.chars.append(c)
        self.mark_underlines()

    def mark_underlines(self):
        rules = []
        for d in self.drawings:
            r = d['rect']
            fill = d.get('fill')
            if d['type'] == 'f' and fill and max(fill) < 0.3 and r.height <= 1.6 and 3 < r.width < 520:
                rules.append(r)
        if not rules:
            return
        for c in self.chars:
            cx = (c.x0 + c.x1) / 2
            for r in rules:
                if r.x0 - 0.5 <= cx <= r.x1 + 0.5 and c.y1 - 4 <= r.y0 <= c.y1 + 3.5:
                    c.style = c.style | {'u'}
                    break

    def in_rect(self, c, rect, pad=1.0):
        cx, cy = (c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2
        return rect[0] - pad <= cx <= rect[2] + pad and rect[1] - pad <= cy <= rect[3] + pad

    def table_html(self, t):
        rows = t.extract()
        cells = t.rows
        out = ['<table>']
        for ri, row in enumerate(rows):
            tag = 'th' if ri == 0 else 'td'
            tds = []
            for ci, text in enumerate(row):
                if text is None:
                    continue
                # текст ячейки — со стилями (индексы, курсив) по символам внутри ячейки
                bbox = cells[ri].cells[ci]
                inner = ''
                if bbox:
                    chs = [c for c in self.chars if self.in_rect(c, bbox, 0.5)]
                    inner = ' '.join(join_lines_html([ln]) for ln in group_lines(chs))
                if not inner:
                    inner = esc(re.sub(r'\s+', ' ', text).strip())
                if inner == '---':
                    inner = '—'
                tds.append(f'<{tag}>{inner}</{tag}>')
            out.append('<tr>' + ''.join(tds) + '</tr>')
        out.append('</table>')
        return ''.join(out)

    def image_html(self, bbox, caption):
        clip = fitz.Rect(bbox)
        pix = self.page.get_pixmap(clip=clip, dpi=144)
        data = base64.b64encode(pix.tobytes('png')).decode('ascii')
        alt = esc(caption or 'График').replace('"', '&quot;')
        cap = f'<figcaption>{esc(caption)}</figcaption>' if caption else ''
        return f'<figure><img src="data:image/png;base64,{data}" alt="{alt}" />{cap}</figure>'


class Fonts:
    """Определяет начертание Type3-шрифтов по их употреблению (имён у них нет)."""

    def __init__(self, doc, last_page):
        spans = []
        for i in range(last_page):
            for b in doc[i].get_text('dict')['blocks']:
                for ln in b.get('lines', []):
                    line_fonts = [s['font'] for s in ln['spans']]
                    for s in ln['spans']:
                        spans.append((s, line_fonts))
        counts = Counter(s['font'] for s, _ in spans if s['size'] > 9 and len(s['text']) > 20)
        self.body = {f for f, n in counts.most_common(2)}  # текст стимула и текст вариантов
        self.styles = {}
        bold = set()
        for s, _ in spans:
            if re.fullmatch(r'\s*Text [12]\s*', s['text']) or s['size'] >= 12:
                bold.add(s['font'])
        for s, line_fonts in spans:
            f = s['font']
            if f in self.body or f in self.styles or f.startswith('KaTeX'):
                continue
            if f in bold:
                self.styles[f] = frozenset({'strong'})
            elif any(lf in self.body for lf in line_fonts) and len(re.findall(r'[A-Za-z]', s['text'])) >= 3:
                self.styles[f] = frozenset({'em'})

    def style(self, font):
        return self.styles.get(font, frozenset())


# --- Навык вопроса --------------------------------------------------------------------------------


def classify(stimulus_text, stem, choices_text):
    s = stem.lower()
    st = stimulus_text.lower()
    if 'conventions of standard english' in s:
        stripped = {re.sub(r'[^\w\s]|\s+', '', c.lower()) for c in choices_text}
        return 'boundaries' if len(stripped) == 1 else 'form-structure-sense'
    if 'transition' in s:
        return 'transitions'
    if 'notes' in s and ('goal' in s or 'accomplish' in s):
        return 'rhetorical-synthesis'
    if 'logical and precise word' in s or 'most nearly mean' in s:
        return 'words-in-context'
    if 'text 1' in st and 'text 2' in st:
        return 'cross-text'
    if 'underlined' in s or 'main purpose' in s or 'overall structure' in s or 'function of' in s:
        return 'text-structure'
    if re.search(r'data (from|in) the (table|graph|chart)|uses data|information (from|in) the (table|graph)', s) \
            or (('<table' in stimulus_text or 'graph' in s or 'table' in s) and 'complete' in s):
        return 'evidence-quant'
    if re.search(r'quotation|illustrates? the claim|most directly (support|weaken|undermine|challenge)|'
                 r'would most (strongly|directly|seriously) (support|weaken|undermine)|support(s)? the .*(claim|hypothesis|argument)|'
                 r'(weaken|undermine)', s):
        return 'evidence-textual'
    if 'if true' in s:
        return 'evidence-textual'
    if 'given sentences' in s:
        return 'rhetorical-synthesis'
    if 'most strongly suggest' in s or 'most reasonably' in s or 'most logically completes' in s:
        return 'inferences'
    if 'main idea' in s or 'central idea' in s or 'is presented' in s or             re.search(r'according to the (text|passage)|based on the (text|passage)', s):
        return 'central-ideas'
    return ''


# --- Вёрстка «November» ---------------------------------------------------------------------------


def is_rule(d, gray_min=0.95):
    fill = d.get('fill')
    return d['type'] == 'f' and fill and min(fill) >= gray_min and max(fill) < 0.99


def parse_november(doc, path):
    problems = []
    # последняя страница R&W — перед «Math — Module 1»; ключ — страница с «Answer Key»
    rw_pages, key_page = [], None
    for i, p in enumerate(doc):
        t = p.get_text()
        if t.lstrip().startswith('Math'):
            rw_pages = list(range(1, i))
            break
    for i, p in enumerate(doc):
        if 'Answer Key' in p.get_text() and 'READING AND WRITING' in p.get_text():
            key_page = i
    fonts = Fonts(doc, rw_pages[-1] + 1)

    questions = []
    module = 0
    for pi in rw_pages:
        pg = Page(doc, pi, fonts)
        header = [c for c in pg.chars if c.size >= 11.5 and c.y1 < 60]
        if header and 'Module' in plain(sorted(header, key=lambda c: c.x0)):
            m = re.search(r'Module (\d)', plain(sorted(header, key=lambda c: c.x0)))
            module = int(m.group(1))
        chars = [c for c in pg.chars if not (c.size >= 11.5 and c.y1 < 60)]
        chars = [c for c in chars if not (c.size < 9.5 and c.y0 > 740)]  # колонтитул «27 questions · 32 minutes»
        # номера вопросов — белые цифры в кружке
        nums = sorted({(round(c.y0), c.x0) for c in chars if c.color == 0xffffff and c.c.isdigit() and c.x0 < 60})
        starts = []
        for y, _x in nums:
            digits = sorted([c for c in chars if c.color == 0xffffff and c.c.isdigit() and abs(c.y0 - y) < 2],
                            key=lambda c: c.x0)
            n = int(''.join(c.c for c in digits))
            if not starts or starts[-1][1] != n:
                starts.append((y, n))
        boxes = [d['rect'] for d in pg.drawings
                 if d['type'] == 's' and 11 < d['rect'].width < 17 and 11 < d['rect'].height < 17]
        for k, (y, n) in enumerate(starts):
            y_end = starts[k + 1][0] - 5 if k + 1 < len(starts) else 800
            region = [c for c in chars if y + 12 < (c.y0 + c.y1) / 2 < y_end and c.color != 0xffffff]
            region = [c for c in region if not (c.size < 8 and 'CHOOSE' in '')]
            region = [c for c in region if abs(c.size - 7.5) > 0.2 or c.color != 0x7e676f]  # «CHOOSE THE BEST ANSWER»
            qboxes = sorted([b for b in boxes if y < b.y0 < y_end], key=lambda b: (round(b.y0), b.x0))
            if len(qboxes) != 4:
                problems.append(f'{os.path.basename(path)} M{module} #{n}: вариантов {len(qboxes)}')
            choice_top = min((b.y0 for b in qboxes), default=y_end) - 3
            # варианты
            choices = []
            col_xs = sorted({round(b.x0) for b in qboxes})
            for bi, b in enumerate(qboxes):
                same_col = [o for o in qboxes if round(o.x0) == round(b.x0) and o.y0 > b.y0 + 2]
                bottom = min((o.y0 - 3 for o in same_col), default=y_end)
                right = 600
                for cx in col_xs:
                    if cx > b.x1 + 5:
                        right = cx - 4
                        break
                in_choice = [c for c in region if b.x1 + 2 < c.x0 and c.x1 <= right + 2 and b.y0 - 3 <= (c.y0 + c.y1) / 2 < bottom]
                letter_chars = [c for c in region if pg.in_rect(c, (b.x0, b.y0, b.x1, b.y1), 0.5)]
                letter = ''.join(c.c for c in letter_chars).strip()
                lines = group_lines(in_choice)
                choices.append({'letter': letter, 'html': join_lines_html(lines), 'text': ' '.join(l.text for l in lines)})
            choices.sort(key=lambda c: c['letter'])
            # стимул и вопрос: всё выше вариантов
            top_chars = [c for c in region if (c.y0 + c.y1) / 2 < choice_top]
            gray = [d['rect'] for d in pg.drawings if is_rule(d) and d['rect'].height > 20 and y < d['rect'].y0 < y_end]
            blocks = []  # (y, html, kind)
            used = set()
            for t in pg.tables:
                if y < t.bbox[1] < choice_top:
                    blocks.append((t.bbox[1], pg.table_html(t), 'table'))
                    for c in top_chars:
                        if pg.in_rect(c, t.bbox, 1):
                            used.add(id(c))
            for im in pg.images:
                bb = im['bbox']
                if y < bb[1] < choice_top:
                    # подпись-описание мелким шрифтом сразу под картинкой
                    cap_chars = [c for c in top_chars if c.size < 8 and bb[3] - 2 < c.y0 < bb[3] + 20]
                    caption = plain(sorted(cap_chars, key=lambda c: c.x0)).strip()
                    for c in top_chars:
                        if pg.in_rect(c, bb, 1) or c in cap_chars:
                            used.add(id(c))
                    blocks.append((bb[1], pg.image_html(bb, caption), 'figure'))
            text_chars = [c for c in top_chars if id(c) not in used]
            lines = sorted(group_lines(text_chars), key=lambda l: l.y0)
            # абзацы
            # маркеры списка заметок — маленькие тёмные квадраты слева от строки
            bullets = [d['rect'] for d in pg.drawings if d['type'] == 'f' and d.get('fill') and max(d['fill']) < 0.3
                       and 2 < d['rect'].width < 6 and 2 < d['rect'].height < 6 and y < d['rect'].y0 < choice_top]
            paras = []
            for ln in lines:
                inside = any(g.y0 - 2 <= ln.y0 and ln.y1 <= g.y1 + 2 for g in gray)
                is_label = re.fullmatch(r'Text [12]', ln.text.strip()) is not None
                li_start = any(b.x1 < ln.x0 and ln.x0 - b.x1 < 20 and ln.y0 - 1 <= (b.y0 + b.y1) / 2 <= ln.y1 + 1
                               for b in bullets)
                li_cont = bool(bullets) and not li_start and ln.x0 > min(b.x1 for b in bullets) + 4
                prev = paras[-1] if paras else None
                if prev and not li_start and not is_label and not prev['label'] and prev['inside'] == inside \
                        and ln.y0 - prev['lines'][-1].y1 < 6 and prev['li'] == li_cont:
                    prev['lines'].append(ln)
                else:
                    paras.append({'lines': [ln], 'inside': inside, 'label': is_label, 'li': li_start})
            for p in paras:
                kind = 'outside' if not p['inside'] else 'p'
                tag = ('<ul><li>', '</li></ul>') if p['li'] else ('<p>', '</p>')
                blocks.append((p['lines'][0].y0, f"{tag[0]}{join_lines_html(p['lines'])}{tag[1]}", kind))
            blocks.sort(key=lambda b: b[0])
            # вопрос — последний абзац вне серого блока
            stem_idx = max((i for i, b in enumerate(blocks) if b[2] == 'outside'), default=None)
            if stem_idx is None:
                problems.append(f'{os.path.basename(path)} M{module} #{n}: не найден вопрос')
                stem = ''
            else:
                stem = blocks.pop(stem_idx)[1]
            stimulus = ''.join(b[1] for b in blocks).replace('</li></ul><ul><li>', '</li><li>')
            questions.append({
                'module': module, 'num': n, 'stimulus': stimulus, 'stem': stem,
                'choices': choices,
            })

    # ключ
    key = {}
    if key_page is not None:
        mod = 0
        for line in doc[key_page].get_text().splitlines():
            m = re.match(r'READING AND WRITING — MODULE (\d)', line.strip())
            if m:
                mod = int(m.group(1))
                continue
            if line.strip().startswith('MATH'):
                mod = 0
            m = re.fullmatch(r'(\d+)\. ([A-D])', line.strip())
            if m and mod:
                key[(mod, int(m.group(1)))] = m.group(2)
    explanations = {}
    return questions, key, explanations, problems


# --- Вёрстка «December» ---------------------------------------------------------------------------


def parse_december(doc, path):
    problems = []
    fonts = Fonts(doc, len(doc))
    # где начинается ключ: страница и y заголовка «Answer Key»
    key_pos = None
    for pi in range(len(doc)):
        for b in doc[pi].get_text('dict')['blocks']:
            for ln in b.get('lines', []):
                t = ''.join(s['text'] for s in ln['spans']).strip()
                if t == 'Answer Key' and key_pos is None:
                    key_pos = (pi, ln['bbox'][1])
    if key_pos is None:
        raise SystemExit(f'{path}: не найден «Answer Key»')

    def before_key(pi, y):
        return (pi, y) < key_pos

    all_lines, key_tables = [], []
    for pi in range(len(doc)):
        pg = Page(doc, pi, fonts)
        chars = [c for c in pg.chars if not (c.size < 9 and c.y0 > 790)]  # колонтитул
        used = set()
        for t in pg.tables:
            if not before_key(pi, t.bbox[1]):
                key_tables.append((pi, t.bbox, t.extract()))  # extract сразу: потом страница уже другая
            for c in chars:
                if pg.in_rect(c, t.bbox, 1):
                    used.add(id(c))
        lines = group_lines([c for c in chars if id(c) not in used])
        for ln in lines:
            ln.page = pi
            ln.gy = pi * 10000 + ln.y0
            ln.kind = 'text'
        for t in pg.tables:
            if before_key(pi, t.bbox[1]):
                tl = Line([Char('#', t.bbox, '', 10, 0)])
                tl.page, tl.gy, tl.kind, tl.html = pi, pi * 10000 + t.bbox[1], 'table', pg.table_html(t)
                lines.append(tl)
        all_lines.extend(lines)
    all_lines.sort(key=lambda l: (l.gy, l.x0))

    def first(ln):
        return ln.font_of_first()

    body = [ln for ln in all_lines if before_key(ln.page, ln.y0)]
    key_lines = [ln for ln in all_lines if not before_key(ln.page, ln.y0)]

    questions = []
    module = 0
    cur = None
    for ln in body:
        if ln.kind == 'text':
            f = first(ln)
            t = ln.text.strip()
            if f.size >= 17 and re.fullmatch(r'Module (\d)', t):
                module = int(t.split()[1])
                cur = None
                continue
            if module == 0:
                continue
            if f.color == 0x047857 and f.size >= 12 and t.isdigit():
                cur = {'module': module, 'num': int(t), 'lines': []}
                questions.append(cur)
                continue
            if re.match(r'27 questions', t) and cur is None:
                continue
        if cur is not None:
            cur['lines'].append(ln)

    parsed = []
    for q in questions:
        lines = q['lines']
        ci = [i for i, ln in enumerate(lines) if ln.kind == 'text' and re.match(r'[A-D]\) ', ln.text.strip())]
        choices = []
        if ci:
            for k, i in enumerate(ci):
                j = ci[k + 1] if k + 1 < len(ci) else len(lines)
                chunk = lines[i:j]
                h = join_lines_html(chunk)
                h = re.sub(r'^[A-D]\)\s*', '', h)
                choices.append({'letter': chunk[0].text.strip()[0], 'html': h,
                                'text': re.sub(r'^[A-D]\)\s*', '', ' '.join(l.text for l in chunk))})
            pre = lines[:ci[0]]
        else:
            pre = lines
        if [c['letter'] for c in choices] != LETTERS:
            problems.append(f"{os.path.basename(path)} M{q['module']} #{q['num']}: варианты {[c['letter'] for c in choices]}")
        parsed.append({'module': q['module'], 'num': q['num'], 'choices': choices, **stimulus_and_stem(pre)})

    # ключ: строки «1 B 2 A …» под заголовками «Module N»
    key, expl = {}, {}
    module = 0
    module_y = []  # ((page, y), module) — чтобы отнести таблицы объяснений к модулю
    for ln in key_lines:
        t = ln.text.strip()
        m = re.fullmatch(r'Module (\d)', t)
        if m:
            module = int(m.group(1))
            module_y.append(((ln.page, ln.y0), module))
            continue
        if module and re.fullmatch(r'(\d+ [A-D]\s*)+', t):
            for n, a in re.findall(r'(\d+) ([A-D])', t):
                key[(module, int(n))] = a
    # объяснения: таблицы «# | Ans | Explanation»
    for pi, bbox, rows in key_tables:
        mod = 0
        for pos, m in module_y:
            if pos <= (pi, bbox[1]):
                mod = m
        for row in rows:
            if not row or len(row) < 3 or not (row[0] or '').strip().isdigit():
                continue
            n = int(row[0].strip())
            text = re.sub(r'\s+', ' ', row[-1] or '').strip()
            if (row[1] or '').strip() != key.get((mod, n)):
                problems.append(f'{os.path.basename(path)} M{mod} #{n}: в таблице объяснений ответ {row[1]}, '
                                f'в ключе {key.get((mod, n))}')
            if re.search(r'\b(Wait|Ah!|Let me correct|in my mind)', text):
                problems.append(f'{os.path.basename(path)} M{mod} #{n}: объяснение противоречит ключу — '
                                f'пропущено, проверьте ответ вручную')
                continue
            expl[(mod, n)] = esc(text)
    return parsed, key, expl, problems


def stimulus_and_stem(pre):
    """Строки до вариантов -> стимул (абзацы, таблицы, списки заметок) и вопрос (последний абзац)."""
    paras = []
    for ln in pre:
        if ln.kind == 'table':
            paras.append({'html': ln.html, 'lines': [ln], 'label': False, 'table': True, 'li': False})
            continue
        is_label = re.fullmatch(r'Text [12]', ln.text.strip()) is not None
        is_li = ln.x0 > 60  # заметки ученика — с отступом
        prev = paras[-1] if paras else None
        if prev and not prev['table'] and not prev['label'] and not is_label and not prev['li'] and not is_li \
                and prev['lines'][-1].page == ln.page and ln.y0 - prev['lines'][-1].y1 < 5:
            prev['lines'].append(ln)
        else:
            paras.append({'lines': [ln], 'label': is_label, 'table': False, 'li': is_li})
    blocks = []
    for p in paras:
        if p['table']:
            blocks.append(p['html'])
        elif p['li']:
            item = f"<li>{join_lines_html(p['lines'])}</li>"
            if blocks and blocks[-1].startswith('<ul>'):
                blocks[-1] = blocks[-1][:-5] + item + '</ul>'
            else:
                blocks.append(f'<ul>{item}</ul>')
        else:
            blocks.append(f"<p>{join_lines_html(p['lines'])}</p>")
    stem = blocks.pop() if blocks else ''
    return {'stimulus': ''.join(blocks), 'stem': stem}


# --- Сборка ---------------------------------------------------------------------------------------

ALLOWED = {'p', 'ul', 'li', 'strong', 'em', 'u', 'sub', 'sup', 'table', 'tr', 'th', 'td', 'figure', 'figcaption', 'img'}


def check_html(h, where, problems):
    for tag in re.findall(r'</?([a-zA-Z0-9]+)', h):
        if tag.lower() not in ALLOWED:
            problems.append(f'{where}: недопустимый тег {tag}')
    for src in re.findall(r'src="([^"]*)"', h):
        if not src.startswith('data:image/png;base64,'):
            problems.append(f'{where}: недопустимый src')


def title_for(path, doc):
    name = os.path.splitext(os.path.basename(path))[0]
    first = doc[0].get_text()
    m = re.search(r'Form ([A-Z])\b', first)
    month = re.search(r'(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})', name.replace('-', ' ').replace('_', ' '))
    mon = f'{month.group(1)} {month.group(2)}' if month else ''
    if m:
        return f'FlashSAT {mon} · Form {m.group(1)}'.replace('  ', ' ')
    m = re.search(r'Prediction[_ ]Test[_ ](\d+)', name)
    if m:
        return f'FlashSAT {mon} · Prediction Test {m.group(1)}'
    return name.replace('_', ' ')


def main():
    out_path, pdfs = sys.argv[1], sys.argv[2:]
    now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    sets, materials, all_problems = [], [], []
    for path in pdfs:
        doc = fitz.open(path)
        text1 = doc[0].get_text()
        if 'MODULE' in text1 and 'QUESTIONS' in text1:
            qs, key, expl, problems = parse_november(doc, path)
            subtitle_extra = 'Reading & Writing (Math пропущен)'
        else:
            qs, key, expl, problems = parse_december(doc, path)
            subtitle_extra = 'Reading & Writing'
        title = title_for(path, doc)
        set_id = str(uuid.uuid5(uuid.NAMESPACE_URL, 'verbal-crm:practice-test:' + os.path.basename(path)))

        modules = []
        for m in sorted({q['module'] for q in qs}):
            cnt = sum(1 for q in qs if q['module'] == m)
            modules.append({'title': f'Модуль {m}', 'count': cnt, 'minutes': MODULE_MINUTES})
            nums = [q['num'] for q in qs if q['module'] == m]
            if nums != list(range(1, cnt + 1)):
                problems.append(f'{title} M{m}: номера вопросов {nums}')
            if cnt != QUESTIONS_PER_MODULE:
                problems.append(f'{title} M{m}: {cnt} вопросов вместо {QUESTIONS_PER_MODULE}')
        key_count = len(key)
        if key_count != len(qs):
            problems.append(f'{title}: ключ {key_count} vs вопросов {len(qs)}')

        questions, answers, explanations = [], [], []
        skill_counts = Counter()
        for i, q in enumerate(qs, 1):
            stim_text = re.sub(r'<[^>]+>', ' ', q['stimulus'])
            stem_text = re.sub(r'<[^>]+>', ' ', q['stem'])
            skill = classify(stim_text + (' <table' if '<table' in q['stimulus'] else ''), stem_text,
                             [c['text'] for c in q['choices']])
            skill_counts[skill or '?'] += 1
            where = f"{title} M{q['module']} #{q['num']}"
            for h in [q['stimulus'], q['stem']] + [c['html'] for c in q['choices']]:
                check_html(h, where, problems)
            if not q['stem']:
                problems.append(f'{where}: пустой вопрос')
            if any(not c['html'] for c in q['choices']):
                problems.append(f'{where}: пустой вариант')
            questions.append({
                'n': i, 'module': q['module'], 'skill': skill,
                'stimulus': q['stimulus'], 'stem': q['stem'],
                'choices': [{'letter': c['letter'], 'html': c['html']} for c in q['choices']],
            })
            a = key.get((q['module'], q['num']), '')
            if not a:
                problems.append(f'{where}: нет ответа в ключе')
            answers.append(a)
            explanations.append(f"<p>{expl[(q['module'], q['num'])]}</p>" if (q['module'], q['num']) in expl else '')

        n_expl = sum(1 for e in explanations if e)
        subtitle = f'{subtitle_extra} · {len(modules)} модуля × {MODULE_MINUTES} мин'
        sets.append({
            'id': set_id, 'title': title, 'subtitle': subtitle, 'skills': [], 'kind': 'test',
            'modules': modules, 'questions': questions, 'answers': answers, 'explanations': explanations,
        })
        notes = f'{len(questions)} вопросов · {len(modules)} модуля по {MODULE_MINUTES} мин'
        notes += f' · объяснений: {n_expl}' if n_expl else ' · без объяснений'
        materials.append({
            'id': set_id, 'title': title, 'url': '', 'kind': 'test', 'skills': [],
            'notes': notes, 'createdAt': now, 'setId': set_id,
        })
        all_problems.extend(problems)
        print(f'{title}: {len(questions)} вопросов, ключ {key_count}, объяснений {n_expl}, '
              f'навыки {dict(skill_counts)}')

    out = {'version': 1, 'students': [], 'lessons': [], 'scores': [], 'materials': materials, 'questionSets': sets}
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('проблемы:', '\n  '.join([''] + all_problems) if all_problems else 'нет')


if __name__ == '__main__':
    main()
