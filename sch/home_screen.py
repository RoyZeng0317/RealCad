import tkinter as tk

window = tk.Tk()
window.title("RealCad")

function = ["File(F)", "Edit(E)", "View(V)", "Tool(V)", "Setting(S)", "Help(H)"]
file_function = ["New Project", "Open Project", "Open Recently Project", "Exit"]
edit_function = ["Cut", "Copy", "Past"]
view_function = ["Restart"]
tool_function = ["Sch Editor", "PCB Editor", "Compoent Editor", "Footprint Edit", "3D Layout"]
setting_function = ["Components Manage", "Footprint Manage", "Language", ""]
help_function = ["Keypress"]

menubar = tk.Menu(window)
for name in function:
    submenu = tk.Menu(menubar, tearoff=0)
    if name == "File(F)":
        for item in file_function:
            submenu.add_command(label=item)
    elif name == "Edit(E)":
        for item in edit_function:
            submenu.add_command(label=item)
    elif name == "View(V)":
        for item in view_function:
            submenu.add_command(label=item)
    elif name == "Tool(T)":
        for item in tool_function:
            submenu.add_command(label=item)
    elif name == "Setting(S)":
        for item in setting_function:
            submenu.add_command(label=item)
    elif name == "Help(H)":
        for item in help_function:
            submenu.add_command(label=item)
    menubar.add_cascade(label=name, menu=submenu)
    

window.config(menu=menubar)

window.geometry("360x480")

window.mainloop()