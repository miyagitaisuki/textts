from core.parser import parse_script


def test_bare_number_sets_role():
    items = parse_script("1 すみません\n2: はい\n3：ありがとう\n")
    assert [(i["role"], i["display"]) for i in items] == [
        ("1", "すみません"), ("2", "はい"), ("3", "ありがとう"),
    ]


def test_bracket_and_bare_lines_mix():
    items = parse_script("[1] こんにちは\n2 はい\n")
    assert [i["role"] for i in items] == ["1", "2"]


def test_year_like_text_is_not_a_role():
    items = parse_script("[1] 2024年です\n")
    assert items[0]["display"] == "2024年です"
    assert items[0]["role"] == "1"


def test_indented_continuation_is_not_a_role():
    items = parse_script("[1] こんにちは\n  2 つづき\n")
    assert len(items) == 1
    assert items[0]["display"].endswith("2 つづき")
