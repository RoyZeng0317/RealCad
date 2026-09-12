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


def _get_component_badge(comp, sim_res):
    if not sim_res:
        return None
    comp_id = comp.get("id")
    comp_ref = comp.get("ref")

    for r in sim_res.get("resistors", []):
        if r.get("id") == comp_id or r.get("ref") == comp_ref:
            st = r.get("stress", {})
            status = st.get("status", "SAFE")
            ratio = st.get("stress_ratio", 0.0) * 100
            if status == "EXPLODED":
                return (f"💥 炸裂 {ratio:.0f}%", "#D0021B", "#FFFFFF")
            elif status == "BURNT":
                return (f"🔥 燒毀 {ratio:.0f}%", "#E65100", "#FFFFFF")
            elif status == "WARNING":
                return (f"⚠️ 發燙 {ratio:.0f}%", "#F57F17", "#000000")
            else:
                return (f"✓ 安全 {ratio:.0f}%", "#2E7D32", "#FFFFFF")

    for s in sim_res.get("sources", []):
        if s.get("id") == comp_id or s.get("ref") == comp_ref:
            st = s.get("stress", {})
            status = st.get("status", "SAFE")
            if status == "EXPLODED":
                return ("💥 電源短路", "#D0021B", "#FFFFFF")
            elif status == "BURNT":
                return ("🔥 電源超載", "#E65100", "#FFFFFF")
            elif status == "WARNING":
                return ("⚠️ 電源重載", "#F57F17", "#000000")
            else:
                return ("✓ 供電正常", "#2E7D32", "#FFFFFF")
    return None


