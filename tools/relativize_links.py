#!/usr/bin/env python3
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

pattern = re.compile(r'(?P<attr>\b(?:href|src)\b)\s*=\s*"(?P<path>/[^"]+)"')

def make_relative(file_path, match):
    attr = match.group('attr')
    path = match.group('path')
    target_abs = os.path.normpath(os.path.join(ROOT, path.lstrip('/')))
    src_dir = os.path.dirname(os.path.abspath(file_path))
    try:
        rel = os.path.relpath(target_abs, src_dir).replace('\\', '/')
    except Exception:
        rel = path.lstrip('/')
    return f'{attr}="{rel}"'

def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    new_text, count = pattern.subn(lambda m: make_relative(path, m), text)
    if count and new_text != text:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_text)
        return count
    return 0

def main():
    total = 0
    changed_files = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        # skip .git and node_modules if present
        if '.git' in dirpath.split(os.sep) or 'node_modules' in dirpath.split(os.sep):
            continue
        for fn in filenames:
            if fn.lower().endswith('.html'):
                path = os.path.join(dirpath, fn)
                c = process_file(path)
                if c:
                    changed_files += 1
                    total += c
                    print(f'Updated {path} ({c} replacements)')
    print(f'Done. Files changed: {changed_files}, total replacements: {total}')

if __name__ == '__main__':
    main()
