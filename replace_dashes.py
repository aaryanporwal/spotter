import os

em_dash = ' - '
en_dash = '-'

def replace_in_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except (UnicodeDecodeError, IsADirectoryError):
        return False
        
    if em_dash in content or en_dash in content:
        # Replace em dash with " - " (space hyphen space) if it connects words, but usually it's " - " or just "-"
        # A simple replacement: em dash -> " - ", en dash -> "-"
        # Let's see context. If it's "Milemark - HOS", " - " is good. 
        # For en-dash, e.g. "1990-2000", "-" is good.
        
        # Replace em dash surrounded by spaces with " - "
        content = content.replace(' ' + em_dash + ' ', ' - ')
        # Replace other em dashes with " - "
        content = content.replace(em_dash, ' - ')
        
        # Replace en dash surrounded by spaces with " - "
        content = content.replace(' ' + en_dash + ' ', ' - ')
        # Replace other en dashes with "-"
        content = content.replace(en_dash, '-')
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def walk_dir(directory):
    for root, dirs, files in os.walk(directory):
        if '.git' in root or 'node_modules' in root or '.venv' in root or '.ruff_cache' in root or 'dist' in root:
            continue
        for file in files:
            # Skip common binary/image extensions
            if file.endswith(('.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.pyc')):
                continue
            filepath = os.path.join(root, file)
            if replace_in_file(filepath):
                print(f"Replaced in {filepath}")

if __name__ == '__main__':
    walk_dir('.')
