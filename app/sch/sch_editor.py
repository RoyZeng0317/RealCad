import json
import os
import re
import sys
import tkinter as tk
from tkinter import filedialog, messagebox

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import simulator  # noqa: E402

LIBRARY_EXT = ".RealCad_lib"
SCH_EXT = ".RealCad_sch"

SCALE = 20  # pixels per symbol-unit (mm)

STROKE = "#000000"
WIRE_COLOR = "#0B7A0B"
PIN_DOT_COLOR = "#1E66C8"
PENDING_PIN_COLOR = "#D0021B"

# 每個 pin 的旋轉角度 -> 從 pin 尖端指向零件本體的方向 (畫布座標,Y 向下為正)
PIN_DIRECTIONS = {
    0: (-1, 0),
    90: (0, -1),
    180: (1, 0),
    270: (0, 1),
}


def _pick_symbol(parent, symbols, bg, fg):
    picker = tk.Toplevel(parent)
    picker.title("Choose Symbol")
    picker.configure(bg=bg)
    picker.transient(parent)
    picker.grab_set()

    body = tk.Frame(picker, bg=bg)
    body.pack(fill="both", expand=True, padx=10, pady=10)

    listbox = tk.Listbox(body, bg=bg, fg=fg, selectbackground="#444444", width=24)
    for sym in symbols:
        listbox.insert(tk.END, sym.get("name", "?"))
    listbox.pack(side="left", fill="both", expand=True)
    if symbols:
        listbox.selection_set(0)

    preview_size = 200
    preview_canvas = tk.Canvas(body, bg="#FFFFFF", width=preview_size, height=preview_size)
    preview_canvas.pack(side="left", padx=(10, 0))

    def update_preview(_event=None):
        preview_canvas.delete("all")
        selection = listbox.curselection()
        if not selection:
            return
        sym = symbols[selection[0]]
        min_x, max_x, min_y, max_y = _symbol_bounds(sym)
        width_units = max(max_x - min_x, 1.0)
        height_units = max(max_y - min_y, 1.0)
        margin = 20
        zoom = min(
            (preview_size - margin) / (width_units * SCALE),
            (preview_size - margin) / (height_units * SCALE),
        )
        zoom = max(0.05, min(zoom, 3.0))
        center_x = (min_x + max_x) / 2 * SCALE
        center_y = -(min_y + max_y) / 2 * SCALE
        preview_state = {
            "zoom": zoom,
            "offset_x": preview_size / 2 - center_x * zoom,
            "offset_y": preview_size / 2 - center_y * zoom,
        }
        fake_comp = {"id": "preview", "symbol": sym, "x": 0, "y": 0, "rotation": 0, "ref": ""}
        _draw_component(preview_canvas, fake_comp, preview_state)

    listbox.bind("<<ListboxSelect>>", update_preview)
    update_preview()

    result = {"symbol": None}

    def confirm():
        selection = listbox.curselection()
        if selection:
            result["symbol"] = symbols[selection[0]]
        picker.destroy()

    tk.Button(picker, text="OK", command=confirm).pack(pady=(0, 10))
    picker.wait_window()
    return result["symbol"]


def _to_screen(state, wx, wy):
    return wx * state["zoom"] + state["offset_x"], wy * state["zoom"] + state["offset_y"]


def _to_world(state, sx, sy):
    return (sx - state["offset_x"]) / state["zoom"], (sy - state["offset_y"]) / state["zoom"]


def _rotate_local(local_x, local_y, degrees):
    # 只需要處理 0/90/180/270 這四個直角,用查表方式做,不用 sin/cos 避免浮點誤差。
    degrees = int(degrees) % 360
    if degrees == 90:
        return -local_y, local_x
    if degrees == 180:
        return -local_x, -local_y
    if degrees == 270:
        return local_y, -local_x
    return local_x, local_y


def _orthogonal_points(p1, p2):
    # 走線只能是水平/垂直的直線,不走斜線:兩點不共線就先橫移再直移,拉出一個 L 型。
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2 or y1 == y2:
        return [x1, y1, x2, y2]
    return [x1, y1, x2, y1, x2, y2]