def _edit_component_dialog(parent, comp, bg, fg, on_update):
    editor = tk.Toplevel(parent)
    editor.title(f"Edit Component - {comp.get('ref', '')}")
    editor.configure(bg=bg)
    editor.geometry("450x420")
    editor.transient(parent)
    editor.grab_set()

    symbol = comp.get("symbol", {})
    props = symbol.setdefault("properties", {})
    ref = comp.get("ref", "")
    prefix = _ref_prefix(ref)

    frame = tk.Frame(editor, bg=bg)
    frame.pack(fill="both", expand=True, padx=20, pady=15)

    # Reference
    tk.Label(frame, text="Reference (零件代號):", bg=bg, fg=fg, font=("", 9, "bold")).grid(row=0, column=0, sticky="w", pady=6)
    ref_entry = tk.Entry(frame, width=22)
    ref_entry.insert(0, ref)
    ref_entry.grid(row=0, column=1, sticky="w", pady=6)

    # Value
    val_title = "Value (阻值 / 電壓):" if prefix in ("R", "V", "BT") else "Value (數值):"
    tk.Label(frame, text=val_title, bg=bg, fg=fg, font=("", 9, "bold")).grid(row=1, column=0, sticky="w", pady=6)
    val_entry = tk.Entry(frame, width=22)
    val_entry.insert(0, props.get("Value", ""))
    val_entry.grid(row=1, column=1, sticky="w", pady=6)

    p_rate_var = tk.StringVar(value=props.get("Rating_Power", "1/4W"))
    qual_var = tk.StringVar(value=props.get("Quality", "standard"))
    i_max_var = tk.StringVar(value=props.get("Max_Current", "2A"))

    row_idx = 2
    if prefix == "R":
        tk.Label(frame, text="採買額定功率 (Rating):", bg=bg, fg=fg, font=("", 9, "bold")).grid(row=row_idx, column=0, sticky="w", pady=6)
        p_frame = tk.Frame(frame, bg=bg)
        p_frame.grid(row=row_idx, column=1, sticky="w", pady=6)
        p_entry = tk.Entry(p_frame, textvariable=p_rate_var, width=12)
        p_entry.pack(side="left")

        # 常用按鈕
        row_idx += 1
        quick_frame = tk.Frame(frame, bg=bg)
        quick_frame.grid(row=row_idx, column=1, sticky="w", pady=2)
        for opt in ["1/8W", "1/4W", "1/2W", "1W", "2W", "5W"]:
            tk.Button(quick_frame, text=opt, font=("", 8), command=lambda o=opt: p_rate_var.set(o)).pack(side="left", padx=1)

        row_idx += 1
        tk.Label(frame, text="採買通路品質經驗:", bg=bg, fg=fg, font=("", 9, "bold")).grid(row=row_idx, column=0, sticky="w", pady=6)
        q_menu = tk.OptionMenu(frame, qual_var, "official", "standard", "cheap")
        q_menu.config(width=16)
        q_menu.grid(row=row_idx, column=1, sticky="w", pady=6)

        row_idx += 1
        desc_lbl = tk.Label(
            frame,
            text="說明: official=原廠正品(100%), standard=材料行(85%), cheap=淘寶雜牌(虛標65%)",
            bg=bg, fg="#888888", font=("", 8),
        )
        desc_lbl.grid(row=row_idx, column=0, columnspan=2, sticky="w", pady=4)

    elif prefix in ("V", "BT"):
        tk.Label(frame, text="最大額定電流 (Max I):", bg=bg, fg=fg, font=("", 9, "bold")).grid(row=row_idx, column=0, sticky="w", pady=6)
        i_entry = tk.Entry(frame, textvariable=i_max_var, width=22)
        i_entry.grid(row=row_idx, column=1, sticky="w", pady=6)

    def save():
        new_ref = ref_entry.get().strip()
        new_val = val_entry.get().strip()
        if new_ref:
            comp["ref"] = new_ref
        if new_val:
            props["Value"] = new_val
        if prefix == "R":
            props["Rating_Power"] = p_rate_var.get().strip() or "1/4W"
            props["Quality"] = qual_var.get().strip()
        elif prefix in ("V", "BT"):
            props["Max_Current"] = i_max_var.get().strip() or "2A"

        editor.destroy()
        on_update()

    btn_frame = tk.Frame(editor, bg=bg)
    btn_frame.pack(side="bottom", fill="x", pady=15)
    tk.Button(btn_frame, text="確定 (Save)", width=12, command=save).pack(side="right", padx=15)
    tk.Button(btn_frame, text="取消 (Cancel)", width=10, command=editor.destroy).pack(side="right", padx=5)


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
        "simulation_results": None,  # 儲存模擬結果與過應力/燒毀狀態
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
            initial_dir = os.path.dirname(state["last_library_path"])
        else:
            default_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Components", "sch"))
            if not os.path.isdir(default_dir):
                default_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "boards"))
            initial_dir = default_dir
        lib_path = filedialog.askopenfilename(
            title="Choose Library",
            initialdir=initial_dir,
            filetypes=filetypes,
        )
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

    def clear_badges():
        state["simulation_results"] = None
        redraw()

    def edit_selected_component():
        if not state["selected"]:
            messagebox.showinfo("Edit Component", "請先點擊選取電路圖中的元件 (Click to select)。", parent=dialog)
            return
        comp = _find_component(state, state["selected"])
        if comp:
            _edit_component_dialog(dialog, comp, bg, fg, redraw)

    def run_simulation():
        try:
            result = simulator.solve_dc(state["components"], state["wires"])
            state["simulation_results"] = result
            redraw()
        except simulator.CircuitError as err:
            messagebox.showerror("Run Simulation", str(err), parent=dialog)
            return
        except (KeyError, ValueError) as err:
            messagebox.showerror("Run Simulation", f"Could not simulate:\n{err}", parent=dialog)
            return

        results_win = tk.Toplevel(dialog)
        results_win.title("Simulation Results & Stress Test")
        results_win.configure(bg=bg)
        results_win.geometry("640x520")

        header_frame = tk.Frame(results_win, bg=bg)
        header_frame.pack(fill="x", padx=10, pady=(10, 5))

        hazards = result.get("hazards", [])
        if hazards:
            warn_lbl = tk.Label(
                header_frame,
                text=f"🚨 採買測試告警：檢測到 {len(hazards)} 個元件可能過熱、冒煙燒毀或炸裂！",
                bg="#FF4D4F",
                fg="#FFFFFF",
                font=("", 10, "bold"),
                pady=6,
            )
            warn_lbl.pack(fill="x")
        else:
            pass_lbl = tk.Label(
                header_frame,
                text="🎉 採買測試通過：所有元件均在安全降額規範內 (負載率 < 70%)！",
                bg="#52C41A",
                fg="#FFFFFF",
                font=("", 10, "bold"),
                pady=6,
            )
            pass_lbl.pack(fill="x")

        text = tk.Text(results_win, bg=bg, fg=fg, width=64, height=22)
        text.pack(fill="both", expand=True, padx=10, pady=5)

        lines = []
        if hazards:
            lines.append("【🚨 採買過載與損壞分析報告】:")
            for h in hazards:
                lines.append(f"  ● [{h['ref']}] {h['message']}")
                lines.append(f"    採買建議: {h['suggestion']}")
                lines.append("")
            lines.append("-" * 60)

        lines.append("【電源供電狀況 (Power Sources)】:")
        for s in result["sources"]:
            st = s.get("stress", {})
            lines.append(
                f"  {s['ref']}: {s['voltage']:.4g} V, "
                f"輸出電流 I = {s['current'] * 1000:.4g} mA ({st.get('message', '')})"
            )
        lines.append("")

        lines.append("【電阻負載與耐受度 (Resistors & Procurement Ratings)】:")
        for r in result["resistors"]:
            st = r.get("stress", {})
            p_mW = r['power'] * 1000
            p_lim_mW = st.get('p_effective', 0.25) * 1000
            ratio = st.get('stress_ratio', 0.0) * 100
            quality_name = st.get('quality_label', st.get('quality', 'standard'))
            lines.append(
                f"  {r['ref']} ({r['resistance']:.4g} Ω):"
            )
            lines.append(
                f"    電壓 V = {r['voltage']:.4g} V, 電流 I = {r['current'] * 1000:.4g} mA"
            )
            lines.append(
                f"    實測功耗 P = {p_mW:.1f} mW | 採買額定: {st.get('raw_rating', '1/4W')} ({quality_name})"
            )
            lines.append(
                f"    有效極限: {p_lim_mW:.1f} mW | 負載率: {ratio:.0f}% -> 狀態: [{st.get('status', 'SAFE')}]"
            )
            lines.append("")

        text.insert("1.0", "\n".join(lines))
        text.configure(state="disabled")

        btn_box = tk.Frame(results_win, bg=bg)
        btn_box.pack(fill="x", padx=10, pady=(0, 10))
        tk.Button(
            btn_box,
            text="清除畫面標記 (Clear Badges)",
            command=lambda: [clear_badges(), results_win.destroy()],
        ).pack(side="left")
        tk.Button(btn_box, text="確定關閉 (OK)", width=10, command=results_win.destroy).pack(side="right")

    def open_oscilloscope():
        canvas_w, canvas_h = 750, 380
        probes = _probeable_components(state, {"R", "C", "L", "V", "BT", "B"})
        palette = ["#1E66C8", "#D0021B", "#2E7D32", "#F57F17"]

        scope_win = tk.Toplevel(dialog)
        scope_win.title("Oscilloscope")
        scope_win.configure(bg=bg)
        scope_win.geometry("780x480")

        top = tk.Frame(scope_win, bg=bg)
        top.pack(fill="x", padx=10, pady=10)

        tk.Label(top, text="模擬時間長度 (s):", bg=bg, fg=fg).pack(side="left")
        duration_var = tk.StringVar(value="0.01")
        tk.Entry(top, textvariable=duration_var, width=10).pack(side="left", padx=(4, 15))

        listbox = tk.Listbox(top, selectmode=tk.MULTIPLE, exportselection=False, height=4, width=20)
        for _comp_id, ref, _comp in probes:
            listbox.insert(tk.END, ref)
        listbox.pack(side="left", padx=(0, 15))

        wave_canvas = tk.Canvas(scope_win, bg="#FFFFFF", width=canvas_w, height=canvas_h)
        wave_canvas.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        def run():
            try:
                t_stop = float(duration_var.get())
            except ValueError:
                messagebox.showerror("Oscilloscope", "模擬時間長度需為數字。", parent=scope_win)
                return
            if t_stop <= 0:
                messagebox.showerror("Oscilloscope", "模擬時間長度需大於 0。", parent=scope_win)
                return
            selection = listbox.curselection()
            if not selection:
                messagebox.showinfo("Oscilloscope", "請先勾選要觀察波形的元件。", parent=scope_win)
                return
            selected_refs = [probes[i][1] for i in selection[:4]]  # 最多同時畫 4 條波形

            dt = t_stop / 500
            try:
                result = simulator.solve_transient(state["components"], state["wires"], t_stop, dt)
            except simulator.CircuitError as err:
                messagebox.showerror("Oscilloscope", str(err), parent=scope_win)
                return
            except (KeyError, ValueError) as err:
                messagebox.showerror("Oscilloscope", f"Could not simulate:\n{err}", parent=scope_win)
                return

            times = result["time"]
            series = []
            for i, ref in enumerate(selected_refs):
                for group in ("resistors", "capacitors", "inductors", "sources"):
                    match = next((e for e in result[group] if e["ref"] == ref), None)
                    if match:
                        series.append((ref, palette[i % len(palette)], times, match["voltage"]))
                        break
            _draw_waveform(wave_canvas, canvas_w, canvas_h, series)

        tk.Button(top, text="執行模擬 (Run)", command=run).pack(side="left")
        _draw_waveform(wave_canvas, canvas_w, canvas_h, [])

    def open_multimeter():
        probes = _probeable_components(state, {"R", "V", "BT", "B"})
        status_colors = {"SAFE": "#00FF66", "WARNING": "#FFD400", "BURNT": "#FF8C00", "EXPLODED": "#FF3B30"}

        meter_win = tk.Toplevel(dialog)
        meter_win.title("Multimeter")
        meter_win.configure(bg=bg)
        meter_win.geometry("420x360")

        top = tk.Frame(meter_win, bg=bg)
        top.pack(fill="x", padx=10, pady=10)

        listbox = tk.Listbox(top, exportselection=False, height=6, width=18)
        for _comp_id, ref, _comp in probes:
            listbox.insert(tk.END, ref)
        listbox.pack(side="left")

        readout = tk.Frame(meter_win, bg="#101010")
        readout.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        readout_lbl = tk.Label(
            readout, text="請選擇元件並按量測", bg="#101010", fg="#00FF66",
            font=("Consolas", 13, "bold"), justify="left", anchor="w",
        )
        readout_lbl.pack(fill="both", expand=True, padx=10, pady=10)

        def measure():
            selection = listbox.curselection()
            if not selection:
                messagebox.showinfo("Multimeter", "請先選擇要量測的元件。", parent=meter_win)
                return
            ref = probes[selection[0]][1]
            try:
                result = simulator.solve_dc(state["components"], state["wires"])
            except simulator.CircuitError as err:
                messagebox.showerror("Multimeter", str(err), parent=meter_win)
                return
            except (KeyError, ValueError) as err:
                messagebox.showerror("Multimeter", f"Could not simulate:\n{err}", parent=meter_win)
                return

            entry = next((r for r in result["resistors"] if r["ref"] == ref), None)
            kind = "resistor"
            if entry is None:
                entry = next((s for s in result["sources"] if s["ref"] == ref), None)
                kind = "source"
            if entry is None:
                readout_lbl.configure(text=f"{ref}: 找不到量測結果。", fg="#FF3B30")
                return

            status = entry.get("stress", {}).get("status", "SAFE")
            color = status_colors.get(status, "#00FF66")
            lines = [ref, f"V = {entry['voltage']:.4g} V", f"I = {entry['current'] * 1000:.4g} mA"]
            if kind == "resistor":
                lines.append(f"P = {entry['power'] * 1000:.4g} mW")
                ratio = entry.get("stress", {}).get("stress_ratio", 0.0) * 100
                lines.append(f"負載率 = {ratio:.0f}% [{status}]")
            else:
                lines.append(f"狀態: [{status}]")
            readout_lbl.configure(text="\n".join(lines), fg=color)

        tk.Button(top, text="量測 (Measure)", command=measure).pack(side="left", padx=10)

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

    tk.Button(toolbar, text="Add Component", command=add_component).pack(side="left", padx=5, pady=6)
    tk.Button(toolbar, text="Edit Properties", command=edit_selected_component).pack(side="left", padx=5, pady=6)
    tk.Button(toolbar, text="Save Schematic", command=save_schematic).pack(side="left", padx=5, pady=6)
    tk.Button(toolbar, text="Open Schematic", command=open_schematic).pack(side="left", padx=5, pady=6)
    tk.Button(toolbar, text="Run Simulation", command=run_simulation).pack(side="left", padx=5, pady=6)
    tk.Button(toolbar, text="Oscilloscope", command=open_oscilloscope).pack(side="left", padx=5, pady=6)
    tk.Button(toolbar, text="Multimeter", command=open_multimeter).pack(side="left", padx=5, pady=6)
    tk.Button(toolbar, text="Clear Badges", command=clear_badges).pack(side="left", padx=5, pady=6)
    tk.Button(toolbar, text="Zoom In", command=zoom_in).pack(side="left", padx=5, pady=6)
    tk.Button(toolbar, text="Zoom Out", command=zoom_out).pack(side="left", padx=5, pady=6)
    tk.Button(toolbar, text="Reset Zoom", command=reset_zoom).pack(side="left", padx=5, pady=6)

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
            redraw()
            return
        state["pending_wire"] = None
        state["selected"] = None
        redraw()

    def on_double_click(event):
        _pin_tag, comp_tag = hit_test(event.x, event.y)
        if comp_tag:
            comp_id = comp_tag.split(":", 1)[1]
            comp = _find_component(state, comp_id)
            if comp:
                state["selected"] = comp_id
                _edit_component_dialog(dialog, comp, bg, fg, redraw)

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

    def delete_selected(_event=None):
        if not state["selected"]:
            return
        comp_id = state["selected"]
        state["components"] = [c for c in state["components"] if c["id"] != comp_id]
        state["wires"] = [
            w for w in state["wires"]
            if w["from"][0] != comp_id and w["to"][0] != comp_id
        ]
        state["selected"] = None
        state["simulation_results"] = None
        redraw()

    canvas.bind("<Button-1>", on_click)
    canvas.bind("<Double-Button-1>", on_double_click)
    canvas.bind("<B1-Motion>", on_drag)
    canvas.bind("<ButtonRelease-1>", on_release)
    canvas.bind("<MouseWheel>", on_mousewheel)
    canvas.bind("<KeyPress-r>", rotate_selected)
    canvas.bind("<KeyPress-R>", rotate_selected)
    canvas.bind("<KeyPress-e>", lambda _e: edit_selected_component())
    canvas.bind("<KeyPress-E>", lambda _e: edit_selected_component())
    canvas.bind("<KeyPress-Delete>", delete_selected)
    canvas.bind("<KeyPress-BackSpace>", delete_selected)

    if initial_file:
        load_schematic_file(initial_file)


