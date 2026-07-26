import json
import os
import tkinter as tk
from tkinter import filedialog, messagebox

from sch_editor import SCALE, _draw_component, _symbol_bounds  # noqa: E402

LIBRARY_EXT = ".RealCad_lib"

ELECTRICAL_TYPES = [
    "input", "output", "bidirectional", "tri_state", "passive",
    "power_in", "power_out", "open_collector", "open_emitter", "unspecified",
]
PIN_SHAPES = ["line", "inverted", "clock", "inverted_clock"]
ROTATIONS = ["0", "90", "180", "270"]


def _readable_fg(bg_hex):
    try:
        bg_hex = bg_hex.lstrip("#")
        r, g, b = int(bg_hex[0:2], 16), int(bg_hex[2:4], 16), int(bg_hex[4:6], 16)
        return "#000000" if (0.299 * r + 0.587 * g + 0.114 * b) > 140 else "#FFFFFF"
    except (ValueError, IndexError):
        return "#FFFFFF"


def _default_body(pins):
    if not pins:
        return {"type": "rectangle", "start": [-2.54, -2.54], "end": [2.54, 2.54]}
    xs = [pin["x"] for pin in pins]
    ys = [pin["y"] for pin in pins]
    half_w = max(max(abs(min(xs)), abs(max(xs))) - 1.27, 1.27)
    half_h = max(max(abs(min(ys)), abs(max(ys))) - 1.27, 1.27)
    return {"type": "rectangle", "start": [-half_w, -half_h], "end": [half_w, half_h]}


