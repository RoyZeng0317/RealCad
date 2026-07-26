# 這裡要的是把 KiCad 的檔案轉換成 RealCad 可以用的檔案
# 包含所有的 .kicad_sch .kicad_pcb .kicad_sym 等都適用
#
# 目前完成 .kicad_sym（符號庫）跟 .kicad_sch（電路圖）這兩種。
# .kicad_pcb 之後再做——RealCad 目前還沒有 PCB 的資料格式。
#
# RealCad 符號庫是 sch/home_screen.py 裡 open_library() 讀的那種 .RealCad_lib
# (JSON 檔),這裡把它擴充成真的裝得下符號資料,原本的 "name" 欄位保留相容:
#   {
#     "name": "<函式庫名稱>",
#     "format": "RealCad-Symbol-Library",
#     "version": 1,
#     "source": "kicad_sym",
#     "symbols": [
#       {
#         "name": "R",
#         "properties": {"Reference": "R", "Value": "R", ...},
#         "pins": [{"number": "1", "name": "~", "x": 0, "y": 3.81, "rotation": 270,
#                    "length": 1.27, "electrical_type": "passive", "shape": "line"}, ...],
#         "graphics": [{"type": "rectangle", "start": [-1.016, -2.54], "end": [1.016, 2.54]}, ...]
#       }, ...
#     ]
#   }
#
# .kicad_sch -> RealCad 電路圖,輸出 sch/sch_editor.py 存的 .RealCad_sch:
#   { "name", "format": "RealCad-Schematic", "version": 1, "source": "kicad_sch",
#     "components": [{"id","symbol":{同上符號格式},"x","y","ref"}, ...],
#     "wires": [{"from":[comp_id,pin_no], "to":[comp_id,pin_no]}, ...] }
#
# KiCad 電路圖的接線是「座標重合」判斷連接(wire 端點座標 == pin 的絕對座標),
# 不是像 RealCad 這樣直接用 (元件,pin) 配對,所以要:
#   1. 從 lib_symbols 取出每個符號定義(pin 的區域座標)
#   2. 每個放置的 symbol instance 有自己的 (at x y rotation),把 pin 區域座標轉成絕對座標
#   3. 用 union-find 把所有 wire 端點 + pin 絕對座標(座標相同視為同一點)分組成網路(net)
#   4. 同一個 net 裡的 pin,兩兩之間補一條 RealCad 的 wire
#
# 已知限制: 旋轉角度只保證 0°/180° 一定正確(這兩個沒有方向性模糊的問題);
# 90°/270° 用標準旋轉矩陣處理,但因為沒有真正的 KiCad 環境可以比對驗證,
# 有旋轉的元件建議轉換後自行檢查接線是否正確。鏡像(mirror)目前未處理。
#
# .kicad_pro -> RealCad 專案。注意 .kicad_pro 本身就是「純 JSON」,
# 不是前面幾種的 S-expression 語法,所以直接 json.load 讀,不用經過 parse_sexp。
# 輸出沿用 home_screen.py 的 .RealCad_pro 專案格式({"name","version"}),
# 並把整份原始 KiCad 專案 JSON 原封不動存進 "kicad_project" 欄位——
# RealCad 目前沒有設計規則/網路類別/板層這些概念,先不逐項轉換,保留原始資料
# 以免遺失資訊,以後 RealCad 有對應功能時可以回頭從這裡取用。

import json
import math
import os
import sys

LIBRARY_EXT = ".RealCad_lib"
SCH_EXT = ".RealCad_sch"
PROJECT_EXT = ".KiCad_pro"
REALCAD_PROJECT_EXT = ".RealCad_pro"

# ---------- S-expression 解析(KiCad 檔案都是這種括號式語法) ----------

def tokenize(text):
    tokens = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c.isspace():
            i += 1
        elif c in "()":
            tokens.append(c)
            i += 1
        elif c == '"':
            j = i + 1
            buf = []
            while j < n and text[j] != '"':
                if text[j] == "\\" and j + 1 < n:
                    buf.append(text[j + 1])
                    j += 2
                else:
                    buf.append(text[j])
                    j += 1
            tokens.append(("str", "".join(buf)))
            i = j + 1
        else:
            j = i
            while j < n and not text[j].isspace() and text[j] not in "()":
                j += 1
            tokens.append(("atom", text[i:j]))
            i = j
    return tokens