def _find_component(state, comp_id):
    return next((c for c in state["components"] if c["id"] == comp_id), None)


def _probeable_components(state, prefixes):
    # 給示波器/三用電表的元件清單用:只列出 ref 前綴在 prefixes 內的元件(例如三用電表
    # 目前只認得 solve_dc 支援的 R/V,電容/電感故意不放進去,避免選了卻量不到)。
    result = []
    for comp in state["components"]:
        prefix, _number = _parse_ref(comp.get("ref"))
        if prefix in prefixes:
            result.append((comp["id"], comp.get("ref", ""), comp))
    return result


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

    # 標籤顯示: Reference、數值、額定功率
    props = symbol.get("properties", {})
    val = props.get("Value", "")
    p_rate = props.get("Rating_Power", "")
    prefix = _ref_prefix(comp.get("ref", ""))

    specs = []
    if val and val != comp.get("ref"):
        specs.append(val)
    if p_rate and prefix == "R":
        specs.append(p_rate)
    label_text = comp.get("ref", "")
    if specs:
        label_text += f" ({', '.join(specs)})"

    ref_x, ref_y = screen(0, -40)
    canvas.create_text(ref_x, ref_y, text=label_text, fill=STROKE, font=("", 9, "bold"), tags=(comp_tag,))

    # 選取高亮外框 (若被選取則顯示藍色虛線框)
    if state.get("selected") == comp["id"]:
        min_x, max_x, min_y, max_y = _symbol_bounds(symbol)
        x1, y1 = screen((min_x - 1.5) * SCALE, -(min_y - 1.5) * SCALE)
        x2, y2 = screen((max_x + 1.5) * SCALE, -(max_y + 1.5) * SCALE)
        canvas.create_rectangle(
            min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2),
            outline="#1E66C8", dash=(4, 4), width=2, tags=(comp_tag,)
        )

    # 模擬過應力狀態標籤 (💥 炸裂 / 🔥 燒毀 / ⚠️ 發燙 / ✓ 正常)
    sim_res = state.get("simulation_results")
    if sim_res:
        badge = _get_component_badge(comp, sim_res)
        if badge:
            badge_text, fill_bg, text_fg = badge
            bx, by = screen(0, 42)
            canvas.create_rectangle(
                bx - 44, by - 12, bx + 44, by + 12,
                fill=fill_bg, outline="#FFFFFF", width=1, tags=(comp_tag,)
            )
            canvas.create_text(
                bx, by, text=badge_text, fill=text_fg, font=("", 9, "bold"), tags=(comp_tag,)
            )