def open_component_editor(window):
    bg = window["bg"]
    fg = _readable_fg(bg)
    pins = []

    dialog = tk.Toplevel(window)
    dialog.title("Component Editor")
    dialog.configure(bg=bg)
    dialog.geometry("760x560")

    main = tk.Frame(dialog, bg=bg)
    main.pack(fill="both", expand=True)

    left = tk.Frame(main, bg=bg)
    left.pack(side="left", fill="both", expand=True)

    right = tk.Frame(main, bg=bg)
    right.pack(side="left", fill="y", padx=10, pady=10)

    tk.Label(right, text="Preview", bg=bg, fg=fg, font=("", 10, "bold")).pack(anchor="w")
    preview_size = 260
    preview_canvas = tk.Canvas(right, bg="#FFFFFF", width=preview_size, height=preview_size)
    preview_canvas.pack(pady=(4, 0))

    def refresh_preview():
        preview_canvas.delete("all")
        if not pins:
            return
        fake_symbol = {"pins": pins, "graphics": [_default_body(pins)]}
        min_x, max_x, min_y, max_y = _symbol_bounds(fake_symbol)
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
        fake_comp = {
            "id": "preview",
            "symbol": fake_symbol,
            "x": 0,
            "y": 0,
            "rotation": 0,
            "ref": f"{ref_entry.get().strip() or 'U'}1",
        }
        _draw_component(preview_canvas, fake_comp, preview_state)

    top = tk.Frame(left, bg=bg)
    top.pack(fill="x", padx=10, pady=10)
    top.columnconfigure(1, weight=1)

    tk.Label(top, text="Component Name", bg=bg, fg=fg).grid(row=0, column=0, sticky="w")
    name_entry = tk.Entry(top)
    name_entry.grid(row=0, column=1, sticky="we", padx=(6, 0))

    tk.Label(top, text="Reference Prefix", bg=bg, fg=fg).grid(row=1, column=0, sticky="w", pady=(6, 0))
    ref_entry = tk.Entry(top)
    ref_entry.insert(0, "U")
    ref_entry.grid(row=1, column=1, sticky="we", padx=(6, 0), pady=(6, 0))

    pins_frame = tk.Frame(left, bg=bg)
    pins_frame.pack(fill="both", expand=True, padx=10)
    tk.Label(pins_frame, text="Pins", bg=bg, fg=fg).pack(anchor="w")

    list_row = tk.Frame(pins_frame, bg=bg)
    list_row.pack(fill="both", expand=True)
    pins_list = tk.Listbox(list_row, bg=bg, fg=fg, selectbackground="#444444")
    pins_list.pack(fill="both", expand=True, side="left")
    scrollbar = tk.Scrollbar(list_row, command=pins_list.yview)
    scrollbar.pack(side="right", fill="y")
    pins_list.configure(yscrollcommand=scrollbar.set)

    def refresh_pins_list():
        pins_list.delete(0, tk.END)
        for pin in pins:
            pins_list.insert(
                tk.END,
                f"#{pin['number']}  {pin['name']}  ({pin['x']}, {pin['y']})  "
                f"rot={pin['rotation']}  {pin['electrical_type']}",
            )

    def add_pin():
        add_dialog = tk.Toplevel(dialog)
        add_dialog.title("Add Pin")
        add_dialog.configure(bg=bg)
        add_dialog.columnconfigure(1, weight=1)

        entries = {}

        def labeled_entry(row, label, default=""):
            tk.Label(add_dialog, text=label, bg=bg, fg=fg).grid(row=row, column=0, sticky="w", padx=8, pady=4)
            entry = tk.Entry(add_dialog)
            entry.insert(0, default)
            entry.grid(row=row, column=1, sticky="we", padx=8, pady=4)
            entries[label] = entry

        labeled_entry(0, "Number", str(len(pins) + 1))
        labeled_entry(1, "Name", "~")
        labeled_entry(2, "X", "0")
        labeled_entry(3, "Y", "0")
        labeled_entry(4, "Length", "2.54")

        rotation_var = tk.StringVar(value="0")
        tk.Label(add_dialog, text="Rotation", bg=bg, fg=fg).grid(row=5, column=0, sticky="w", padx=8, pady=4)
        tk.OptionMenu(add_dialog, rotation_var, *ROTATIONS).grid(row=5, column=1, sticky="we", padx=8, pady=4)

        electrical_var = tk.StringVar(value="passive")
        tk.Label(add_dialog, text="Electrical Type", bg=bg, fg=fg).grid(row=6, column=0, sticky="w", padx=8, pady=4)
        tk.OptionMenu(add_dialog, electrical_var, *ELECTRICAL_TYPES).grid(row=6, column=1, sticky="we", padx=8, pady=4)

        shape_var = tk.StringVar(value="line")
        tk.Label(add_dialog, text="Shape", bg=bg, fg=fg).grid(row=7, column=0, sticky="w", padx=8, pady=4)
        tk.OptionMenu(add_dialog, shape_var, *PIN_SHAPES).grid(row=7, column=1, sticky="we", padx=8, pady=4)

        def confirm():
            try:
                pin = {
                    "number": entries["Number"].get().strip(),
                    "name": entries["Name"].get().strip(),
                    "x": float(entries["X"].get()),
                    "y": float(entries["Y"].get()),
                    "rotation": float(rotation_var.get()),
                    "length": float(entries["Length"].get()),
                    "electrical_type": electrical_var.get(),
                    "shape": shape_var.get(),
                }
            except ValueError:
                messagebox.showerror("Add Pin", "X / Y / Length must be numbers.", parent=add_dialog)
                return
            if not pin["number"]:
                messagebox.showerror("Add Pin", "Pin number is required.", parent=add_dialog)
                return
            pins.append(pin)
            refresh_pins_list()
            refresh_preview()
            add_dialog.destroy()

        tk.Button(add_dialog, text="Add", command=confirm).grid(row=8, column=0, columnspan=2, pady=10)

    def remove_selected_pin():
        selection = pins_list.curselection()
        if not selection:
            return
        del pins[selection[0]]
        refresh_pins_list()
        refresh_preview()

    pin_buttons = tk.Frame(left, bg=bg)
    pin_buttons.pack(fill="x", padx=10, pady=(6, 0))
    tk.Button(pin_buttons, text="Add Pin", command=add_pin).pack(side="left")
    tk.Button(pin_buttons, text="Remove Selected Pin", command=remove_selected_pin).pack(side="left", padx=(6, 0))

    def save_component():
        name = name_entry.get().strip()
        if not name:
            messagebox.showerror("Component Editor", "Component name is required.", parent=dialog)
            return
        if not pins:
            messagebox.showerror("Component Editor", "Add at least one pin before saving.", parent=dialog)
            return

        component = {
            "name": name,
            "properties": {
                "Reference": ref_entry.get().strip() or "U",
                "Value": name,
                "Footprint": "",
                "Datasheet": "~",
            },
            "pins": pins,
            "graphics": [_default_body(pins)],
        }

        target = filedialog.askopenfilename(
            title="Choose a library to save into (Cancel to create a new one)",
            filetypes=[("RealCad Library", f"*{LIBRARY_EXT}"), ("All files", "*.*")],
        )
        if target:
            try:
                with open(target, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, json.JSONDecodeError) as err:
                messagebox.showerror("Component Editor", f"Could not read library:\n{err}", parent=dialog)
                return
            data.setdefault("symbols", []).append(component)
        else:
            target = filedialog.asksaveasfilename(
                title="Save New Library",
                defaultextension=LIBRARY_EXT,
                filetypes=[("RealCad Library", f"*{LIBRARY_EXT}"), ("All files", "*.*")],
            )
            if not target:
                return
            data = {
                "name": os.path.splitext(os.path.basename(target))[0],
                "format": "RealCad-Symbol-Library",
                "version": 1,
                "source": "manual",
                "symbols": [component],
            }

        with open(target, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        messagebox.showinfo("Component Editor", f'Saved "{name}" to:\n{target}', parent=dialog)
        dialog.destroy()

    bottom = tk.Frame(dialog, bg=bg)
    bottom.pack(fill="x", padx=10, pady=10)
    tk.Button(bottom, text="Save Component", command=save_component).pack(side="right")
    tk.Button(bottom, text="Cancel", command=dialog.destroy).pack(side="right", padx=(0, 6))