def _parse_ref(ref):
    match = re.match(r"^([A-Za-z]+)(\d+)$", ref or "")
    if match:
        return match.group(1), int(match.group(2))
    return None, None


def _symbol_bounds(symbol):
    xs, ys = [0.0], [0.0]
    for g in symbol.get("graphics", []):
        gtype = g.get("type")
        if gtype == "rectangle":
            xs += [g["start"][0], g["end"][0]]
            ys += [g["start"][1], g["end"][1]]
        elif gtype == "circle":
            r = g["radius"]
            xs += [g["center"][0] - r, g["center"][0] + r]
            ys += [g["center"][1] - r, g["center"][1] + r]
        elif gtype == "polyline":
            for px, py in g.get("points", []):
                xs.append(px)
                ys.append(py)
        elif gtype == "arc":
            for key in ("start", "mid", "end"):
                xs.append(g[key][0])
                ys.append(g[key][1])
    for pin in symbol.get("pins", []):
        xs.append(pin["x"])
        ys.append(pin["y"])
    return min(xs), max(xs), min(ys), max(ys)


def _pin_position(state, comp, pin_no):
    rotation = int(comp.get("rotation", 0)) % 360
    for pin in comp["symbol"].get("pins", []):
        if pin["number"] == pin_no:
            local_x, local_y = _rotate_local(pin["x"] * SCALE, -pin["y"] * SCALE, rotation)
            return _to_screen(state, comp["x"] + local_x, comp["y"] + local_y)
    return None


