import io
import math

import cv2
import numpy as np
import pandas as pd
import streamlit as st
from PIL import Image, ImageDraw

try:
    import fitz  # PyMuPDF
except Exception:
    fitz = None

st.set_page_config(page_title="土木図面 数量拾いAI", page_icon="🚧", layout="wide", initial_sidebar_state="collapsed")

st.markdown("""
<style>
.block-container {padding-top: 1rem; padding-bottom: 2rem; max-width: 1200px;}
[data-testid="stMetric"] {background:#f6f7f9; border:1px solid #e7e9ee; padding:10px; border-radius:12px;}
.stButton button, .stDownloadButton button {width:100%; min-height:46px; border-radius:12px;}
[data-testid="stFileUploader"] {border:1px dashed #b9bec8; padding:8px; border-radius:14px;}
@media (max-width: 700px) {
  .block-container {padding-left:.7rem; padding-right:.7rem;}
  h1 {font-size:1.55rem !important;}
  h2, h3 {font-size:1.15rem !important;}
  [data-testid="column"] {min-width:100% !important; width:100% !important; flex:1 1 100% !important;}
}
</style>
""", unsafe_allow_html=True)

st.title("🚧 土木図面 数量拾いAI")
st.caption("平面図・施工図から延長／面積を拾い、厚さ・深さを使って土工・舗装・コンクリート数量まで計算するMVP")


def make_demo_image():
    img = Image.new("RGB", (1200, 800), "white")
    d = ImageDraw.Draw(img)
    d.rectangle((90, 100, 1110, 700), outline="black", width=4)
    d.line((150, 400, 1050, 400), fill="black", width=10)
    d.line((300, 180, 300, 620), fill="black", width=5)
    d.line((900, 180, 900, 620), fill="black", width=5)
    d.rectangle((380, 250, 820, 550), outline="black", width=5)
    d.text((470, 365), "CIVIL PLAN", fill="black")
    return np.array(img)


def load_image(file, pdf_dpi):
    raw = file.read()
    name = file.name.lower()
    if name.endswith(".pdf"):
        if fitz is None:
            raise RuntimeError("PDF読込に必要なPyMuPDFがありません")
        doc = fitz.open(stream=raw, filetype="pdf")
        page = doc.load_page(0)
        zoom = pdf_dpi / 72.0
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4:
            arr = cv2.cvtColor(arr, cv2.COLOR_RGBA2RGB)
        return arr, float(pdf_dpi), "PDF 1ページ目"
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    dpi = img.info.get("dpi", (96, 96))[0] if hasattr(img, "info") else 96
    if not dpi or dpi < 20:
        dpi = 96
    return np.array(img), float(dpi), "画像"


def preprocess(rgb):
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    bw = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                               cv2.THRESH_BINARY_INV, 31, 11)
    bw = cv2.morphologyEx(bw, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8), iterations=1)
    return bw


def px_to_m(px, dpi, scale):
    return (px / dpi) * 0.0254 * scale


def detect_lines(rgb, bw, dpi, scale, min_line_px):
    edges = cv2.Canny(bw, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=70,
                            minLineLength=min_line_px, maxLineGap=14)
    vis = rgb.copy()
    rows, total = [], 0.0
    if lines is not None:
        for i, l in enumerate(lines[:, 0]):
            x1, y1, x2, y2 = map(int, l)
            length_px = math.hypot(x2-x1, y2-y1)
            length_m = px_to_m(length_px, dpi, scale)
            total += length_m
            angle = math.degrees(math.atan2(y2-y1, x2-x1))
            rows.append({"No.": i+1, "延長(m)": round(length_m, 3), "角度(°)": round(angle, 1)})
            cv2.line(vis, (x1, y1), (x2, y2), (230, 70, 40), 3)
    return vis, pd.DataFrame(rows), total


