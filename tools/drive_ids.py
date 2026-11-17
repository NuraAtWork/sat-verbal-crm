"""Находит Google Drive ID HTML-сетов в папке «SAT Questions» через локальную базу Drive for Desktop.

Запуск (Windows, Drive for Desktop должен быть установлен и синхронизирован):
    python tools/drive_ids.py <путь к копии metadata_sqlite_db> <выходной sets.json> [имя корневой папки]

Базу лучше скопировать перед чтением (она может быть занята):
    %LOCALAPPDATA%\\Google\\DriveFS\\<account_id>\\metadata_sqlite_db  (+ файл -wal рядом)

Результат: [{folder, file, id, mime}] для файлов *_Set_NN.html в подпапках категорий (папки _old пропускаются).
"""
import json
import sqlite3
import sys

db_path, out_path = sys.argv[1], sys.argv[2]
root_title = sys.argv[3] if len(sys.argv) > 3 else 'SAT Questions'

c = sqlite3.connect(db_path)


def children(stable_id):
    return c.execute(
        'select i.stable_id, i.id, i.local_title, i.is_folder, i.trashed, i.mime_type '
        'from stable_parents p join items i on i.stable_id = p.item_stable_id '
        'where p.parent_stable_id = ?',
        (stable_id,),
    ).fetchall()


roots = c.execute(
    'select stable_id from items where is_folder = 1 and trashed = 0 and local_title = ?', (root_title,)
).fetchall()

out = []
for (root_id,) in roots:
    for sid, _, folder, is_folder, trashed, _ in children(root_id):
        if not is_folder or trashed or folder.startswith('_'):
            continue
        for _, file_id, title, f_is_folder, f_trashed, mime in children(sid):
            if f_is_folder or f_trashed or not title.endswith('.html'):
                continue
            out.append({'folder': folder, 'file': title, 'id': file_id, 'mime': mime})

json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{len(out)} files')
