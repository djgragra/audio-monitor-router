"""Dante Monitor Router - matrice di ascolto: sorgenti (ingressi Windows) x destinazioni (uscite Windows)."""
import json
import os
import sys

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (QApplication, QGridLayout, QHBoxLayout, QLabel, QProgressBar,
                               QPushButton, QSlider, QVBoxLayout, QWidget)

import engine

CONFIG_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "DanteMonitorRouter")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
DEFAULTS = {
    "routes": {},                       # destinazione -> sorgente
    "volumes": {},                      # destinazione -> 0..100
    "exclude_dest": ["DVS Transmit", "MOTIV"],
    "exclude_src": [],
}

STYLE = """
QWidget { background:#1b1d21; color:#e6e6e6; font-size:13px; }
QLabel#hdr { font-weight:600; }
QPushButton { background:#2a2d33; border:1px solid #3a3e46; border-radius:4px; }
QPushButton:checked { background:#2fb344; border-color:#47d35e; }
QPushButton:hover { border-color:#6a7280; }
QProgressBar { background:#101215; border:none; max-height:8px; }
QProgressBar::chunk { background:#2fb344; }
"""


def load_config():
    cfg = json.loads(json.dumps(DEFAULTS))
    try:
        with open(CONFIG_FILE, encoding="utf-8") as f:
            cfg.update(json.load(f))
    except Exception:
        pass
    return cfg


def save_config(cfg):
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
    except Exception:
        pass


class Main(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Dante Monitor Router")
        self.cfg = load_config()
        self.routes = {}      # nome destinazione -> Route
        self.active = {}      # nome destinazione -> nome sorgente
        self.cells = {}       # (nome sorgente, nome destinazione) -> bottone
        self.meters = {}
        self.sliders = {}
        self.srcs, self.dsts = [], []

        root = QVBoxLayout(self)
        top = QHBoxLayout()
        self.btn_refresh = QPushButton("Aggiorna elenco dispositivi")
        self.btn_refresh.clicked.connect(self.refresh)
        top.addWidget(self.btn_refresh)
        top.addStretch(1)
        root.addLayout(top)
        self.grid_host = QWidget()
        self.grid = QGridLayout(self.grid_host)
        root.addWidget(self.grid_host)
        self.status = QLabel("")
        self.status.setWordWrap(True)
        root.addWidget(self.status)
        root.addStretch(1)

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.update_meters)
        self.timer.start(50)

        self.build()
        for dst, src in list(self.cfg["routes"].items()):
            cell = self.cells.get((src, dst))
            if cell:
                cell.setChecked(True)

    # ---------- costruzione griglia ----------
    def build(self):
        try:
            self.srcs, self.dsts = engine.list_devices(self.cfg["exclude_src"], self.cfg["exclude_dest"])
        except Exception as e:
            self.srcs, self.dsts = [], []
            self.status.setText(f"Errore enumerazione dispositivi: {e}")
        while self.grid.count():
            w = self.grid.takeAt(0).widget()
            if w:
                w.deleteLater()
        self.cells, self.meters, self.sliders = {}, {}, {}
        self.grid.addWidget(QLabel("Sorgenti \\ Uscite"), 0, 0)
        for c, d in enumerate(self.dsts, start=1):
            lbl = QLabel(d["name"])
            lbl.setObjectName("hdr")
            lbl.setWordWrap(True)
            lbl.setAlignment(Qt.AlignCenter)
            lbl.setFixedWidth(120)
            self.grid.addWidget(lbl, 0, c)
        for r, s in enumerate(self.srcs, start=1):
            self.grid.addWidget(QLabel(s["name"]), r, 0)
            for c, d in enumerate(self.dsts, start=1):
                b = QPushButton("")
                b.setCheckable(True)
                b.setFixedSize(120, 28)
                b.toggled.connect(lambda on, sn=s["name"], dn=d["name"]: self.on_cell(sn, dn, on))
                self.cells[(s["name"], d["name"])] = b
                self.grid.addWidget(b, r, c)
        vr = len(self.srcs) + 1
        self.grid.addWidget(QLabel("Volume"), vr, 0)
        self.grid.addWidget(QLabel("Livello"), vr + 1, 0)
        for c, d in enumerate(self.dsts, start=1):
            sl = QSlider(Qt.Horizontal)
            sl.setRange(0, 100)
            sl.setValue(int(self.cfg["volumes"].get(d["name"], 80)))
            sl.valueChanged.connect(lambda v, dn=d["name"]: self.on_volume(dn, v))
            self.sliders[d["name"]] = sl
            self.grid.addWidget(sl, vr, c)
            pb = QProgressBar()
            pb.setRange(0, 100)
            pb.setTextVisible(False)
            self.meters[d["name"]] = pb
            self.grid.addWidget(pb, vr + 1, c)

    # ---------- azioni ----------
    def gain_of(self, dst):
        v = self.sliders[dst].value() / 100.0 if dst in self.sliders else 0.8
        return v * v    # curva piu' naturale

    def on_cell(self, src, dst, on):
        if on:
            # una sola sorgente per destinazione
            for (s, d), b in self.cells.items():
                if d == dst and s != src and b.isChecked():
                    b.blockSignals(True)
                    b.setChecked(False)
                    b.blockSignals(False)
            self.stop_route(dst)
            sidx = next(x["index"] for x in self.srcs if x["name"] == src)
            didx = next(x["index"] for x in self.dsts if x["name"] == dst)
            try:
                self.routes[dst] = engine.Route(sidx, didx, self.gain_of(dst))
                self.active[dst] = src
                self.cells[(src, dst)].setText("ASCOLTO")
                self.status.setText("")
            except Exception as e:
                b = self.cells[(src, dst)]
                b.blockSignals(True)
                b.setChecked(False)
                b.blockSignals(False)
                self.status.setText(f"Impossibile avviare {src} -> {dst}: {e}")
        else:
            if self.active.get(dst) == src:
                self.stop_route(dst)
            self.cells[(src, dst)].setText("")
        self.persist()

    def stop_route(self, dst):
        r = self.routes.pop(dst, None)
        if r:
            r.stop()
        old = self.active.pop(dst, None)
        if old and (old, dst) in self.cells:
            self.cells[(old, dst)].setText("")

    def on_volume(self, dst, v):
        r = self.routes.get(dst)
        if r:
            r.gain = self.gain_of(dst)
        self.persist()

    def update_meters(self):
        for dst, pb in self.meters.items():
            r = self.routes.get(dst)
            if r:
                import math
                p = r.peak
                r.peak = 0.0
                db = 20 * math.log10(p) if p > 1e-6 else -90
                pb.setValue(int(max(0, min(100, (db + 60) / 60 * 100))))
            else:
                pb.setValue(0)

    def refresh(self):
        keep = dict(self.active)
        for dst in list(self.routes):
            self.stop_route(dst)
        try:
            import sounddevice as sd
            sd._terminate()
            sd._initialize()
        except Exception:
            pass
        self.build()
        for dst, src in keep.items():
            cell = self.cells.get((src, dst))
            if cell:
                cell.setChecked(True)

    def persist(self):
        self.cfg["routes"] = dict(self.active)
        self.cfg["volumes"] = {d: s.value() for d, s in self.sliders.items()}
        save_config(self.cfg)

    def closeEvent(self, e):
        for dst in list(self.routes):
            self.stop_route(dst)
        super().closeEvent(e)


def main():
    app = QApplication(sys.argv)
    app.setStyleSheet(STYLE)
    w = Main()
    w.resize(900, 420)
    w.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
