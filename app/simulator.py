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
# 還沒做的(之後再處理): 交流分析、電容/電感、電晶體/IC、
# Arduino/ESP32/STM32/Raspberry Pi 5 這些開發板的行為模擬。

import re

UNIT_MULTIPLIERS = {
    "p": 1e-12, "n": 1e-9, "u": 1e-6, "m": 1e-3,
    "k": 1e3, "K": 1e3, "M": 1e6, "G": 1e9,
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

    resistor_results = [
        {
            "ref": comp.get("ref"),
            "resistance": resistance,
            "voltage": node_voltages[na] - node_voltages[nb],
            "current": (node_voltages[na] - node_voltages[nb]) / resistance,
            "power": ((node_voltages[na] - node_voltages[nb]) / resistance) ** 2 * resistance,
        }
        for comp, na, nb, resistance in resistors
    ]

    source_results = [
        # MNA 的分支電流變數方向是「流進正極」,取負號改成使用者直覺的
        # 「電源對外供電的電流方向」,才會跟電阻上量到的電流方向一致。
        {"ref": comp.get("ref"), "voltage": voltage, "current": -solution[n_nodes + k]}
        for k, (comp, _n_pos, _n_neg, voltage) in enumerate(sources)
    ]

    return {"node_voltages": node_voltages, "resistors": resistor_results, "sources": source_results}


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
