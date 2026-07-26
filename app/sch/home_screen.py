import ctypes
import json
import os
import sys
import tkinter as tk
from tkinter import colorchooser, filedialog, messagebox, simpledialog

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "FileConvert"))
from KiCad_to_RealCad import convert_symbol_library, convert_schematic, convert_project  # noqa: E402
from component_editor import open_component_editor  # noqa: E402
from sch_editor import open_sch_editor  # noqa: E402

window = tk.Tk()
window.title("RealCad")

PROJECT_EXT = ".RealCad_pro"
DEFAULT_BG = "#191A1B"
DEFAULT_FG = "#FFFFFF"
LIGHT_BG = "#F0F0F0"
LIGHT_FG = "#000000"
LIBRARY_EXT = ".RealCad_lib"
SCH_EXT = ".RealCad_sch"
PCB_EXT = ".RealCad_pcb"  # PCB Editor 還沒做,這裡先掃描副檔名,清單目前一定是空的

current_project_dir = None

DWMWA_CAPTION_COLOR = 35
DWMWA_TEXT_COLOR = 36


def set_titlebar_color(hex_color, hex_text="#FFFFFF"):
    # Windows 11 only (DWM caption color API). No-op / silently fails on older Windows.
    def to_colorref(hex_value):
        hex_value = hex_value.lstrip("#")
        r, g, b = int(hex_value[0:2], 16), int(hex_value[2:4], 16), int(hex_value[4:6], 16)
        return r | (g << 8) | (b << 16)

    window.update_idletasks()
    hwnd = ctypes.windll.user32.GetParent(window.winfo_id())
    for attribute, value in (
        (DWMWA_CAPTION_COLOR, to_colorref(hex_color)),
        (DWMWA_TEXT_COLOR, to_colorref(hex_text)),
    ):
        ctypes.windll.dwmapi.DwmSetWindowAttribute(
            hwnd, attribute, ctypes.byref(ctypes.c_int(value)), ctypes.sizeof(ctypes.c_int)
        )


window.configure(bg=DEFAULT_BG)
set_titlebar_color(DEFAULT_BG)

# 新增專案
def new_project():
    global current_project_dir
    name = simpledialog.askstring("New Project", "Project name:", parent=window)
    if not name:
        return
    parent_dir = filedialog.askdirectory(title="Choose a location for the project")
    if not parent_dir:
        return
    project_dir = os.path.join(parent_dir, name)
    try:
        os.makedirs(project_dir, exist_ok=False)
    except FileExistsError:
        messagebox.showerror("New Project", f'"{name}" already exists at that location.')
        return
    project_file = os.path.join(project_dir, f"{name}{PROJECT_EXT}")
    with open(project_file, "w", encoding="utf-8") as f:
        json.dump({"name": name, "version": "0.1.0"}, f, ensure_ascii=False, indent=2)
    window.title(f"RealCad - {name}")
    current_project_dir = project_dir
    file_list()

