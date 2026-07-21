from __future__ import annotations

import py_compile
import re
import shutil
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path("/opt/pine-wilt")
MAIN_PATH = PROJECT_ROOT / "rag-backend/app/main.py"
BACKUP_GLOBS = (
    "main.py.backup_auto_*",
    "main.py.backup_before_report_drafts_*",
    "main.py.backup_*",
)

IMPORT_LINE = (
    "from app.api.report_drafts "
    "import router as report_drafts_router"
)
DICT_LINE = '"report_drafts": report_drafts_router,'
INCLUDE_LINE = "app.include_router(report_drafts_router)"


def newest_valid_backup() -> Path | None:
    candidates: list[Path] = []

    for pattern in BACKUP_GLOBS:
        candidates.extend(MAIN_PATH.parent.glob(pattern))

    candidates = sorted(
        set(candidates),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )

    for candidate in candidates:
        try:
            py_compile.compile(
                str(candidate),
                doraise=True,
            )
            return candidate
        except Exception:
            continue

    return None


def compile_file(path: Path) -> None:
    py_compile.compile(
        str(path),
        doraise=True,
    )


def restore_valid_source() -> str:
    try:
        compile_file(MAIN_PATH)
        print("현재 main.py 문법 정상")
        return MAIN_PATH.read_text(encoding="utf-8")
    except Exception as exc:
        print("현재 main.py 문법 오류:", exc)

    backup = newest_valid_backup()
    if backup is None:
        raise RuntimeError(
            "문법이 정상인 main.py 백업을 찾지 못했습니다."
        )

    print("복구에 사용할 백업:", backup)
    return backup.read_text(encoding="utf-8")


def add_import(text: str) -> str:
    if IMPORT_LINE in text:
        return text

    lines = text.splitlines()
    api_import_indexes = [
        index
        for index, line in enumerate(lines)
        if line.startswith("from app.api.")
    ]

    if api_import_indexes:
        insert_at = api_import_indexes[-1] + 1
    else:
        import_indexes = [
            index
            for index, line in enumerate(lines)
            if line.startswith("from ")
            or line.startswith("import ")
        ]
        insert_at = (
            import_indexes[-1] + 1
            if import_indexes
            else 0
        )

    lines.insert(insert_at, IMPORT_LINE)
    return "\n".join(lines) + "\n"


def add_router_registration(text: str) -> str:
    if (
        DICT_LINE in text
        or INCLUDE_LINE in text
    ):
        return text

    lines = text.splitlines()

    # Preferred project structure:
    # required_routers = {
    #     "auth": auth_router,
    # }
    dict_start = None
    dict_indent = ""

    for index, line in enumerate(lines):
        match = re.match(
            r"^(\s*)(required_routers|routers)\s*=\s*\{\s*$",
            line,
        )
        if match:
            dict_start = index
            dict_indent = match.group(1)
            break

    if dict_start is not None:
        closing_index = None

        for index in range(dict_start + 1, len(lines)):
            if lines[index] == f"{dict_indent}}}":
                closing_index = index
                break

        if closing_index is None:
            raise RuntimeError(
                "라우터 딕셔너리의 닫는 중괄호를 찾지 못했습니다."
            )

        item_indent = dict_indent + "    "
        lines.insert(
            closing_index,
            f"{item_indent}{DICT_LINE}",
        )
        return "\n".join(lines) + "\n"

    # Fallback for direct app.include_router structure.
    include_indexes = [
        index
        for index, line in enumerate(lines)
        if re.match(
            r"^\s*app\.include_router\(",
            line,
        )
    ]

    if include_indexes:
        last_index = include_indexes[-1]
        indent = re.match(
            r"^(\s*)",
            lines[last_index],
        ).group(1)

        lines.insert(
            last_index + 1,
            f"{indent}{INCLUDE_LINE}",
        )
        return "\n".join(lines) + "\n"

    raise RuntimeError(
        "main.py에서 required_routers 딕셔너리나 "
        "app.include_router 구문을 찾지 못했습니다."
    )


def main() -> None:
    if not MAIN_PATH.is_file():
        raise FileNotFoundError(MAIN_PATH)

    source = restore_valid_source()
    updated = add_import(source)
    updated = add_router_registration(updated)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safety_backup = MAIN_PATH.with_name(
        f"main.py.backup_repair_{timestamp}"
    )

    if MAIN_PATH.exists():
        shutil.copy2(
            MAIN_PATH,
            safety_backup,
        )

    temporary_path = MAIN_PATH.with_suffix(".py.repaired")
    temporary_path.write_text(
        updated,
        encoding="utf-8",
    )

    try:
        compile_file(temporary_path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise

    temporary_path.replace(MAIN_PATH)
    compile_file(MAIN_PATH)

    print("main.py 복구 및 라우터 등록 완료")
    print("안전 백업:", safety_backup)
    print("수정 파일:", MAIN_PATH)


if __name__ == "__main__":
    main()
