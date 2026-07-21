from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(
    "/workspace/scratch/86def5f1a956/audit_sources/Looper_Visual_Asset_Bible_MVP_v1.0.pdf"
)
TMP = ROOT / "tmp/pdfs/Looper_Visual_Asset_Bible_UI_Appendix_v0.17.0.pdf"
OUTPUT = ROOT / "output/pdf/Looper_Visual_Asset_Bible_MVP_v1.0_UI_Central_v0.17.0.pdf"

GREEN_DARK = colors.HexColor("#294633")
GREEN = colors.HexColor("#4D724E")
GREEN_PALE = colors.HexColor("#EEF3E8")
CREAM = colors.HexColor("#FFF8E8")
AMBER = colors.HexColor("#E6B85C")
INK = colors.HexColor("#2B2A27")
MUTED = colors.HexColor("#5F655E")
LINE = colors.HexColor("#BCC7BA")

FONT_ROOT = Path("/workspace/scratch/7afba08e639d/.local/share/fonts")
pdfmetrics.registerFont(TTFont("NotoTC", FONT_ROOT / "NotoSansTC_400Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoTC-SemiBold", FONT_ROOT / "NotoSansTC_600SemiBold.ttf"))

styles = getSampleStyleSheet()
title_style = ParagraphStyle(
    "TitleTC",
    parent=styles["Title"],
    fontName="NotoTC-SemiBold",
    fontSize=22,
    leading=28,
    textColor=GREEN_DARK,
    alignment=TA_LEFT,
    spaceAfter=10,
    wordWrap="CJK",
)
body_style = ParagraphStyle(
    "BodyTC",
    parent=styles["BodyText"],
    fontName="NotoTC",
    fontSize=9.5,
    leading=15,
    textColor=INK,
    wordWrap="CJK",
)
small_style = ParagraphStyle(
    "SmallTC",
    parent=body_style,
    fontSize=8,
    leading=11,
    textColor=MUTED,
)
table_header_style = ParagraphStyle(
    "TableHeaderTC",
    parent=small_style,
    fontName="NotoTC-SemiBold",
    textColor=colors.white,
)
callout_label_style = ParagraphStyle(
    "CalloutLabelTC",
    parent=small_style,
    fontName="NotoTC-SemiBold",
    textColor=GREEN_DARK,
)
section_style = ParagraphStyle(
    "SectionTC",
    parent=body_style,
    fontSize=12,
    leading=16,
    textColor=GREEN_DARK,
    spaceBefore=6,
    spaceAfter=5,
    fontName="NotoTC-SemiBold",
)
number_style = ParagraphStyle(
    "NumberTC",
    parent=body_style,
    fontSize=20,
    leading=22,
    textColor=GREEN_DARK,
    fontName="NotoTC-SemiBold",
)


def p(text: str, style=body_style):
    return Paragraph(text, style)


