# 這裡要跑出模擬結果出來
#
# 目前先做「電阻 + 直流電壓源」的節點分析(Modified Nodal Analysis, MNA)。
# 歐姆定律、焦耳定律(P=I^2R)、惠斯登電橋都只是不同接法的電阻網路,
# 用同一套通用的節點分析就能算,不用個別寫死公式。
#
# 電路資料來自 sch/sch_editor.py 存的 .RealCad_sch:
#   components: [{"id", "symbol": {"pins":[...], "properties":{...}}, "ref"}, ...]
#   wires:      [{"from": [comp_id, pin_no], "to": [comp_id, pin_no]}, ...]
#
# 元件依 "ref" 開頭字母判斷種類: R -> 電阻, V/BT -> 直流電壓源(電池), GND -> 接地。
# 電阻/電壓源的數值讀 symbol.properties.Value,支援 p/n/u/m/k/M/G 單位字首。
#
# solve_transient() 用 Backward-Euler companion model 支援電容(C)/電感(L)的時域模擬,
# 是示波器、動畫互動模擬的基礎。
#
# 還沒做的(之後再處理): 交流(小訊號)分析、電晶體/IC 等非線性元件、
# Arduino/ESP32/STM32/Raspberry Pi 5 這些開發板的行為模擬。

import re

UNIT_MULTIPLIERS = {
    "p": 1e-12, "n": 1e-9, "u": 1e-6, "m": 1e-3,
    "k": 1e3, "K": 1e3, "M": 1e6, "G": 1e9,
}

# 採買品質與店家通路經驗係數
# official: 原廠/得捷(DigiKey)/貿澤(Mouser)大廠正品 (係數 1.0,標稱規格 100% 達標,短暫耐受裕度佳)
# standard: 一般實體電子材料行/台產合格品 (係數 0.85,符合標稱規格,留有標準安全裕度)
# cheap: 散裝白牌/淘寶雜牌/庫存虛標件 (係數 0.65,常見虛標發燙,容易提前冒煙燒毀)
QUALITY_FACTORS = {
    "official": 1.0,
    "standard": 0.85,
    "cheap": 0.65,
}

QUALITY_LABELS = {
    "official": "原廠正品 (100% 額定耐受)",
    "standard": "電子材料行標準品 (85% 實用耐受)",
    "cheap": "淘寶/散裝白牌 (65% 實用耐受,易虛標)",
}


class CircuitError(Exception):
    pass


def parse_value(text):
    text = str(text).strip()
    match = re.match(r"^([+-]?\d*\.?\d+)\s*([a-zA-Z]*)", text)
    if not match or not match.group(1):
        raise ValueError(f"Cannot parse value: {text!r}")
    number = float(match.group(1))
    suffix = match.group(2)
    for prefix, mult in UNIT_MULTIPLIERS.items():
        if suffix.startswith(prefix):
            return number * mult
    return number


def parse_power_rating(text, default=0.25):
    """
    解析額定功率字串,支援常見採買規格:
    - 分數格式: 如 '1/8W', '1/4W', '1/2W', '1/4'
    - 小數與單位格式: 如 '0.25W', '250mW', '1W', '2W', '5W'
    若未指定或解析失敗則預設為 0.25W (常見 1/4W 插件電阻)。
    """
    if text is None:
        return default
    text = str(text).strip()
    if not text:
        return default

    # 1. 匹配分數格式: 例如 1/4W, 1/8, 1/2 W
    frac_match = re.match(r"^(\d+)\s*/\s*(\d+)\s*([a-zA-Z]*)", text)
    if frac_match:
        num = float(frac_match.group(1))
        den = float(frac_match.group(2))
        if den != 0:
            val = num / den
            suffix = frac_match.group(3)
            for prefix, mult in UNIT_MULTIPLIERS.items():
                if suffix.startswith(prefix):
                    val *= mult
                    break
            return val

    # 2. 匹配標準數值格式: 例如 0.25W, 250mW, 1W
    try:
        return parse_value(text)
    except Exception:
        return default


