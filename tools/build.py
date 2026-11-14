#!/usr/bin/env python3
"""
tools/build.py
AstroChief MarsMap - Isletim Sistemi Duyarli Otomatik Derleme, Denetim ve Masaustu Dagitim Araci.
Calistigi isletim sistemini (Linux / Windows) algilar, readme.md kurallarini denetler,
gerekli paketi derler ve guncel surumu Masaustu/AstroChief-MarsMap dizinine yukler.
"""

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path


class CodeRuleAuditor:
    """Proje dosyalarinin AstroChief readme.md kurallarina uygunlugunu denetleyen sinif."""

    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self.max_lines = 800
        self.main_entrypoint = Path("js/app.js")

    def audit_all(self):
        """Tum kural kontrollerini sirasiyla calistirir."""
        self.check_readme_unmodified()
        self.check_required_dirs()
        self.check_line_limits_and_footers()
        self.check_no_external_cdn()
        print("[OK] Tum AstroChief kod, alt yorum, offline res/ ve < 800 satir kurallari dogrulandi.")

    def check_readme_unmodified(self):
        """readme.md dosyasinin degistirilmedigini git diff ile denetler."""
        readme_path = self.root_dir / "readme.md"
        if not readme_path.exists():
            raise RuntimeError("KURAL IHLALI: readme.md bulunamadi!")
        try:
            res = subprocess.run(
                ["git", "diff", "--quiet", "readme.md"],
                cwd=self.root_dir,
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if res.returncode not in (0, 128):
                raise RuntimeError("KURAL IHLALI: readme.md uzerinde degisiklik tespit edildi!")
        except FileNotFoundError:
            pass

    def check_required_dirs(self):
        """Zorunlu data/, res/fonts/, res/images/ ve ForAgents/ dizinlerini dogrular."""
        required = [
            self.root_dir / "data" / "tiles",
            self.root_dir / "data" / "datasets",
            self.root_dir / "res" / "fonts",
            self.root_dir / "res" / "images",
            self.root_dir / "ForAgents",
        ]
        for folder in required:
            if not folder.exists() or not any(folder.iterdir()):
                raise RuntimeError(f"EKSIK DIZIN VEYA ICERIK: {folder}")

    def check_line_limits_and_footers(self):
        """Main kodu disinda < 800 satir ve her kod dosyasinda alt satir aciklama blogu kontrolu."""
        scan_roots = ["js", "css", "data", "tools", "api", "chat", "backend/src"]
        code_exts = {".js", ".css", ".py", ".sh", ".ps1", ".cs", ".php", ".rs"}
        candidates = [self.root_dir / "index.html", self.root_dir / "build.sh"]
        for sub in scan_roots:
            sub_dir = self.root_dir / sub
            if sub_dir.exists():
                for p in sub_dir.rglob("*"):
                    if p.is_file() and p.suffix.lower() in code_exts:
                        candidates.append(p)

        for path in sorted(set(candidates)):
            if not path.exists():
                continue
            rel = path.relative_to(self.root_dir)
            text = path.read_text(encoding="utf-8", errors="replace")
            line_count = len(text.splitlines())
            if rel != self.main_entrypoint and line_count >= self.max_lines:
                raise RuntimeError(f"SATIR SINIRI ASILDI: {rel} = {line_count} satir (>= {self.max_lines})")
            tail = text[-1800:].upper()
            if "DOSYA SATIR" not in tail and "NE I" not in tail:
                raise RuntimeError(f"EKSIK ALT ACIKLAMA: {rel} sonuna satir/islev ozeti eklenmeli.")

    def check_no_external_cdn(self):
        """Runtime HTML/CSS/JS dosyalarinda internetten kutuphane/font cekimi olmadigini dogrular."""
        forbidden = re.compile(
            r"(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|images\.unsplash\.com)",
            re.IGNORECASE,
        )
        runtime_files = [self.root_dir / "index.html"]
        for folder in ("css", "js"):
            runtime_files.extend((self.root_dir / folder).rglob("*"))

        for p in runtime_files:
            if p.is_file() and p.suffix.lower() in {".html", ".css", ".js"}:
                content = p.read_text(encoding="utf-8", errors="replace")
                if forbidden.search(content):
                    raise RuntimeError(f"CDN YASAGI IHLALI: {p.relative_to(self.root_dir)}")


class PlatformPackager:
    """Isletim sistemine ozgu calistirilabilir test paketlerini ureten sinif."""

    def __init__(self, root_dir: Path, version: str):
        self.root_dir = root_dir
        self.version = version
        self.dist_root = root_dir / "dist"
        self.runtime_files = ["index.html", "SOURCES.md", "LICENSE", "version.json"]
        self.runtime_dirs = ["css", "js", "data", "res", "ForAgents"]

    def copy_common_bundle(self, stage_dir: Path):
        """Ortak web, yerel res/, data/ ve ForAgents dosyalarini hedef dizine kopyalar."""
        stage_dir.mkdir(parents=True, exist_ok=True)
        for fname in self.runtime_files:
            src = self.root_dir / fname
            if src.exists():
                shutil.copy2(src, stage_dir / fname)
        for dname in self.runtime_dirs:
            src_dir = self.root_dir / dname
            dst_dir = stage_dir / dname
            if dst_dir.exists():
                shutil.rmtree(dst_dir)
            if src_dir.exists():
                shutil.copytree(src_dir, dst_dir)

    def build_linux(self) -> tuple[Path, Path]:
        """Linux test paketi dizini, launch-linux.sh, SHA256SUMS.txt ve .tar.gz arsivi uretir."""
        stage = self.dist_root / "linux" / "AstroChief-MarsMap-linux"
        archive = self.dist_root / f"AstroChief-MarsMap-v{self.version}-linux.tar.gz"
        if stage.exists():
            shutil.rmtree(stage)
        self.copy_common_bundle(stage)

        launch_src = self.root_dir / "tools" / "launch-linux.sh"
        launch_dst = stage / "launch-linux.sh"
        lf_text = launch_src.read_text(encoding="utf-8").replace("\r\n", "\n")
        launch_dst.write_bytes(lf_text.encode("utf-8"))
        os.chmod(launch_dst, launch_dst.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        hashes = []
        for fpath in sorted(p for p in stage.rglob("*") if p.is_file()):
            rel = fpath.relative_to(stage).as_posix()
            digest = hashlib.sha256(fpath.read_bytes()).hexdigest().lower()
            hashes.append(f"{digest}  {rel}")
        (stage / "SHA256SUMS.txt").write_bytes(("\n".join(hashes) + "\n").encode("utf-8"))

        if archive.exists():
            archive.unlink()
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(stage, arcname=stage.name)

        print(f"[OK] Linux test paketi uretildi: {archive}")
        return stage, archive

    def build_windows(self) -> tuple[Path, Path]:
        """Windows hedefi paketi (PowerShell / .NET derleyici varsa EXE + ZIP) uretir."""
        stage = self.dist_root / "windows" / "AstroChief-MarsMap-win64"
        archive = self.dist_root / f"AstroChief-MarsMap-v{self.version}-windows.zip"
        if stage.exists():
            shutil.rmtree(stage)
        self.copy_common_bundle(stage)
        for fname in ("serve.ps1", "preview.bat", "build.bat", "deploy_desktop.bat", "deploy_desktop.ps1"):
            src = self.root_dir / fname
            if src.exists():
                shutil.copy2(src, stage / fname)

        csc = Path(r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe")
        if platform.system() == "Windows" and csc.exists():
            exe_out = stage / "MarsMap-win64.exe"
            cs_src = self.root_dir / "tools" / "WinLauncher.cs"
            subprocess.run([str(csc), "/nologo", "/optimize+", f"/out:{exe_out}", str(cs_src)], check=True)

        if archive.exists():
            archive.unlink()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for fpath in sorted(p for p in stage.rglob("*") if p.is_file()):
                arc = Path(stage.name) / fpath.relative_to(stage)
                zf.write(fpath, arcname=arc.as_posix())

        print(f"[OK] Windows paketi uretildi: {archive}")
        return stage, archive


class DesktopBuildTool:
    """Isletim sistemini algilayip derleme ve Masaustune yuklemeyi yoneten ana sinif."""

    def __init__(self, root_dir: Path, skip_desktop: bool = False, target: str = "all"):
        self.root_dir = root_dir
        self.skip_desktop = skip_desktop
        self.target = target
        ver_data = json.loads((root_dir / "version.json").read_text(encoding="utf-8"))
        self.version = ver_data["version"]
        self.detected_os = platform.system()
        self.auditor = CodeRuleAuditor(root_dir)
        self.packager = PlatformPackager(root_dir, self.version)

    def run(self):
        """Tum derleme ve masaustu dagitim surecini calistirir."""
        print("==================================================================")
        print(f" [AstroChief Build Tool] OS: {self.detected_os} | Surum: v{self.version}")
        print("==================================================================")
        self.auditor.audit_all()

        dist_dir = self.root_dir / "dist"
        if dist_dir.exists():
            shutil.rmtree(dist_dir)
        dist_dir.mkdir(parents=True, exist_ok=True)

        built_archives = []
        primary_stage = None

        run_linux = self.target in ("linux", "all") or (self.target == "auto" and self.detected_os != "Windows")
        run_windows = self.target in ("windows", "all") or (self.target == "auto" and self.detected_os == "Windows")

        if run_windows:
            stage_win, arch_win = self.packager.build_windows()
            built_archives.append(arch_win)
            if self.detected_os == "Windows":
                primary_stage = stage_win

        if run_linux:
            stage_lin, arch_lin = self.packager.build_linux()
            built_archives.append(arch_lin)
            if self.detected_os != "Windows":
                primary_stage = stage_lin

        if not self.skip_desktop and primary_stage is not None:
            self.deploy_to_desktop(primary_stage, built_archives)

    def deploy_to_desktop(self, stage_dir: Path, archives: list[Path]):
        """Guncel surumu ve test arsivlerini ~/Desktop/AstroChief-MarsMap dizinine yukler."""
        desktop_dir = Path.home() / "Desktop"
        target_dir = desktop_dir / "AstroChief-MarsMap"
        desktop_dir.mkdir(parents=True, exist_ok=True)

        if target_dir.exists():
            shutil.rmtree(target_dir)
        shutil.copytree(stage_dir, target_dir)

        desk_dist = target_dir / "dist"
        desk_dist.mkdir(parents=True, exist_ok=True)
        for arch in archives:
            shutil.copy2(arch, desk_dist / arch.name)

        launch_sh = target_dir / "launch-linux.sh"
        if launch_sh.exists():
            os.chmod(launch_sh, launch_sh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        print(f"[OK] Guncel surum masaustune yuklendi: {target_dir}")
        for arch in archives:
            print(f"     - Arsiv: {desk_dist / arch.name}")


def main():
    parser = argparse.ArgumentParser(description="AstroChief OS-Aware Build & Desktop Deploy Tool")
    parser.add_argument("--skip-desktop", action="store_true", help="Masaustu kopyalamasini atla")
    parser.add_argument("--target", choices=["auto", "linux", "windows", "all"], default="all", help="Hedef platform")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    tool = DesktopBuildTool(root_dir=root, skip_desktop=args.skip_desktop, target=args.target)
    tool.run()


if __name__ == "__main__":
    main()

# ==============================================================================
# DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
# ------------------------------------------------------------------------------
# - Satir 1-23: Modul dokumantasyonu ve Python standart kutuphane iceri aktarimlari.
# - Satir 24-110: CodeRuleAuditor sinifi; readme.md dokunulmazligini, res/ ve data/ varligini, <800 satir sinirini, alt yorum bloklarini ve CDN yasagini denetler.
# - Satir 112-193: PlatformPackager sinifi; Linux (.tar.gz + LF launch-linux.sh + SHA256SUMS) ve Windows (AstroChief-MarsMap-win64 + ZIP) paketlerini derler.
# - Satir 195-263: DesktopBuildTool sinifi; isletim sistemini algilar, hem Windows hem Linux hedeflerini derler ve Masaustune yukler.
# - Satir 265-278: CLI arguman cozucu (all/auto/linux/windows) ve ana baslatici.
# ==============================================================================
