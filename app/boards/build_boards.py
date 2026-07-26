# 產生開發板的 .RealCad_lib 元件庫檔案(Raspberry Pi 5 / Arduino Uno / ESP32 DevKitC / STM32 Blue Pill)。
#
# 這裡直接用程式寫死接腳資料產生 JSON,而不是透過 component_editor.py 手動一根一根新增
# ——這些板子動輒 20~40 根腳位,手動點選單很沒效率也容易打錯。
#
# 準確度說明(誠實講清楚,免得誤導使用者接錯線):
#   - Raspberry Pi 5 (40-pin GPIO 排針) 跟 Arduino Uno 是業界多年沒變的標準接腳,可信度高。
#   - ESP32 DevKitC(通用 30-pin 版本)、STM32 Blue Pill(STM32F103C8T6) 這兩塊板子,
#     接腳「名稱/編號」是根據常見公開資料整理,但市面上同款板子仍有廠牌差異,
#     建議實際接線前對照手上板子的絲印(silkscreen)再次確認。
#   - 左右兩欄的視覺排列是為了畫符號方便自己分的,不代表實體排針的正反面順序,
#     電路圖裡真正決定接線的是腳位名稱/編號,不是畫面上的位置。

import json
import os

LIBRARY_EXT = ".RealCad_lib"
PIN_SPACING = 2.54  # mm,標準 0.1" 排針間距


def build_header_symbol(name, reference, left_pins, right_pins):
    n = max(len(left_pins), len(right_pins))
    half_height = (n - 1) * PIN_SPACING / 2

    pins = []
    for i, (number, label) in enumerate(left_pins):
        y = half_height - i * PIN_SPACING
        pins.append(
            {
                "number": str(number), "name": label, "x": -7.62, "y": y,
                "rotation": 180.0, "length": 2.54, "electrical_type": "passive", "shape": "line",
            }
        )
    for i, (number, label) in enumerate(right_pins):
        y = half_height - i * PIN_SPACING
        pins.append(
            {
                "number": str(number), "name": label, "x": 7.62, "y": y,
                "rotation": 0.0, "length": 2.54, "electrical_type": "passive", "shape": "line",
            }
        )

    body = {"type": "rectangle", "start": [-5.08, -half_height - 1.27], "end": [5.08, half_height + 1.27]}
    return {
        "name": name,
        "properties": {"Reference": reference, "Value": name, "Footprint": "", "Datasheet": ""},
        "pins": pins,
        "graphics": [body],
    }


def write_library(filename, library_name, source, symbol):
    data = {
        "name": library_name,
        "format": "RealCad-Symbol-Library",
        "version": 1,
        "source": source,
        "symbols": [symbol],
    }
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename + LIBRARY_EXT)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return out_path


# ---------- Raspberry Pi 5 (40-pin GPIO header) ----------

RPI5_LEFT = [
    (1, "3V3"), (3, "GPIO2_SDA"), (5, "GPIO3_SCL"), (7, "GPIO4"), (9, "GND"),
    (11, "GPIO17"), (13, "GPIO27"), (15, "GPIO22"), (17, "3V3"), (19, "GPIO10_MOSI"),
    (21, "GPIO9_MISO"), (23, "GPIO11_SCLK"), (25, "GND"), (27, "GPIO0_ID_SD"), (29, "GPIO5"),
    (31, "GPIO6"), (33, "GPIO13"), (35, "GPIO19_PCM_FS"), (37, "GPIO26"), (39, "GND"),
]
RPI5_RIGHT = [
    (2, "5V"), (4, "5V"), (6, "GND"), (8, "GPIO14_TXD"), (10, "GPIO15_RXD"),
    (12, "GPIO18_PCM_CLK"), (14, "GND"), (16, "GPIO23"), (18, "GPIO24"), (20, "GND"),
    (22, "GPIO25"), (24, "GPIO8_CE0"), (26, "GPIO7_CE1"), (28, "GPIO1_ID_SC"), (30, "GND"),
    (32, "GPIO12"), (34, "GND"), (36, "GPIO16"), (38, "GPIO20_PCM_DIN"), (40, "GPIO21_PCM_DOUT"),
]

# ---------- Arduino Uno (R3) ----------