def evaluate_resistor_stress(comp, voltage, current, power):
    """
    依據個人硬體採買經驗、標稱額定功率與零件品質係數,評估電阻是否會過熱、冒煙或炸裂。
    """
    props = comp.get("symbol", {}).get("properties", {})
    quality = str(props.get("Quality", "standard")).strip().lower()
    if quality not in QUALITY_FACTORS:
        quality = "standard"
    q_factor = QUALITY_FACTORS[quality]

    raw_rating = str(props.get("Rating_Power", "1/4W")).strip()
    p_nominal = parse_power_rating(raw_rating, default=0.25)
    p_effective = p_nominal * q_factor

    stress_ratio = (power / p_effective) if p_effective > 0 else 999.0
    ref = comp.get("ref", "R")

    if stress_ratio > 2.0:
        status = "EXPLODED"
        message = (
            f"💥 嚴重過載炸裂！實測功耗 {power*1000:.1f} mW "
            f"達採買極限 {p_effective*1000:.1f} mW 的 {stress_ratio*100:.0f}%！"
        )
        suggestion = (
            f"建議立即更換為額定功率至少 {max(power * 1.5, 1.0):.2f} W 以上之水泥電阻或大功率金屬氧化膜電阻，"
            "並選用原廠正品以防瞬間突波崩解！"
        )
    elif stress_ratio > 1.0:
        status = "BURNT"
        message = (
            f"🔥 功率超標冒煙燒焦！實測功耗 {power*1000:.1f} mW "
            f"> 採買極限 {p_effective*1000:.1f} mW (負載率 {stress_ratio*100:.0f}%)。"
        )
        if quality == "cheap":
            suggestion = (
                f"雜牌散裝標稱 {raw_rating} 實測虛標打折(僅約 {p_effective*1000:.0f} mW 耐受)。"
                f"建議升級規格至 {max(power * 1.4, 0.5):.2f} W 或換用正品合格件。"
            )
        else:
            suggestion = (
                f"電阻表面漆膜將碳化發黑甚至燒斷開路。建議升級額定功率至 {max(power * 1.4, 0.5):.2f} W 以上。"
            )
    elif stress_ratio > 0.70:
        status = "WARNING"
        message = (
            f"⚠️ 接近耐受極限！實測功耗 {power*1000:.1f} mW (負載率 {stress_ratio*100:.0f}%)，元件劇烈發燙！"
        )
        suggestion = "硬體採買經驗建議遵循降額準則 (負載率 < 70%)，長期運作建議提升一檔功率或注意散熱。"
    else:
        status = "SAFE"
        message = f"✅ 工作正常 (負載率 {stress_ratio*100:.0f}%)。"
        suggestion = "處於安全降額範圍內。"

    return {
        "status": status,
        "stress_ratio": stress_ratio,
        "p_nominal": p_nominal,
        "p_effective": p_effective,
        "raw_rating": raw_rating,
        "quality": quality,
        "quality_label": QUALITY_LABELS.get(quality, quality),
        "message": message,
        "suggestion": suggestion,
    }


def evaluate_source_stress(comp, voltage, current):
    """
    評估直流電源或電池是否出現過載、短路或過熱起火危險。
    """
    props = comp.get("symbol", {}).get("properties", {})
    i_max_raw = str(props.get("Max_Current", "2A")).strip()
    try:
        i_max = parse_value(i_max_raw)
    except Exception:
        i_max = 2.0

    abs_i = abs(current)
    if abs_i > 10.0 or (i_max > 0 and abs_i > i_max * 3.0):
        status = "EXPLODED"
        message = f"💥 電源迴路極度短路！輸出電流高達 {abs_i:.2f} A，電池可能急遽膨脹起火爆炸！"
        suggestion = "請立即檢查線路是否有跨接短路，並於電源正極串聯保險絲或限流電阻！"
    elif i_max > 0 and abs_i > i_max:
        status = "BURNT"
        message = f"🔥 電源超載！輸出電流 {abs_i:.2f} A 超過採買額定 {i_max:.2f} A。"
        suggestion = "電源過載發燙，可能觸發保護斷電或燒毀內部晶片，請更換大電流供應器。"
    elif i_max > 0 and abs_i > i_max * 0.75:
        status = "WARNING"
        message = f"⚠️ 電源重載！輸出電流 {abs_i:.2f} A 接近上限 {i_max:.2f} A。"
        suggestion = "電源長時間滿載將產生明顯高溫，建議保留至少 25% 裕度。"
    else:
        status = "SAFE"
        message = f"✅ 供電正常 (輸出電流 {abs_i*1000:.1f} mA)。"
        suggestion = "處於額定安全範圍內。"

    return {
        "status": status,
        "i_max": i_max,
        "message": message,
        "suggestion": suggestion,
    }


