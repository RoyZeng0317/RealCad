# -*- coding: utf-8 -*-
"""
測試暫態(時域)模擬引擎:RC 充電曲線、RL 電流曲線是否符合解析解。
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import simulator


def _two_pin(ref, value):
    return {
        "id": ref,
        "ref": ref,
        "symbol": {
            "pins": [{"number": "1"}, {"number": "2"}],
            "properties": {"Value": value, "Max_Current": "10A"},
        },
    }


def test_rc_charging_curve():
    v_src, r, c = 5.0, 1000.0, 1e-6  # 5V, 1k, 1uF
    tau = r * c
    dt = tau / 50
    t_stop = tau * 5

    comp_v = _two_pin("V1", "5")
    comp_r = _two_pin("R1", "1k")
    comp_c = _two_pin("C1", "1u")
    wires = [
        {"from": ["V1", "1"], "to": ["R1", "1"]},
        {"from": ["R1", "2"], "to": ["C1", "1"]},
        {"from": ["C1", "2"], "to": ["V1", "2"]},
    ]

    result = simulator.solve_transient([comp_v, comp_r, comp_c], wires, t_stop, dt)
    cap_voltage = result["capacitors"][0]["voltage"]

    for t, v in zip(result["time"], cap_voltage):
        expected = v_src * (1 - math.exp(-t / tau))
        assert abs(v - expected) < 0.05, f"t={t}: got {v}, expected {expected}"
    print("[PASS] test_rc_charging_curve")


def test_rl_current_curve():
    v_src, r, l = 5.0, 100.0, 0.1  # 5V, 100 ohm, 100mH
    tau = l / r
    dt = tau / 50
    t_stop = tau * 5

    comp_v = _two_pin("V1", "5")
    comp_r = _two_pin("R1", "100")
    comp_l = _two_pin("L1", "100m")
    wires = [
        {"from": ["V1", "1"], "to": ["R1", "1"]},
        {"from": ["R1", "2"], "to": ["L1", "1"]},
        {"from": ["L1", "2"], "to": ["V1", "2"]},
    ]

    result = simulator.solve_transient([comp_v, comp_r, comp_l], wires, t_stop, dt)
    ind_current = result["inductors"][0]["current"]

    i_final = v_src / r
    for t, i in zip(result["time"], ind_current):
        expected = i_final * (1 - math.exp(-t / tau))
        assert abs(i - expected) < 0.001, f"t={t}: got {i}, expected {expected}"
    print("[PASS] test_rl_current_curve")


if __name__ == "__main__":
    test_rc_charging_curve()
    test_rl_current_curve()
    print("ALL TESTS PASSED SUCCESSFULLY!")
