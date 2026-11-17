"""Разбирает HTML-сеты SAT Questions в структуру для CRM и собирает файл импорта.

Запуск: python tools/parse_sets.py <sets.json из tools/drive_ids.py> <папка SAT Questions> <выходной json>

Выходной JSON импортируется на сайте: «Данные → Добавить из файла» (нужен облачный режим для сетов).
НЕ коммитить выходной JSON: в нём вопросы и ключи ответов, а репозиторий публичный.

Каждый сет -> questionSets[]: {id, title, subtitle, skills, questions[], answers[]}
  question: {n, difficulty, stimulus, stem, choices: [{letter, html}]}
HTML вопросов чистится по белому списку тегов/атрибутов (включая SVG для графиков),
id внутри SVG получают префикс, чтобы не конфликтовать между вопросами.
Материалы (materials[]) ссылаются на сет через setId и сохраняют ссылку на Drive.
"""
import json
import re
import sys
import uuid
from copy import deepcopy
from datetime import datetime, timezone

import lxml.html
from lxml import etree

sys.stdout.reconfigure(encoding='utf-8')

sets_path, root, out_path = sys.argv[1:4]
drive_files = json.load(open(sets_path, encoding='utf-8'))

FOLDER_SKILLS = {
    'Boundaries': ['boundaries'],
    'Central_Ideas_and_Details': ['central-ideas'],
    'Command_of_Evidence': ['evidence-textual', 'evidence-quant'],
    'Cross-Text_Connections': ['cross-text'],
    'Form_Structure_and_Sense': ['form-structure-sense'],
    'Inferences': ['inferences'],
    'Rhetorical_Synthesis': ['rhetorical-synthesis'],
    'Text_Structure_and_Purpose': ['text-structure'],
    'Transitions': ['transitions'],
    'Words_in_Context': ['words-in-context'],
}

ALLOWED_TAGS = {
    # текст
    'p', 'span', 'div', 'em', 'strong', 'u', 'sub', 'sup', 'br', 'blockquote', 'ol', 'ul', 'li', 'figure',
    'figcaption',
    # таблицы
    'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    # svg (графики в Command of Evidence)
    'svg', 'g', 'defs', 'pattern', 'rect', 'line', 'text', 'marker', 'polygon', 'polyline', 'path', 'circle',
    'ellipse', 'tspan', 'title', 'desc',
}
ALLOWED_ATTRS = {
    'class', 'style', 'lang', 'role', 'scope', 'colspan', 'rowspan', 'id',
    'width', 'height', 'viewbox', 'xmlns', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'd', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
    'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'transform', 'opacity',
    'patternunits', 'patterntransform', 'markerwidth', 'markerheight', 'refx', 'refy', 'markerunits', 'orient',
    'marker-end', 'marker-start', 'preserveaspectratio',
}


def clean(el, id_prefix):
    """Очищает поддерево на месте: неизвестные теги разворачиваются, опасные атрибуты удаляются."""
    for node in list(el.iter()):
        if not isinstance(node.tag, str):  # комментарии и т.п.
            node.drop_tree() if node.getparent() is not None else None
            continue
        tag = node.tag.lower()
        if node is not el and tag not in ALLOWED_TAGS:
            if tag in ('script', 'style', 'iframe', 'object', 'embed', 'img', 'a', 'form', 'input', 'link'):
                node.drop_tree()
            else:
                node.drop_tag()
            continue
        for name in list(node.attrib):
            value = node.attrib[name]
            lname = name.lower()
            keep = lname in ALLOWED_ATTRS or lname.startswith('aria-') or lname.startswith('data-')
            if lname.startswith('on') or 'javascript:' in value.lower():
                keep = False
            if 'url(' in value.lower() and not re.fullmatch(r'\s*url\(#[\w.-]+\)\s*', value):
                keep = keep and lname == 'style' and 'url(' not in value.lower()
            if not keep:
                del node.attrib[name]
                continue
            if lname == 'id':
                node.attrib[name] = f'{id_prefix}{value}'
            elif value.strip().startswith('url(#'):
                node.attrib[name] = re.sub(r'url\(#([\w.-]+)\)', lambda m: f'url(#{id_prefix}{m.group(1)})', value)