UNO_LEFT = [
    ("D0", "D0_RXD"), ("D1", "D1_TXD"), ("D2", "D2"), ("D3", "D3_PWM"), ("D4", "D4"),
    ("D5", "D5_PWM"), ("D6", "D6_PWM"), ("D7", "D7"), ("D8", "D8"), ("D9", "D9_PWM"),
    ("D10", "D10_PWM"), ("D11", "D11_PWM"), ("D12", "D12"), ("D13", "D13_LED"),
]
UNO_RIGHT = [
    ("A0", "A0"), ("A1", "A1"), ("A2", "A2"), ("A3", "A3"), ("A4", "A4_SDA"), ("A5", "A5_SCL"),
    ("5V", "5V"), ("3V3", "3V3"), ("VIN", "VIN"), ("GND1", "GND"), ("GND2", "GND"),
    ("RESET", "RESET"), ("AREF", "AREF"), ("IOREF", "IOREF"),
]

# ---------- ESP32 DevKitC (generic 30-pin) ----------

ESP32_LEFT = [
    ("EN", "EN"), ("GPIO36", "VP_GPIO36"), ("GPIO39", "VN_GPIO39"), ("GPIO34", "GPIO34"),
    ("GPIO35", "GPIO35"), ("GPIO32", "GPIO32"), ("GPIO33", "GPIO33"), ("GPIO25", "GPIO25"),
    ("GPIO26", "GPIO26"), ("GPIO27", "GPIO27"), ("GPIO14", "GPIO14"), ("GPIO12", "GPIO12"),
    ("GND1", "GND"), ("GPIO13", "GPIO13"), ("VIN", "VIN_5V"),
]
ESP32_RIGHT = [
    ("3V3", "3V3"), ("GPIO23", "GPIO23"), ("GPIO22", "GPIO22"), ("GPIO1", "TX0_GPIO1"),
    ("GPIO3", "RX0_GPIO3"), ("GPIO21", "GPIO21"), ("GPIO19", "GPIO19"), ("GPIO18", "GPIO18"),
    ("GPIO5", "GPIO5"), ("GPIO17", "GPIO17"), ("GPIO16", "GPIO16"), ("GPIO4", "GPIO4"),
    ("GPIO0", "GPIO0_BOOT"), ("GPIO2", "GPIO2"), ("GPIO15", "GPIO15"),
]

# ---------- STM32 Blue Pill (STM32F103C8T6) ----------

STM32_LEFT = [
    ("VBAT", "VBAT"), ("PC13", "PC13"), ("PC14", "PC14"), ("PC15", "PC15"),
    ("PA0", "PA0"), ("PA1", "PA1"), ("PA2", "PA2"), ("PA3", "PA3"),
    ("PA4", "PA4"), ("PA5", "PA5"), ("PA6", "PA6"), ("PA7", "PA7"),
    ("PB0", "PB0"), ("PB1", "PB1"), ("PB2", "PB2_BOOT1"), ("PB10", "PB10"),
    ("PB11", "PB11"), ("PB12", "PB12"), ("PB13", "PB13"), ("PB14", "PB14"), ("PB15", "PB15"),
]
STM32_RIGHT = [
    ("RESET", "RESET"), ("BOOT0", "BOOT0"), ("3V3", "3V3"), ("5V", "5V"),
    ("GND1", "GND"), ("GND2", "GND"), ("PA8", "PA8"), ("PA9", "PA9"),
    ("PA10", "PA10"), ("PA11", "PA11"), ("PA12", "PA12"), ("PA13", "PA13_SWDIO"),
    ("PA14", "PA14_SWCLK"), ("PA15", "PA15"), ("PB3", "PB3"), ("PB4", "PB4"),
    ("PB5", "PB5"), ("PB6", "PB6"), ("PB7", "PB7"), ("PB8", "PB8"), ("PB9", "PB9"),
]


if __name__ == "__main__":
    boards = [
        ("RaspberryPi5", "Raspberry Pi 5 (40-pin GPIO)", "J", RPI5_LEFT, RPI5_RIGHT),
        ("ArduinoUno", "Arduino Uno R3", "J", UNO_LEFT, UNO_RIGHT),
        ("ESP32_DevKitC_30pin", "ESP32 DevKitC (30-pin, generic)", "U", ESP32_LEFT, ESP32_RIGHT),
        ("STM32_BluePill", "STM32 Blue Pill (STM32F103C8T6)", "U", STM32_LEFT, STM32_RIGHT),
    ]
    for filename, display_name, ref, left, right in boards:
        symbol = build_header_symbol(display_name, ref, left, right)
        out_path = write_library(filename, display_name, "manual", symbol)
        print(f"Built {display_name}: {len(left) + len(right)} pins -> {out_path}")