def parse_tokens(tokens):
    pos = 0

    def parse_expr():
        nonlocal pos
        tok = tokens[pos]
        if tok == "(":
            pos += 1
            items = []
            while tokens[pos] != ")":
                items.append(parse_expr())
            pos += 1
            return items
        pos += 1
        kind, value = tok
        return value

    exprs = []
    while pos < len(tokens):
        exprs.append(parse_expr())
    return exprs


def parse_sexp(text):
    return parse_tokens(tokenize(text))


# ---------- 從解析好的樹狀結構取資料的小工具 ----------

def sexp_tag(node):
    return node[0] if isinstance(node, list) and node else None


def direct_children(node, tag):
    return [child for child in node if isinstance(child, list) and sexp_tag(child) == tag]


def first_child(node, tag):
    for child in node:
        if isinstance(child, list) and sexp_tag(child) == tag:
            return child
    return None


def to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


# ---------- .kicad_sym -> RealCad 符號資料 ----------

def extract_properties(sym_node):
    properties = {}
    for prop in direct_children(sym_node, "property"):
        if len(prop) >= 3:
            properties[prop[1]] = prop[2]
    return properties


def extract_pins(sym_node):
    pins = []
    candidates = direct_children(sym_node, "pin")
    for unit in direct_children(sym_node, "symbol"):
        candidates.extend(direct_children(unit, "pin"))

    for pin in candidates:
        at = first_child(pin, "at")
        length_node = first_child(pin, "length")
        name_node = first_child(pin, "name")
        number_node = first_child(pin, "number")
        x = to_float(at[1]) if at and len(at) > 1 else 0.0
        y = to_float(at[2]) if at and len(at) > 2 else 0.0
        rotation = to_float(at[3]) if at and len(at) > 3 else 0.0
        pins.append(
            {
                "number": number_node[1] if number_node and len(number_node) > 1 else "",
                "name": name_node[1] if name_node and len(name_node) > 1 else "",
                "x": x,
                "y": y,
                "rotation": rotation,
                "length": to_float(length_node[1]) if length_node and len(length_node) > 1 else 0.0,
                "electrical_type": pin[1] if len(pin) > 1 else None,
                "shape": pin[2] if len(pin) > 2 else None,
            }
        )
    return pins


def extract_graphics(sym_node):
    graphics = []
    for unit in direct_children(sym_node, "symbol"):
        for rect in direct_children(unit, "rectangle"):
            start, end = first_child(rect, "start"), first_child(rect, "end")
            if start and end:
                graphics.append(
                    {
                        "type": "rectangle",
                        "start": [to_float(start[1]), to_float(start[2])],
                        "end": [to_float(end[1]), to_float(end[2])],
                    }
                )
        for circle in direct_children(unit, "circle"):
            center, radius = first_child(circle, "center"), first_child(circle, "radius")
            if center and radius:
                graphics.append(
                    {
                        "type": "circle",
                        "center": [to_float(center[1]), to_float(center[2])],
                        "radius": to_float(radius[1]) if len(radius) > 1 else 0.0,
                    }
                )
        for arc in direct_children(unit, "arc"):
            start, mid, end = first_child(arc, "start"), first_child(arc, "mid"), first_child(arc, "end")
            if start and mid and end:
                graphics.append(
                    {
                        "type": "arc",
                        "start": [to_float(start[1]), to_float(start[2])],
                        "mid": [to_float(mid[1]), to_float(mid[2])],
                        "end": [to_float(end[1]), to_float(end[2])],
                    }
                )
        for poly in direct_children(unit, "polyline"):
            pts_node = first_child(poly, "pts")
            if pts_node:
                points = [[to_float(p[1]), to_float(p[2])] for p in direct_children(pts_node, "xy")]
                graphics.append({"type": "polyline", "points": points})
    return graphics