def inner_html(el, id_prefix):
    if el is None:
        return ''
    el = deepcopy(el)
    clean(el, id_prefix)
    parts = [el.text or '']
    for child in el:
        parts.append(lxml.html.tostring(child, encoding='unicode', method='html'))
    return ''.join(parts).strip()


def questions_word(n):
    a, b = n % 100, n % 10
    if 10 < a < 20:
        return 'вопросов'
    if b == 1:
        return 'вопрос'
    if 2 <= b <= 4:
        return 'вопроса'
    return 'вопросов'


now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
question_sets, materials, problems = [], [], []

for f in drive_files:
    path = f"{root}/{f['folder']}/{f['file']}"
    doc = lxml.html.fromstring(open(path, encoding='utf-8').read())
    url = f"https://drive.google.com/file/d/{f['id']}/view"
    set_id = str(uuid.uuid5(uuid.NAMESPACE_URL, url))
    short = set_id[:8]

    title = (doc.findtext('.//title') or f['file']).strip().replace('Practice Set', 'Set')
    sub_el = doc.xpath('//header[contains(@class,"set")]//*[contains(@class,"sub")]')
    subtitle = re.sub(r'\s+', ' ', sub_el[0].text_content()).strip() if sub_el else ''

    questions = []
    for idx, q in enumerate(doc.xpath('//div[@class="q"][not(ancestor::section[contains(@class,"answer-key")])]'), 1):
        qnum = q.xpath('./p[contains(@class,"qnum")]')
        diff_m = re.search(r'\[(Easy|Medium|Hard)\]', qnum[0].text_content()) if qnum else None
        prefix = f's{short}q{idx}-'
        choices = []
        for li in q.xpath('./ol[contains(@class,"choices")]/li'):
            letter = (li.findtext('./span[@class="ltr"]') or '').strip()
            ct = li.xpath('./div[contains(@class,"ct")]')
            choices.append({'letter': letter, 'html': inner_html(ct[0] if ct else None, prefix)})
        stim = q.xpath('./div[contains(@class,"stimulus")]')
        stem = q.xpath('./div[contains(@class,"stem")]')
        questions.append({
            'n': idx,
            'difficulty': diff_m.group(1) if diff_m else '',
            'stimulus': inner_html(stim[0] if stim else None, prefix),
            'stem': inner_html(stem[0] if stem else None, prefix),
            'choices': choices,
        })

    key = {int(n): letter for n, letter in
           (re.match(r'\s*(\d+)\.\s*([A-D])\s*$', k.text_content()).groups() for k in doc.xpath('//div[@class="k"]'))}
    answers = [key.get(q['n'], '') for q in questions]

    # проверки
    if not questions:
        problems.append(f'{title}: нет вопросов')
    for q in questions:
        letters = [c['letter'] for c in q['choices']]
        if letters != ['A', 'B', 'C', 'D']:
            problems.append(f"{title} #{q['n']}: варианты {letters}")
        if not q['stem']:
            problems.append(f"{title} #{q['n']}: нет вопроса (stem)")
    if len(key) != len(questions) or '' in answers:
        problems.append(f'{title}: ключ {len(key)} vs вопросов {len(questions)}')

    skills = FOLDER_SKILLS[f['folder']]
    question_sets.append({
        'id': set_id, 'title': title, 'subtitle': subtitle, 'skills': skills,
        'questions': questions, 'answers': answers,
    })

    diffs = {}
    for q in questions:
        diffs[q['difficulty'] or '?'] = diffs.get(q['difficulty'] or '?', 0) + 1
    mix = ', '.join(f'{v} {k}' for k, v in diffs.items())
    notes = [f'{len(questions)} {questions_word(len(questions))} · {mix}']
    if f['folder'] == 'Command_of_Evidence':
        notes.append('текст + графики/таблицы')
    materials.append({
        'id': set_id, 'title': title, 'url': url, 'kind': 'practice', 'skills': skills,
        'notes': ' · '.join(notes), 'createdAt': now, 'setId': set_id,
    })

question_sets.sort(key=lambda s: s['title'])
materials.sort(key=lambda m: m['title'])
out = {'version': 1, 'students': [], 'lessons': [], 'scores': [], 'materials': materials,
       'questionSets': question_sets}
json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

total_q = sum(len(s['questions']) for s in question_sets)
print(f'{len(question_sets)} сетов, {total_q} вопросов')
print('проблемы:', problems if problems else 'нет')