def draw_page(canvas, document):
    width, height = A4
    canvas.saveState()
    canvas.setFont("NotoTC-SemiBold", 7.5)
    canvas.setFillColor(GREEN)
    canvas.drawRightString(width - 23 * mm, height - 15 * mm, "LOOPER · VISUAL ASSET BIBLE · MVP v1.0")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(23 * mm, 17 * mm, width - 23 * mm, 17 * mm)
    canvas.setFont("NotoTC", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(23 * mm, 11 * mm, "Looper X Codex｜UI 中央整合 2026-07-18")
    canvas.drawRightString(width - 23 * mm, 11 * mm, str(19 + document.page))
    canvas.restoreState()


def build_appendix():
    TMP.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(TMP),
        pagesize=A4,
        rightMargin=23 * mm,
        leftMargin=23 * mm,
        topMargin=25 * mm,
        bottomMargin=23 * mm,
    )
    story = [
        p("16. UI 中央整合｜v0.17.0", title_style),
        p(
            "本節記錄 Looper UI Asset Workstream B 併入中央資產基線的正式結果。"
            "UI 素材以 asset_id 原位更新，不新增第二套計數；物品、角色、資源與場景主線資料保持不變。"
        ),
        Spacer(1, 5 * mm),
    ]

    cards = Table(
        [
            [p("69", number_style), p("274", number_style), p("116 / 5 / 94", number_style)],
            [p("Approved UI 家族", small_style), p("UI 狀態", small_style), p("中央 Approved / Concept / Not started", small_style)],
        ],
        colWidths=[49 * mm, 49 * mm, 51 * mm],
        rowHeights=[13 * mm, 10 * mm],
    )
    cards.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), GREEN_PALE),
                ("BOX", (0, 0), (-1, -1), 0.7, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.white),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.extend([cards, Spacer(1, 6 * mm), p("16.1 中央寫入結果", section_style)])

    merge_rows = [
        [p("載體", table_header_style), p("結果", table_header_style), p("保護條件", table_header_style)],
        [p("中央 Manifest"), p("69 筆 UI 記錄依 asset_id 更新為 Approved；總家族維持 215。"), p("未 append 重複 ID；非 UI 記錄逐筆相等。")],
        [p("中央素材台帳"), p("固定 Google Sheet 已同步 69 家族、274 狀態、路徑、版本、雜湊與 QA。"), p("保留公式、格式與物品主線列。")],
        [p("Visual Asset Bible / Notion"), p("中央統計更新為 116 Approved、5 Concept、94 Not started。"), p("UI runtime 與實機 QA 維持 Not tested。")],
        [p("UI 支線"), p("fragment 重建為 v0.17.0，完整包含 69 家族與 274 狀態。"), p("Batch 範圍 B01-B19；不存在 Batch 20。")],
    ]
    merge_table = Table(merge_rows, colWidths=[35 * mm, 72 * mm, 42 * mm], repeatRows=1)
    merge_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), GREEN_DARK),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#F4F6F1")),
                ("BACKGROUND", (0, 4), (-1, 4), colors.HexColor("#F4F6F1")),
                ("BOX", (0, 0), (-1, -1), 0.7, GREEN_DARK),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.extend([merge_table, Spacer(1, 5 * mm)])

    guardrail = Table(
        [[p("計數與主線保護", section_style), p("274 個狀態不列為 274 個 asset family；13 個 ui_knowledge_* 每日知識素材仍歸知識內容主線；item_*、resource_*、character_*、scene_* 與 5 個既有 Concept 記錄不因 UI 合併而改寫。")]],
        colWidths=[42 * mm, 107 * mm],
    )
    guardrail.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), CREAM),
                ("LINEBEFORE", (0, 0), (0, -1), 7, AMBER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.extend([guardrail, Spacer(1, 5 * mm), p("16.2 玩家介面與 QA 閘門", section_style)])

    qa_rows = [
        [p("檢查", table_header_style), p("狀態", table_header_style), p("說明", table_header_style)],
        [p("69 master / 274 state 靜態完整性"), p("Pass"), p("SHA-256 零差異；SVG 無烘焙文字元素。")],
        [p("Next production build / TypeScript / API regression"), p("Pass"), p("9 packages typecheck；9 項 API 測試通過。")],
        [p("iOS / Android runtime"), p("Not tested"), p("需 simulator、實機或 device farm。")],
        [p("Dynamic Type / VoiceOver / TalkBack / Reduce Motion"), p("Not tested"), p("程式已具語意與響應式基線；不得以靜態檢查取代裝置驗證。")],
    ]
    qa_table = Table(qa_rows, colWidths=[61 * mm, 25 * mm, 63 * mm], repeatRows=1)
    qa_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), GREEN_DARK),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#F4F6F1")),
                ("BACKGROUND", (0, 4), (-1, 4), colors.HexColor("#F4F6F1")),
                ("BOX", (0, 0), (-1, -1), 0.7, GREEN_DARK),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TEXTCOLOR", (1, 1), (1, 2), GREEN),
                ("TEXTCOLOR", (1, 3), (1, 4), colors.HexColor("#9B5C18")),
            ]
        )
    )
    next_gate = Table(
        [[p("下一步", callout_label_style), p("以可存取 preview 或 device farm 完成 iOS / Android 尺寸、最大字級、VoiceOver、TalkBack、Reduce Motion 與 pending / settled 流程；完成前中央 QA 維持 Not tested。", small_style)]],
        colWidths=[25 * mm, 124 * mm],
    )
    next_gate.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), CREAM),
                ("LINEBEFORE", (0, 0), (0, -1), 5, AMBER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.extend([qa_table, Spacer(1, 3 * mm), next_gate])
    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)


def append_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    writer = PdfWriter()
    for page in PdfReader(SOURCE).pages:
        writer.add_page(page)
    for page in PdfReader(TMP).pages:
        writer.add_page(page)
    writer.add_metadata(
        {
            "/Title": "Looper Visual Asset Bible MVP v1.0 - UI Central Integration v0.17.0",
            "/Author": "Looper X Codex",
            "/Subject": "UI Workstream B central integration record",
        }
    )
    with OUTPUT.open("wb") as handle:
        writer.write(handle)


if __name__ == "__main__":
    build_appendix()
    append_pdf()
    print(OUTPUT)