def _ref_prefix(ref):
    match = re.match(r"^[A-Za-z]+", ref or "")
    return match.group(0) if match else ""


def build_netlist(components, wires):
    parent = {}

    def find(node):
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for comp in components:
        for pin in comp["symbol"].get("pins", []):
            parent[(comp["id"], pin["number"])] = (comp["id"], pin["number"])

    for wire in wires:
        a, b = tuple(wire["from"]), tuple(wire["to"])
        if a in parent and b in parent:
            union(a, b)

    roots, net_of = {}, {}
    for node in parent:
        root = find(node)
        if root not in roots:
            roots[root] = len(roots)
        net_of[node] = roots[root]
    return net_of, len(roots)


def solve_dc(components, wires):
    net_of, net_count = build_netlist(components, wires)

    resistors, sources = [], []
    ground_net = None

    for comp in components:
        prefix = _ref_prefix(comp.get("ref", ""))
        symbol = comp["symbol"]
        pins = symbol.get("pins", [])

        if symbol.get("name", "").upper() in ("GND", "GROUND") or prefix == "GND":
            if pins:
                ground_net = net_of.get((comp["id"], pins[0]["number"]))
            continue

        if prefix == "R":
            if len(pins) != 2:
                raise CircuitError(f"Resistor {comp.get('ref')} must have exactly 2 pins.")
            value = parse_value(symbol.get("properties", {}).get("Value", "0"))
            na = net_of[(comp["id"], pins[0]["number"])]
            nb = net_of[(comp["id"], pins[1]["number"])]
            resistors.append((comp, na, nb, value))
        elif prefix in ("V", "BT", "B"):
            if len(pins) != 2:
                raise CircuitError(f"Source {comp.get('ref')} must have exactly 2 pins.")
            value = parse_value(symbol.get("properties", {}).get("Value", "0"))
            n_pos = net_of[(comp["id"], pins[0]["number"])]
            n_neg = net_of[(comp["id"], pins[1]["number"])]
            sources.append((comp, n_pos, n_neg, value))

    if not sources:
        raise CircuitError("Circuit needs at least one voltage source (ref starting with V/BT).")

    if ground_net is None:
        ground_net = sources[0][2]  # 沒放 GND 元件時,預設拿第一個電壓源的負極接地

    other_nets = [n for n in range(net_count) if n != ground_net]
    node_index = {n: i for i, n in enumerate(other_nets)}
    n_nodes = len(other_nets)
    n_sources = len(sources)
    size = n_nodes + n_sources

    matrix = [[0.0] * size for _ in range(size)]
    rhs = [0.0] * size

    def idx(net):
        return node_index[net] if net != ground_net else None

    for _comp, na, nb, resistance in resistors:
        if resistance == 0:
            raise CircuitError("Resistor value cannot be 0 (short circuit).")
        g = 1.0 / resistance
        ia, ib = idx(na), idx(nb)
        if ia is not None:
            matrix[ia][ia] += g
        if ib is not None:
            matrix[ib][ib] += g
        if ia is not None and ib is not None:
            matrix[ia][ib] -= g
            matrix[ib][ia] -= g

    for k, (_comp, n_pos, n_neg, voltage) in enumerate(sources):
        row = n_nodes + k
        i_pos, i_neg = idx(n_pos), idx(n_neg)
        if i_pos is not None:
            matrix[i_pos][row] += 1
            matrix[row][i_pos] += 1
        if i_neg is not None:
            matrix[i_neg][row] -= 1
            matrix[row][i_neg] -= 1
        rhs[row] = voltage

    solution = _gaussian_solve(matrix, rhs)

    node_voltages = {ground_net: 0.0}
    for net, i in node_index.items():
        node_voltages[net] = solution[i]

    resistor_results = []
    hazards = []

    for comp, na, nb, resistance in resistors:
        v = node_voltages[na] - node_voltages[nb]
        i = v / resistance
        power = (i ** 2) * resistance
        stress = evaluate_resistor_stress(comp, v, i, power)

        res_info = {
            "id": comp.get("id"),
            "ref": comp.get("ref"),
            "resistance": resistance,
            "voltage": v,
            "current": i,
            "power": power,
            "stress": stress,
        }
        resistor_results.append(res_info)

        if stress["status"] != "SAFE":
            hazards.append({
                "type": "resistor",
                "id": comp.get("id"),
                "ref": comp.get("ref"),
                "status": stress["status"],
                "message": stress["message"],
                "suggestion": stress["suggestion"],
                "details": f"實測 P={power*1000:.1f}mW / 額定極限 {stress['p_effective']*1000:.1f}mW",
            })

    source_results = []
    for k, (comp, _n_pos, _n_neg, voltage) in enumerate(sources):
        # MNA 的分支電流變數方向是「流進正極」,取負號改成使用者直覺的
        # 「電源對外供電的電流方向」,才會跟電阻上量到的電流方向一致。
        i_src = -solution[n_nodes + k]
        stress = evaluate_source_stress(comp, voltage, i_src)

        src_info = {
            "id": comp.get("id"),
            "ref": comp.get("ref"),
            "voltage": voltage,
            "current": i_src,
            "power": abs(voltage * i_src),
            "stress": stress,
        }
        source_results.append(src_info)

        if stress["status"] != "SAFE":
            hazards.append({
                "type": "source",
                "id": comp.get("id"),
                "ref": comp.get("ref"),
                "status": stress["status"],
                "message": stress["message"],
                "suggestion": stress["suggestion"],
                "details": f"輸出電流 I={abs(i_src):.2f}A / 額定 {stress['i_max']:.2f}A",
            })

    return {
        "node_voltages": node_voltages,
        "resistors": resistor_results,
        "sources": source_results,
        "hazards": hazards,
    }


