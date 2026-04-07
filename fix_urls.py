import os
import glob

def fix_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        if 'https://os.oazyse.ooo' in content:
            content = content.replace('https://os.oazyse.ooo', 'https://os.oazyse.ooo')
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Fixed {filepath}")
    except Exception as e:
        pass

for root, _, files in os.walk('.'):
    if '.git' in root or 'node_modules' in root or '.claude' in root:
        continue
    for file in files:
        fix_file(os.path.join(root, file))
