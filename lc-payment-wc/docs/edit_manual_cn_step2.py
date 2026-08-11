import copy
import docx
from docx.text.paragraph import Paragraph
from docx.table import Table

PATH = "LC-Payment-WC-User-Manual-cn.docx"
d = docx.Document(PATH)
body = d.element.body
children = list(body)

p116 = Paragraph(children[116], d)
assert p116.text == '6.3 使用模拟器', p116.text
p122 = Paragraph(children[122], d)
assert 'N/A 案例会呈现为' in p122.text, p122.text
p123 = Paragraph(children[123], d)
assert p123.text == '6.4 与微服务通信', p123.text

tmpl_h3 = children[74]        # 'Heading 3' style
tmpl_normal = children[109]   # 'normal' style, single run
tmpl_bullet = children[117]   # ListParagraph style, single run, numId=2 bullet

def make(tmpl, text):
    el = copy.deepcopy(tmpl)
    p = Paragraph(el, d)
    for extra in p.runs[1:]:
        extra._element.getparent().remove(extra._element)
    p.runs[0].text = text
    return el

NEW_SECTION = [
    (tmpl_h3, '6.3.1 编辑借/贷分录 —— 金额瀑布式重新分配规则（v1.12.3）'),
    (tmpl_normal,
        "每一笔 leg-allocator 分录都可以用三种方式固定为精确数值 —— 其 % 占比、其 Amount (Tx Ccy)，"
        "或者当该笔分录自身币别与交易币别不同时，其 Account Ccy Equiv.（以该笔分录自身币别表示）。"
        "编辑 % 只会把剩余额度重新分配到自动计算的余额分录（100% 减去其他每一笔的占比）。编辑 "
        "Amount (Tx Ccy) 或 Account Ccy Equiv. 则会触发一套“瀑布式”重新平衡机制，确保该侧所有分录"
        "的加总永远精确等于总额，规则如下："),
    (tmpl_bullet,
        "对任何非最后一笔的分录：增加金额会让最后一笔分录等额减少（上限为最后一笔目前持有的金额）；"
        "减少金额则会让最后一笔分录增加等额的释出金额。任何非最后一笔的编辑一律直接对最后一笔生效 —— "
        "绝不会影响紧邻的下一笔或上一笔。"),
    (tmpl_bullet,
        "对最后一笔分录本身，减少金额会开出一笔全新的分录承接释出的差额，该新分录的 Account No. 会"
        "自动带入该账户类型自身的预设值（例如 CUSTOMER 对应 CUST-ACC），而不是留空。"),
    (tmpl_bullet,
        "对最后一笔分录本身，增加金额会依序向前面的分录取用金额，若单一分录不足以补足差额，会继续往"
        "更前面的分录取用，每笔分录最多取到 0（绝不会变成负数）。"),
    (tmpl_bullet,
        "Amount (Tx Ccy) 与 Account Ccy Equiv. 是同一个底层数值的两种输入方式，因此不论从哪一个栏位"
        "编辑，都会套用上述同一套规则。"),
    (tmpl_normal,
        "Account Ccy Equiv. 现在会精确来回一致：直接在该栏位输入的金额（例如汇率 149.0825 下输入 "
        "JPY 20000）会原样被记住，重新显示时也会维持不变，而不是每次都从四舍五入后的 Amount (Tx "
        "Ccy) 数值重新反推。先前的做法在两种币别的小数位精度无法整除时，可能会悄悄产生一个最小货币"
        "单位的落差 —— 例如 JPY 20000 重新显示后变成 19999；直接编辑 Amount (Tx Ccy) 则不受此影响。"),
    (tmpl_normal,
        "一次失败的 Confirm 操作所显示的错误讯息（例如缺少 Account No.）现在会在表单被修正、且下一次"
        "即时预览重新计算完成后自动清除 —— 不再需要再按一次 Confirm 才能让不再适用的旧错误讯息消失。"),
]

anchor = children[123]
for tmpl, text in NEW_SECTION:
    anchor.addprevious(make(tmpl, text))

print("Step 2 (insert 6.3.1) done")
d.save(PATH)
