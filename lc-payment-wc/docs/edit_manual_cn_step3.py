import docx
from docx.text.paragraph import Paragraph

PATH = "LC-Payment-WC-User-Manual-cn.docx"
d = docx.Document(PATH)
body = d.element.body
children = list(body)

start_idx = None
end_idx = None
for i, child in enumerate(children):
    tag = child.tag.split('}')[-1]
    if tag == 'p':
        p = Paragraph(child, d)
        if p.text.startswith('6.7 chargeBridge'):
            start_idx = i
        elif start_idx is not None and end_idx is None and p.text.startswith('范例：Suspense Credit 为 USD 100'):
            end_idx = i

assert start_idx is not None, "6.7 heading not found"
assert end_idx is not None, "6.7 closing paragraph not found"
print("Removing body indices", start_idx, "through", end_idx, "inclusive")

for el in children[start_idx:end_idx + 1]:
    el.getparent().remove(el)

print("Step 3 (remove old 6.7) done")
d.save(PATH)
