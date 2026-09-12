# -*- coding: utf-8 -*-
"""
測試電路模擬之過應力、燒毀與炸裂檢測機制 (結合個人硬體採買經驗)
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import simulator


def test_power_parsing():
    assert simulator.parse_power_rating("1/4W") == 0.25
    assert simulator.parse_power_rating("1/8W") == 0.125
    assert simulator.parse_power_rating("1/2W") == 0.5
    assert simulator.parse_power_rating("1W") == 1.0
    assert simulator.parse_power_rating("250mW") == 0.25
    assert simulator.parse_power_rating("0.5W") == 0.5
    assert simulator.parse_power_rating(None, default=0.25) == 0.25
    print("[PASS] test_power_parsing")


def test_quality_factors():
    assert simulator.QUALITY_FACTORS["official"] == 1.0
    assert simulator.QUALITY_FACTORS["standard"] == 0.85
    assert simulator.QUALITY_FACTORS["cheap"] == 0.65
    print("[PASS] test_quality_factors")


def test_resistor_stress_levels():
    # 測試 1: 安全設計 (5V 跨接 1k 歐姆 = 5mA, P = 25mW, 採買 1/4W 標稱 = 250mW)
    # 負載率 25mW / 212.5mW = 11.8% -> SAFE
    comp_safe = {
        "id": "C1",
        "ref": "R1",
        "symbol": {
            "properties": {"Rating_Power": "1/4W", "Quality": "standard"}
        }
    }
    st_safe = simulator.evaluate_resistor_stress(comp_safe, 5.0, 0.005, 0.025)
    assert st_safe["status"] == "SAFE"

    # 測試 2: 發燙警戒 (P = 180mW, 標稱 1/4W 原廠 250mW, 負載率 72% -> WARNING)
    comp_warn = {
        "id": "C2",
        "ref": "R2",
        "symbol": {
            "properties": {"Rating_Power": "1/4W", "Quality": "official"}
        }
    }
    st_warn = simulator.evaluate_resistor_stress(comp_warn, 5.0, 0.036, 0.180)
    assert st_warn["status"] == "WARNING"

    # 測試 3: 冒煙燒毀 (P = 250mW, 淘寶雜牌 1/4W 虛標極限 162.5mW, 負載率 154% -> BURNT)
    comp_burnt = {
        "id": "C3",
        "ref": "R3",
        "symbol": {
            "properties": {"Rating_Power": "1/4W", "Quality": "cheap"}
        }
    }
    st_burnt = simulator.evaluate_resistor_stress(comp_burnt, 5.0, 0.050, 0.250)
    assert st_burnt["status"] == "BURNT"

    # 測試 4: 嚴重超載炸裂 (12V 跨接 10 歐姆, P = 14.4W, 採買 1/4W 散裝極限 162.5mW -> EXPLODED)
    comp_boom = {
        "id": "C4",
        "ref": "R4",
        "symbol": {
            "properties": {"Rating_Power": "1/4W", "Quality": "cheap"}
        }
    }
    st_boom = simulator.evaluate_resistor_stress(comp_boom, 12.0, 1.2, 14.4)
    assert st_boom["status"] == "EXPLODED"
    print("[PASS] test_resistor_stress_levels")


def test_solve_dc_hazards_integration():
    # 建立電路: 12V 電壓源串聯 10 歐姆電阻 (嚴重炸裂)
    comp_v = {
        "id": "C1",
        "ref": "V1",
        "symbol": {
            "pins": [{"number": "1"}, {"number": "2"}],
            "properties": {"Value": "12V", "Max_Current": "2A"},
        },
    }
    comp_r = {
        "id": "C2",
        "ref": "R1",
        "symbol": {
            "pins": [{"number": "1"}, {"number": "2"}],
            "properties": {"Value": "10", "Rating_Power": "1/4W", "Quality": "cheap"},
        },
    }
    wires = [
        {"from": ["C1", "1"], "to": ["C2", "1"]},
        {"from": ["C1", "2"], "to": ["C2", "2"]},
    ]

    result = simulator.solve_dc([comp_v, comp_r], wires)
    assert "hazards" in result
    assert len(result["hazards"]) >= 1

    hazard = result["hazards"][0]
    assert hazard["ref"] == "R1"
    assert hazard["status"] == "EXPLODED"
    assert "炸裂" in hazard["message"]
    assert "水泥電阻" in hazard["suggestion"]
    print("[PASS] test_solve_dc_hazards_integration")


if __name__ == "__main__":
    test_power_parsing()
    test_quality_factors()
    test_resistor_stress_levels()
    test_solve_dc_hazards_integration()
    print("ALL TESTS PASSED SUCCESSFULLY!")