def convert_symbol_library(kicad_sym_path, output_path=None):
    with open(kicad_sym_path, "r", encoding="utf-8") as f:
        text = f.read()

    tree = parse_sexp(text)
    root = tree[0] if tree else []
    if sexp_tag(root) != "kicad_symbol_lib":
        raise ValueError(f"Not a kicad_symbol_lib file: {kicad_sym_path}")

    symbols = [
        {
            "name": sym_node[1],
            "properties": extract_properties(sym_node),
            "pins": extract_pins(sym_node),
            "graphics": extract_graphics(sym_node),
        }
        for sym_node in direct_children(root, "symbol")
    ]

    data = {
        "name": os.path.splitext(os.path.basename(kicad_sym_path))[0],
        "format": "RealCad-Symbol-Library",
        "version": 1,
        "source": "kicad_sym",
        "symbols": symbols,
    }

    if output_path is None:
        output_path = os.path.splitext(kicad_sym_path)[0] + LIBRARY_EXT

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return data, output_path


# ---------- .kicad_sch -> RealCad 電路圖 ----------

def _collect_lib_symbols(root):
    lib_symbols_node = first_child(root, "lib_symbols")
    definitions = {}
    if lib_symbols_node:
        for sym_node in direct_children(lib_symbols_node, "symbol"):
            definitions[sym_node[1]] = {
                "name": sym_node[1],
                "properties": extract_properties(sym_node),
                "pins": extract_pins(sym_node),
                "graphics": extract_graphics(sym_node),
            }
    return definitions


def _placed_symbols(root):
    placed = []
    for sym_node in direct_children(root, "symbol"):
        lib_id_node = first_child(sym_node, "lib_id")
        at_node = first_child(sym_node, "at")
        if not lib_id_node or not at_node:
            continue
        placed.append(
            {
                "lib_id": lib_id_node[1],
                "x": to_float(at_node[1]),
                "y": to_float(at_node[2]),
                "rotation": to_float(at_node[3]) if len(at_node) > 3 else 0.0,
                "properties": extract_properties(sym_node),
            }
        )
    return placed


def _wire_segments(root):
    segments = []
    for wire_node in direct_children(root, "wire"):
        pts_node = first_child(wire_node, "pts")
        if not pts_node:
            continue
        points = [(to_float(p[1]), to_float(p[2])) for p in direct_children(pts_node, "xy")]
        for i in range(len(points) - 1):
            segments.append((points[i], points[i + 1]))
    return segments


def _transform_pin(local_x, local_y, place_x, place_y, rotation_deg):
    # 符號庫座標是 Y-up,先翻成跟工作表一致的 Y-down,再套用放置旋轉角度、平移。
    x, y = local_x, -local_y
    theta = math.radians(rotation_deg)
    cos_t, sin_t = math.cos(theta), math.sin(theta)
    rx = x * cos_t - y * sin_t
    ry = x * sin_t + y * cos_t
    return place_x + rx, place_y + ry


