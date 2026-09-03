from PIL import Image
from collections import Counter

img = Image.open('public/favicon.png').convert('RGB')
colors = img.getdata()
c = Counter(colors)
print(c.most_common(10))