def solve_transient(components, wires, t_stop, dt, t0=0.0):
    """
    時域暫態模擬(Backward-Euler)。除了電阻(R)/電壓源(V,BT,B)外,
    另支援電容(C)、電感(L),兩者都用 Norton 等效(等效電導 + 歷史電流源)
    直接併入既有的節點導納矩陣,不需要額外的分支電流未知數:
      電容: g = C/dt, 歷史項用上一步的電容電壓 v_prev。
      電感: g = dt/L, 歷史項用上一步的電感電流 i_prev。
    回傳每個元件隨時間變化的電壓/電流序列,供示波器等後續功能使用。
    """
    if dt <= 0:
        raise CircuitError("dt must be > 0.")

    net_of, net_count = build_netlist(components, wires)

    resistors, sources, capacitors, inductors = [], [], [], []
    ground_net = None

    for comp in components:
        prefix = _ref_prefix(comp.get("ref", ""))
        symbol = comp["symbol"]
        pins = symbol.get("pins", [])

        if symbol.get("name", "").upper() in ("GND", "GROUND") or prefix == "GND":
            if pins:
                ground_net = net_of.get((comp["id"], pins[0]["number"]))
            continue

        if len(pins) != 2 and prefix in ("R", "V", "BT", "B", "C", "L"):
            raise CircuitError(f"{comp.get('ref')} must have exactly 2 pins.")

        if prefix == "R":
            value = parse_value(symbol.get("properties", {}).get("Value", "0"))
            na = net_of[(comp["id"], pins[0]["number"])]
            nb = net_of[(comp["id"], pins[1]["number"])]
            resistors.append((comp, na, nb, value))
        elif prefix in ("V", "BT", "B"):
            value = parse_value(symbol.get("properties", {}).get("Value", "0"))
            n_pos = net_of[(comp["id"], pins[0]["number"])]
            n_neg = net_of[(comp["id"], pins[1]["number"])]
            sources.append((comp, n_pos, n_neg, value))
        elif prefix == "C":
            value = parse_value(symbol.get("properties", {}).get("Value", "0"))
            na = net_of[(comp["id"], pins[0]["number"])]
            nb = net_of[(comp["id"], pins[1]["number"])]
            capacitors.append({"comp": comp, "na": na, "nb": nb, "c": value, "v_prev": 0.0})
        elif prefix == "L":
            value = parse_value(symbol.get("properties", {}).get("Value", "0"))
            na = net_of[(comp["id"], pins[0]["number"])]
            nb = net_of[(comp["id"], pins[1]["number"])]
            inductors.append({"comp": comp, "na": na, "nb": nb, "l": value, "i_prev": 0.0})

    if not sources:
        raise CircuitError("Circuit needs at least one voltage source (ref starting with V/BT).")
    if ground_net is None:
        ground_net = sources[0][2]

    other_nets = [n for n in range(net_count) if n != ground_net]
    node_index = {n: i for i, n in enumerate(other_nets)}
    n_nodes = len(other_nets)
    n_sources = len(sources)
    size = n_nodes + n_sources

    def idx(net):
        return node_index[net] if net != ground_net else None

    # 每步都是一次 backward-Euler 位移,所以回傳序列從 t0+dt 開始(不含 t0 當下
    # 的初始條件,電容/電感的初始電壓/電流預設為 0,呼叫端已知這一點)。
    n_steps = max(1, int(round((t_stop - t0) / dt)))
    times = [t0 + (k + 1) * dt for k in range(n_steps)]

    result = {
        "time": times,
        "node_voltages": [],
        "resistors": [{"id": c.get("id"), "ref": c.get("ref"), "voltage": [], "current": [], "power": []}
                      for c, _na, _nb, _r in resistors],
        "capacitors": [{"id": e["comp"].get("id"), "ref": e["comp"].get("ref"), "voltage": [], "current": []}
                       for e in capacitors],
        "inductors": [{"id": e["comp"].get("id"), "ref": e["comp"].get("ref"), "voltage": [], "current": []}
                      for e in inductors],
        "sources": [{"id": c.get("id"), "ref": c.get("ref"), "voltage": [], "current": []}
                    for c, _np, _nn, _v in sources],
    }

    for t in times:
        matrix = [[0.0] * size for _ in range(size)]
        rhs = [0.0] * size

        for _comp, na, nb, resistance in resistors:
            if resistance == 0:
                raise CircuitError("Resistor value cannot be 0 (short circuit).")
            g = 1.0 / resistance
            ia, ib = idx(na), idx(nb)
            if ia is not None:
                matrix[ia][ia] += g
            if ib is not None:
                matrix[ib][ib] += g
            if ia is not None and ib is not None:
                matrix[ia][ib] -= g
                matrix[ib][ia] -= g

        for k, (_comp, n_pos, n_neg, voltage) in enumerate(sources):
            row = n_nodes + k
            i_pos, i_neg = idx(n_pos), idx(n_neg)
            if i_pos is not None:
                matrix[i_pos][row] += 1
                matrix[row][i_pos] += 1
            if i_neg is not None:
                matrix[i_neg][row] -= 1
                matrix[row][i_neg] -= 1
            rhs[row] = voltage

        for e in capacitors:
            g = e["c"] / dt
            ia, ib = idx(e["na"]), idx(e["nb"])
            if ia is not None:
                matrix[ia][ia] += g
                rhs[ia] += g * e["v_prev"]
            if ib is not None:
                matrix[ib][ib] += g
                rhs[ib] -= g * e["v_prev"]
            if ia is not None and ib is not None:
                matrix[ia][ib] -= g
                matrix[ib][ia] -= g

        for e in inductors:
            g = dt / e["l"]
            ia, ib = idx(e["na"]), idx(e["nb"])
            if ia is not None:
                matrix[ia][ia] += g
                rhs[ia] -= e["i_prev"]
            if ib is not None:
                matrix[ib][ib] += g
                rhs[ib] += e["i_prev"]
            if ia is not None and ib is not None:
                matrix[ia][ib] -= g
                matrix[ib][ia] -= g

        solution = _gaussian_solve(matrix, rhs)

        node_v = {ground_net: 0.0}
        for net, i in node_index.items():
            node_v[net] = solution[i]
        result["node_voltages"].append(node_v)

        for out, (_comp, na, nb, resistance) in zip(result["resistors"], resistors):
            v = node_v[na] - node_v[nb]
            i = v / resistance
            out["voltage"].append(v)
            out["current"].append(i)
            out["power"].append(i * i * resistance)

        for out, e in zip(result["capacitors"], capacitors):
            v = node_v[e["na"]] - node_v[e["nb"]]
            g = e["c"] / dt
            out["voltage"].append(v)
            out["current"].append(g * v - g * e["v_prev"])
            e["v_prev"] = v

        for out, e in zip(result["inductors"], inductors):
            v = node_v[e["na"]] - node_v[e["nb"]]
            g = dt / e["l"]
            i_new = g * v + e["i_prev"]
            out["voltage"].append(v)
            out["current"].append(i_new)
            e["i_prev"] = i_new

        for k, (_comp, _n_pos, _n_neg, voltage) in enumerate(sources):
            i_src = -solution[n_nodes + k]
            result["sources"][k]["voltage"].append(voltage)
            result["sources"][k]["current"].append(i_src)

    hazards = []
    for out, (comp, _na, _nb, _r) in zip(result["resistors"], resistors):
        peak = max(range(len(out["power"])), key=lambda idx: abs(out["power"][idx]))
        stress = evaluate_resistor_stress(comp, out["voltage"][peak], out["current"][peak], out["power"][peak])
        if stress["status"] != "SAFE":
            hazards.append({
                "type": "resistor", "id": comp.get("id"), "ref": comp.get("ref"),
                "status": stress["status"], "message": stress["message"], "suggestion": stress["suggestion"],
                "details": f"峰值 P={out['power'][peak]*1000:.1f}mW @ t={times[peak]:.4g}s",
            })
    for out, (comp, _np, _nn, voltage) in zip(result["sources"], sources):
        peak = max(range(len(out["current"])), key=lambda idx: abs(out["current"][idx]))
        stress = evaluate_source_stress(comp, voltage, out["current"][peak])
        if stress["status"] != "SAFE":
            hazards.append({
                "type": "source", "id": comp.get("id"), "ref": comp.get("ref"),
                "status": stress["status"], "message": stress["message"], "suggestion": stress["suggestion"],
                "details": f"峰值 I={abs(out['current'][peak]):.2f}A @ t={times[peak]:.4g}s",
            })
    result["hazards"] = hazards

    return result


def _gaussian_solve(matrix, rhs):
    n = len(rhs)
    a = [row[:] + [rhs[i]] for i, row in enumerate(matrix)]

    for col in range(n):
        pivot_row = max(range(col, n), key=lambda r: abs(a[r][col]))
        if abs(a[pivot_row][col]) < 1e-12:
            raise CircuitError("Circuit matrix is singular (floating node or short circuit?).")
        a[col], a[pivot_row] = a[pivot_row], a[col]
        pivot = a[col][col]
        for j in range(col, n + 1):
            a[col][j] /= pivot
        for row in range(n):
            if row != col and a[row][col] != 0:
                factor = a[row][col]
                for j in range(col, n + 1):
                    a[row][j] -= factor * a[col][j]

    return [a[i][n] for i in range(n)]