# 開啟專案
def open_project():
    global current_project_dir
    project_file = filedialog.askopenfilename(
        title="Open Project",
        filetypes=[("RealCad Project", f"*{PROJECT_EXT}"), ("All files", "*.*")],
    )
    if not project_file:
        return
    try:
        with open(project_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as err:
        messagebox.showerror("Open Project", f"Could not open project:\n{err}")
        return
    window.title(f"RealCad - {data.get('name', os.path.basename(project_file))}")
    current_project_dir = os.path.dirname(project_file)
    file_list()
# 開啟符號庫
def open_library():
    library_file = filedialog.askopenfilename(
        title="Open Library",
        filetypes=[("RealCad Library", f"*{LIBRARY_EXT}"), ("All files", "*.*")],
    )
    if not library_file:
        return
    try:
        with open(library_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as err:
        messagebox.showerror("Open Library", f"Could not open library:\n{err}")
        return
    window.title(f"RealCad - {data.get('name', os.path.basename(library_file))}")
# 從 KiCad 匯入
def open_from_kicad():
    kicad_file = filedialog.askopenfilename(
        title="Open from KiCad",
        filetypes=[
            ("KiCad Files", "*.kicad_sym *.kicad_sch *.kicad_pro"),
            ("KiCad Symbol Library", "*.kicad_sym"),
            ("KiCad Schematic", "*.kicad_sch"),
            ("KiCad Project", "*.kicad_pro"),
            ("All files", "*.*"),
        ],
    )
    if not kicad_file:
        return
    kicad_file_lower = kicad_file.lower()
    try:
        if kicad_file_lower.endswith(".kicad_sch"):
            data, output_path, warnings = convert_schematic(kicad_file)
            message = (
                f"Converted {len(data['components'])} component(s), "
                f"{len(data['wires'])} wire(s).\nSaved to:\n{output_path}"
            )
            if warnings:
                message += "\n\nWarnings:\n" + "\n".join(warnings)
        elif kicad_file_lower.endswith(".kicad_pro"):
            data, output_path = convert_project(kicad_file)
            message = f"Converted project \"{data['name']}\".\nSaved to:\n{output_path}"
        else:
            data, output_path = convert_symbol_library(kicad_file)
            message = f"Converted {len(data['symbols'])} symbol(s).\nSaved to:\n{output_path}"
    except (OSError, ValueError) as err:
        messagebox.showerror("Open from KiCad", f"Could not convert file:\n{err}")
        return
    messagebox.showinfo("Open from KiCad", message)
    window.title(f"RealCad - {data.get('name', os.path.basename(kicad_file))}")

# 退出
def exit_app():
    window.destroy()

def apply_theme(bg_color, fg_color=DEFAULT_FG):
    window.configure(bg=bg_color)
    menu_bar.configure(bg=bg_color)
    for button in menu_buttons:
        button.configure(bg=bg_color, fg=fg_color, activebackground=bg_color, activeforeground=fg_color)
    for sub in submenus:
        sub.configure(bg=bg_color, fg=fg_color)
    set_titlebar_color(bg_color, fg_color)
    file_list()


# 背景色
def background():
    color = colorchooser.askcolor(color=window["bg"], title="Choose Background Color")[1]
    if color:
        apply_theme(color)


# 偏好設定
def performance():
    dialog = tk.Toplevel(window)
    dialog.title("Performance Settings")
    dialog.configure(bg=window["bg"])

    dialog.geometry("800x600")
    
    tk.Label(dialog, text="General", bg=window["bg"], fg=DEFAULT_FG, font=("", 10, "bold")).pack(
        anchor="w", padx=10, pady=(10, 0)
    )
    tk.Label(dialog, text="Theme", bg=window["bg"], fg=DEFAULT_FG).pack(anchor="w", padx=20, pady=(6, 0))

    theme_var = tk.StringVar(value="dark")

    def on_theme_change():
        if theme_var.get() == "light":
            apply_theme(LIGHT_BG, LIGHT_FG)
        else:
            apply_theme(DEFAULT_BG, DEFAULT_FG)
        dialog.configure(bg=window["bg"])

    for value, label in (("light", "Light"), ("dark", "Dark")):
        tk.Radiobutton(
            dialog,
            text=label,
            variable=theme_var,
            value=value,
            command=on_theme_change,
            bg=window["bg"],
            fg=DEFAULT_FG,
            selectcolor=window["bg"],
            activebackground=window["bg"],
            activeforeground=DEFAULT_FG,
        ).pack(anchor="w", padx=30)

FILE_COMMANDS = {
    "New Project": new_project,
    "Open Project": open_project,
    "Open from KiCad": open_from_kicad,
    "Exit": exit_app,
}

SETTING_COMMANDS = {
    "Background": background,
    "Performance": performance,
}

TOOL_COMMANDS = {
    "Sch Editor": lambda: open_sch_editor(window),
    "Component Editor": lambda: open_component_editor(window),
}


function = ["File(F)", "Edit(E)", "View(V)", "Tool(T)", "Setting(S)", "Help(H)"]
file_function = ["New Project", "Open Project", "Open Recently Project", "Open from KiCad", "Exit"]
edit_function = ["Cut", "Copy", "Past"]
view_function = ["Restart"]
tool_function = ["Sch Editor", "PCB Editor", "Component Editor", "Footprint Edit", "3D Layout"]
setting_function = ["Components Manage", "Footprint Manage", "Language", "Performance"]
help_function = ["Keypress"]

def underline_index(label):
    open_paren = label.rfind("(")
    if open_paren != -1 and label.endswith(")"):
        return open_paren + 1
    return -1

# Windows 的原生選單列(window.config(menu=...))不吃 bg 顏色設定,
# 所以改用 Frame+Button 自畫選單列,才能讓最上方橫幅跟著背景色一起變。
def open_dropdown(menu, button):
    def _open(event=None):
        x = button.winfo_rootx()
        y = button.winfo_rooty() + button.winfo_height()
        menu.post(x, y)

    return _open


menu_bar = tk.Frame(window, bg=DEFAULT_BG)
menu_bar.pack(side="top", fill="x")

file_panel = tk.Frame(window, bg=DEFAULT_BG, width=220)
file_panel.pack(side="left", fill="y")
file_panel.pack_propagate(False)

submenus = []
menu_buttons = []
for name in function:
    submenu = tk.Menu(window, tearoff=0, bg=DEFAULT_BG, fg="#FFFFFF")
    submenus.append(submenu)
    if name == "File(F)":
        for item in file_function:
            if item in FILE_COMMANDS:
                submenu.add_command(label=item, command=FILE_COMMANDS[item])
            else:
                submenu.add_command(label=item, state=tk.DISABLED)
    elif name == "Edit(E)":
        for item in edit_function:
            submenu.add_command(label=item)
    elif name == "View(V)":
        for item in view_function:
            submenu.add_command(label=item)
    elif name == "Tool(T)":
        for item in tool_function:
            if item in TOOL_COMMANDS:
                submenu.add_command(label=item, command=TOOL_COMMANDS[item])
            else:
                submenu.add_command(label=item, state=tk.DISABLED)
    elif name == "Setting(S)":
        for item in setting_function:
            if item in SETTING_COMMANDS:
                submenu.add_command(label=item, command=SETTING_COMMANDS[item])
            else:
                submenu.add_command(label=item, state=tk.DISABLED)
    elif name == "Help(H)":
        for item in help_function:
            submenu.add_command(label=item)

    button = tk.Button(
        menu_bar,
        text=name,
        underline=underline_index(name),
        bg=DEFAULT_BG,
        fg="#FFFFFF",
        activebackground=DEFAULT_BG,
        activeforeground="#FFFFFF",
        relief="flat",
        bd=0,
        padx=10,
        pady=4,
    )
    button.configure(command=open_dropdown(submenu, button))
    button.pack(side="left")
    menu_buttons.append(button)

    idx = underline_index(name)
    if idx != -1:
        window.bind_all(f"<Alt-{name[idx].lower()}>", open_dropdown(submenu, button))

# 檔案清單
def file_list():
    # 開了專案(新增或開啟)後,在主視窗左側面板顯示這個專案資料夾底下的
    # .RealCad_sch / .RealCad_pcb 清單,不彈新視窗(彈出視窗容易被主視窗擋住看不到)。
    bg = window["bg"]
    fg = LIGHT_FG if bg == LIGHT_BG else DEFAULT_FG

    for child in file_panel.winfo_children():
        child.destroy()
    file_panel.configure(bg=bg)

    if not current_project_dir:
        tk.Label(file_panel, text="No project open", bg=bg, fg=fg).pack(anchor="w", padx=10, pady=10)
        return
    project_dir = current_project_dir

    def scan(*exts):
        try:
            names = os.listdir(project_dir)
        except OSError:
            return []
        exts_lower = tuple(e.lower() for e in exts)
        return sorted(f for f in names if f.lower().endswith(exts_lower))

    def open_sch_file(path):
        if path.lower().endswith(".kicad_sch"):
            try:
                _data, output_path, warnings = convert_schematic(path)
            except (OSError, ValueError) as err:
                messagebox.showerror("Open Schematic", f"Could not convert KiCad schematic:\n{err}")
                return
            if warnings:
                messagebox.showwarning("Open Schematic", "\n".join(warnings))
            file_list()
            open_sch_editor(window, initial_file=output_path)
        else:
            open_sch_editor(window, initial_file=path)

    def new_schematic():
        name = simpledialog.askstring("New Schematic", "Schematic name:", parent=window)
        if not name:
            return
        path = os.path.join(project_dir, f"{name}{SCH_EXT}")
        if os.path.exists(path):
            messagebox.showerror("New Schematic", f'"{name}{SCH_EXT}" already exists.')
            return
        data = {"name": name, "format": "RealCad-Schematic", "version": 1, "components": [], "wires": []}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        file_list()
        open_sch_editor(window, initial_file=path)

    def new_pcb():
        messagebox.showinfo("PCB Editor", "PCB Editor is not built yet.")

    header = tk.Frame(file_panel, bg=bg)
    header.pack(fill="x", padx=10, pady=10)
    tk.Button(header, text="+ Sch", command=new_schematic).pack(side="left")
    tk.Button(header, text="+ PCB", command=new_pcb).pack(side="left", padx=(6, 0))

    sch_files = scan(SCH_EXT, ".kicad_sch")
    pcb_files = scan(PCB_EXT, ".kicad_pcb")
    all_files = sorted(sch_files + pcb_files)

    box = tk.Listbox(file_panel, bg=bg, fg=fg, selectbackground="#444444")
    for name in all_files:
        box.insert(tk.END, name)
    if not all_files:
        box.insert(tk.END, "(none)")
        box.configure(state=tk.DISABLED)
    box.pack(fill="both", expand=True, padx=10, pady=(0, 10))

    def on_double_click(_event):
        if not all_files:
            return
        selection = box.curselection()
        if not selection:
            return
        name = all_files[selection[0]]
        path = os.path.join(project_dir, name)
        if name in sch_files:
            open_sch_file(path)
        else:
            messagebox.showinfo("PCB Editor", "PCB Editor is not built yet.")

    box.bind("<Double-Button-1>", on_double_click)

file_list()

window.geometry("1920x1080")

window.mainloop()