def open_sch_editor(window, initial_file=None):
    bg = window["bg"]
    fg = "#000000" if bg in ("#F0F0F0",) else "#FFFFFF"

    dialog = tk.Toplevel(window)
    dialog.title("Sch Editor")
    dialog.configure(bg=bg)
    dialog.geometry("1000x700")

    state = {
        "components": [],  # [{id, symbol, x, y, rotation, ref}] (x/y 是世界座標,不受縮放影響)
        "wires": [],  # [{"from": [comp_id, pin_no], "to": [comp_id, pin_no]}]
        "pending_wire": None,  # (comp_id, pin_no) or None
        "drag": None,  # {"id": comp_id, "dx": .., "dy": ..} (世界座標下的偏移量)
        "selected": None,  # 目前選取的 comp_id,給旋轉快捷鍵用
        "next_id": 1,
        "ref_counters": {},  # 每個 Reference 前綴(R/C/U...)各自的流水號,不共用同一個計數器
        "last_library_path": None,  # 記住上次選過的函式庫,下次開 Add Component 直接從那個資料夾開始
        "zoom": 1.0,
        "offset_x": 0.0,
        "offset_y": 0.0,
    }

    toolbar = tk.Frame(dialog, bg=bg)
    toolbar.pack(side="top", fill="x")

    canvas = tk.Canvas(dialog, bg="#FFFFFF")
    canvas.pack(fill="both", expand=True)

    def redraw():
        canvas.delete("all")
        for comp in state["components"]:
            _draw_component(canvas, comp, state)
        for wire in state["wires"]:
            p1 = _pin_position(state, _find_component(state, wire["from"][0]), wire["from"][1])
            p2 = _pin_position(state, _find_component(state, wire["to"][0]), wire["to"][1])
            if p1 and p2:
                canvas.create_line(*_orthogonal_points(p1, p2), fill=WIRE_COLOR, width=2)
        if state["pending_wire"]:
            comp = _find_component(state, state["pending_wire"][0])
            pos = _pin_position(state, comp, state["pending_wire"][1]) if comp else None
            if pos:
                r = 6
                canvas.create_oval(
                    pos[0] - r, pos[1] - r, pos[0] + r, pos[1] + r, outline=PENDING_PIN_COLOR, width=2
                )

    def add_component():
        filetypes = [("RealCad Library", f"*{LIBRARY_EXT}"), ("All files", "*.*")]
        if state["last_library_path"]:
            lib_path = filedialog.askopenfilename(
                title="Choose Library",
                initialdir=os.path.dirname(state["last_library_path"]),
                filetypes=filetypes,
            )
        else:
            lib_path = filedialog.askopenfilename(title="Choose Library", filetypes=filetypes)
        if not lib_path:
            return
        try:
            with open(lib_path, "r", encoding="utf-8") as f:
                lib_data = json.load(f)
        except (OSError, json.JSONDecodeError) as err:
            messagebox.showerror("Add Component", f"Could not read library:\n{err}", parent=dialog)
            return
        symbols = lib_data.get("symbols", [])
        if not symbols:
            messagebox.showerror("Add Component", "This library has no symbols.", parent=dialog)
            return
        state["last_library_path"] = lib_path
        chosen = _pick_symbol(dialog, symbols, bg, fg)
        if chosen is None:
            return
        comp_id = f"C{state['next_id']}"
        ref_prefix = chosen.get("properties", {}).get("Reference", "U")
        # 每個前綴(R/C/U...)各自的流水號,不共用同一個計數器,不然先放 R 再放 C 會變 R1、C2(跳號)。
        ref_count = state["ref_counters"].get(ref_prefix, 0) + 1
        state["ref_counters"][ref_prefix] = ref_count
        # 排成網格,col/row 用不同的除法/餘數算,不會像 next_id % 5 那樣每 5 個就疊在同一個座標上。
        col = (state["next_id"] - 1) % 5
        row = (state["next_id"] - 1) // 5
        state["components"].append(
            {
                "id": comp_id,
                "symbol": chosen,
                "x": 250 + col * 300,
                "y": 250 + row * 300,
                "rotation": 0,
                "ref": f"{ref_prefix}{ref_count}",
            }
        )
        state["next_id"] += 1
        redraw()

    def save_schematic():
        target = filedialog.asksaveasfilename(
            title="Save Schematic",
            defaultextension=SCH_EXT,
            filetypes=[("RealCad Schematic", f"*{SCH_EXT}"), ("All files", "*.*")],
        )
        if not target:
            return
        data = {
            "name": os.path.splitext(os.path.basename(target))[0],
            "format": "RealCad-Schematic",
            "version": 1,
            "components": state["components"],
            "wires": state["wires"],
        }
        with open(target, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        messagebox.showinfo("Save Schematic", f"Saved to:\n{target}", parent=dialog)

    def load_schematic_file(src):
        try:
            with open(src, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as err:
            messagebox.showerror("Open Schematic", f"Could not open schematic:\n{err}", parent=dialog)
            return
        state["components"] = data.get("components", [])
        state["wires"] = data.get("wires", [])
        max_id = 0
        ref_counters = {}
        for comp in state["components"]:
            try:
                max_id = max(max_id, int(str(comp["id"]).lstrip("C")))
            except ValueError:
                pass
            prefix, number = _parse_ref(comp.get("ref"))
            if prefix is not None and number is not None:
                ref_counters[prefix] = max(ref_counters.get(prefix, 0), number)
        state["next_id"] = max_id + 1
        state["ref_counters"] = ref_counters
        state["pending_wire"] = None
        state["selected"] = None
        redraw()

    def open_schematic():
        src = filedialog.askopenfilename(
            title="Open Schematic",
            filetypes=[("RealCad Schematic", f"*{SCH_EXT}"), ("All files", "*.*")],
        )
        if not src:
            return
        load_schematic_file(src)

    def run_simulation():
        try:
            result = simulator.solve_dc(state["components"], state["wires"])
        except simulator.CircuitError as err:
            messagebox.showerror("Run Simulation", str(err), parent=dialog)
            return
        except (KeyError, ValueError) as err:
            messagebox.showerror("Run Simulation", f"Could not simulate:\n{err}", parent=dialog)
            return

        results_win = tk.Toplevel(dialog)
        results_win.title("Simulation Results")
        results_win.configure(bg=bg)
        text = tk.Text(results_win, bg=bg, fg=fg, width=56, height=20)
        text.pack(fill="both", expand=True, padx=10, pady=10)

        lines = ["Sources:"]
        for s in result["sources"]:
            lines.append(f"  {s['ref']}: {s['voltage']:.4g} V, I = {s['current'] * 1000:.4g} mA")
        lines.append("")
        lines.append("Resistors:")
        for r in result["resistors"]:
            lines.append(
                f"  {r['ref']} ({r['resistance']:.4g} ohm): "
                f"V = {r['voltage']:.4g} V, I = {r['current'] * 1000:.4g} mA, "
                f"P = {r['power'] * 1000:.4g} mW"
            )
        text.insert("1.0", "\n".join(lines))
        text.configure(state="disabled")

    def zoom_at(cursor_x, cursor_y, factor):
        old_zoom = state["zoom"]
        new_zoom = max(0.2, min(5.0, old_zoom * factor))
        if new_zoom == old_zoom:
            return
        wx, wy = _to_world(state, cursor_x, cursor_y)
        state["zoom"] = new_zoom
        state["offset_x"] = cursor_x - wx * new_zoom
        state["offset_y"] = cursor_y - wy * new_zoom
        redraw()

    def zoom_in():
        zoom_at(canvas.winfo_width() / 2, canvas.winfo_height() / 2, 1.25)

    def zoom_out():
        zoom_at(canvas.winfo_width() / 2, canvas.winfo_height() / 2, 1 / 1.25)

    def reset_zoom():
        state["zoom"] = 1.0
        state["offset_x"] = 0.0
        state["offset_y"] = 0.0
        redraw()

    def on_mousewheel(event):
        factor = 1.1 if event.delta > 0 else (1 / 1.1)
        zoom_at(event.x, event.y, factor)

    tk.Button(toolbar, text="Add Component", command=add_component).pack(side="left", padx=6, pady=6)
    tk.Button(toolbar, text="Save Schematic", command=save_schematic).pack(side="left", padx=6, pady=6)
    tk.Button(toolbar, text="Open Schematic", command=open_schematic).pack(side="left", padx=6, pady=6)
    tk.Button(toolbar, text="Run Simulation", command=run_simulation).pack(side="left", padx=6, pady=6)
    tk.Button(toolbar, text="Zoom In", command=zoom_in).pack(side="left", padx=6, pady=6)
    tk.Button(toolbar, text="Zoom Out", command=zoom_out).pack(side="left", padx=6, pady=6)
    tk.Button(toolbar, text="Reset Zoom", command=reset_zoom).pack(side="left", padx=6, pady=6)

    def hit_test(x, y):
        pin_tag, comp_tag = None, None
        for item in canvas.find_overlapping(x - 5, y - 5, x + 5, y + 5):
            for tag in canvas.gettags(item):
                if tag.startswith("pin:"):
                    pin_tag = tag
                elif tag.startswith("comp:"):
                    comp_tag = tag
        return pin_tag, comp_tag

    def on_click(event):
        pin_tag, comp_tag = hit_test(event.x, event.y)
        if pin_tag:
            _, comp_id, pin_no = pin_tag.split(":", 2)
            if state["pending_wire"] is None:
                state["pending_wire"] = (comp_id, pin_no)
            elif state["pending_wire"] != (comp_id, pin_no):
                state["wires"].append({"from": list(state["pending_wire"]), "to": [comp_id, pin_no]})
                state["pending_wire"] = None
            else:
                state["pending_wire"] = None
            redraw()
            return
        if comp_tag:
            comp_id = comp_tag.split(":", 1)[1]
            comp = _find_component(state, comp_id)
            if comp:
                state["selected"] = comp_id
                wx, wy = _to_world(state, event.x, event.y)
                state["drag"] = {"id": comp_id, "dx": wx - comp["x"], "dy": wy - comp["y"]}
            canvas.focus_set()
            return
        state["pending_wire"] = None
        redraw()

    def on_drag(event):
        if not state["drag"]:
            return
        comp = _find_component(state, state["drag"]["id"])
        if comp:
            wx, wy = _to_world(state, event.x, event.y)
            comp["x"] = wx - state["drag"]["dx"]
            comp["y"] = wy - state["drag"]["dy"]
            redraw()

    def on_release(_event):
        state["drag"] = None

    def rotate_selected(_event=None):
        comp = _find_component(state, state["selected"])
        if comp:
            comp["rotation"] = (int(comp.get("rotation", 0)) + 90) % 360
            redraw()

    canvas.bind("<Button-1>", on_click)
    canvas.bind("<B1-Motion>", on_drag)
    canvas.bind("<ButtonRelease-1>", on_release)
    canvas.bind("<MouseWheel>", on_mousewheel)
    canvas.bind("<KeyPress-r>", rotate_selected)
    canvas.bind("<KeyPress-R>", rotate_selected)

    if initial_file:
        load_schematic_file(initial_file)


def _find_component(state, comp_id):
    return next((c for c in state["components"] if c["id"] == comp_id), None)


def _draw_component(canvas, comp, state):
    ox, oy = comp["x"], comp["y"]
    zoom = state["zoom"]
    rotation = int(comp.get("rotation", 0)) % 360
    comp_tag = f"comp:{comp['id']}"
    symbol = comp["symbol"]

    def screen(local_x, local_y):
        rx, ry = _rotate_local(local_x, local_y, rotation)
        return _to_screen(state, ox + rx, oy + ry)

    for g in symbol.get("graphics", []):
        gtype = g.get("type")
        if gtype == "rectangle":
            x1, y1 = screen(g["start"][0] * SCALE, -g["start"][1] * SCALE)
            x2, y2 = screen(g["end"][0] * SCALE, -g["end"][1] * SCALE)
            canvas.create_rectangle(x1, y1, x2, y2, outline=STROKE, tags=(comp_tag,))
        elif gtype == "circle":
            cx, cy = screen(g["center"][0] * SCALE, -g["center"][1] * SCALE)
            r = g["radius"] * SCALE * zoom
            canvas.create_oval(cx - r, cy - r, cx + r, cy + r, outline=STROKE, tags=(comp_tag,))
        elif gtype == "polyline":
            pts = []
            for px, py in g.get("points", []):
                pts.extend(screen(px * SCALE, -py * SCALE))
            if len(pts) >= 4:
                canvas.create_line(*pts, fill=STROKE, tags=(comp_tag,))
        elif gtype == "arc":
            # 簡化: 用 start->mid->end 兩段直線近似弧線,不做真正的圓弧幾何運算
            pts = []
            for key in ("start", "mid", "end"):
                px, py = g[key]
                pts.extend(screen(px * SCALE, -py * SCALE))
            canvas.create_line(*pts, fill=STROKE, smooth=True, tags=(comp_tag,))

    for pin in symbol.get("pins", []):
        tip_x, tip_y = screen(pin["x"] * SCALE, -pin["y"] * SCALE)
        # pin 本身的方向也要跟著零件一起轉,不然轉了零件之後腳位長得方向會跟本體不一致。
        effective_rotation = (int(pin.get("rotation", 0)) + rotation) % 360
        dx, dy = PIN_DIRECTIONS.get(effective_rotation, (-1, 0))
        length = pin.get("length", 0) * SCALE * zoom
        body_x, body_y = tip_x + dx * length, tip_y + dy * length
        canvas.create_line(tip_x, tip_y, body_x, body_y, fill=STROKE, tags=(comp_tag,))

        r = 4
        pin_tag = f"pin:{comp['id']}:{pin['number']}"
        canvas.create_oval(
            tip_x - r, tip_y - r, tip_x + r, tip_y + r, fill=PIN_DOT_COLOR, outline="", tags=(pin_tag, comp_tag)
        )

    ref_x, ref_y = screen(0, -40)
    canvas.create_text(ref_x, ref_y, text=comp.get("ref", ""), fill=STROKE, tags=(comp_tag,))