def convert_schematic(kicad_sch_path, output_path=None):
    with open(kicad_sch_path, "r", encoding="utf-8") as f:
        text = f.read()

    tree = parse_sexp(text)
    root = tree[0] if tree else []
    if sexp_tag(root) != "kicad_sch":
        raise ValueError(f"Not a kicad_sch file: {kicad_sch_path}")

    lib_defs = _collect_lib_symbols(root)
    placed = _placed_symbols(root)
    wire_segments = _wire_segments(root)

    def key(point):
        return (round(point[0], 3), round(point[1], 3))

    parent = {}

    def find(node):
        parent.setdefault(node, node)
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for p1, p2 in wire_segments:
        union(key(p1), key(p2))

    components = []
    pin_at_point = {}
    warnings = []

    for i, inst in enumerate(placed):
        comp_id = f"C{i + 1}"
        symbol = lib_defs.get(inst["lib_id"])
        if symbol is None:
            warnings.append(f"Skipped {inst['lib_id']}: symbol definition not found in lib_symbols.")
            continue

        rotation = inst["rotation"]
        if rotation not in (0.0, 90.0, 180.0, 270.0):
            warnings.append(
                f"{inst['lib_id']} at ({inst['x']}, {inst['y']}): "
                f"unsupported rotation {rotation}, treated as 0."
            )
            rotation = 0.0

        merged_properties = {**symbol.get("properties", {}), **inst["properties"]}
        merged_symbol = dict(symbol)
        merged_symbol["properties"] = merged_properties

        components.append(
            {
                "id": comp_id,
                "symbol": merged_symbol,
                "x": 200 + (i % 6) * 150,
                "y": 200 + (i // 6) * 150,
                "ref": merged_properties.get("Reference", "U"),
            }
        )

        for pin in symbol.get("pins", []):
            abs_pos = _transform_pin(pin["x"], pin["y"], inst["x"], inst["y"], rotation)
            pin_at_point.setdefault(key(abs_pos), []).append((comp_id, pin["number"]))

    nets = {}
    for point_key, pins in pin_at_point.items():
        nets.setdefault(find(point_key), []).extend(pins)

    wires = []
    for pins in nets.values():
        for i in range(len(pins) - 1):
            wires.append({"from": list(pins[i]), "to": list(pins[i + 1])})

    data = {
        "name": os.path.splitext(os.path.basename(kicad_sch_path))[0],
        "format": "RealCad-Schematic",
        "version": 1,
        "source": "kicad_sch",
        "components": components,
        "wires": wires,
    }

    if output_path is None:
        output_path = os.path.splitext(kicad_sch_path)[0] + SCH_EXT

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return data, output_path, warnings


# ---------- .kicad_pro -> RealCad 專案 ----------

def convert_project(kicad_pro_path, output_path=None):
    with open(kicad_pro_path, "r", encoding="utf-8") as f:
        kicad_project = json.load(f)

    if not isinstance(kicad_project, dict):
        raise ValueError(f"Not a valid kicad_pro file: {kicad_pro_path}")

    meta_filename = kicad_project.get("meta", {}).get("filename") if isinstance(kicad_project.get("meta"), dict) else None
    name = os.path.splitext(meta_filename)[0] if meta_filename else os.path.splitext(os.path.basename(kicad_pro_path))[0]

    data = {
        "name": name,
        "version": "0.1.0",
        "source": "kicad_pro",
        "kicad_project": kicad_project,
    }

    if output_path is None:
        output_path = os.path.splitext(kicad_pro_path)[0] + REALCAD_PROJECT_EXT

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return data, output_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        # 沒帶命令列參數(例如直接在 IDE 按執行),跳出檔案選擇視窗,而不是印用法說明就結束。
        import tkinter as tk
        from tkinter import filedialog

        _root = tk.Tk()
        _root.withdraw()
        src = filedialog.askopenfilename(
            title="Select a KiCad file to convert",
            filetypes=[
                ("KiCad Files", "*.kicad_sym *.kicad_sch *.kicad_pro"),
                ("KiCad Symbol Library", "*.kicad_sym"),
                ("KiCad Schematic", "*.kicad_sch"),
                ("KiCad Project", "*.kicad_pro"),
                ("All files", "*.*"),
            ],
        )
        _root.destroy()
        if not src:
            print("No file selected.")
            sys.exit(1)
        dst = None
    else:
        src = sys.argv[1]
        dst = sys.argv[2] if len(sys.argv) > 2 else None

    src_lower = src.lower()

    if src_lower.endswith(".kicad_sch"):
        converted, written_to, sch_warnings = convert_schematic(src, dst)
        print(f"Converted {len(converted['components'])} component(s), "
              f"{len(converted['wires'])} wire(s) -> {written_to}")
        for warning in sch_warnings:
            print(f"  WARNING: {warning}")
    elif src_lower.endswith(PROJECT_EXT.lower()):
        converted, written_to = convert_project(src, dst)
        print(f"Converted project \"{converted['name']}\" -> {written_to}")
    else:
        converted, written_to = convert_symbol_library(src, dst)
        print(f"Converted {len(converted['symbols'])} symbol(s) -> {written_to}")
