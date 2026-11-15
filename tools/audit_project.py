#!/usr/bin/env python3
"""
AstroChief MarsMap — Git Gecmisi, Hata/Geri-Yazim (Churn) ve Eksiklik Denetim Sistemi.
Tum commit gecmisini, ust uste degistirilen/geri alinan dosyalari, cakisma/duzeltme zincirlerini
ve mevcut kod/mimari eksikliklerini otomatik tarayarak ForAgents/PROJECT_DEFECTS_AND_HISTORY.md
dosyasina raporlar.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
REPORT_MD = ROOT / "ForAgents" / "PROJECT_DEFECTS_AND_HISTORY.md"
REPORT_JSON = ROOT / "logs" / "project_audit.json"

CODE_EXTS = {".js", ".css", ".html", ".php", ".py", ".rs", ".ps1", ".sh"}
SKIP_DIRS = {".git", "node_modules", "dist", "backups", "target", "__pycache__", "tiles"}


@dataclass
class CommitInfo:
    sha: str
    short_sha: str
    date: str
    author: str
    subject: str
    kind: str
    files: list[tuple[str, int, int]] = field(default_factory=list)

    @property
    def added(self) -> int:
        return sum(a for _, a, _ in self.files)

    @property
    def deleted(self) -> int:
        return sum(d for _, _, d in self.files)


def run_git(args: list[str]) -> str:
    """Git alt surecini UTF-8 olarak calistirir."""
    proc = subprocess.run(
        ["git", *args],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} basarisiz: {proc.stderr.strip()}")
    return proc.stdout


def classify_commit(subject: str) -> str:
    """Commit basligini turune gore siniflandirir."""
    low = subject.lower().strip()
    if low.startswith("merge ") or "merge branch" in low or "merge remote" in low:
        return "merge"
    if re.search(r"\b(revert|rollback|remove|delete)\b", low) or "kaldir" in low or "sil" in low:
        return "revert/remove"
    if low.startswith("fix") or "fix(" in low or "duzelt" in low or "bug" in low or "crash" in low:
        return "fix"
    if low.startswith("chore") or low.startswith("refactor") or "cleanup" in low or "split" in low:
        return "refactor/cleanup"
    if low.startswith("ci") or "deploy" in low or "workflow" in low:
        return "ci/deploy"
    if low.startswith("docs") or "readme" in low or "rapor" in low:
        return "docs"
    if low.startswith("perf") or "optimiz" in low or "hiz" in low:
        return "perf"
    return "feat"


def parse_git_history() -> list[CommitInfo]:
    """Tum Git commit gecmisini ve dosya bazli +/- satir istatistiklerini cozer."""
    raw = run_git(["log", "--reverse", "--format=@@@%H|%h|%ai|%an|%s", "--numstat"])
    commits: list[CommitInfo] = []
    cur: CommitInfo | None = None

    for line in raw.splitlines():
        if line.startswith("@@@"):
            parts = line[3:].split("|", 4)
            if len(parts) == 5:
                sha, short_sha, date, author, subject = parts
                cur = CommitInfo(
                    sha=sha,
                    short_sha=short_sha,
                    date=date[:19],
                    author=author,
                    subject=subject,
                    kind=classify_commit(subject),
                )
                commits.append(cur)
            continue

        if cur is None or not line.strip():
            continue
        m = re.match(r"^(\d+|-)\t(\d+|-)\t(.+)$", line)
        if not m:
            continue
        add_s, del_s, path = m.groups()
        added = 0 if add_s == "-" else int(add_s)
        deleted = 0 if del_s == "-" else int(del_s)
        cur.files.append((path, added, deleted))

    return commits


def analyze_churn(commits: list[CommitInfo]) -> dict[str, Any]:
    """Dosya bazli tekrarlanan duzenleme, geri yazim ve fix zincirlerini hesaplar."""
    stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "commits": 0,
            "fix_or_revert": 0,
            "merges": 0,
            "added": 0,
            "deleted": 0,
            "subjects": [],
        }
    )

    for c in commits:
        for path, a, d in c.files:
            if path.startswith("data/tiles/") and path.endswith(".png"):
                continue
            row = stats[path]
            row["commits"] += 1
            row["added"] += a
            row["deleted"] += d
            if c.kind in {"fix", "revert/remove"}:
                row["fix_or_revert"] += 1
            if c.kind == "merge":
                row["merges"] += 1
            row["subjects"].append((c.short_sha, c.kind, c.subject))

    hotspots = []
    for path, row in stats.items():
        if row["commits"] < 2:
            continue
        churn_pct = round((row["deleted"] / max(1, row["added"])) * 100, 1)
        hotspots.append(
            {
                "path": path,
                "commits": row["commits"],
                "fix_or_revert": row["fix_or_revert"],
                "merges": row["merges"],
                "added": row["added"],
                "deleted": row["deleted"],
                "churn_pct": churn_pct,
                "recent": row["subjects"][-4:],
            }
        )

    hotspots.sort(key=lambda x: (x["fix_or_revert"] * 2 + x["commits"], x["deleted"]), reverse=True)
    return {"hotspots": hotspots, "total_tracked_touched": len(stats)}


def detect_reversals_and_pingpong(commits: list[CommitInfo]) -> list[dict[str, str]]:
    """Bilinen ve gecmiste tespit edilen hatalı/geri alinan degisiklik zincirlerini cikarir."""
    events: list[dict[str, str]] = []
    for i, c in enumerate(commits):
        if c.kind in {"fix", "revert/remove", "merge"}:
            prev_same = []
            c_paths = {p for p, _, _ in c.files if not p.endswith(".png")}
            for prev in commits[max(0, i - 6) : i]:
                p_paths = {p for p, _, _ in prev.files if not p.endswith(".png")}
                overlap = sorted(c_paths & p_paths)
                if overlap:
                    prev_same.append(f"{prev.short_sha} ({', '.join(overlap[:2])})")
            if c.kind == "revert/remove" or (c.kind == "fix" and prev_same) or (c.kind == "merge" and c.deleted > 20):
                events.append(
                    {
                        "sha": c.short_sha,
                        "date": c.date,
                        "kind": c.kind,
                        "subject": c.subject,
                        "overlaps": ", ".join(prev_same[:3]) if prev_same else "-",
                        "diff": f"+{c.added}/-{c.deleted}",
                    }
                )
    return events


def scan_current_defects() -> dict[str, Any]:
    """Mevcut calisma agacindaki eksiklikleri, riskleri ve kural uyarilarini tarar."""
    defects: dict[str, Any] = {
        "uncommitted": [],
        "near_800_lines": [],
        "over_800_lines": [],
        "missing_footers": [],
        "external_urls": [],
        "broken_html_refs": [],
        "todos": [],
        "missing_tests": not (ROOT / "tests").exists(),
        "manifest_mismatch": None,
        "deploy_drift": [],
    }

    # 1. Commit edilmemis degisiklikler
    status_out = run_git(["status", "--porcelain"])
    for ln in status_out.splitlines():
        if ln.strip():
            defects["uncommitted"].append(ln)

    # 2. Kod dosyalari taramasi (<800 satir, footer, dis URL, TODO)
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file() or p.suffix.lower() not in CODE_EXTS:
            continue
        rel = p.relative_to(ROOT).as_posix()
        if any(part in SKIP_DIRS for part in p.parts):
            continue

        text = p.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        n_lines = len(lines)

        if p.name != "readme.md":
            if n_lines >= 800:
                defects["over_800_lines"].append((rel, n_lines))
            elif n_lines >= 650:
                defects["near_800_lines"].append((rel, n_lines))

        tail = "\n".join(lines[-25:])
        if p.suffix.lower() in {".js", ".css", ".html", ".php"} and "DOSYA SATIR" not in tail:
            defects["missing_footers"].append(rel)

        for idx, ln in enumerate(lines, 1):
            if re.search(r"\b(TODO|FIXME|HACK|XXX)\b", ln):
                defects["todos"].append((rel, idx, ln.strip()[:100]))
            if p.suffix.lower() in {".html", ".css"} and re.search(r"https?://", ln):
                if "w3.org" not in ln and "example" not in ln:
                    defects["external_urls"].append((rel, idx, ln.strip()[:100]))

    # 3. HTML dosya referans kontrolu
    for html_rel in ["index.html", "demo/index.html", "chat/index.html"]:
        hp = ROOT / html_rel
        if not hp.exists():
            continue
        html_txt = hp.read_text(encoding="utf-8", errors="replace")
        base_dir = hp.parent
        base_m = re.search(r'<base\s+href="([^"]+)"', html_txt)
        if base_m and base_m.group(1) == "../":
            base_dir = ROOT
        for m in re.finditer(r'(?:src|href)="(\./[^"?#]+|\.\./[^"?#]+)"', html_txt):
            target = (base_dir / m.group(1)).resolve()
            if not target.exists():
                defects["broken_html_refs"].append((html_rel, m.group(1)))

    # 4. Tile manifest kontrolu
    manifest_path = ROOT / "data" / "tiles" / "manifest.json"
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            tracked_pngs = len(run_git(["ls-files", "data/tiles/*.png"]).splitlines())
            disk_pngs = sum(1 for _ in (ROOT / "data" / "tiles").rglob("*.png"))
            manifest_count = manifest.get("total_tiles") or manifest.get("count")
            defects["manifest_mismatch"] = {
                "manifest_total": manifest_count,
                "git_tracked_pngs": tracked_pngs,
                "disk_pngs": disk_pngs,
            }
        except Exception as exc:
            defects["manifest_mismatch"] = {"error": str(exc)}

    # 5. Deploy hedef farki (marsmap.wiki vs mars.kubitron.com)
    wf = ROOT / ".github" / "workflows" / "deploy-mars-web.yml"
    if wf.exists():
        wf_txt = wf.read_text(encoding="utf-8", errors="replace")
        if "mars.kubitron.com" in wf_txt and "marsmap.wiki" not in wf_txt:
            defects["deploy_drift"].append(
                "GitHub Actions (.github/workflows/deploy-mars-web.yml) yalnizca mars.kubitron.com hedefine bagli; marsmap.wiki (20.102.97.92) manuel SCP/SSH ile guncelleniyor."
            )
    if (ROOT / "api" / "chat.php").exists():
        defects["deploy_drift"].append(
            "marsmap.wiki Nginx sunucusunda PHP-FPM yok; chat/index.html ve api/chat.php yalnizca PHP destekli sunucuda calisir."
        )

    return defects


def render_markdown_report(
    commits: list[CommitInfo],
    churn: dict[str, Any],
    reversals: list[dict[str, str]],
    defects: dict[str, Any],
) -> str:
    """Tum bulgulari okunabilir Turkce Markdown raporuna donusturur."""
    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    by_kind: dict[str, int] = defaultdict(int)
    for c in commits:
        by_kind[c.kind] += 1

    lines: list[str] = [
        "# AstroChief MarsMap — Commit Geçmişi, Geri-Yazım (Churn) ve Eksiklik Raporu",
        "",
        f"> **Oluşturulma:** `{now}` · **Üretici:** `tools/audit_project.py` · **Toplam Commit:** `{len(commits)}`",
        "",
        "## 1. Özet İstatistikler",
        "",
        f"- **Toplam Commit:** `{len(commits)}`",
        f"- **Özellik (`feat`):** `{by_kind['feat']}` | **Hata Düzeltme (`fix`):** `{by_kind['fix']}` | **Birleştirme (`merge`):** `{by_kind['merge']}` | **Geri Alma/Silme (`revert/remove`):** `{by_kind['revert/remove']}` | **Refaktör/Temizlik:** `{by_kind['refactor/cleanup']}` | **Dokümantasyon:** `{by_kind['docs']}` | **CI/Deploy:** `{by_kind['ci/deploy']}`",
        f"- **Hata / Geri-Yazım / Çakışma Olayı Sayısı:** `{len(reversals)}`",
        f"- **Commit Edilmemiş Değişiklikler:** `{len(defects['uncommitted'])}` dosya",
        "",
        "## 2. Tespit Edilen Mevcut Eksiklikler ve Riskler",
        "",
    ]

    if defects["uncommitted"]:
        lines.append("### 2.1 Commit Edilmemiş (Açık) Çalışma Ağacı Değişiklikleri")
        for item in defects["uncommitted"]:
            lines.append(f"- `{item}`")
        lines.append("")

    lines.append("### 2.2 Kod Kuralları, Satır Sınırı ve Mimari Eksiklikler")
    if defects["over_800_lines"]:
        for rel, n in defects["over_800_lines"]:
            lines.append(f"- **[KRİTİK >=800 satır]** `{rel}` ({n} satır)")
    else:
        lines.append("- `>= 800` satır kuralını aşan dosya yok.")

    if defects["near_800_lines"]:
        lines.append("- **800 Satır Sınırına Yaklaşan Dosyalar (>=650 satır, bölünme adayı):**")
        for rel, n in defects["near_800_lines"]:
            lines.append(f"  - `{rel}`: **{n}** satır")

    if defects["missing_footers"]:
        lines.append("- **Satır Sonu Açıklama Bloğu Eksik Dosyalar:**")
        for rel in defects["missing_footers"]:
            lines.append(f"  - `{rel}`")

    if defects["broken_html_refs"]:
        lines.append("- **HTML İçinde Kırık Yerel Dosya Referansları:**")
        for h, ref in defects["broken_html_refs"]:
            lines.append(f"  - `{h}` -> `{ref}` bulunamadı")

    if defects["external_urls"]:
        lines.append("- **HTML/CSS İçinde Harici URL İzleri:**")
        for rel, idx, snippet in defects["external_urls"]:
            lines.append(f"  - `{rel}:{idx}` -> `{snippet}`")

    if defects["todos"]:
        lines.append("- **Kod İçindeki TODO/FIXME İşaretleri:**")
        for rel, idx, snippet in defects["todos"]:
            lines.append(f"  - `{rel}:{idx}` -> `{snippet}`")

    if defects["missing_tests"]:
        lines.append("- **[EKSİKLİK]** Repoda kalıcı otomatik test paketi (`tests/` klasörü veya CI unit/E2E test koşusu) bulunmuyor; yalnızca geçici doğrulamalar yapılıyor.")

    mm = defects["manifest_mismatch"]
    if mm:
        lines.append(
            f"- **Karo (Tile) Envanter Durumu:** `manifest.json`={mm.get('manifest_total')}, Git izlenen PNG={mm.get('git_tracked_pngs')}, Yerel disk PNG={mm.get('disk_pngs')}."
        )

    for dd in defects["deploy_drift"]:
        lines.append(f"- **[DAĞITIM FARKI]** {dd}")
    lines.append("")

    lines.extend(
        [
            "## 3. En Çok Üstüne Yazılan / Hata Düzeltilen Dosyalar (Churn Analizi)",
            "",
            "| Dosya | Toplam Commit | Fix/Geri Alma | Merge | Eklenen (+) | Silinen (-) | Geri-Yazım Oranı |",
            "|---|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for row in churn["hotspots"][:20]:
        lines.append(
            f"| `{row['path']}` | {row['commits']} | {row['fix_or_revert']} | {row['merges']} | +{row['added']} | -{row['deleted']} | %{row['churn_pct']} |"
        )
    lines.append("")

    lines.extend(
        [
            "## 4. Hatalı Değişiklikler, Çakışmalar ve Üstüne Geri Yazılan Zincirler",
            "",
            "| Commit | Tarih | Tür | Fark | Yakın Önceki Çakışan Commit | Açıklama |",
            "|---|---|---|---|---|---|",
        ]
    )
    for ev in reversals:
        subj = ev["subject"].replace("|", "\\|")
        lines.append(
            f"| `{ev['sha']}` | `{ev['date']}` | `{ev['kind']}` | `{ev['diff']}` | `{ev['overlaps']}` | {subj} |"
        )
    lines.append("")

    lines.extend(
        [
            "## 5. Tüm Commitler Listesi (Kronolojik)",
            "",
            "| # | Commit | Tarih | Tür | Fark | Mesaj |",
            "|---:|---|---|---|---|---|",
        ]
    )
    for idx, c in enumerate(commits, 1):
        subj = c.subject.replace("|", "\\|")
        lines.append(f"| {idx} | `{c.short_sha}` | `{c.date}` | `{c.kind}` | `+{c.added}/-{c.deleted}` | {subj} |")
    lines.append("")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="AstroChief Git Gecmisi ve Eksiklik Denetim Raporu Uretici")
    parser.add_argument("--json", action="store_true", help="logs/project_audit.json ciktisi da uret")
    args = parser.parse_args()

    commits = parse_git_history()
    churn = analyze_churn(commits)
    reversals = detect_reversals_and_pingpong(commits)
    defects = scan_current_defects()

    REPORT_MD.parent.mkdir(parents=True, exist_ok=True)
    md = render_markdown_report(commits, churn, reversals, defects)
    REPORT_MD.write_text(md, encoding="utf-8")

    if args.json:
        REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "total_commits": len(commits),
            "hotspots": churn["hotspots"][:20],
            "reversals": reversals,
            "defects": defects,
        }
        REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"[OK] Rapor uretildi: {REPORT_MD.relative_to(ROOT).as_posix()} "
        f"(commits={len(commits)}, reversals={len(reversals)}, uncommitted={len(defects['uncommitted'])})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())


# ==========================================================================
# DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
# --------------------------------------------------------------------------
# - Satir 1-35: Modul basligi, sabit yollar (REPORT_MD, REPORT_JSON) ve CommitInfo veri modeli.
# - Satir 38-87: run_git, classify_commit ve parse_git_history; tum Git gecmisini ve +/- satir farklarini cozer.
# - Satir 90-142: analyze_churn ve detect_reversals_and_pingpong; dosya bazli ustune yazim ve geri-alma zincirlerini bulur.
# - Satir 145-232: scan_current_defects; acik git degisikliklerini, <800 satir riskini, kirik HTML yollarini ve dagitim farklarini tarar.
# - Satir 235-327: render_markdown_report; ozet istatistikler, eksiklikler, churn tablosu, geri-yazim zincirleri ve tam commit listesini uretir.
# - Satir 330-358: main ve CLI (--json); ForAgents/PROJECT_DEFECTS_AND_HISTORY.md raporunu yazar.
# ==========================================================================
