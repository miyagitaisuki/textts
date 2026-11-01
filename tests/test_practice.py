from core.builder import practice_items

ITEMS = [
    {"id": "L001", "type": "line", "role": "1"},
    {"id": "L002", "type": "line", "role": "2"},
    {"id": "P001", "type": "pause", "ms": 500},
    {"id": "L003", "type": "line", "role": "1"},
]
PLACED = [
    {"id": "L001", "start_ms": 0, "end_ms": 1000},
    {"id": "L002", "start_ms": 1450, "end_ms": 2200},
    {"id": "L003", "start_ms": 2700, "end_ms": 3500},
]


def test_no_options_keeps_items():
    assert practice_items(ITEMS, PLACED) == ITEMS


def test_role_play_replaces_other_roles_with_silence_of_same_length():
    out = practice_items(ITEMS, PLACED, practice_role="1")
    assert out[0] == ITEMS[0]
    assert out[1] == {"type": "pause", "ms": 750}
    assert out[2] == ITEMS[2]
    assert out[3] == ITEMS[3]


def test_shadow_adds_gap_after_each_practice_line():
    out = practice_items(ITEMS, PLACED, shadow_gap_ms=1500)
    assert out == [
        ITEMS[0], {"type": "pause", "ms": 2500},
        ITEMS[1], {"type": "pause", "ms": 2250},
        ITEMS[2],
        ITEMS[3], {"type": "pause", "ms": 2300},
    ]


def test_shadow_only_for_practice_role():
    out = practice_items(ITEMS, PLACED, practice_role="1", shadow_gap_ms=1500)
    assert out == [
        ITEMS[0], {"type": "pause", "ms": 2500},
        {"type": "pause", "ms": 750},
        ITEMS[2],
        ITEMS[3], {"type": "pause", "ms": 2300},
    ]