def detect_areas(rgb, bw, dpi, scale, min_area_px):
    closed = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (5,5)), iterations=2)
    inv = cv2.bitwise_not(closed)
    contours, _ = cv2.findContours(inv, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    vis = rgb.copy()
    rows = []
    h, w = bw.shape
    image_area = h * w
    idx = 1
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area_px or area > image_area * 0.45:
            continue
        x, y, cw, ch = cv2.boundingRect(c)
        if x <= 2 or y <= 2 or x+cw >= w-2 or y+ch >= h-2:
            continue
        area_m2 = (px_to_m(1, dpi, scale) ** 2) * area
        peri_m = px_to_m(cv2.arcLength(c, True), dpi, scale)
        rows.append({"No.": idx, "面積(m²)": round(area_m2, 2), "周長(m)": round(peri_m, 2)})
        cv2.drawContours(vis, [c], -1, (30, 160, 95), 3)
        cv2.putText(vis, str(idx), (x+6, y+22), cv2.FONT_HERSHEY_SIMPLEX, .7, (30, 120, 70), 2)
        idx += 1
    return vis, pd.DataFrame(rows)


def metric_row(total_len, total_area, excavation, fill):
    cols = st.columns(4)
    cols[0].metric("延長", f"{total_len:.1f} m")
    cols[1].metric("施工面積", f"{total_area:.1f} m²")
    cols[2].metric("掘削", f"{excavation:.1f} m³")
    cols[3].metric("盛土", f"{fill:.1f} m³")


with st.expander("⚙️ 図面・検出設定", expanded=False):
    c1, c2 = st.columns(2)
    with c1:
        scale = st.number_input("図面縮尺 1 :", min_value=1, max_value=5000, value=100, step=10)
        pdf_dpi = st.select_slider("PDF読込DPI", options=[120, 150, 200, 250, 300], value=200)
    with c2:
        min_line_px = st.slider("最小検出線長(px)", 20, 300, 80, 10)
        min_area_px = st.slider("最小検出面積(px²)", 500, 50000, 4000, 500)
    st.caption("PDFはDPI＋縮尺で実寸換算します。画像写真は撮影条件によって誤差が出ます。")

uploaded = st.file_uploader("📎 図面を挿入（PDF / PNG / JPG）", type=["pdf", "png", "jpg", "jpeg", "webp"])
use_demo = st.toggle("サンプル図面でスマホ表示を試す", value=uploaded is None)

if uploaded or use_demo:
    try:
        if uploaded:
            rgb, dpi, source_type = load_image(uploaded, pdf_dpi)
        else:
            rgb, dpi, source_type = make_demo_image(), 200.0, "内蔵サンプル"

        bw = preprocess(rgb)
        line_vis, line_df, total_len = detect_lines(rgb, bw, dpi, scale, min_line_px)
        area_vis, area_df = detect_areas(rgb, bw, dpi, scale, min_area_px)
        total_area = float(area_df["面積(m²)"].sum()) if not area_df.empty else 0.0

        st.success(f"解析準備OK：{source_type}")

        tab_preview, tab_auto, tab_civil, tab_table = st.tabs(["👀 図面", "✨ 自動拾い", "🧮 土木数量", "📋 数量表"])

        with tab_preview:
            st.image(rgb, caption="挿入図面", use_container_width=True)
            st.caption("スマホではピンチ操作で図面を拡大して確認できます。")

        with tab_auto:
            view = st.radio("検出表示", ["延長", "面積"], horizontal=True)
            if view == "延長":
                st.image(line_vis, caption="赤：検出した線分候補", use_container_width=True)
                st.metric("線分候補の合計", f"{total_len:.2f} m")
                st.dataframe(line_df, use_container_width=True, hide_index=True)
            else:
                st.image(area_vis, caption="緑：閉領域候補", use_container_width=True)
                st.metric("閉領域候補の合計", f"{total_area:.2f} m²")
                st.dataframe(area_df, use_container_width=True, hide_index=True)

        with tab_civil:
            st.subheader("土工・舗装数量")
            st.caption("自動拾いした面積を基準に、施工条件を入力して数量化します。")
            base_area = st.number_input("数量計算に使う面積 (m²)", min_value=0.0, value=round(total_area, 2), step=1.0)
            c1, c2 = st.columns(2)
            with c1:
                excavation_depth = st.number_input("平均掘削深さ (m)", min_value=0.0, value=0.50, step=0.05)
                fill_depth = st.number_input("平均盛土厚 (m)", min_value=0.0, value=0.20, step=0.05)
                pavement_thickness = st.number_input("舗装厚 (m)", min_value=0.0, value=0.05, step=0.01, format="%.2f")
            with c2:
                subbase_thickness = st.number_input("路盤厚 (m)", min_value=0.0, value=0.15, step=0.05)
                concrete_thickness = st.number_input("コンクリート厚 (m)", min_value=0.0, value=0.10, step=0.05)
                loss_rate = st.number_input("割増・ロス率 (%)", min_value=0.0, max_value=50.0, value=0.0, step=1.0)

            f = 1 + loss_rate / 100.0
            excavation = base_area * excavation_depth * f
            fill = base_area * fill_depth * f
            pavement = base_area * pavement_thickness * f
            subbase = base_area * subbase_thickness * f
            concrete = base_area * concrete_thickness * f
            metric_row(total_len, base_area, excavation, fill)

            civil_df = pd.DataFrame([
                {"工種":"測点・中心線等（検出線合計）", "数量":round(total_len, 2), "単位":"m"},
                {"工種":"施工対象面積", "数量":round(base_area, 2), "単位":"m²"},
                {"工種":"掘削", "数量":round(excavation, 2), "単位":"m³"},
                {"工種":"盛土", "数量":round(fill, 2), "単位":"m³"},
                {"工種":"舗装材", "数量":round(pavement, 2), "単位":"m³"},
                {"工種":"路盤材", "数量":round(subbase, 2), "単位":"m³"},
                {"工種":"コンクリート", "数量":round(concrete, 2), "単位":"m³"},
            ])
            st.dataframe(civil_df, use_container_width=True, hide_index=True)

        with tab_table:
            if 'civil_df' not in locals():
                civil_df = pd.DataFrame([
                    {"工種":"検出線合計", "数量":round(total_len,2), "単位":"m"},
                    {"工種":"閉領域面積合計", "数量":round(total_area,2), "単位":"m²"},
                ])
            st.dataframe(civil_df, use_container_width=True, hide_index=True)
            csv = civil_df.to_csv(index=False).encode("utf-8-sig")
            st.download_button("⬇️ 数量表CSVをダウンロード", csv, "civil_quantity.csv", "text/csv")

        st.info("MVPでは線・閉領域を画像処理で候補抽出します。実務版では、道路中心線・側溝・擁壁・集水桝・マンホール・法面・区画線などをAIで工種別に識別する機能を追加できます。")

    except Exception as e:
        st.error(f"処理に失敗しました: {e}")
else:
    st.info("図面をアップロードするか、サンプル図面をONにしてください。")