def _draw_waveform(canvas, width, height, series):
    # series = [(label, color, times, values), ...],給示波器畫波形用,不用額外的繪圖套件,
    # 純粹把時間/數值線性映射到畫布座標後用 create_line 手繪折線。
    canvas.delete("all")
    if not series:
        canvas.create_text(width / 2, height / 2, text="(未選擇探棒,請勾選元件後按 Run)", fill="#888888")
        return

    margin_l, margin_r, margin_t, margin_b = 55, 15, 15, 45
    plot_w = max(width - margin_l - margin_r, 10)
    plot_h = max(height - margin_t - margin_b, 10)
    x0, y0 = margin_l, margin_t
    x1, y1 = margin_l + plot_w, margin_t + plot_h
    mid_y = (y0 + y1) / 2

    t_max = max((times[-1] for _l, _c, times, _v in series if times), default=1.0) or 1.0
    v_max = max((abs(v) for _l, _c, _t, values in series for v in values), default=0.0)
    v_max = v_max if v_max > 1e-12 else 1.0

    canvas.create_rectangle(x0, y0, x1, y1, outline="#CCCCCC")
    canvas.create_line(x0, mid_y, x1, mid_y, fill="#DDDDDD")
    canvas.create_text(x0 - 6, y0, text=f"+{v_max:.3g}", anchor="e", font=("", 8))
    canvas.create_text(x0 - 6, mid_y, text="0", anchor="e", font=("", 8))
    canvas.create_text(x0 - 6, y1, text=f"-{v_max:.3g}", anchor="e", font=("", 8))
    canvas.create_text(x0, y1 + 12, text="0s", anchor="n", font=("", 8))
    canvas.create_text(x1, y1 + 12, text=f"{t_max:.3g}s", anchor="n", font=("", 8))

    for label, color, times, values in series:
        pts = []
        for t, v in zip(times, values):
            pts.append(x0 + (t / t_max) * plot_w)
            pts.append(mid_y - (v / v_max) * (plot_h / 2))
        if len(pts) >= 4:
            canvas.create_line(*pts, fill=color, width=2)

    legend_y = y1 + 30
    for i, (label, color, _t, _v) in enumerate(series):
        lx = x0 + i * 150
        canvas.create_rectangle(lx, legend_y - 5, lx + 12, legend_y + 5, fill=color, outline="")
        canvas.create_text(lx + 16, legend_y, text=label, anchor="w", font=("", 9))
