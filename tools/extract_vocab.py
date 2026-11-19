"""Собирает слова-кандидаты для тренера словаря из сетов Words in Context.

Запуск: python tools/extract_vocab.py <файл импорта из tools/parse_sets.py> <выходной json>

Берёт сеты с навыком words-in-context. Из каждого вопроса с пропуском в тексте получается:
  - верный вариант -> слово с контекстом {text с ____, answer, distractors: остальные три варианта};
  - неверные варианты -> слова без контекста (их тоже стоит знать).
Вопросы без пропуска («as used in the text, what does X most nearly mean») пропускаются.

Выход: {..., vocabWords: [{id, word, pos, definition, translation, connotation, contexts, confusables,
deck, rank, forms}]} — формат «Данные → Добавить из файла». Поля definition / translation / pos / connotation /
confusables здесь ПУСТЫЕ: их нужно заполнить перед импортом (слова без definition импорт пропускает).
В поле word — форма из вопроса (например corroborates); при заполнении её стоит привести к начальной
(corroborate), а форму из вопроса оставить в contexts[].answer и в forms: по forms (нижний регистр)
сервер узнаёт слово в вариантах ответа — так слова из ошибок ученика попадают в его очередь.

НЕ коммитить выходной JSON (в нём тексты вопросов): называйте файл *-import.json — он в .gitignore.
"""
import json
import re
import sys
import uuid

import lxml.html

sys.stdout.reconfigure(encoding='utf-8')

BLANK = '____'
DECK = 'SAT Words in Context'
PREPOSITIONS = {'to', 'of', 'with', 'in', 'by', 'for', 'from', 'on', 'toward', 'about', 'among', 'over', 'as'}


def forms_of(option):
    """Вариант ответа и он же без артикля и без предлога в конце: «a modest» → modest."""
    words = option.split()
    out = [option]
    if words[0] in ('a', 'an'):
        words = words[1:]
        out.append(' '.join(words))
    if len(words) > 1 and words[-1] in PREPOSITIONS:
        out.append(' '.join(words[:-1]))
    return list(dict.fromkeys(f for f in out if f))


def text_of(html):
    if not html or not html.strip():
        return ''
    text = lxml.html.fromstring(f'<div>{html}</div>').text_content()
    return re.sub(r'\s+', ' ', text).strip()


def main(src_path, out_path):
    data = json.load(open(src_path, encoding='utf-8'))
    sets = [s for s in data.get('questionSets', []) if 'words-in-context' in s.get('skills', [])]

    words = {}  # ключ — слово в нижнем регистре
    order = []
    used = skipped = 0

    def entry(word):
        key = word.lower()
        if key not in words:
            words[key] = {'word': key, 'contexts': [], 'seen': 0}
            order.append(key)
        words[key]['seen'] += 1
        return words[key]

    for s in sets:
        for q, answer in zip(s['questions'], s['answers']):
            # в HTML после черты стоит скрытое слово «blank» для экранных читалок
            stimulus = re.sub(r'_{3,}(?:\s*blank\b)?', BLANK, text_of(q.get('stimulus', '')))
            choices = {c['letter']: text_of(c['html']) for c in q.get('choices', [])}
            right = choices.get(answer, '')
            # только одиночные слова и короткие словосочетания
            if stimulus.count(BLANK) != 1 or not right or any(len(c.split()) > 3 or not c for c in choices.values()):
                skipped += 1
                continue
            used += 1
            wrong = [c for letter, c in choices.items() if letter != answer]
            entry(right)['contexts'].append({'text': stimulus, 'answer': right, 'distractors': wrong})
            for c in wrong:
                entry(c)

    # сначала слова с контекстами, внутри — чаще встречающиеся
    ranked = sorted(order, key=lambda k: (not words[k]['contexts'], -words[k]['seen'], k))
    vocab = [{
        'id': str(uuid.uuid5(uuid.NAMESPACE_URL, f'vocab:{k}')),
        'word': words[k]['word'],
        'pos': '',
        'definition': '',
        'translation': '',
        'connotation': '',
        'contexts': words[k]['contexts'],
        'confusables': [],
        'deck': DECK,
        'rank': i + 1,
        'forms': forms_of(k),
    } for i, k in enumerate(ranked)]

    out = {'version': 1, 'students': [], 'lessons': [], 'scores': [], 'materials': [], 'vocabWords': vocab}
    json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    with_ctx = sum(1 for w in vocab if w['contexts'])
    print(f'сетов Words in Context: {len(sets)}; вопросов использовано: {used}, пропущено: {skipped}')
    print(f'слов: {len(vocab)} (с контекстом: {with_ctx}, только как вариант: {len(vocab) - with_ctx})')
    print('Заполните definition / translation перед импортом — слова без definition пропускаются.')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
